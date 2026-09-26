"""
run.py - image in, measurements out.

    python run.py --root "2026 Hackathon" --backend fastsam --out results
    python run.py --root "2026 Hackathon" --backend circles --match Thaps_A2 --out results

Writes
    results/frustules.csv   one row per detected shell (size, orientation, species, damage)
    results/pores.csv       one row per pore (frustule id, x, y, diameter in um)
    results/images.csv      one row per image (scale source, counts, notes)
    results/results.xlsx    the three tables above + the literature size reference
    results/overlays/*.png  outlines coloured by damage, for eyeballing and the demo
"""
from __future__ import annotations

import argparse
import os
import time

import cv2
import numpy as np
import pandas as pd
from PIL import Image

from scale import read_scale, crop_databar, weak_labels, IMG_EXT
from species import SPECIES, HINT_TO_SPECIES
from segment import segment
from measure import measure_mask, classify, damage, view_type, keep_object
from pores import detect_pores, resolvable
from sample_type import predict_sample_type

# what the user can pick instead of letting the model decide
CHOICES = {"thaps": "Thalassiosira pseudonana", "didymo": "Didymosphenia geminata",
           "mixed": None}

COLOURS = {  # BGR
    "intact": (80, 200, 80), "cracked": (0, 200, 255), "fragmented": (60, 60, 255),
    "partial (cut by image edge)": (160, 160, 160),
}


def process(path: str, rel: str, backend: str, out_dir: str,
            sample_type: str = "auto") -> tuple[list, list, dict]:
    t0 = time.time()
    info = read_scale(path)
    hint = weak_labels(rel)
    img_row = {"image": rel, "scale_source": info.source, "um_per_px": info.um_per_px,
               "scale_check": info.check}
    if not info.um_per_px:
        img_row["note"] = "no scale - skipped"
        return [], [], img_row

    img = np.asarray(crop_databar(Image.open(path).convert("L"), info))

    # Which sample is this? Default: predict it from the pixels (sample_type.py).
    if sample_type == "auto":
        st = predict_sample_type(img, info.um_per_px)
        predicted = st["label"]
        img_row.update(sample_type=predicted or "unsure", sample_type_source="predicted from image",
                       sample_type_confidence=round(st["confidence"], 3),
                       **{f"p_{k.split()[0]}": v for k, v in st["probs"].items()})
        prior = HINT_TO_SPECIES.get(predicted)          # Richmond / unsure -> generic size rules
    elif sample_type == "name":
        prior = HINT_TO_SPECIES.get(hint["species_hint"])
        img_row.update(sample_type=hint["species_hint"], sample_type_source="file name")
    else:
        prior = CHOICES[sample_type]
        img_row.update(sample_type=prior or "mixed / unknown", sample_type_source="chosen by user")
    img_row["file_name_hint"] = hint["species_hint"]      # kept only to compare against
    masks = segment(img, info.um_per_px, prior, backend)

    shells, label_map = [], np.zeros(img.shape, np.int32)
    for m in masks:
        row = measure_mask(m, info.um_per_px)
        if row is None or not keep_object(row, prior):
            continue
        sp, morph, why = classify(row, prior)
        row.update(species=sp, morphotype=morph, species_reason=why,
                   damage=damage(row, sp), view=view_type(row, morph))
        row["frustule_id"] = len(shells) + 1
        label_map[m & (label_map == 0)] = row["frustule_id"]
        shells.append(row)

    ok, why = resolvable(info.um_per_px, prior)
    if ok and not shells:
        # no shell outlines: only trust a whole-image pore scan on a close-up of one shell
        fov = img.shape[1] * info.um_per_px
        typical_max = SPECIES[prior]["typical_length_um"][1] if prior in SPECIES else 0
        if fov > 2 * typical_max:
            ok, why = False, "not measured: no shell outlines found in this image"
        else:
            why += " (close-up: whole image scanned)"
    pores = detect_pores(img, info.um_per_px, prior, label_map if shells else None) if ok else []
    for p in pores:
        p["image"] = rel
    for row in shells:
        if not ok:
            row.update(n_pores=None, mean_pore_diameter_um=None, median_pore_diameter_um=None,
                       pore_note=why)
            continue
        d = [p["diameter_um"] for p in pores if p["frustule_id"] == row["frustule_id"]]
        row.update(n_pores=len(d),
                   mean_pore_diameter_um=round(float(np.mean(d)), 4) if d else None,
                   median_pore_diameter_um=round(float(np.median(d)), 4) if d else None,
                   pore_note=why)

    # overlay for the demo
    vis = cv2.cvtColor(img, cv2.COLOR_GRAY2BGR)
    for row in shells:
        m = (label_map == row["frustule_id"]).astype(np.uint8)
        cnts, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(vis, cnts, -1, COLOURS.get(row["damage"], (255, 255, 255)), 2)
    for p in pores[:5000]:
        c = (int(p["x_um"] / info.um_per_px), int(p["y_um"] / info.um_per_px))
        cv2.circle(vis, c, max(1, int(p["diameter_um"] / info.um_per_px / 2)), (255, 0, 255), 1)
    os.makedirs(os.path.join(out_dir, "overlays"), exist_ok=True)
    cv2.imwrite(os.path.join(out_dir, "overlays", rel.replace(os.sep, "__").rsplit(".", 1)[0] + ".png"), vis)

    for row in shells:
        row.pop("_bbox", None)
        row["image"] = rel
    whole = [r for r in shells if r["damage"] != "partial (cut by image edge)"]
    img_row.update(
        backend=backend, n_frustules=len(shells), n_whole_in_frame=len(whole),
        n_intact=sum(r["damage"] == "intact" for r in shells),
        n_cracked=sum(r["damage"] == "cracked" for r in shells),
        n_fragmented=sum(r["damage"] == "fragmented" for r in shells),
        median_length_um=float(np.median([r["length_um"] for r in whole])) if whole else None,
        n_pores=len(pores), pore_note=why, seconds=round(time.time() - t0, 1))
    for name, sp in SPECIES.items():
        img_row[f"n_{sp['short']}"] = sum(r["species"] == name for r in shells)
    img_row["n_unknown_species"] = sum(r["species"] not in SPECIES for r in shells)
    return shells, pores, img_row


def species_reference() -> pd.DataFrame:
    rows = []
    for name, s in SPECIES.items():
        rows.append({"species": name, "morphotype": s["morphotype"],
                     "length_um (lit.)": f"{s['length_um'][0]}-{s['length_um'][1]}",
                     "width_um (lit.)": f"{s['width_um'][0]}-{s['width_um'][1]}" if s["width_um"] else "round",
                     "pore_um (lit.)": f"{s['pore_um'][0]}-{s['pore_um'][1]}"})
    return pd.DataFrame(rows)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", required=True)
    ap.add_argument("--backend", default="fastsam", choices=["fastsam", "sam", "circles"])
    ap.add_argument("--match", default="", help="only images whose path contains this text")
    ap.add_argument("--limit", type=int, default=0)
    ap.add_argument("--out", default="results")
    ap.add_argument("--sample-type", default="auto", choices=["auto", "name", "thaps", "didymo", "mixed"],
                    help="auto = predict from the image (default); name = old file-name guess")
    a = ap.parse_args()

    paths = []
    for d, _, files in os.walk(a.root):
        for f in sorted(files):
            if f.lower().endswith(IMG_EXT):
                rel = os.path.relpath(os.path.join(d, f), a.root)
                if a.match.lower() in rel.lower():
                    paths.append(rel)
    if a.limit:
        paths = paths[: a.limit]
    os.makedirs(a.out, exist_ok=True)

    all_shells, all_pores, all_imgs = [], [], []
    for i, rel in enumerate(paths, 1):
        shells, pores, img_row = process(os.path.join(a.root, rel), rel, a.backend, a.out,
                                         a.sample_type)
        all_shells += shells
        all_pores += pores
        all_imgs.append(img_row)
        print(f"[{i}/{len(paths)}] {rel}: looks like {img_row.get('sample_type')} "
              f"({img_row.get('sample_type_confidence', '-')}) | {img_row.get('n_frustules', 0)} shells, "
              f"{img_row.get('n_pores', 0)} pores ({img_row.get('seconds', 0)} s)")

    front = ["image", "frustule_id", "species", "morphotype", "length_um", "width_um", "area_um2",
             "orientation_deg", "head_direction_deg", "view", "damage",
             "n_pores", "mean_pore_diameter_um", "median_pore_diameter_um"]
    shells_df = pd.DataFrame(all_shells)
    if len(shells_df):
        shells_df = shells_df[front + [c for c in shells_df.columns if c not in front]]
    pores_df = pd.DataFrame(all_pores, columns=["image", "frustule_id", "x_um", "y_um", "diameter_um"])
    imgs_df = pd.DataFrame(all_imgs)
    shells_df.to_csv(os.path.join(a.out, "frustules.csv"), index=False)
    pores_df.to_csv(os.path.join(a.out, "pores.csv"), index=False)
    imgs_df.to_csv(os.path.join(a.out, "images.csv"), index=False)
    with pd.ExcelWriter(os.path.join(a.out, "results.xlsx")) as xw:
        imgs_df.to_excel(xw, sheet_name="images", index=False)
        shells_df.to_excel(xw, sheet_name="frustules", index=False)
        pores_df.to_excel(xw, sheet_name="pores", index=False)
        if len(shells_df):
            summary = pd.crosstab(shells_df["species"], shells_df["damage"], margins=True,
                                  margins_name="total")
            summary.to_excel(xw, sheet_name="summary")
        species_reference().to_excel(xw, sheet_name="literature sizes", index=False)
    print(f"done -> {a.out}/ ({len(shells_df)} shells, {len(pores_df)} pores)")


if __name__ == "__main__":
    main()
