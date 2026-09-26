import type { DocumentSummary } from "@inkwell/shared";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { CameraButton } from "../components/CameraButton";
import { UploadDropzone } from "../components/UploadDropzone";
import { api, ApiRequestError } from "../lib/api";

export function Home() {
  const navigate = useNavigate();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [examples, setExamples] = useState<DocumentSummary[] | null>(null);

  useEffect(() => {
    api.listExamples().then(setExamples, () => setExamples([]));
  }, []);

  const upload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const { id } = await api.createDocument(file);
      navigate(`/doc/${id}`);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : "Upload failed. Please try again.");
      setUploading(false);
    }
  };

  return (
    <div className="py-10 sm:py-14">
      <section className="max-w-3xl">
        <h1 className="font-display text-4xl leading-tight sm:text-5xl">Read the Founders' handwriting</h1>
        <p className="mt-4 font-serif text-lg text-ink-soft">
          Photograph an 18th-century letter. Inkwell transcribes it, modernizes it, explains who and what it mentions, and reads it aloud.
        </p>
      </section>

      <section className="mt-8 grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
        <CameraButton onFile={upload} disabled={uploading} />
        <UploadDropzone onFile={upload} disabled={uploading} />
      </section>
      <div aria-live="polite" className="mt-3 min-h-6 text-sm">
        {uploading && <span className="text-ink-soft">Uploading…</span>}
        {error && <span className="text-sepia-dark" role="alert">{error}</span>}
      </div>

      <section className="mt-12">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">Try an example</h2>
        {examples === null ? (
          <p className="mt-3 text-ink-soft">Loading examples…</p>
        ) : examples.length === 0 ? (
          <p className="mt-3 text-ink-soft">No examples yet.</p>
        ) : (
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {examples.map((ex) => (
              <li key={ex.id}>
                <Link to={`/doc/${ex.id}`} className="block overflow-hidden rounded-2xl border border-rule bg-card shadow-sm hover:border-sepia">
                  <img src={ex.imageUrl} alt="" loading="lazy" className="aspect-[4/3] w-full object-cover object-top" />
                  <span className="block p-3 font-serif font-semibold">{ex.title ?? "Untitled letter"}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
