import type { AnnotationResult } from "@inkwell/shared";
import { ConfidenceBadge, EntityCard } from "./EntityCard";

const META_LABELS = { author: "Author", recipient: "Recipient", date: "Date", place: "Place written" } as const;
const TYPE_ORDER = ["person", "place", "organization", "event", "document", "other"] as const;
const TYPE_HEADINGS: Record<(typeof TYPE_ORDER)[number], string> = {
  person: "People",
  place: "Places",
  organization: "Organizations",
  event: "Events",
  document: "Documents",
  other: "Other",
};

export function PeoplePlaces({ annotations, links }: { annotations: AnnotationResult; links: { wikipedia: string | null }[] }) {
  const { letter_metadata: meta, entities } = annotations;
  return (
    <div className="space-y-8">
      <section>
        <h2 className="font-display text-2xl">About this letter</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2">
          {(Object.keys(META_LABELS) as (keyof typeof META_LABELS)[]).map((k) => (
            <div key={k} className="rounded-xl border border-rule bg-card p-3">
              <dt className="flex items-center justify-between gap-2 text-sm text-ink-soft">
                {META_LABELS[k]} <ConfidenceBadge level={meta[k].confidence} />
              </dt>
              <dd className="mt-1 font-serif text-lg">{meta[k].value ?? "Unknown"}</dd>
              <dd className="mt-1 text-sm text-ink-soft">{meta[k].evidence}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section>
        <h2 className="font-display text-2xl">Historical context</h2>
        <p className="mt-2 font-serif text-lg leading-relaxed">{annotations.context}</p>
        <p className="mt-3 rounded-xl bg-parchment-deep p-4 font-serif leading-relaxed">
          <span className="font-sans text-sm font-semibold uppercase tracking-wide text-sepia-dark">Why it matters </span>
          {annotations.why_it_matters}
        </p>
      </section>

      {TYPE_ORDER.map((type) => {
        const items = entities.map((e, i) => ({ e, i })).filter(({ e }) => e.type === type);
        if (!items.length) return null;
        return (
          <section key={type}>
            <h2 className="font-display text-2xl">{TYPE_HEADINGS[type]}</h2>
            <div className="mt-3 grid gap-3">
              {items.map(({ e, i }) => (
                <EntityCard key={i} entity={e} wikipedia={links[i]?.wikipedia ?? null} />
              ))}
            </div>
          </section>
        );
      })}

      <section>
        <h2 className="font-display text-2xl">Discussion questions</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-6 font-serif text-lg leading-relaxed">
          {annotations.discussion_questions.map((q, i) => (
            <li key={i}>{q}</li>
          ))}
        </ol>
      </section>
    </div>
  );
}
