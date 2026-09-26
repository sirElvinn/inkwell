import type { DocumentStatus } from "@inkwell/shared";

const STEPS = [
  { key: "transcribe", label: "Reading the handwriting…", activeOn: ["QUEUED", "PREPROCESSING", "TRANSCRIBING"] },
  { key: "modernize", label: "Modernizing the spelling…", activeOn: ["ENRICHING"] },
  { key: "annotate", label: "Finding people & places…", activeOn: ["ENRICHING"] },
] as const;

const ORDER: DocumentStatus[] = ["QUEUED", "PREPROCESSING", "TRANSCRIBING", "ENRICHING", "DONE"];

export function ProgressSteps({ status }: { status: DocumentStatus }) {
  const at = ORDER.indexOf(status);
  return (
    <ol className="flex flex-col gap-2 sm:flex-row sm:gap-6" aria-live="polite" aria-label="Processing progress">
      {STEPS.map((step) => {
        const active = (step.activeOn as readonly string[]).includes(status);
        const done = !active && at > ORDER.indexOf(step.activeOn[step.activeOn.length - 1] as DocumentStatus);
        return (
          <li key={step.key} className={`flex items-center gap-2 text-sm ${active ? "font-medium text-ink" : done ? "text-ink" : "text-ink-soft"}`}>
            <span
              aria-hidden="true"
              className={`inline-block h-3 w-3 rounded-full border-2 ${
                done ? "border-sepia bg-sepia" : active ? "animate-pulse border-sepia motion-reduce:animate-none" : "border-rule"
              }`}
            />
            {step.label}
            <span className="sr-only">{done ? "(done)" : active ? "(in progress)" : "(waiting)"}</span>
          </li>
        );
      })}
    </ol>
  );
}
