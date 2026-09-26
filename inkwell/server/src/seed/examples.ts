// Example letters shown in the gallery (spec §14).
// `npm run seed` runs each image through the REAL pipeline once and freezes the output in results/.
// At startup, loadExamples() inserts those frozen results, so the examples never cost API calls.
import { AnnotationResult, ModernizationResult, NarrationVariantSchema, RunInfo, TranscriptionResult, WordTiming } from "@inkwell/shared";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { env } from "../env";
import { asJson, prisma } from "../lib/db";
import { sha256 } from "../lib/hash";
import { logger } from "../lib/logger";
import { AUDIO_DIR, saveUpload } from "../lib/storage";
import { preprocess } from "../pipeline/preprocess";

const SEED_DIR = new URL("./", import.meta.url);
export const imagePath = (file: string) => new URL(`images/${file}`, SEED_DIR);
export const resultPath = (slug: string) => new URL(`results/${slug}.json`, SEED_DIR);
export const exampleId = (slug: string) => `example-${slug}`;
export const seedAudioPath = (file: string) => new URL(`audio/${file}`, SEED_DIR);

/** Narration frozen with an example: the mp3 files live in seed/audio/. */
export const FrozenAudio = z.object({
  textSha256: z.string(),
  voiceId: z.string(),
  modelId: z.string(),
  files: z.array(z.string()).min(1),
  durationSec: z.number(),
  words: z.array(WordTiming),
});

export const ExampleEntry = z.object({
  slug: z.string(),
  title: z.string(),
  image: z.string(),
  locUrl: z.string(),
  note: z.string(),
});
export type ExampleEntry = z.infer<typeof ExampleEntry>;

/** What `npm run seed` writes for each example. */
export const FrozenResult = z.object({
  slug: z.string(),
  title: z.string(),
  imageSha256: z.string(),
  pipelineVersion: z.string(),
  frozenAt: z.string(),
  transcription: TranscriptionResult,
  modernization: ModernizationResult.nullable(),
  annotations: AnnotationResult.nullable(),
  runInfo: RunInfo,
  audio: z.partialRecord(NarrationVariantSchema, FrozenAudio).default({}),
});
export type FrozenResult = z.infer<typeof FrozenResult>;

export async function readExamples(): Promise<ExampleEntry[]> {
  return z.array(ExampleEntry).parse(JSON.parse(await readFile(new URL("examples.json", SEED_DIR), "utf8")));
}

/** Startup: insert any frozen example that isn't in the DB yet. Never calls an AI API. */
export async function loadExamples(): Promise<void> {
  for (const ex of await readExamples()) {
    if (!existsSync(resultPath(ex.slug))) {
      logger.warn({ slug: ex.slug }, "example has no frozen result yet; run `npm run seed`");
      continue;
    }
    const frozen = FrozenResult.parse(JSON.parse(await readFile(resultPath(ex.slug), "utf8")));
    if (frozen.pipelineVersion !== env.PIPELINE_VERSION) {
      logger.warn({ slug: ex.slug, frozen: frozen.pipelineVersion, current: env.PIPELINE_VERSION }, "frozen example is from an older pipeline version");
    }
    // Fixed id per example: stable demo URLs (/doc/example-<slug>), and two server processes starting
    // at once can't both insert it (the second create hits the primary key and is skipped).
    const id = exampleId(ex.slug);
    const exists = await prisma.document.findUnique({ where: { id } });
    // Up to date = same run (runInfo holds per-run latencies, so it changes whenever the seed is re-run).
    if (exists && JSON.stringify(exists.runInfo) === JSON.stringify(frozen.runInfo)) continue;
    if (exists) await prisma.document.delete({ where: { id } }); // frozen result was regenerated; its audio rows cascade

    // Recreate the image files (App Platform's disk is wiped on redeploy) with no network calls.
    const original = await readFile(imagePath(ex.image));
    const pre = await preprocess(original);
    const ext = ex.image.split(".").pop() ?? "jpg";
    const originalPath = await saveUpload(`${frozen.imageSha256}.${ext}`, original);
    const derivedPath = await saveUpload(`${frozen.imageSha256}.derived.jpg`, pre.jpeg);
    await prisma.document
      .create({
        data: {
          id,
          source: "example",
          title: frozen.title,
          imageSha256: frozen.imageSha256,
          originalPath,
          derivedPath,
          width: pre.width,
          height: pre.height,
          status: "DONE",
          pipelineVersion: frozen.pipelineVersion,
          transcription: asJson(frozen.transcription),
          modernization: frozen.modernization ? asJson(frozen.modernization) : undefined,
          annotations: frozen.annotations ? asJson(frozen.annotations) : undefined,
          runInfo: asJson(frozen.runInfo),
        },
      })
      .then(
        async () => {
          await loadExampleAudio(id, frozen);
          logger.info({ slug: ex.slug, narrations: Object.keys(frozen.audio) }, "loaded example");
        },
        () => logger.info({ slug: ex.slug }, "example already loaded by another process"),
      );
  }
}

/** Copy an example's frozen mp3s into AUDIO_DIR and create its AudioClip rows (no ElevenLabs calls). */
async function loadExampleAudio(documentId: string, frozen: FrozenResult): Promise<void> {
  await mkdir(AUDIO_DIR, { recursive: true });
  for (const [variant, clip] of Object.entries(frozen.audio)) {
    if (!clip) continue;
    for (const file of clip.files) {
      const target = path.join(AUDIO_DIR, file);
      if (!existsSync(target)) await copyFile(seedAudioPath(file), target);
    }
    await prisma.audioClip.create({
      data: {
        documentId,
        variant,
        textSha256: clip.textSha256,
        voiceId: clip.voiceId,
        modelId: clip.modelId,
        audioPath: clip.files.join("|"),
        durationSec: clip.durationSec,
        words: asJson(clip.words),
      },
    });
  }
}

export { sha256 };
