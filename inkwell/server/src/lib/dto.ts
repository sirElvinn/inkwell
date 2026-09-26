// DB row → API DTO. JSON columns are re-validated with the shared schemas so the client
// can trust every field it receives.
import { AnnotationResult, DocumentDTO, ModernizationResult, RunInfo, TranscriptionResult } from "@inkwell/shared";
import type { z } from "zod";
import type { Document } from "../generated/prisma/client";
import { uploadUrl } from "./storage";

function parseOrNull<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> | null {
  if (value == null) return null;
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Wikipedia search link for an identified entity. Founders Online's search URL format couldn't be
 * verified (the site blocks automated requests), so we don't link there yet. */
function wikipediaSearch(name: string | null): string | null {
  return name ? `https://en.wikipedia.org/w/index.php?search=${encodeURIComponent(name)}` : null;
}

export function toDocumentDTO(doc: Document): DocumentDTO {
  const annotations = parseOrNull(AnnotationResult, doc.annotations);
  return DocumentDTO.parse({
    id: doc.id,
    createdAt: doc.createdAt.toISOString(),
    source: doc.source,
    title: doc.title,
    status: doc.status,
    errorMessage: doc.errorMessage,
    imageUrl: uploadUrl(doc.derivedPath ?? doc.originalPath),
    width: doc.width,
    height: doc.height,
    pipelineVersion: doc.pipelineVersion,
    transcription: parseOrNull(TranscriptionResult, doc.transcription),
    modernization: parseOrNull(ModernizationResult, doc.modernization),
    annotations,
    runInfo: parseOrNull(RunInfo, doc.runInfo),
    entityLinks: (annotations?.entities ?? []).map((e) => ({ wikipedia: wikipediaSearch(e.canonical_name) })),
  });
}
