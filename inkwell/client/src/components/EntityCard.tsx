import type { AnnotationResult } from "@inkwell/shared";

type Entity = AnnotationResult["entities"][number];

const CONFIDENCE_LABEL = { high: "High confidence", medium: "Medium confidence", low: "Low confidence" } as const;

export function ConfidenceBadge({ level }: { level: keyof typeof CONFIDENCE_LABEL }) {
  const tone = level === "high" ? "bg-parchment-deep text-ink" : level === "medium" ? "bg-amber/30 text-ink" : "bg-sepia/15 text-sepia-dark";
  return <span className={`rounded-full px-2 py-0.5 font-sans text-xs font-medium ${tone}`}>{CONFIDENCE_LABEL[level]}</span>;
}

export function EntityCard({ entity, wikipedia }: { entity: Entity; wikipedia: string | null }) {
  return (
    <article className="rounded-xl border border-rule bg-card p-4 font-sans">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-serif text-lg font-semibold">{entity.canonical_name ?? entity.surface}</h3>
        <span className="rounded-full bg-parchment-deep px-2 py-0.5 text-xs capitalize text-ink-soft">{entity.type}</span>
        <ConfidenceBadge level={entity.confidence} />
      </div>
      {entity.canonical_name && entity.canonical_name !== entity.surface && (
        <p className="mt-1 text-sm text-ink-soft">
          Written as <span className="font-serif italic">“{entity.surface}”</span>
          {entity.lines.length > 0 && <> on line {entity.lines.join(", ")}</>}
        </p>
      )}
      {!entity.canonical_name && <p className="mt-1 text-sm text-sepia-dark">Not confidently identified.</p>}
      <p className="mt-2 font-serif leading-relaxed">{entity.description}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-soft">
        {wikipedia && (
          <a href={wikipedia} target="_blank" rel="noopener noreferrer" className="font-medium text-sepia-dark underline">
            Search Wikipedia
          </a>
        )}
        <span>AI-generated, verify with sources.</span>
      </div>
    </article>
  );
}
