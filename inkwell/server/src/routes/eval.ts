// Accuracy data for the /accuracy page. Served straight from the committed eval/results/*.json files
// (not the database), so every number in the app is traceable to a file in the repo (spec §12.6).
import { EvalRunFile, EvalRunSummary } from "@inkwell/shared";
import { Router } from "express";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { RESULTS_DIR } from "../eval/common";
import { HttpError } from "../lib/errors";
import { logger } from "../lib/logger";

export const evalRouter = Router();

async function readRuns(): Promise<EvalRunFile[]> {
  let files: string[] = [];
  try {
    files = (await readdir(RESULTS_DIR)).filter((f) => f.endsWith(".json"));
  } catch {
    return []; // no results yet
  }
  const runs: EvalRunFile[] = [];
  for (const file of files) {
    const parsed = EvalRunFile.safeParse(JSON.parse(await readFile(path.join(RESULTS_DIR, file), "utf8")));
    if (parsed.success) runs.push(parsed.data);
    else logger.warn({ file }, "skipping malformed eval result file");
  }
  return runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

// GET /api/eval/runs: every run's config + summary (newest first).
evalRouter.get("/runs", async (_req, res) => {
  const runs = await readRuns();
  res.json(runs.map(({ samples: _samples, ...summary }) => EvalRunSummary.parse(summary)));
});

// GET /api/eval/runs/:id: one run with per-sample results (predictions + references for the diff).
evalRouter.get("/runs/:id", async (req, res) => {
  const { id } = z.object({ id: z.string().regex(/^[\w-]+$/) }).parse(req.params);
  const run = (await readRuns()).find((r) => r.id === id);
  if (!run) throw new HttpError(404, "not_found", "No evaluation run with that id.");
  res.json(run);
});
