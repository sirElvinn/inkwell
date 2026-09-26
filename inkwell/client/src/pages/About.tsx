const STEPS = [
  { title: "Photo", body: "A phone photo or scan of a handwritten letter. We fix its rotation, resize it, and strip location data." },
  { title: "Read", body: "Gemini produces a diplomatic transcription: original spelling, abbreviations, and line breaks, with uncertain words flagged." },
  { title: "Explain", body: "In parallel, Gemini modernizes the text, writes a plain-English version, and identifies the people, places, and events." },
  { title: "Listen", body: "An ElevenLabs AI narrator reads the letter while each word lights up on screen." },
];

export function About() {
  return (
    <div className="max-w-3xl space-y-10 py-10">
      <section>
        <h1 className="font-display text-4xl">About Inkwell</h1>
        <p className="mt-4 font-serif text-lg leading-relaxed">
          The Founders' papers are a shared civic inheritance, but most people can't read 18th-century handwriting. Inkwell turns a photo of a Revolutionary-era letter into something anyone can read, understand, and hear, in time for America's 250th anniversary and William &amp; Mary's Year of Civic Leadership.
        </p>
      </section>

      <section>
        <h2 className="font-display text-2xl">How it works</h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative rounded-xl border border-rule bg-card p-4">
              <span className="font-sans text-xs font-semibold uppercase tracking-wider text-sepia-dark">Step {i + 1}</span>
              <h3 className="mt-1 font-serif text-lg font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">{s.body}</p>
              {i < STEPS.length - 1 && (
                <span aria-hidden="true" className="absolute -right-2.5 top-1/2 hidden -translate-y-1/2 text-sepia lg:block">→</span>
              )}
            </li>
          ))}
        </ol>
        <p className="mt-4 text-sm text-ink-soft">
          We measure transcription accuracy against expert transcriptions; see the <a href="/accuracy" className="font-medium text-sepia-dark underline">Accuracy</a> page.
        </p>
      </section>

      <section className="space-y-3 font-serif text-lg leading-relaxed">
        <h2 className="font-display text-2xl">Limitations and ethics</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            <strong>AI transcriptions can be wrong.</strong> Inkwell is a reading aid, not a replacement for scholarly editions. For research, use the authoritative transcriptions at Founders Online.
          </li>
          <li>
            <strong>We don't sanitize history.</strong> The Founders' papers include references to slavery, violence, and language that is offensive today. Inkwell renders them faithfully and gives factual, respectful context.
          </li>
          <li>
            <strong>The narrator is an AI voice.</strong> It's a clearly labeled narrator from the ElevenLabs voice library and doesn't imitate any historical person.
          </li>
          <li>
            <strong>Famous letters may look easier than they are.</strong> They can appear in AI training data, so we report accuracy on famous and lesser-known letters separately.
          </li>
          <li>
            <strong>Your photos.</strong> Uploaded images are stored only to show you the results, and location data is removed from the image the AI sees.
          </li>
        </ul>
      </section>

      <section className="space-y-3 font-serif text-lg leading-relaxed">
        <h2 className="font-display text-2xl">Sources and credits</h2>
        <ul className="list-disc space-y-2 pl-6">
          <li>
            Letter images: <a className="text-sepia-dark underline" href="https://www.loc.gov/collections/george-washington-papers/" target="_blank" rel="noopener noreferrer">George Washington Papers</a> and{" "}
            <a className="text-sepia-dark underline" href="https://www.loc.gov/collections/thomas-jefferson-papers/" target="_blank" rel="noopener noreferrer">Thomas Jefferson Papers</a>, Manuscript Division, Library of Congress.
          </li>
          <li>
            Expert transcriptions used for accuracy testing: <a className="text-sepia-dark underline" href="https://founders.archives.gov/" target="_blank" rel="noopener noreferrer">Founders Online</a>, National Archives, in partnership with the University of Virginia Press. Used for non-commercial research.
          </li>
          <li>AI: Google Gemini (transcription, modernization, annotation) and ElevenLabs (narration).</li>
          <li>Fonts: IM Fell English (Igino Marini), Source Serif 4, and Inter, via Google Fonts.</li>
        </ul>
        <p className="font-sans text-sm text-ink-soft">Built at &amp;hacks XII, William &amp; Mary.</p>
      </section>
    </div>
  );
}
