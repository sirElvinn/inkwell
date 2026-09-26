"""Score transcriptions against Founders Online references: CER and WER, strict and lenient.

Layout:
  eval/data/<id>.ref.txt          reference text for that page (hand-trimmed from Founders Online)
  eval/preds/<variant>/<id>.txt   model output for that page (one file per page)

Usage:
  python eval/score.py                       # score every variant in eval/preds/
  python eval/score.py fewshot_pro zeroshot  # score only these variants
"""
import csv
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).parent
DATA, PREDS = ROOT / "data", ROOT / "preds"


def levenshtein(a, b):
    """Edit distance between two sequences (strings or token lists)."""
    if len(a) < len(b):
        a, b = b, a
    prev = list(range(len(b) + 1))
    for i, x in enumerate(a, 1):
        cur = [i]
        for j, y in enumerate(b, 1):
            cur.append(min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (x != y)))
        prev = cur
    return prev[-1]


def normalize(text, lenient=False):
    """Apply the same rules to reference and prediction so only reading errors count."""
    text = unicodedata.normalize("NFC", text)
    text = re.sub(r"<del>.*?</del>", "", text, flags=re.S)          # struck text: Founders usually omits
    text = re.sub(r"</?ins>", "", text)                             # keep inserted text, drop tags
    text = re.sub(r"\[illegible\]", "", text)                       # unreadable: scored as a deletion
    text = re.sub(r"\[([^\]]*)\?\]", r"\1", text)                   # [word?]: score the guess
    text = re.sub(r"\[[^\]]*\]", "", text)                          # editorial brackets in references
    text = text.replace("ſ", "s").replace("^", "")                  # long s, superscript carets
    text = text.replace("’", "'").replace("‘", "'")
    text = text.replace("“", '"').replace("”", '"')
    text = text.replace("—", "-").replace("–", "-")
    text = re.sub(r"-\s*\n\s*", "", text)                           # rejoin hyphenated line breaks
    if lenient:
        text = text.lower()
        text = re.sub(r"[^\w\s&]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def score(ref, hyp):
    """Return (char_edits, ref_chars, word_edits, ref_words)."""
    return levenshtein(ref, hyp), len(ref), levenshtein(ref.split(), hyp.split()), len(ref.split())


def score_variant(variant):
    rows = []
    for ref_path in sorted(DATA.glob("*.ref.txt")):
        page = ref_path.name.removesuffix(".ref.txt")
        hyp_path = PREDS / variant / f"{page}.txt"
        if not hyp_path.exists():
            print(f"  [skip] {variant}: no prediction for {page}", file=sys.stderr)
            continue
        ref_raw, hyp_raw = ref_path.read_text(encoding="utf-8"), hyp_path.read_text(encoding="utf-8")
        row = {"variant": variant, "page": page}
        for mode, lenient in (("strict", False), ("lenient", True)):
            ce, cn, we, wn = score(normalize(ref_raw, lenient), normalize(hyp_raw, lenient))
            row.update({f"{mode}_char_edits": ce, f"{mode}_ref_chars": cn,
                        f"{mode}_word_edits": we, f"{mode}_ref_words": wn,
                        f"{mode}_cer": ce / max(cn, 1), f"{mode}_wer": we / max(wn, 1)})
        rows.append(row)
    return rows


def summarize(rows):
    """Corpus-level rates (total edits / total ref length), plus mean and worst page CER."""
    out = {}
    for mode in ("strict", "lenient"):
        out[f"{mode}_cer"] = sum(r[f"{mode}_char_edits"] for r in rows) / max(sum(r[f"{mode}_ref_chars"] for r in rows), 1)
        out[f"{mode}_wer"] = sum(r[f"{mode}_word_edits"] for r in rows) / max(sum(r[f"{mode}_ref_words"] for r in rows), 1)
    cers = [r["strict_cer"] for r in rows]
    worst = max(rows, key=lambda r: r["strict_cer"])
    out.update(pages=len(rows), mean_page_cer=sum(cers) / len(cers), worst_page=worst["page"], worst_cer=worst["strict_cer"])
    return out


def main():
    variants = sys.argv[1:] or (sorted(p.name for p in PREDS.iterdir() if p.is_dir()) if PREDS.exists() else [])
    if not variants:
        sys.exit("No variants found in eval/preds/.")
    all_rows = []
    print(f"{'variant':<22}{'pages':>6}{'CER':>8}{'WER':>8}{'CER-len':>9}{'WER-len':>9}  worst page")
    for v in variants:
        rows = score_variant(v)
        if not rows:
            continue
        s = summarize(rows)
        all_rows += rows
        print(f"{v:<22}{s['pages']:>6}{s['strict_cer']:>8.1%}{s['strict_wer']:>8.1%}"
              f"{s['lenient_cer']:>9.1%}{s['lenient_wer']:>9.1%}  {s['worst_page']} ({s['worst_cer']:.1%})")
    if not all_rows:
        sys.exit("No pages scored: check eval/data/*.ref.txt and eval/preds/<variant>/*.txt names match.")
    with open(ROOT / "results.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(all_rows[0]))
        w.writeheader()
        w.writerows(all_rows)
    print(f"\nPer-page results: {ROOT / 'results.csv'}")


if __name__ == "__main__":
    main()
