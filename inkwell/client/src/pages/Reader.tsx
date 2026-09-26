import { useState } from "react";
import { Link, useParams } from "react-router";
import { ImageViewer } from "../components/ImageViewer";
import { ProgressSteps } from "../components/ProgressSteps";
import { TranscriptTabs } from "../components/TranscriptTabs";
import { useDocument } from "../hooks/useDocument";

export function Reader() {
  const { id = "" } = useParams();
  const { doc, error, retry } = useDocument(id);
  const [retrying, setRetrying] = useState(false);

  if (!doc) {
    return (
      <div className="py-12" aria-live="polite">
        {error ? (
          <>
            <p className="text-sepia-dark" role="alert">{error}</p>
            <Link to="/" className="mt-4 inline-block font-medium text-sepia-dark underline">Back to home</Link>
          </>
        ) : (
          <p className="text-ink-soft">Loading letter…</p>
        )}
      </div>
    );
  }

  const running = !["DONE", "ERROR"].includes(doc.status);
  const transcribe = doc.runInfo?.stages.transcribe;
  const seconds = doc.runInfo?.totalMs ? (doc.runInfo.totalMs / 1000).toFixed(1) : null;

  const onRetry = async () => {
    setRetrying(true);
    try {
      await retry();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div className="py-6">
      {running && (
        <div className="mb-5 rounded-xl border border-rule bg-card p-4">
          <ProgressSteps status={doc.status} />
        </div>
      )}
      {doc.status === "ERROR" && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-sepia/40 bg-parchment-deep p-4" role="alert">
          <p className="flex-1">{doc.errorMessage ?? "Something went wrong."}</p>
          <button
            type="button"
            onClick={onRetry}
            disabled={retrying}
            className="rounded-lg bg-ink px-4 py-2 font-semibold text-parchment disabled:opacity-60"
          >
            {retrying ? "Retrying…" : "Try again"}
          </button>
        </div>
      )}
      {error && <p className="mb-4 text-sm text-sepia-dark" role="alert">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="lg:sticky lg:top-20 lg:self-start">
          <ImageViewer src={doc.imageUrl} alt="The uploaded letter" />
        </div>
        <div>
          <TranscriptTabs doc={doc} />
        </div>
      </div>

      <footer className="mt-10 border-t border-rule pt-4 text-xs text-ink-soft">
        {transcribe && <span>Transcribed by {transcribe.model}. </span>}
        {seconds && !running && <span>Processed in {seconds} s. </span>}
        <span>AI-generated; may contain errors.</span>
      </footer>
    </div>
  );
}
