// Shared runner for the two text-only stages (modernize, annotate).
// Like transcription, it falls back to GEMINI_MODEL_FALLBACK once if the main model keeps failing.
import type { StageRunInfo } from "@inkwell/shared";
import type { z } from "zod";
import { callGeminiJson, GeminiError, type Thinking } from "../ai/gemini";
import { env } from "../env";
import { logger } from "../lib/logger";
import { PROMPT_VERSION } from "./prompts";

export async function runTextStage<S extends z.ZodType>(
  schema: S,
  opts: { stage: "modernize" | "annotate"; prompt: string; input: string; thinking: Thinking; docId?: string },
): Promise<{ result: z.infer<S>; info: StageRunInfo }> {
  const run = (model: string) =>
    callGeminiJson(
      schema,
      {
        model,
        systemInstruction: opts.prompt,
        parts: [{ text: opts.input }],
        thinking: opts.thinking,
        timeoutMs: 60_000,
      },
      { docId: opts.docId, stage: opts.stage },
    );
  const model = env.GEMINI_MODEL_TEXT;
  try {
    const { data, info } = await run(model);
    return { result: data, info: { ...info, promptVersion: PROMPT_VERSION } };
  } catch (err) {
    const fallback = env.GEMINI_MODEL_FALLBACK;
    if (!(err instanceof GeminiError) || err.code === "not_configured" || fallback === model) throw err;
    logger.warn({ docId: opts.docId, stage: opts.stage, from: model, to: fallback }, "falling back to secondary model");
    const { data, info } = await run(fallback);
    return { result: data, info: { ...info, promptVersion: PROMPT_VERSION, settings: { ...info.settings, fallbackFrom: model } } };
  }
}
