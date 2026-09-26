// Stage 2: image → diplomatic transcription (spec §10.3).
// IMPORTANT: the eval CLI imports this exact function, so the accuracy we report is the accuracy users get.
import { TranscriptionResult, type StageRunInfo } from "@inkwell/shared";
import { callGeminiJson, GeminiError, type Thinking } from "../ai/gemini";
import { env } from "../env";
import { logger } from "../lib/logger";
import { PROMPT_VERSION, TRANSCRIBE_PROMPT_V1 } from "./prompts";

export interface TranscribeOptions {
  model?: string;
  thinking?: Thinking;
  mediaResolution?: "high" | "medium" | "low";
  /** Try GEMINI_MODEL_FALLBACK once if the main model fails after retries. Off in eval runs. */
  fallback?: boolean;
  docId?: string;
}

export async function transcribe(
  jpeg: Buffer,
  opts: TranscribeOptions = {},
): Promise<{ result: TranscriptionResult; info: StageRunInfo }> {
  const model = opts.model ?? env.GEMINI_MODEL_TRANSCRIBE;
  const run = (m: string) =>
    callGeminiJson(
      TranscriptionResult,
      {
        model: m,
        // Image first, instruction text last: Gemini 3 needs non-empty text in the final user turn.
        parts: [{ inlineData: { mimeType: "image/jpeg", data: jpeg.toString("base64") } }, { text: TRANSCRIBE_PROMPT_V1 }],
        thinking: opts.thinking ?? "medium",
        mediaResolution: opts.mediaResolution ?? "high",
        timeoutMs: 120_000,
      },
      { docId: opts.docId, stage: "transcribe" },
    );

  try {
    const { data, info } = await run(model);
    return { result: data, info: { ...info, promptVersion: PROMPT_VERSION } };
  } catch (err) {
    const fallback = env.GEMINI_MODEL_FALLBACK;
    if (!opts.fallback || !(err instanceof GeminiError) || err.code === "not_configured" || fallback === model) throw err;
    logger.warn({ docId: opts.docId, stage: "transcribe", from: model, to: fallback }, "falling back to secondary model");
    const { data, info } = await run(fallback);
    return { result: data, info: { ...info, promptVersion: PROMPT_VERSION, settings: { ...info.settings, fallbackFrom: model } } };
  }
}
