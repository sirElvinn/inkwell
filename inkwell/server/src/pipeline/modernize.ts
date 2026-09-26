// Stage 3a: diplomatic transcription → modern English, plain English, summary, glossary (spec §10.4).
import { ModernizationResult, type TranscriptionResult } from "@inkwell/shared";
import { MODERNIZE_PROMPT_V1, transcriptionForPrompt } from "./prompts";
import { runTextStage } from "./textStage";

export function modernize(transcription: TranscriptionResult, docId?: string) {
  return runTextStage(ModernizationResult, {
    stage: "modernize",
    prompt: MODERNIZE_PROMPT_V1,
    input: transcriptionForPrompt(transcription),
    thinking: "low",
    docId,
  });
}
