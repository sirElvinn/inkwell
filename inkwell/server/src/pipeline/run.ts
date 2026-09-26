// Pipeline orchestrator (spec §7). Runs in-process, at most 3 documents at a time.
// Each stage writes its result to the DB as soon as it finishes, so the Reader can show
// partial results while the client polls.
import type { DocumentStatus, RunInfo } from "@inkwell/shared";
import { readFile } from "node:fs/promises";
import pLimit from "p-limit";
import { GeminiError } from "../ai/gemini";
import { asJson, prisma } from "../lib/db";
import { logger } from "../lib/logger";
import { saveUpload, uploadPath } from "../lib/storage";
import { preprocess } from "./preprocess";
import { transcribe } from "./transcribe";

const limit = pLimit(3);
const RUNNING: DocumentStatus[] = ["QUEUED", "PREPROCESSING", "TRANSCRIBING", "ENRICHING"];

/** Queue a document; returns immediately. Errors are recorded on the document, never thrown. */
export function startPipeline(docId: string): void {
  void limit(() => runPipeline(docId));
}

async function setStatus(id: string, status: DocumentStatus) {
  await prisma.document.update({ where: { id }, data: { status } });
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
        return "Reading the handwriting took too long. Please try again.";
      case "not_configured":
        return "Transcription isn't configured on this server.";
      default:
        return "The AI service couldn't read this image. Please try again.";
    }
  }
  return "Something went wrong while processing this letter. Please try again.";
}

async function runPipeline(docId: string): Promise<void> {
  const log = logger.child({ docId });
  const started = Date.now();
  const runInfo: RunInfo = { stages: {}, errors: {} };
  const saveRunInfo = () => prisma.document.update({ where: { id: docId }, data: { runInfo: asJson({ ...runInfo, totalMs: Date.now() - started }) } });

  try {
    const doc = await prisma.document.findUniqueOrThrow({ where: { id: docId } });

    // 1. Preprocess
    await setStatus(docId, "PREPROCESSING");
    let t = Date.now();
    const pre = await preprocess(await readFile(uploadPath(doc.originalPath)));
    const derivedPath = await saveUpload(`${doc.imageSha256}.derived.jpg`, pre.jpeg);
    await prisma.document.update({ where: { id: docId }, data: { derivedPath, width: pre.width, height: pre.height } });
    runInfo.stages.preprocess = { model: "sharp", promptVersion: "-", settings: { maxLongSide: 3000 }, latencyMs: Date.now() - t, attempts: 1 };
    log.info({ stage: "preprocess", latencyMs: Date.now() - t, width: pre.width, height: pre.height }, "stage done");

    // 2. Transcribe
    await setStatus(docId, "TRANSCRIBING");
    t = Date.now();
    const { result, info } = await transcribe(pre.jpeg, { fallback: true, docId });
    runInfo.stages.transcribe = info;
    await prisma.document.update({ where: { id: docId }, data: { transcription: asJson(result) } });
    await saveRunInfo();
    log.info({ stage: "transcribe", latencyMs: Date.now() - t, lines: result.lines.length }, "stage done");

    if (result.not_a_manuscript || result.lines.length === 0) {
      await prisma.document.update({
        where: { id: docId },
        data: { status: "ERROR", errorMessage: "We couldn't find handwriting in this image. Try a clearer photo of a letter." },
      });
      return;
    }

    // 3. Modernize ∥ annotate: added in P2.

    await prisma.document.update({ where: { id: docId }, data: { status: "DONE", errorMessage: null } });
    await saveRunInfo();
    log.info({ totalMs: Date.now() - started }, "pipeline done");
  } catch (err) {
    log.error({ err: err instanceof GeminiError ? { code: err.code, status: err.status } : err }, "pipeline failed");
    await prisma.document
      .update({ where: { id: docId }, data: { status: "ERROR", errorMessage: friendlyError(err) } })
      .catch(() => undefined);
    await saveRunInfo().catch(() => undefined);
  }
}

/** On startup, anything still "running" was interrupted by a restart: mark it retryable. */
export async function recoverInterruptedDocuments(): Promise<void> {
  const { count } = await prisma.document.updateMany({
    where: { status: { in: RUNNING } },
    data: { status: "ERROR", errorMessage: "Processing was interrupted. Please retry." },
  });
  if (count) logger.warn({ count }, "marked interrupted documents as ERROR");
}
