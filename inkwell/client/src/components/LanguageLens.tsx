// Language Lens (Linguistics track): the glossary grouped by category, with counts.
import type { GlossaryCategory, ModernizationResult } from "@inkwell/shared";

const CATEGORIES: { key: GlossaryCategory; label: string; blurb: string }[] = [
  { key: "abbreviation", label: "Abbreviations", blurb: "Shortened words, often with raised letters, that saved ink and paper." },
  { key: "spelling", label: "Historical spellings", blurb: "Spellings that were normal before American English was standardized." },
  { key: "archaic_word", label: "Archaic words", blurb: "Words or meanings that have fallen out of everyday use." },
  { key: "symbol", label: "Symbols", blurb: "Marks like & and &c. that stood in for words." },
  { key: "other", label: "Other", blurb: "Other features worth noticing." },
];

export function LanguageLens({ glossary }: { glossary: ModernizationResult["glossary"] }) {
  if (!glossary.length) return <p className="text-ink-soft">No historical spellings or abbreviations were found in this letter.</p>;
  const groups = CATEGORIES.map((c) => ({ ...c, items: glossary.filter((g) => g.category === c.key) })).filter((g) => g.items.length);

  return (
    <div className="space-y-8">
      <ul className="flex flex-wrap gap-2" aria-label="Counts by category">
        {groups.map((g) => (
          <li key={g.key} className="rounded-full border border-rule bg-card px-3 py-1 text-sm">
            <span className="font-semibold">{g.items.length}</span> {g.label.toLowerCase()}
          </li>
        ))}
      </ul>
      {groups.map((g) => (
        <section key={g.key}>
          <h2 className="font-display text-2xl">{g.label}</h2>
          <p className="mt-1 text-sm text-ink-soft">{g.blurb}</p>
          <div className="mt-3 overflow-x-auto rounded-xl border border-rule bg-card">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-rule text-ink-soft">
                <tr>
                  <th scope="col" className="px-3 py-2 font-medium">As written</th>
                  <th scope="col" className="px-3 py-2 font-medium">Modern</th>
                  <th scope="col" className="px-3 py-2 font-medium">Explanation</th>
                </tr>
              </thead>
              <tbody>
                {g.items.map((item, i) => (
                  <tr key={i} className="border-b border-rule/60 last:border-0 align-top">
                    <td className="px-3 py-2 font-serif text-base italic">{item.original}</td>
                    <td className="px-3 py-2 font-serif text-base">{item.modern}</td>
                    <td className="px-3 py-2">{item.explanation}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
