// POST /api/documents/:id/audio  { variant: "modern" | "plain" }
// Returns cached narration if we have it; otherwise generates it once with ElevenLabs.
// ElevenLabs characters are our scarcest resource, so audio is only made when someone presses Listen,
// cached by sha256(text + voiceId + modelId), and generation is rate-limited to 5/min/IP.
import { AudioRequest } from "@inkwell/shared";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { getOrCreateNarration, resolveClip } from "../pipeline/narrate";

export const audioRouter = Router({ mergeParams: true });

// Only count requests that would actually spend ElevenLabs characters.
const generationLimiter = rateLimit({
  windowMs: 60_000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skip: async (req) => {
    const parsed = AudioRequest.safeParse(req.body);
    if (!parsed.success || typeof req.params.id !== "string") return true;
    try {
      return !!(await resolveClip(req.params.id, parsed.data.variant)).cached;
    } catch {
      return true; // let the handler produce the proper error
    }
  },
  message: { error: { code: "rate_limited", message: "Too many narration requests. Please wait a minute." } },
});

audioRouter.post("/", generationLimiter, async (req, res) => {
  const { id } = z.object({ id: z.string().min(1).max(64) }).parse(req.params);
  const { variant } = AudioRequest.parse(req.body);
  res.json(await getOrCreateNarration(id, variant));
});
