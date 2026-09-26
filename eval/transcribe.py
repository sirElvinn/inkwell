"""Run a transcription variant over every eval page and save outputs for score.py.

  export GEMINI_API_KEY=...
  python eval/transcribe.py zeroshot_flash --model gemini-3.8-flash
  python eval/transcribe.py fewshot_pro --model gemini-3.1-pro-preview --fewshot eval/fewshot
  python eval/transcribe.py selfcheck_pro --model gemini-3.1-pro-preview --selfcheck

Images:  eval/data/<id>.jpg (or .png)
Output:  eval/preds/<variant>/<id>.txt  (+ <id>.json with the raw response and timing)
Few-shot dir: pairs of <name>.jpg + <name>.json (correct response JSON), never eval pages.
"""
import argparse
import json
import time
from pathlib import Path

from google import genai
from google.genai import types

ROOT = Path(__file__).parent
PROMPT = (ROOT.parent / "prompts" / "transcribe.md").read_text(encoding="utf-8")
SCHEMA = {
    "type": "object",
    "properties": {
        "lines": {"type": "array", "items": {"type": "string"}},
        "uncertain": {"type": "array", "items": {"type": "object", "properties": {
            "line": {"type": "integer"}, "text": {"type": "string"}, "reason": {"type": "string"}}}},
        "writer_guess": {"type": "string"},
        "date_guess": {"type": "string"},
        "notes": {"type": "string"},
    },
    "required": ["lines", "uncertain"],
}
SELFCHECK = ("Here is a draft transcription. Compare it to the image line by line and return a "
             "corrected version under the same rules and schema.\n\n")


def image_part(path):
    mime = "image/png" if path.suffix.lower() == ".png" else "image/jpeg"
    return types.Part.from_bytes(data=path.read_bytes(), mime_type=mime)


def fewshot_turns(folder):
    turns = []
    for img in sorted(p for p in Path(folder).iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png")):
        answer = img.with_suffix(".json").read_text(encoding="utf-8")
        turns.append(types.Content(role="user", parts=[image_part(img)]))
        turns.append(types.Content(role="model", parts=[types.Part.from_text(text=answer)]))
    return turns


def call(client, model, contents):
    config = types.GenerateContentConfig(
        system_instruction=PROMPT,
        temperature=0,
        response_mime_type="application/json",
        response_json_schema=SCHEMA,
    )
    for attempt in range(4):
        try:
            return json.loads(client.models.generate_content(model=model, contents=contents, config=config).text)
        except Exception as e:  # rate limits, transient 5xx, malformed JSON
            wait = 2 ** attempt * 5
            print(f"    retry in {wait}s: {e}")
            time.sleep(wait)
    raise RuntimeError("gave up after 4 attempts")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("variant")
    ap.add_argument("--model", default="gemini-3.8-flash")
    ap.add_argument("--fewshot", help="folder of held-out example image + JSON pairs")
    ap.add_argument("--selfcheck", action="store_true", help="second pass that corrects the first draft")
    ap.add_argument("--force", action="store_true", help="redo pages that already have output")
    args = ap.parse_args()

    client = genai.Client()  # reads GEMINI_API_KEY
    out_dir = ROOT / "preds" / args.variant
    out_dir.mkdir(parents=True, exist_ok=True)
    shots = fewshot_turns(args.fewshot) if args.fewshot else []

    pages = sorted(p for p in (ROOT / "data").iterdir() if p.suffix.lower() in (".jpg", ".jpeg", ".png"))
    for img in pages:
        out_txt = out_dir / f"{img.stem}.txt"
        if out_txt.exists() and not args.force:
            continue
        print(f"  {img.stem} ...")
        start = time.time()
        target = types.Content(role="user", parts=[image_part(img)])
        result = call(client, args.model, shots + [target])
        if args.selfcheck:
            draft = types.Part.from_text(text=SELFCHECK + json.dumps(result, ensure_ascii=False))
            result = call(client, args.model, [types.Content(role="user", parts=[image_part(img), draft])])
        seconds = time.time() - start
        out_txt.write_text("\n".join(result["lines"]) + "\n", encoding="utf-8")
        (out_dir / f"{img.stem}.json").write_text(
            json.dumps({"model": args.model, "seconds": round(seconds, 2), **result}, ensure_ascii=False, indent=2),
            encoding="utf-8")
    print(f"Done. Now run: python eval/score.py {args.variant}")


if __name__ == "__main__":
    main()
