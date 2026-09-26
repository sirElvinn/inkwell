// Shared zod schemas. One definition gives three things:
//   1. the TypeScript type (same name as the schema),
//   2. a runtime check for API bodies and LLM output,
//   3. the JSON Schema sent to Gemini as its structured-output format (via z.toJSONSchema).
import { z } from "zod";

// ---------- health + errors ----------

export const HealthResponse = z.object({
  ok: z.boolean(),
  db: z.boolean(),
  gemini: z.boolean(),
  elevenlabs: z.boolean(),
  /** DEMO_MODE: only already-processed letters and cached audio are served. */
  demoMode: z.boolean(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

/** Every API error has this shape. */
export const ApiError = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiError = z.infer<typeof ApiError>;

// ---------- LLM outputs (spec §10.3–10.5) ----------

export const TranscriptionResult = z.object({
  not_a_manuscript: z.boolean(),
  lines: z.array(z.object({ n: z.number().int(), text: z.string() })),
  uncertain: z.array(
    z.object({
      line: z.number().int(),
      reading: z.string(),
      alternatives: z.array(z.string()).max(2),
      reason: z.string(),
    }),
  ),
  notes: z.string().describe("Dockets, later hands, damage, other observations"),
  script_description: z.string().describe("One sentence, e.g. 'neat clerk's hand, faded brown ink'"),
});
export type TranscriptionResult = z.infer<typeof TranscriptionResult>;

export const GlossaryCategory = z.enum(["spelling", "abbreviation", "archaic_word", "symbol", "other"]);
export type GlossaryCategory = z.infer<typeof GlossaryCategory>;

export const ModernizationResult = z.object({
  modern_text: z.string(),
  plain_english: z.string(),
  summary: z.string(),
  glossary: z.array(
    z.object({
      original: z.string(),
      modern: z.string(),
      category: GlossaryCategory,
      explanation: z.string(),
    }),
  ),
});
export type ModernizationResult = z.infer<typeof ModernizationResult>;

export const Confidence = z.enum(["low", "medium", "high"]);
export type Confidence = z.infer<typeof Confidence>;

const MetaField = z.object({
  value: z.string().nullable(),
  confidence: Confidence,
  evidence: z.string(),
});

export const EntityType = z.enum(["person", "place", "organization", "event", "document", "other"]);

export const AnnotationResult = z.object({
  letter_metadata: z.object({ author: MetaField, recipient: MetaField, date: MetaField, place: MetaField }),
  entities: z.array(
    z.object({
      surface: z.string(),
      canonical_name: z.string().nullable(),
      type: EntityType,
      description: z.string(),
      confidence: Confidence,
      lines: z.array(z.number().int()),
    }),
  ),
  context: z.string(),
  why_it_matters: z.string(),
  discussion_questions: z.array(z.string()).length(3),
});
export type AnnotationResult = z.infer<typeof AnnotationResult>;

// ---------- run info (what produced each stored result) ----------

export const StageRunInfo = z.object({
  model: z.string(),
  promptVersion: z.string(),
  settings: z.record(z.string(), z.unknown()),
  latencyMs: z.number(),
  attempts: z.number().int(),
  usage: z
    .object({
      promptTokens: z.number().optional(),
      outputTokens: z.number().optional(),
      thoughtsTokens: z.number().optional(),
      totalTokens: z.number().optional(),
    })
    .optional(),
});
export type StageRunInfo = z.infer<typeof StageRunInfo>;

export const StageName = z.enum(["preprocess", "transcribe", "modernize", "annotate"]);
export type StageName = z.infer<typeof StageName>;

export const RunInfo = z.object({
  stages: z.partialRecord(StageName, StageRunInfo),
  /** Friendly per-stage error messages (e.g. annotate failed but the rest worked). */
  errors: z.partialRecord(StageName, z.string()).default({}),
  totalMs: z.number().optional(),
});
export type RunInfo = z.infer<typeof RunInfo>;

// ---------- API DTOs ----------

export const DocumentStatus = z.enum(["QUEUED", "PREPROCESSING", "TRANSCRIBING", "ENRICHING", "DONE", "ERROR"]);
export type DocumentStatus = z.infer<typeof DocumentStatus>;

export const DocumentSource = z.enum(["upload", "example", "seed"]);

export const DocumentDTO = z.object({
  id: z.string(),
  createdAt: z.string(),
  source: DocumentSource,
  title: z.string().nullable(),
  status: DocumentStatus,
  errorMessage: z.string().nullable(),
  imageUrl: z.string(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  pipelineVersion: z.string(),
  transcription: TranscriptionResult.nullable(),
  modernization: ModernizationResult.nullable(),
  annotations: AnnotationResult.nullable(),
  runInfo: RunInfo.nullable(),
  /** Server-built reference links, one per annotations.entities item (same order). */
  entityLinks: z.array(z.object({ wikipedia: z.string().nullable() })),
});
export type DocumentDTO = z.infer<typeof DocumentDTO>;

export const DocumentSummary = z.object({
  id: z.string(),
  title: z.string().nullable(),
  imageUrl: z.string(),
  status: DocumentStatus,
});
export type DocumentSummary = z.infer<typeof DocumentSummary>;

export const CreateDocumentResponse = z.object({
  id: z.string(),
  status: DocumentStatus,
  cached: z.boolean().optional(),
});
export type CreateDocumentResponse = z.infer<typeof CreateDocumentResponse>;

// ---------- narration ----------

export const NarrationVariantSchema = z.enum(["modern", "plain"]);

export const AudioRequest = z.object({ variant: NarrationVariantSchema });
export type AudioRequest = z.infer<typeof AudioRequest>;

/** One spoken word. Times are seconds from the start of its own chunk's audio file. */
export const WordTiming = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number(),
  /** Character offsets in the narrated text (see prepareNarration). */
  charStart: z.number().int(),
  charEnd: z.number().int(),
  /** Which audio file (chunk) this word is in; long letters are split into chunks. */
  chunk: z.number().int(),
});
export type WordTiming = z.infer<typeof WordTiming>;

export const AudioResponse = z.object({
  /** One URL per chunk, played in order as a playlist. */
  audioUrls: z.array(z.string()).min(1),
  words: z.array(WordTiming),
  durationSec: z.number(),
  voiceLabel: z.string(),
});
export type AudioResponse = z.infer<typeof AudioResponse>;

// ---------- evaluation (spec §12) ----------

export const ManifestEntry = z.object({
  id: z.string().regex(/^[\w-]+$/),
  image: z.string(),
  foundersId: z.string(),
  locUrl: z.string(),
  sourceNote: z.string(),
  hand: z.enum(["author", "clerk", "unknown"]),
  famous: z.boolean(),
  trimmed: z.boolean(),
  notes: z.string().default(""),
});
export type ManifestEntry = z.infer<typeof ManifestEntry>;

export const EvalConfig = z.object({
  name: z.string().regex(/^[\w-]+$/),
  label: z.string(),
  kind: z.enum(["gemini", "tesseract"]),
  model: z.string().optional(),
  thinking: z.enum(["low", "medium", "high"]).optional(),
  mediaResolution: z.enum(["low", "medium", "high"]).optional(),
  preprocess: z.enum(["default", "grayscale"]).default("default"),
});
export type EvalConfig = z.infer<typeof EvalConfig>;

const Rates = z.object({ cer: z.number(), wer: z.number() });

export const EvalSample = z.object({
  id: z.string(),
  famous: z.boolean(),
  hand: z.string(),
  strict: Rates,
  loose: Rates,
  latencyMs: z.number(),
  /** Model output (lines joined with \n) and the reference, both before normalization, for the diff view. */
  prediction: z.string(),
  reference: z.string(),
  model: z.string().optional(),
  error: z.string().optional(),
});
export type EvalSample = z.infer<typeof EvalSample>;

const Stats = z.object({ mean: z.number(), median: z.number(), min: z.number(), max: z.number() });

export const EvalSummary = z.object({
  n: z.number().int(),
  failed: z.number().int(),
  strict: z.object({ cer: Stats, wer: Stats }),
  loose: z.object({ cer: Stats, wer: Stats }),
  /** Loose CER mean for famous vs. lesser-known letters (contamination check). */
  looseCerFamous: z.number().nullable(),
  looseCerLesserKnown: z.number().nullable(),
  meanLatencyMs: z.number(),
});
export type EvalSummary = z.infer<typeof EvalSummary>;

export const EvalRunFile = z.object({
  id: z.string(),
  createdAt: z.string(),
  config: EvalConfig,
  summary: EvalSummary,
  samples: z.array(EvalSample),
});
export type EvalRunFile = z.infer<typeof EvalRunFile>;

export const EvalRunSummary = EvalRunFile.omit({ samples: true });
export type EvalRunSummary = z.infer<typeof EvalRunSummary>;
