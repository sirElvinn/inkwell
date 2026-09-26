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
