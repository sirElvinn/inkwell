// npm run eval:run -- --config eval/configs/flash-high.json [--delay 4000]
// Runs the app's own transcribe() on every eval image and scores it against Founders Online.
import type { EvalSample } from "@inkwell/shared";
import { GeminiError } from "../ai/gemini";
import { prisma } from "../lib/db";
import { preprocess } from "../pipeline/preprocess";
import { transcribe } from "../pipeline/transcribe";
import { argValue, readConfig, readyEntries, saveRun, scoreSample } from "./common";

const configPath = argValue("--config");
if (!configPath) {
  console.error("Usage: npm run eval:run -- --config eval/configs/<name>.json [--delay ms]");
  process.exit(1);
}
const config = await readConfig(configPath);
if (config.kind !== "gemini") {
  console.error(`Config ${config.name} is kind "${config.kind}"; use npm run eval:baseline for Tesseract.`);
  process.exit(1);
}
// Free-tier Gemini keys are rate-limited per minute, so pace requests (default 4 s apart).
const delayMs = Number(argValue("--delay") ?? 4000);

const samples: EvalSample[] = [];
const entries = await readyEntries();
console.log(`Running ${config.name} on ${entries.length} pages…`);
for (const [i, { entry, reference, image }] of entries.entries()) {
  const pre = await preprocess(image, { grayscale: config.preprocess === "grayscale" });
  const t = Date.now();
  try {
    // Same function the app uses; no fallback model here, so every result really comes from config.model.
    const { result, info } = await transcribe(pre.jpeg, {
      model: config.model,
      thinking: config.thinking,
      mediaResolution: config.mediaResolution,
      fallback: false,
    });
    const prediction = result.lines.map((l) => l.text).join("\n");
    samples.push(scoreSample(entry, prediction, reference, info.latencyMs, info.model));
    console.log(`  ${i + 1}/${entries.length} ${entry.id} done (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  } catch (err) {
    const message = err instanceof GeminiError ? `${err.code}${err.status ? ` (${err.status})` : ""}` : String(err);
    console.warn(`  ${i + 1}/${entries.length} ${entry.id} FAILED: ${message}`);
    samples.push({ ...scoreSample(entry, "", reference, Date.now() - t), error: message });
  }
  if (i < entries.length - 1) await new Promise((r) => setTimeout(r, delayMs));
}
await saveRun(config, samples);
await prisma.$disconnect();
