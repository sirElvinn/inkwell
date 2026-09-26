// ElevenLabs narration with per-word timings (spec §10.6).
//
// Endpoint (verified in the ElevenLabs API reference):
//   POST /v1/text-to-speech/{voice_id}/with-timestamps?output_format=mp3_44100_128
//   body { text, model_id, voice_settings }  →  { audio_base64, alignment, normalized_alignment }
// `alignment` gives a start and end time for EVERY CHARACTER of the text we sent.
//
// Word timing logic:
//   words are the /\S+/ runs of the narrated text; a word starts when its first character starts
//   and ends when its last character ends. That only works if the alignment characters are exactly
//   our text, so we check that first and fall back (normalized alignment, then proportional timing).
import { narratedWords, type WordTiming } from "@inkwell/shared";
import { env } from "../env";
import { logger } from "../lib/logger";

const API = "https://api.elevenlabs.io/v1/text-to-speech";
/** Keep each request well under the model's limit so latency stays low; split longer letters. */
export const MAX_CHUNK_CHARS = 2000;

export class ElevenLabsError extends Error {
  constructor(public code: "not_configured" | "quota" | "rate_limited" | "unavailable" | "failed", message: string, public status?: number) {
    super(message);
  }
}

interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

interface TtsResponse {
  audio_base64: string;
  alignment: Alignment | null;
  normalized_alignment: Alignment | null;
}

export interface NarratedChunk {
  audio: Buffer;
  words: Omit<WordTiming, "chunk">[];
  durationSec: number;
  timing: "exact" | "normalized" | "proportional";
}

/** Split text into chunks of whole sentences, each at most maxChars (a single huge sentence is split on spaces). */
export function chunkText(text: string, maxChars = MAX_CHUNK_CHARS): string[] {
  if (text.length <= maxChars) return [text];
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  const push = () => {
    if (current.trim()) chunks.push(current.trim());
    current = "";
  };
  for (const sentence of sentences) {
    if (sentence.length > maxChars) {
      push();
      for (const word of sentence.split(/(?<=\s)/)) {
        if ((current + word).length > maxChars) push();
        current += word;
      }
      push();
    } else {
      if ((current + sentence).length > maxChars) push();
      current += sentence;
    }
  }
  push();
  return chunks;
}

/**
 * Per-word timings from per-character timings.
 * Word = a /\S+/ run in `text`. start = start time of its first character, end = end time of its last.
 */
export function wordTimingsFromAlignment(text: string, alignment: Alignment): Omit<WordTiming, "chunk">[] {
  const starts = alignment.character_start_times_seconds;
  const ends = alignment.character_end_times_seconds;
  return narratedWords(text).map(({ start, end }) => ({
    word: text.slice(start, end),
    start: starts[start] ?? 0,
    end: ends[end - 1] ?? starts[start] ?? 0,
    charStart: start,
    charEnd: end,
  }));
}

/**
 * Fallback when the alignment doesn't match our text character for character: spread the audio's
 * duration over the words in proportion to their length (plus one for the following space).
 */
export function proportionalTimings(text: string, durationSec: number): Omit<WordTiming, "chunk">[] {
  const words = narratedWords(text);
  const weight = (w: { start: number; end: number }) => w.end - w.start + 1;
  const total = words.reduce((sum, w) => sum + weight(w), 0) || 1;
  let t = 0;
  return words.map((w) => {
    const duration = (weight(w) / total) * durationSec;
    const timing = { word: text.slice(w.start, w.end), start: t, end: t + duration, charStart: w.start, charEnd: w.end };
    t += duration;
    return timing;
  });
}

function lastEndTime(a: Alignment | null): number {
  const ends = a?.character_end_times_seconds ?? [];
  return ends.length ? ends[ends.length - 1]! : 0;
}

/** Narrate one chunk of text. `voiceId`/`modelId` come from env unless given (the seed script passes them explicitly). */
export async function narrateChunk(text: string, opts: { voiceId: string; modelId: string; docId?: string }): Promise<NarratedChunk> {
  if (!env.ELEVENLABS_API_KEY) throw new ElevenLabsError("not_configured", "ELEVENLABS_API_KEY is not set.");
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(`${API}/${encodeURIComponent(opts.voiceId)}/with-timestamps?output_format=mp3_44100_128`, {
      method: "POST",
      headers: { "xi-api-key": env.ELEVENLABS_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: opts.modelId, voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    throw new ElevenLabsError("unavailable", "Couldn't reach ElevenLabs.");
  }
  if (!res.ok) {
    // Log the provider's status and error code only; never pass its body to the client.
    const body = await res.text().catch(() => "");
    const detail = /"status"\s*:\s*"([^"]+)"/.exec(body)?.[1];
    logger.warn({ docId: opts.docId, status: res.status, detail }, "elevenlabs request failed");
    if (res.status === 401 && detail === "quota_exceeded") throw new ElevenLabsError("quota", "Narration quota reached.", 401);
    if (res.status === 401) throw new ElevenLabsError("not_configured", "ElevenLabs rejected the API key.", 401);
    if (res.status === 429) throw new ElevenLabsError("rate_limited", "ElevenLabs is busy.", 429);
    if (res.status >= 500) throw new ElevenLabsError("unavailable", "ElevenLabs is unavailable.", res.status);
    throw new ElevenLabsError("failed", "Narration failed.", res.status);
  }
  const data = (await res.json()) as TtsResponse;
  const audio = Buffer.from(data.audio_base64, "base64");

  // Prefer exact character alignment; it must match our text exactly for the offsets to be right.
  let timing: NarratedChunk["timing"] = "exact";
  let words: Omit<WordTiming, "chunk">[];
  if (data.alignment && data.alignment.characters.join("") === text) {
    words = wordTimingsFromAlignment(text, data.alignment);
  } else if (data.normalized_alignment && data.normalized_alignment.characters.join("") === text) {
    timing = "normalized";
    words = wordTimingsFromAlignment(text, data.normalized_alignment);
  } else {
    timing = "proportional";
    words = proportionalTimings(text, lastEndTime(data.alignment ?? data.normalized_alignment));
  }
  const durationSec = lastEndTime(data.alignment ?? data.normalized_alignment);
  logger.info({ docId: opts.docId, stage: "narrate", chars: text.length, latencyMs: Date.now() - started, timing, durationSec }, "elevenlabs ok");
  if (timing !== "exact") logger.warn({ docId: opts.docId, timing }, "alignment didn't match narrated text; used fallback timing");
  return { audio, words, durationSec, timing };
}
