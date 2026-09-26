import type { HealthResponse } from "@inkwell/shared";
import { Router } from "express";
import { env } from "../env";
import { prisma } from "../lib/db";

export const healthRouter = Router();

// Liveness + DB check + which keys are configured (booleans only, never the keys).
healthRouter.get("/", async (_req, res) => {
  let db = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    db = true;
  } catch {
    db = false;
  }
  const body: HealthResponse = { ok: db, db, gemini: !!env.GEMINI_API_KEY, elevenlabs: !!env.ELEVENLABS_API_KEY };
  res.status(db ? 200 : 503).json(body);
});
