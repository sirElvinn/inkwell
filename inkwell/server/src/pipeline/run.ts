// Pipeline orchestrator (spec §7). Runs in-process, at most 3 documents at a time.
//
//   preprocess → transcribe → (modernize ∥ annotate) → DONE
//
// Each stage writes its result to the DB as soon as it finishes, so the Reader can show partial
// results while the client polls. If modernize or annotate fails, the document still reaches DONE
// (the transcription is the core result) and the failure is recorded in runInfo.errors for that tab.
// A retry only re-runs the stages that are missing.
import { RunInfo, TranscriptionResult, type DocumentStatus, type StageName } from "@inkwell/shared";
import { readFile } from "node:fs/promises";
import pLimit from "p-limit";
import { GeminiError } from "../ai/gemini";
import { asJson, prisma } from "../lib/db";
import { logger } from "../lib/logger";
import { saveUpload, uploadPath } from "../lib/storage";
import { annotate } from "./annotate";
import { modernize } from "./modernize";
import { preprocess } from "./preprocess";
import { transcribe } from "./transcribe";

const limit = pLimit(3);
const RUNNING: DocumentStatus[] = ["QUEUED", "PREPROCESSING", "TRANSCRIBING", "ENRICHING"];

/** Queue a document; returns immediately. Errors are recorded on the document, never thrown. */
export function startPipeline(docId: string): void {
  void limit(() => runPipeline(docId));
}

/** Turn any error into a message that's safe and useful to show a user. */
export function friendlyError(err: unknown): string {
  if (err instanceof GeminiError) {
    switch (err.code) {
      case "rate_limited":
        return "The AI service is busy right now (rate limit reached). Please try again in a minute.";
      case "unavailable":
        return "The AI service is overloaded right now. Please try again in a minute.";
      case "timeout":
        return "The AI service took too long to respond. Please try again.";
      case "not_configured":
        return "The AI service isn't configured on this server.";
      default:
        return "The AI service couldn't process this letter. Please try again.";
    }
  }
  return "Something went wrong while processing this letter. Please try again.";
}

/** Runs (or resumes) the pipeline for one document. Awaitable, so the seed script can use it directly. */
export async function runPipeline(docId: string): Promise<void> {
  const log = logger.child({ docId });
  const started = Date.now();
  const doc = await prisma.document.findUniqueOrThrow({ where: { id: docId } });

  // Keep info from earlier runs (e.g. a successful transcription before a retry); clear old errors.
  const previous = RunInfo.safeParse(doc.runInfo);
  const runInfo: RunInfo = { stages: previous.success ? previous.data.stages : {}, errors: {} };
  const update = (data: Parameters<typeof prisma.document.update>[0]["data"]) => prisma.document.update({ where: { id: docId }, data });
  const saveRunInfo = () => update({ runInfo: asJson({ ...runInfo, totalMs: (runInfo.totalMs ?? 0) + (Date.now() - started) }) });
  if (previous.success) runInfo.totalMs = previous.data.totalMs;

  try {
    // 1 + 2. Preprocess and transcribe, unless a transcription already exists (retry of enrichment).
    let transcription = doc.transcription ? TranscriptionResult.safeParse(doc.transcription).data : undefined;
    if (!transcription) {
      await update({ status: "PREPROCESSING" });
      let t = Date.now();
      const pre = await preprocess(await readFile(uploadPath(doc.originalPath)));
      const derivedPath = await saveUpload(`${doc.imageSha256}.derived.jpg`, pre.jpeg);
      await update({ derivedPath, width: pre.width, height: pre.height });
      runInfo.stages.preprocess = { model: "sharp", promptVersion: "-", settings: { maxLongSide: 3000 }, latencyMs: Date.now() - t, attempts: 1 };
      log.info({ stage: "preprocess", latencyMs: Date.now() - t }, "stage done");

      await update({ status: "TRANSCRIBING" });
      t = Date.now();
      const out = await transcribe(pre.jpeg, { fallback: true, docId });
      transcription = out.result;
      runInfo.stages.transcribe = out.info;
      await update({ transcription: asJson(transcription) });
      await saveRunInfo();
      log.info({ stage: "transcribe", latencyMs: Date.now() - t, lines: transcription.lines.length }, "stage done");
    }

    if (transcription.not_a_manuscript || transcription.lines.length === 0) {
      await update({ status: "ERROR", errorMessage: "We couldn't find handwriting in this image. Try a clearer photo of a letter." });
      return;
    }

    // 3. Modernize ∥ annotate. Each saves its own result the moment it finishes.
    await update({ status: "ENRICHING" });
    const enrich = async (stage: Extract<StageName, "modernize" | "annotate">) => {
      const t = Date.now();
      try {
        if (stage === "modernize") {
          const out = await modernize(transcription, docId);
          runInfo.stages.modernize = out.info;
          await update({ modernization: asJson(out.result) });
        } else {
          const out = await annotate(transcription, docId);
          runInfo.stages.annotate = out.info;
          await update({ annotations: asJson(out.result) });
        }
        log.info({ stage, latencyMs: Date.now() - t }, "stage done");
      } catch (err) {
        runInfo.errors[stage] = friendlyError(err);
        log.error({ stage, err: err instanceof GeminiError ? { code: err.code, status: err.status } : err }, "stage failed");
      }
      await saveRunInfo();
    };
    await Promise.allSettled([
      doc.modernization ? Promise.resolve() : enrich("modernize"),
      doc.annotations ? Promise.resolve() : enrich("annotate"),
    ]);

    await update({ status: "DONE", errorMessage: null });
    await saveRunInfo();
    log.info({ totalMs: Date.now() - started }, "pipeline done");
  } catch (err) {
    log.error({ err: err instanceof GeminiError ? { code: err.code, status: err.status } : err }, "pipeline failed");
    await update({ status: "ERROR", errorMessage: friendlyError(err) }).catch(() => undefined);
    await saveRunInfo().catch(() => undefined);
  }
}

/** A DONE document can be retried if one of its enrichment stages is missing. */
export function canRetry(doc: { status: string; modernization: unknown; annotations: unknown }): boolean {
  return doc.status === "ERROR" || (doc.status === "DONE" && (doc.modernization == null || doc.annotations == null));
}

/** On startup, anything still "running" was interrupted by a restart: mark it retryable. */
export async function recoverInterruptedDocuments(): Promise<void> {
  const { count } = await prisma.document.updateMany({
    where: { status: { in: RUNNING } },
    data: { status: "ERROR", errorMessage: "Processing was interrupted. Please retry." },
  });
  if (count) logger.warn({ count }, "marked interrupted documents as ERROR");
}
