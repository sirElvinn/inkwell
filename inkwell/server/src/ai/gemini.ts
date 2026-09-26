// Gemini wrapper: one function, callGeminiJson, used by every pipeline stage and by the eval CLI.
//
// What it guarantees:
//   - a timeout per call (transcription 120 s, text stages 60 s)
//   - up to 2 retries with exponential backoff + jitter on 429/500/503/timeouts
//   - the response is parsed as JSON and validated with zod; if validation fails we make ONE
//     "repair" call that sends the validation error back and asks for corrected JSON only
//   - latency, attempts, and token usage are returned for runInfo
//
// Verified against @google/genai 2.24.0: generateContent takes responseMimeType + responseJsonSchema
// (the `responseFormat` field in newer docs belongs to the Interactions API), thinking levels are
// ThinkingLevel enum values, and the timeout goes in httpOptions.timeout (ms).
// Gemini 3.x: we never send temperature/topP/topK/candidateCount.
import { GoogleGenAI, MediaResolution, ThinkingLevel, type Content, type Part } from "@google/genai";
import type { StageRunInfo } from "@inkwell/shared";
import { z } from "zod";
import { env } from "../env";
import { logger } from "../lib/logger";

let client: GoogleGenAI | null = null;
function gemini(): GoogleGenAI {
  if (!env.GEMINI_API_KEY) throw new GeminiError("not_configured", "GEMINI_API_KEY is not set.", false);
  client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return client;
}

export class GeminiError extends Error {
  constructor(public code: string, message: string, public retryable: boolean, public status?: number) {
    super(message);
  }
}

export type Thinking = "low" | "medium" | "high";
const THINKING: Record<Thinking, ThinkingLevel> = {
  low: ThinkingLevel.LOW,
  medium: ThinkingLevel.MEDIUM,
  high: ThinkingLevel.HIGH,
};

export interface GeminiRequest {
  model: string;
  /** Content parts for the single user turn. Images first, instruction text last (must be non-empty). */
  parts: Part[];
  systemInstruction?: string;
  thinking: Thinking;
  mediaResolution?: "high" | "medium" | "low";
  timeoutMs: number;
}

export interface GeminiResult<T> {
  data: T;
  info: Omit<StageRunInfo, "promptVersion">;
}

const RESOLUTION = {
  high: MediaResolution.MEDIA_RESOLUTION_HIGH,
  medium: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
  low: MediaResolution.MEDIA_RESOLUTION_LOW,
} as const;

const MAX_RETRIES = 2;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 1 s, 2 s, 4 s … plus up to 50% random jitter so parallel callers don't retry in lockstep. */
function backoffMs(attempt: number): number {
  const base = 1000 * 2 ** attempt;
  return base + Math.random() * base * 0.5;
}

/** Map SDK/network errors to GeminiError, deciding whether a retry could help. */
function classify(err: unknown): GeminiError {
  if (err instanceof GeminiError) return err;
  const e = err as { status?: number; name?: string; message?: string };
  const status = e.status;
  if (status === 429) return new GeminiError("rate_limited", "Gemini rate limit or quota reached.", true, status);
  if (status === 500 || status === 503) return new GeminiError("unavailable", "Gemini is temporarily overloaded.", true, status);
  if (e.name === "AbortError" || e.name === "TimeoutError" || /timed? ?out/i.test(e.message ?? "")) {
    return new GeminiError("timeout", "Gemini took too long to respond.", true);
  }
  return new GeminiError("gemini_error", `Gemini request failed${status ? ` (${status})` : ""}.`, false, status);
}

async function generateOnce(req: GeminiRequest, contents: Content[], jsonSchema: unknown) {
  return gemini().models.generateContent({
    model: req.model,
    contents,
    config: {
      ...(req.systemInstruction ? { systemInstruction: req.systemInstruction } : {}),
      ...(req.mediaResolution ? { mediaResolution: RESOLUTION[req.mediaResolution] } : {}),
      thinkingConfig: { thinkingLevel: THINKING[req.thinking] },
      responseMimeType: "application/json",
      responseJsonSchema: jsonSchema,
      httpOptions: { timeout: req.timeoutMs },
    },
  });
}

/** Parse text as JSON and validate it. Returns the zod issues as a readable string on failure. */
function parseAndValidate<S extends z.ZodType>(schema: S, text: string | undefined) {
  let json: unknown;
  try {
    json = JSON.parse(text ?? "");
  } catch {
    return { ok: false as const, problem: "Response was not valid JSON." };
  }
  const parsed = schema.safeParse(json);
  if (parsed.success) return { ok: true as const, data: parsed.data as z.infer<S> };
  return { ok: false as const, problem: z.prettifyError(parsed.error) };
}

export async function callGeminiJson<S extends z.ZodType>(
  schema: S,
  req: GeminiRequest,
  log: { docId?: string; stage: string },
): Promise<GeminiResult<z.infer<S>>> {
  const jsonSchema = z.toJSONSchema(schema);
  const contents: Content[] = [{ role: "user", parts: req.parts }];
  const started = Date.now();
  let attempts = 0;

  // 1) The main call, with retries on transient failures.
  let response: Awaited<ReturnType<typeof generateOnce>> | undefined;
  for (let retry = 0; ; retry++) {
    attempts++;
    try {
      response = await generateOnce(req, contents, jsonSchema);
      break;
    } catch (err) {
      const e = classify(err);
      logger.warn({ ...log, model: req.model, attempt: attempts, code: e.code, status: e.status }, "gemini call failed");
      if (!e.retryable || retry >= MAX_RETRIES) throw e;
      await sleep(backoffMs(retry));
    }
  }

  // 2) Validate. If the JSON doesn't match the schema, ask once for a corrected version.
  let result = parseAndValidate(schema, response.text);
  if (!result.ok) {
    logger.warn({ ...log, model: req.model, problem: result.problem.slice(0, 500) }, "gemini output failed validation; repairing");
    attempts++;
    const repairTurns: Content[] = [
      ...contents,
      { role: "model", parts: [{ text: response.text ?? "" }] },
      {
        role: "user",
        parts: [{ text: `Your JSON did not match the required schema:\n${result.problem}\nReturn the corrected JSON only.` }],
      },
    ];
    try {
      response = await generateOnce(req, repairTurns, jsonSchema);
    } catch (err) {
      throw classify(err);
    }
    result = parseAndValidate(schema, response.text);
    if (!result.ok) throw new GeminiError("invalid_output", "Gemini returned data in an unexpected format.", false);
  }

  const u = response.usageMetadata;
  const info = {
    model: req.model,
    settings: { thinking: req.thinking, mediaResolution: req.mediaResolution ?? null },
    latencyMs: Date.now() - started,
    attempts,
    usage: {
      promptTokens: u?.promptTokenCount,
      outputTokens: u?.candidatesTokenCount,
      thoughtsTokens: u?.thoughtsTokenCount,
      totalTokens: u?.totalTokenCount,
    },
  };
  logger.info({ ...log, model: req.model, latencyMs: info.latencyMs, attempts, tokens: info.usage.totalTokens }, "gemini ok");
  return { data: result.data, info };
}
