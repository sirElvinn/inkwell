import type { TranscriptionResult } from "@inkwell/shared";
import { Fragment, type ReactNode } from "react";
import { UncertainWord } from "./UncertainWord";

type Line = TranscriptionResult["lines"][number];
type UncertainItem = TranscriptionResult["uncertain"][number];

/** Split one line into plain text and UncertainWord pieces, wherever an uncertain reading occurs in it. */
function renderLine(line: Line, uncertain: UncertainItem[]): ReactNode {
  const pieces: ReactNode[] = [];
  let rest = line.text;
  let key = 0;
  for (const u of uncertain) {
    const at = u.reading ? rest.indexOf(u.reading) : -1;
    if (at < 0) continue; // the model's reading isn't literally in the line; skip rather than guess
    pieces.push(<Fragment key={key++}>{rest.slice(0, at)}</Fragment>);
    pieces.push(<UncertainWord key={key++} text={u.reading} info={u} />);
    rest = rest.slice(at + u.reading.length);
  }
  pieces.push(<Fragment key={key++}>{rest}</Fragment>);
  return pieces;
}

export function AsWritten({ transcription }: { transcription: TranscriptionResult }) {
  return (
    <div>
      <ol className="font-serif text-lg leading-relaxed">
        {transcription.lines.map((line) => (
          <li key={line.n} className="grid grid-cols-[2.5rem_1fr] gap-2">
            <span className="select-none pt-1 text-right font-sans text-xs text-ink-soft" aria-hidden="true">{line.n}</span>
            <span>{renderLine(line, transcription.uncertain.filter((u) => u.line === line.n))}</span>
          </li>
        ))}
      </ol>
      {transcription.notes && (
        <p className="mt-6 rounded-lg bg-parchment-deep p-3 text-sm text-ink-soft">
          <span className="font-medium text-ink">Notes on the page: </span>
          {transcription.notes}
        </p>
      )}
    </div>
  );
}
