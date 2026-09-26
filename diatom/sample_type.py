"""
sample_type.py - predict the sample type (Thaps / Didymo / Richmond fossil) from the
PIXELS, not the file name.

Idea (the lab's hint): the organisms have very different physical sizes, and we know
um-per-pixel for every image. So we measure "how much structure is there at each
real-world size" - 0.05 um, 0.1 um, ... up to 51 um - and let a small classifier learn
which size-fingerprint belongs to which sample.

For each physical size s (in um) we compute, after normalising brightness/contrast:
  dog_s     how much detail exists at that size (band-pass energy)
  bright_s  how densely bright blobs of that size are packed (e.g. 4 um Thaps shells)
  dark_s    same for dark blobs (holes, gaps, pores)
  coh_s     how stripy / elongated the texture is at that size (needles, striae)
Sizes an image cannot show (smaller than a pixel or bigger than the frame) are left
missing, and the classifier handles missing values natively.

Folder names are used ONLY as training labels. At prediction time we look at pixels +
the scale bar, nothing else.

    python sample_type.py train    --root "2026 Hackathon" --model sample_type_model.joblib
    python sample_type.py evaluate --root "2026 Hackathon"      # honest held-out-session test
"""
from __future__ import annotations

import argparse
import os
import warnings

import cv2
import joblib
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
from skimage.feature import peak_local_max, structure_tensor, structure_tensor_eigenvalues

from scale import read_scale, crop_databar, weak_labels, IMG_EXT

warnings.filterwarnings("ignore")

SCALES_UM = [0.05, 0.1, 0.2, 0.4, 0.8, 1.6, 3.2, 6.4, 12.8, 25.6, 51.2]
KINDS = ["dog", "bright", "dark", "coh"]
CLASSES = ["Thalassiosira pseudonana", "Didymosphenia geminata", "Richmond fossil diatomite (mixed)"]
FEATURE_NAMES = [f"{k}_{s:g}um" for s in SCALES_UM for k in KINDS]
MIN_CONFIDENCE = 0.60   # below this, say "unsure" and fall back to generic size rules


def size_fingerprint(img: np.ndarray, um_per_px: float) -> np.ndarray:
    """img: 2-D grey image (info bar already removed). Returns len(FEATURE_NAMES) floats."""
    x = img.astype(np.float32)
    lo, hi = np.percentile(x, [5, 95])
    x = (x - np.median(x)) / (hi - lo + 1e-6)            # brightness/contrast invariant
    H, W = x.shape
    feats = []
    for s in SCALES_UM:
        sig = s / um_per_px                              # this physical size in pixels
        if sig < 1.0 or sig > min(H, W) / 10:
            feats += [np.nan] * len(KINDS)               # not visible in this image
            continue
        f = min(1.0, 2.0 / sig)                          # shrink so the size is ~2 px
        xs = cv2.resize(x, None, fx=f, fy=f, interpolation=cv2.INTER_AREA) if f < 1 else x
        if max(xs.shape) > 1024:                         # big image: a central 1024 px window
            r0, c0 = (xs.shape[0] - 1024) // 2, (xs.shape[1] - 1024) // 2   # is plenty for averages
            xs = xs[max(r0, 0):max(r0, 0) + 1024, max(c0, 0):max(c0, 0) + 1024]
        sp = sig * f
        dog = ndi.gaussian_filter(xs, sp) - ndi.gaussian_filter(xs, 2 * sp)
        thr = 0.5 * float(np.std(dog)) + 1e-6
        dens = []
        for sign in (1, -1):                             # bright blobs, dark blobs
            pk = peak_local_max(sign * dog, min_distance=max(1, int(round(sp))),
                                threshold_abs=thr, exclude_border=False)
            dens.append(len(pk) * sp * sp / dog.size)    # packing fraction, size-free
        A = structure_tensor(xs, sigma=sp, order="rc")
        l1, l2 = structure_tensor_eigenvalues(A)
        coh = float(np.mean((l1 - l2) / (l1 + l2 + 1e-9)))
        feats += [float(np.mean(np.abs(dog))), dens[0], dens[1], coh]
    return np.array(feats, dtype=np.float32)


def fingerprint_file(path: str) -> tuple[np.ndarray, float] | None:
    info = read_scale(path)
    if not info.um_per_px:
        return None
    img = np.asarray(crop_databar(Image.open(path).convert("L"), info))
    return size_fingerprint(img, info.um_per_px), info.um_per_px


def session_of(rel: str) -> str:
    """Group images that were shot together, so evaluation never trains and tests on
    the same session (otherwise the score is fake-high)."""
    p = rel.lower()
    if "richmond" in p:
        return "richmond_" + ("b&c" if "b&c" in p else "b&d" if "b&d" in p else "med_ra")
    if "didy" in p:
        for k in ("burn", "precip", "sint_acid", "didymo_sint", "lab grown"):
            if k in p:
                return "didymo_" + k
        return "didymo_other"
    return rel.split(os.sep)[0]                          # each Thaps folder = one session


def load_dataset(root: str, cache: str = "fingerprints_cache.npz"):
    if cache and os.path.exists(cache):
        z = np.load(cache, allow_pickle=True)
        return z["X"], z["y"], z["g"], list(z["paths"])
    X, y, groups, paths = [], [], [], []
    for d, _, files in os.walk(root):
        for f in sorted(files):
            if not f.lower().endswith(IMG_EXT):
                continue
            rel = os.path.relpath(os.path.join(d, f), root)
            label = weak_labels(rel)["species_hint"]
            if label not in CLASSES:
                continue                                  # e.g. the single lab-grown image
            out = fingerprint_file(os.path.join(root, rel))
            if out is None:
                continue
            X.append(out[0]); y.append(label); groups.append(session_of(rel)); paths.append(rel)
    X, y, groups = np.array(X), np.array(y), np.array(groups)
    if cache:
        np.savez(cache, X=X, y=y, g=groups, paths=np.array(paths, dtype=object))
    return X, y, groups, paths


def make_model():
    # Random forest won our held-out-session comparison (76% vs 70% for gradient boosting)
    # and handles the "size not visible in this image" gaps natively.
    from sklearn.ensemble import RandomForestClassifier
    return RandomForestClassifier(n_estimators=500, min_samples_leaf=2,
                                  class_weight="balanced", random_state=0)


def evaluate(root: str):
    from sklearn.metrics import confusion_matrix
    X, y, g, paths = load_dataset(root)
    pred, conf = np.empty_like(y), np.zeros(len(y))
    for held in np.unique(g):                           # leave one session out
        tr, te = g != held, g == held
        m = make_model().fit(X[tr], y[tr])
        pred[te] = m.predict(X[te])
        conf[te] = m.predict_proba(X[te]).max(axis=1)
    acc = (pred == y).mean()
    sure = conf >= MIN_CONFIDENCE
    print(f"\nHeld-out-session accuracy: {acc:.1%} on {len(y)} images, {len(np.unique(g))} sessions")
    print("(each session was predicted by a model that never saw ANY image from that session)")
    print(f"When confident (>= {MIN_CONFIDENCE:.0%}): {(pred[sure] == y[sure]).mean():.1%} correct, "
          f"on {sure.mean():.0%} of images. Otherwise it answers 'unsure'.\n")
    for held in np.unique(g):
        te = g == held
        print(f"  {held:45s} {int((pred[te] == y[te]).sum()):>3d}/{int(te.sum()):<3d} correct")
    print("\nconfusion matrix (rows = true, cols = predicted):", [c.split()[0] for c in CLASSES])
    print(confusion_matrix(y, pred, labels=CLASSES))
    return acc


def train(root: str, model_path: str):
    X, y, g, _ = load_dataset(root)
    m = make_model().fit(X, y)
    joblib.dump({"model": m, "features": FEATURE_NAMES, "classes": list(m.classes_)}, model_path)
    print(f"trained on {len(y)} images -> {model_path}")


_CACHE: dict = {}


def predict_sample_type(img: np.ndarray, um_per_px: float,
                        model_path: str = "sample_type_model.joblib") -> dict:
    """-> {'label', 'confidence', 'probs'}; label is None when unsure or no model."""
    if model_path not in _CACHE:
        _CACHE[model_path] = joblib.load(model_path) if os.path.exists(model_path) else None
    bundle = _CACHE[model_path]
    if bundle is None:
        return {"label": None, "confidence": 0.0, "probs": {}}
    p = bundle["model"].predict_proba(size_fingerprint(img, um_per_px)[None])[0]
    probs = dict(zip(bundle["classes"], (round(float(v), 3) for v in p)))
    best = max(probs, key=probs.get)
    label = best if probs[best] >= MIN_CONFIDENCE else None
    return {"label": label, "confidence": probs[best], "probs": probs}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["train", "evaluate"])
    ap.add_argument("--root", required=True)
    ap.add_argument("--model", default="sample_type_model.joblib")
    a = ap.parse_args()
    if a.cmd == "evaluate":
        evaluate(a.root)
    else:
        train(a.root, a.model)
