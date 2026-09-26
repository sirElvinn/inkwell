// Stage 3b: diplomatic transcription → metadata, entities, context, discussion questions (spec §10.5).
import { AnnotationResult, type TranscriptionResult } from "@inkwell/shared";
import { ANNOTATE_PROMPT_V1, transcriptionForPrompt } from "./prompts";
import { runTextStage } from "./textStage";

export function annotate(transcription: TranscriptionResult, docId?: string) {
  return runTextStage(AnnotationResult, {
    stage: "annotate",
    prompt: ANNOTATE_PROMPT_V1,
    input: transcriptionForPrompt(transcription),
    thinking: "medium",
    docId,
  });
}
