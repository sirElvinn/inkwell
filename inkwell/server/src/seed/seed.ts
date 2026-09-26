// `npm run seed [-- --force]`: run each example image through the real pipeline and freeze the output.
// Uses real API calls (Gemini now; ElevenLabs narration is added in P4). Skips examples that
// already have a frozen result unless --force is given.
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { RunInfo, TranscriptionResult, ModernizationResult, AnnotationResult } from "@inkwell/shared";
import { env } from "../env";
import { prisma } from "../lib/db";
import { sha256 } from "../lib/hash";
import { saveUpload } from "../lib/storage";
import { runPipeline } from "../pipeline/run";
import { exampleId, FrozenResult, imagePath, readExamples, resultPath } from "./examples";

const force = process.argv.includes("--force");

for (const ex of await readExamples()) {
  if (existsSync(resultPath(ex.slug)) && !force) {
    console.log(`skip ${ex.slug} (frozen result exists; use --force to redo)`);
    continue;
  }
  const original = await readFile(imagePath(ex.image));
  const imageSha256 = sha256(original);
  const ext = ex.image.split(".").pop() ?? "jpg";

  // A fresh working document for this run (source "seed" so it never shows up as an upload or example).
  const doc = await prisma.document.create({
    data: {
      source: "seed",
      title: ex.title,
      imageSha256,
      originalPath: await saveUpload(`${imageSha256}.${ext}`, original),
      status: "QUEUED",
      pipelineVersion: env.PIPELINE_VERSION,
    },
  });
  console.log(`running ${ex.slug} …`);
  await runPipeline(doc.id);
  let done = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
  // One retry for missing enrichment stages (e.g. the model was briefly overloaded).
  if (done.status === "DONE" && (!done.modernization || !done.annotations)) {
    console.log(`  retrying missing stages for ${ex.slug}`);
    await runPipeline(doc.id);
    done = await prisma.document.findUniqueOrThrow({ where: { id: doc.id } });
  }
  if (done.status !== "DONE" || !done.transcription) {
    console.error(`  FAILED ${ex.slug}: ${done.errorMessage}`);
    continue;
  }

  const frozen: FrozenResult = FrozenResult.parse({
    slug: ex.slug,
    title: ex.title,
    imageSha256,
    pipelineVersion: done.pipelineVersion,
    frozenAt: new Date().toISOString(),
    transcription: TranscriptionResult.parse(done.transcription),
    modernization: done.modernization ? ModernizationResult.parse(done.modernization) : null,
    annotations: done.annotations ? AnnotationResult.parse(done.annotations) : null,
    runInfo: RunInfo.parse(done.runInfo),
  });
  await writeFile(resultPath(ex.slug), JSON.stringify(frozen, null, 2) + "\n");
  // Replace any old example row so the next startup loads the new frozen result.
  await prisma.document.deleteMany({ where: { id: exampleId(ex.slug) } });
  await prisma.document.delete({ where: { id: doc.id } });
  const s = frozen.runInfo.stages;
  console.log(`  frozen ${ex.slug}: ${frozen.transcription.lines.length} lines, modernize=${!!frozen.modernization}, annotate=${!!frozen.annotations}, transcribe model=${s.transcribe?.model}`);
}
await prisma.$disconnect();
