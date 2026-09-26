import type { EvalRunFile, EvalRunSummary, EvalSample } from "@inkwell/shared";
import { useEffect, useMemo, useState } from "react";
import { DiffView } from "../components/DiffView";
import { EvalChart } from "../components/EvalChart";
import { api } from "../lib/api";

const pct = (x: number | null | undefined) => (x == null ? "not measured yet" : `${(x * 100).toFixed(1)}%`);

/** Latest run per configuration name. */
function latestPerConfig(runs: EvalRunSummary[]): EvalRunSummary[] {
  const seen = new Map<string, EvalRunSummary>();
  for (const r of runs) if (!seen.has(r.config.name) && r.summary.n > 0) seen.set(r.config.name, r); // runs arrive newest first
  return [...seen.values()];
}

type SortKey = "id" | "looseCer" | "strictCer" | "looseWer";
type Filter = "all" | "famous" | "lesser";

export function Accuracy() {
  const [runs, setRuns] = useState<EvalRunSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [detail, setDetail] = useState<EvalRunFile | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "looseCer", asc: true });
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    api.evalRuns().then(setRuns, () => setError("Couldn't load accuracy results."));
  }, []);

  const current = useMemo(() => (runs ? latestPerConfig(runs) : []), [runs]);
  const best = useMemo(() => current.filter((r) => r.config.kind === "gemini").sort((a, b) => a.summary.loose.cer.mean - b.summary.loose.cer.mean)[0], [current]);
  const baseline = current.find((r) => r.config.kind === "tesseract");

  // Show the best Gemini run's details by default.
  useEffect(() => {
    if (!runId && best) setRunId(best.id);
  }, [best, runId]);
  useEffect(() => {
    if (runId) api.evalRun(runId).then((d) => { setDetail(d); setSelected(d.samples.find((s) => !s.error)?.id ?? null); }, () => setError("Couldn't load that run."));
  }, [runId]);

  const samples = useMemo(() => {
    const list = (detail?.samples ?? []).filter((s) => (filter === "all" ? true : filter === "famous" ? s.famous : !s.famous));
    const value = (s: EvalSample) =>
      sort.key === "id" ? s.id : sort.key === "looseCer" ? s.loose.cer : sort.key === "strictCer" ? s.strict.cer : s.loose.wer;
    return [...list].sort((a, b) => {
      if (a.error || b.error) return a.error ? 1 : -1;
      const x = value(a);
      const y = value(b);
      const c = typeof x === "string" ? x.localeCompare(String(y)) : x - (y as number);
      return sort.asc ? c : -c;
    });
  }, [detail, filter, sort]);
  const selectedSample = detail?.samples.find((s) => s.id === selected);

  const header = (key: SortKey, label: string) => (
    <th scope="col" className="px-3 py-2 font-medium" aria-sort={sort.key === key ? (sort.asc ? "ascending" : "descending") : "none"}>
      <button type="button" className="hover:text-ink" onClick={() => setSort((s) => ({ key, asc: s.key === key ? !s.asc : true }))}>
        {label} {sort.key === key ? (sort.asc ? "▲" : "▼") : ""}
      </button>
    </th>
  );

  return (
    <div className="space-y-10 py-10">
      <section className="max-w-3xl">
        <h1 className="font-display text-4xl">How accurate is Inkwell?</h1>
        {error && <p className="mt-4 text-sepia-dark" role="alert">{error}</p>}
        {runs === null && !error && <p className="mt-4 text-ink-soft">Loading results…</p>}
        {runs && !best && (
          <p className="mt-4 font-serif text-lg text-ink-soft">Accuracy is not measured yet. Results appear here after the evaluation has run on our test letters.</p>
        )}
        {best && (
          <p className="mt-4 font-serif text-xl leading-relaxed">
            On <strong>{best.summary.n} letters</strong>, Inkwell's normalized character error rate is <strong>{pct(best.summary.loose.cer.mean)}</strong>
            {baseline ? <>, versus <strong>{pct(baseline.summary.loose.cer.mean)}</strong> for classic OCR (Tesseract)</> : <> (classic OCR baseline: not measured yet)</>}.
          </p>
        )}
        {best && (
          <p className="mt-3 text-sm text-ink-soft">
            Best configuration: {best.config.label}. Loose normalization (see methodology). Famous letters: {pct(best.summary.looseCerFamous)}; lesser-known letters: {pct(best.summary.looseCerLesserKnown)}. Famous letters may appear in the model's training data, which can make them look easier.
          </p>
        )}
      </section>

      {current.length > 0 && (
        <section>
          <h2 className="font-display text-2xl">Error rate by configuration</h2>
          <div className="mt-4 rounded-2xl border border-rule bg-card p-4">
            <EvalChart runs={current} />
          </div>
        </section>
      )}

      {detail && (
        <section>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-display text-2xl">Letter by letter</h2>
            <div className="flex flex-wrap gap-3 text-sm">
              <label className="flex items-center gap-2">
                Run
                <select className="rounded-md border border-rule bg-card px-2 py-1" value={runId ?? ""} onChange={(e) => setRunId(e.target.value)}>
                  {current.map((r) => (
                    <option key={r.id} value={r.id}>{r.config.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2">
                Show
                <select className="rounded-md border border-rule bg-card px-2 py-1" value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
                  <option value="all">All letters</option>
                  <option value="lesser">Lesser-known</option>
                  <option value="famous">Famous</option>
                </select>
              </label>
            </div>
          </div>
          <div className="mt-4 overflow-x-auto rounded-xl border border-rule bg-card">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-rule text-ink-soft">
                <tr>
                  {header("id", "Letter")}
                  <th scope="col" className="px-3 py-2 font-medium">Type</th>
                  {header("looseCer", "Loose CER")}
                  {header("strictCer", "Strict CER")}
                  {header("looseWer", "Loose WER")}
                  <th scope="col" className="px-3 py-2 font-medium">Time</th>
                </tr>
              </thead>
              <tbody>
                {samples.map((s) => (
                  <tr
                    key={s.id}
                    className={`cursor-pointer border-b border-rule/60 last:border-0 hover:bg-parchment-deep ${s.id === selected ? "bg-parchment-deep" : ""}`}
                    onClick={() => setSelected(s.id)}
                  >
                    <td className="px-3 py-2">
                      <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => setSelected(s.id)}>{s.id}</button>
                    </td>
                    <td className="px-3 py-2">{s.famous ? "Famous" : "Lesser-known"} · {s.hand}</td>
                    {s.error ? (
                      <td colSpan={4} className="px-3 py-2 text-sepia-dark">Failed: {s.error}</td>
                    ) : (
                      <>
                        <td className="px-3 py-2 tabular-nums">{pct(s.loose.cer)}</td>
                        <td className="px-3 py-2 tabular-nums">{pct(s.strict.cer)}</td>
                        <td className="px-3 py-2 tabular-nums">{pct(s.loose.wer)}</td>
                        <td className="px-3 py-2 tabular-nums">{(s.latencyMs / 1000).toFixed(1)} s</td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {selectedSample && !selectedSample.error && (
            <div className="mt-6">
              <h3 className="font-serif text-lg font-semibold">Diff for {selectedSample.id}</h3>
              <DiffView prediction={selectedSample.prediction} reference={selectedSample.reference} />
            </div>
          )}
        </section>
      )}

      <section className="max-w-3xl space-y-3 font-serif text-lg leading-relaxed">
        <h2 className="font-display text-2xl">Methodology</h2>
        <p>
          We took single-page letters from the Library of Congress's digitized George Washington Papers and paired each scan with the expert transcription of the same physical manuscript published by Founders Online (National Archives). We only pair a scan with a transcription when the edition's source note says it was made from that Library of Congress manuscript.
        </p>
        <p>
          Each image goes through exactly the same transcription code the app uses. We compare Inkwell's output to the expert text with edit distance: the fewest character insertions, deletions, and substitutions that turn one into the other. Character error rate (CER) is that count divided by the number of characters in the expert transcription; word error rate (WER) does the same with words.
        </p>
        <p>
          <strong>Strict</strong> scoring only normalizes whitespace. <strong>Loose</strong> scoring also ignores editorial conventions that aren't about reading the handwriting: the long s, quote and dash styles, bracketed editorial notes, capitalization, punctuation, and words hyphenated across a line break. Classic OCR (Tesseract, English model) runs on the same images as a baseline.
        </p>
      </section>
    </div>
  );
}
