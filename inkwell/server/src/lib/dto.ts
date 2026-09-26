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

export function toDocumentDTO(doc: Document): DocumentDTO {
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
    annotations: parseOrNull(AnnotationResult, doc.annotations),
    runInfo: parseOrNull(RunInfo, doc.runInfo),
  });
}
