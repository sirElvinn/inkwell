// npm run eval:baseline
// Classic OCR baseline: Tesseract (English model) on the same images, scored with the same metrics.
import type { EvalSample } from "@inkwell/shared";
import { createWorker } from "tesseract.js";
import { prisma } from "../lib/db";
import { preprocess } from "../pipeline/preprocess";
import { readConfig, readyEntries, saveRun, scoreSample, EVAL_DIR } from "./common";
import path from "node:path";

const config = await readConfig(path.join(EVAL_DIR, "configs", "tesseract.json"));
const worker = await createWorker("eng"); // downloads the English model on first use
const samples: EvalSample[] = [];
const entries = await readyEntries();
console.log(`Running Tesseract on ${entries.length} pages…`);
for (const [i, { entry, reference, image }] of entries.entries()) {
  const pre = await preprocess(image, { grayscale: config.preprocess === "grayscale" });
  const t = Date.now();
  const { data } = await worker.recognize(pre.jpeg);
  samples.push(scoreSample(entry, data.text.trim(), reference, Date.now() - t, "tesseract.js (eng)"));
  console.log(`  ${i + 1}/${entries.length} ${entry.id} done`);
}
await worker.terminate();
await saveRun(config, samples);
await prisma.$disconnect();
