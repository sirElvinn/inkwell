// Shared helpers for the eval CLIs: paths, manifest, scoring, and writing result files.
import {
  EvalConfig,
  EvalRunFile,
  ManifestEntry,
  errorRates,
  normalizeLoose,
  normalizeStrict,
  summarize,
  type EvalSample,
  type EvalSummary,
} from "@inkwell/shared";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { asJson, prisma } from "../lib/db";

/** inkwell/eval: committed eval data (manifest, images, ground truth, configs, results). */
export const EVAL_DIR = fileURLToPath(new URL("../../../eval", import.meta.url));
export const RESULTS_DIR = path.join(EVAL_DIR, "results");
export const groundTruthPath = (id: string, ext: "txt" | "json") => path.join(EVAL_DIR, "ground-truth", `${id}.${ext}`);

export async function readManifest(): Promise<ManifestEntry[]> {
  return z.array(ManifestEntry).parse(JSON.parse(await readFile(path.join(EVAL_DIR, "manifest.json"), "utf8")));
}

export async function readConfig(file: string): Promise<EvalConfig> {
  return EvalConfig.parse(JSON.parse(await readFile(path.resolve(file), "utf8")));
}

/** Entries that have both an image and a ground-truth text; the rest are reported and skipped. */
export async function readyEntries(): Promise<{ entry: ManifestEntry; reference: string; image: Buffer }[]> {
  const ready = [];
  for (const entry of await readManifest()) {
    const imagePath = path.join(EVAL_DIR, entry.image);
    const refPath = groundTruthPath(entry.id, "txt");
    if (!existsSync(imagePath) || !existsSync(refPath)) {
      console.warn(`  skip ${entry.id}: missing ${!existsSync(imagePath) ? "image" : "ground truth"}`);
      continue;
    }
    ready.push({ entry, reference: await readFile(refPath, "utf8"), image: await readFile(imagePath) });
  }
  return ready;
}

/** Score one prediction against its reference, strict and loose (spec §12.4). */
export function scoreSample(entry: ManifestEntry, prediction: string, reference: string, latencyMs: number, model?: string): EvalSample {
  const strict = errorRates(normalizeStrict(prediction), normalizeStrict(reference));
  const loose = errorRates(normalizeLoose(prediction), normalizeLoose(reference));
  return {
    id: entry.id,
    famous: entry.famous,
    hand: entry.hand,
    strict: { cer: strict.cer, wer: strict.wer },
    loose: { cer: loose.cer, wer: loose.wer },
    latencyMs,
    prediction,
    reference,
    model,
  };
}

export function summarizeRun(samples: EvalSample[]): EvalSummary {
  const ok = samples.filter((s) => !s.error);
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  return {
    n: ok.length,
    failed: samples.length - ok.length,
    strict: { cer: summarize(ok.map((s) => s.strict.cer)), wer: summarize(ok.map((s) => s.strict.wer)) },
    loose: { cer: summarize(ok.map((s) => s.loose.cer)), wer: summarize(ok.map((s) => s.loose.wer)) },
    looseCerFamous: mean(ok.filter((s) => s.famous).map((s) => s.loose.cer)),
    looseCerLesserKnown: mean(ok.filter((s) => !s.famous).map((s) => s.loose.cer)),
    meanLatencyMs: mean(ok.map((s) => s.latencyMs)) ?? 0,
  };
}

/** Write eval/results/{timestamp}-{config}.json, record an EvalRun row, and print a summary table. */
export async function saveRun(config: EvalConfig, samples: EvalSample[]): Promise<EvalRunFile> {
  const createdAt = new Date().toISOString();
  const id = `${createdAt.replace(/[:.]/g, "-")}-${config.name}`;
  const run = EvalRunFile.parse({ id, createdAt, config, summary: summarizeRun(samples), samples });
  await mkdir(RESULTS_DIR, { recursive: true });
  await writeFile(path.join(RESULTS_DIR, `${id}.json`), JSON.stringify(run, null, 2) + "\n");
  await prisma.evalRun.create({ data: { name: config.name, config: asJson(config), summary: asJson(run.summary), samples: asJson(samples) } });

  const pct = (x: number | null) => (x == null ? "  n/a" : `${(x * 100).toFixed(1).padStart(5)}%`);
  console.log(`\n${config.label}  (n=${run.summary.n}, failed=${run.summary.failed})`);
  console.log("id".padEnd(18) + "strict CER  loose CER  loose WER  latency");
  for (const s of samples) {
    console.log(s.error ? `${s.id.padEnd(18)}ERROR: ${s.error}` : `${s.id.padEnd(18)}${pct(s.strict.cer)}      ${pct(s.loose.cer)}     ${pct(s.loose.wer)}   ${(s.latencyMs / 1000).toFixed(1)} s`);
  }
  const m = run.summary;
  console.log(`${"MEAN".padEnd(18)}${pct(m.strict.cer.mean)}      ${pct(m.loose.cer.mean)}     ${pct(m.loose.wer.mean)}   ${(m.meanLatencyMs / 1000).toFixed(1)} s`);
  console.log(`loose CER famous: ${pct(m.looseCerFamous)}   lesser-known: ${pct(m.looseCerLesserKnown)}`);
  console.log(`saved eval/results/${id}.json`);
  return run;
}

export const argValue = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
