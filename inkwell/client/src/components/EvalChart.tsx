import type { EvalRunSummary } from "@inkwell/shared";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** Mean loose CER per configuration (lower is better). Tesseract bar in sepia, Gemini configs in ink. */
export function EvalChart({ runs }: { runs: EvalRunSummary[] }) {
  const data = [...runs]
    .sort((a, b) => a.summary.loose.cer.mean - b.summary.loose.cer.mean)
    .map((r) => ({ name: r.config.label, cer: r.summary.loose.cer.mean, n: r.summary.n, baseline: r.config.kind === "tesseract" }));
  return (
    <figure>
      <div className="h-72 w-full" role="img" aria-label={`Bar chart of character error rate by configuration: ${data.map((d) => `${d.name} ${pct(d.cer)}`).join("; ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 8 }}>
            <CartesianGrid horizontal={false} stroke="#e2d5b8" />
            <XAxis type="number" domain={[0, (max: number) => Math.min(1, Math.max(0.1, max * 1.1))]} tickFormatter={pct} stroke="#4a5570" fontSize={12} />
            <YAxis type="category" dataKey="name" width={220} stroke="#4a5570" fontSize={12} />
            <Tooltip formatter={(v) => [pct(Number(v)), "Loose CER"]} contentStyle={{ background: "#fffcf5", border: "1px solid #e2d5b8", borderRadius: 8 }} />
            <Bar dataKey="cer" radius={[0, 4, 4, 0]}>
              {data.map((d) => (
                <Cell key={d.name} fill={d.baseline ? "#8b5e34" : "#1f2a44"} />
              ))}
              <LabelList dataKey="cer" position="right" formatter={(v) => pct(Number(v))} fontSize={12} fill="#1f2a44" />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="mt-2 text-sm text-ink-soft">Mean character error rate after loose normalization. Lower is better. Brown = classic OCR baseline.</figcaption>
    </figure>
  );
}
