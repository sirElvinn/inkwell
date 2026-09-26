# Diatom SEM pipeline (&hacks XII - Nano & Biomaterials Lab challenge #1)

Image in -> shells counted, species, size in um, orientation, damage, pores -> spreadsheet.
All open-source, runs on a laptop CPU.

## Setup
    python -m venv .venv
    .venv\Scripts\activate          (Windows)   |   source .venv/bin/activate   (Mac/Linux)
    pip install -r requirements.txt

## Run
    python scale.py "2026 Hackathon" --out manifest.csv            # um/px for every image
    python run.py --root "2026 Hackathon" --backend circles --match ThapsSamples --out results
    python run.py --root "2026 Hackathon" --backend fastsam --match didy_precip --out results
Open results/overlays/*.png to eyeball it, results/results.xlsx for the numbers.

## Sample type from the image (not the file name)
    python sample_type.py evaluate --root "2026 Hackathon"   # honest score, ~3 min
    python sample_type.py train    --root "2026 Hackathon"   # rebuilds sample_type_model.joblib
run.py uses the model automatically (--sample-type auto). Other options:
--sample-type name | thaps | didymo | mixed

## Files
- scale.py    - um per pixel from Phenom metadata / Hitachi .txt (checked against the
                scale-bar ticks) / OCR of the field width on screenshots. Never hard-coded.
- species.py  - literature sizes (the lab's hint: use relative sizes of the organisms).
- segment.py  - fastsam / sam (Segment Anything, everything mode) / circles (size-aware baseline).
- measure.py  - length, width, area, orientation, facing, species rules, damage grade.
- pores.py    - pore x, y, diameter in um; skips images where pores are too small to see.
- sample_type.py - predicts Thaps / Didymo / Richmond from a "size fingerprint" of the pixels.
                Held-out-session accuracy 76%; 91% when it is confident (it says "unsure" otherwise).
- sample_type_model.joblib - the trained model (folder names were only used as training labels).
- run.py      - glues it together, writes CSVs, results.xlsx and overlay PNGs.
