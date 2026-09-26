// Narration service: find or create the narration for one document + variant.
// Used by the audio route and by `npm run seed` (so examples ship with pre-made audio).
import { AudioResponse, ModernizationResult, prepareNarration, WordTiming, type NarrationVariant } from "@inkwell/shared";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { chunkText, ElevenLabsError, narrateChunk } from "../ai/elevenlabs";
import { env } from "../env";
import { asJson, prisma } from "../lib/db";
import { HttpError } from "../lib/errors";
import { sha256 } from "../lib/hash";
import { AUDIO_DIR } from "../lib/storage";

export const VOICE_LABEL = "AI narrator voice";
const audioUrl = (file: string) => `/files/audio/${file}`;

/** The displayed text for a variant (what the Reader shows and highlights). */
function displayText(m: ModernizationResult, variant: NarrationVariant): string {
  return variant === "modern" ? m.modern_text : m.plain_english;
}

export function friendly(err: ElevenLabsError): HttpError {
  switch (err.code) {
    case "quota":
      return new HttpError(503, "narration_quota", "Narration is unavailable right now (the voice quota is used up).");
    case "rate_limited":
    case "unavailable":
      return new HttpError(503, "narration_unavailable", "The narrator is busy right now. Please try again in a minute.");
    case "not_configured":
      return new HttpError(503, "narration_not_configured", "Narration isn't configured on this server.");
    default:
      return new HttpError(502, "narration_failed", "We couldn't create the narration. Please try again.");
  }
}

/** Cached clip → API response. */
export function toResponse(clip: { audioPath: string; words: unknown; durationSec: number }): AudioResponse {
  return AudioResponse.parse({
    audioUrls: clip.audioPath.split("|").map(audioUrl),
    words: z.array(WordTiming).parse(clip.words),
    durationSec: clip.durationSec,
    voiceLabel: VOICE_LABEL,
  });
}

/** Look up what would be narrated and whether it's cached. Used by both the limiter and the handler. */
export async function resolveClip(id: string, variant: NarrationVariant) {
  const doc = await prisma.document.findUnique({ where: { id } });
  if (!doc) throw new HttpError(404, "not_found", "We couldn't find that letter.");
  const modernization = ModernizationResult.safeParse(doc.modernization);
  if (!modernization.success) throw new HttpError(409, "not_ready", "This letter doesn't have a modern version to read yet.");
  const narration = prepareNarration(displayText(modernization.data, variant));
  const voiceId = env.ELEVENLABS_VOICE_ID ?? "";
  const modelId = env.ELEVENLABS_MODEL_ID;
  const textSha256 = sha256(`${narration.text}\u0000${voiceId}\u0000${modelId}`);
  const cached = await prisma.audioClip.findUnique({
    where: { documentId_variant_textSha256_voiceId_modelId: { documentId: id, variant, textSha256, voiceId, modelId } },
  });
  return { narration, voiceId, modelId, textSha256, cached };
}

// Two clicks on Listen shouldn't pay for the same audio twice.
const inFlight = new Map<string, Promise<AudioResponse>>();

/** Return cached narration, or generate it (chunk by chunk) and cache it. Throws HttpError on failure. */
export async function getOrCreateNarration(id: string, variant: NarrationVariant): Promise<AudioResponse> {
  const { narration, voiceId, modelId, textSha256, cached } = await resolveClip(id, variant);
  if (cached) return toResponse(cached);
  if (!voiceId) throw new HttpError(503, "narration_not_configured", "Narration isn't configured on this server.");

  const key = `${id}:${variant}:${textSha256}`;
  let job = inFlight.get(key);
  if (!job) {
    job = (async () => {
      const chunks = chunkText(narration.text);
      const files: string[] = [];
      const words: WordTiming[] = [];
      let durationSec = 0;
      let offset = 0; // character offset of this chunk inside the full narrated text
      await mkdir(AUDIO_DIR, { recursive: true });
      for (const [i, chunkTextPart] of chunks.entries()) {
        // Chunks are trimmed sentences; find where this one starts in the full text.
        offset = narration.text.indexOf(chunkTextPart, offset);
        const out = await narrateChunk(chunkTextPart, { voiceId, modelId, docId: id });
        const file = `${textSha256}-${i}.mp3`;
        await writeFile(path.join(AUDIO_DIR, file), out.audio);
        files.push(file);
        for (const w of out.words) words.push({ ...w, charStart: w.charStart + offset, charEnd: w.charEnd + offset, chunk: i });
        durationSec += out.durationSec;
        offset += chunkTextPart.length;
      }
      const clip = await prisma.audioClip.create({
        data: { documentId: id, variant, textSha256, voiceId, modelId, audioPath: files.join("|"), durationSec, words: asJson(words) },
      });
      return toResponse(clip);
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, job);
  }
  try {
    return await job;
  } catch (err) {
    if (err instanceof ElevenLabsError) throw friendly(err);
    throw err;
  }
}
