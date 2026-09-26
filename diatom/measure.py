"""
measure.py - one mask in, one row of measurements out (all lengths in micrometres).

Species and damage come from literature size priors + outline shape, so they work
with zero training labels. Every threshold lives at the top so you can tune it
against a few hand-labelled shells.
"""
from __future__ import annotations

import numpy as np
from scipy.spatial import ConvexHull
from skimage import measure as skm

from species import SPECIES, size_window_um

# ---- tunable thresholds -------------------------------------------------------------
FRAGMENT_SIZE_RATIO = 0.70   # longer than 70% of the species' minimum length = whole-ish
FRAGMENT_SOLIDITY = 0.80     # jagged outline below this = fragment
CRACK_SOLIDITY = 0.92        # full size but a notch in the outline = cracked
VALVE_VIEW_ASPECT = 1.30     # centric: round (valve view) vs drum-shaped (girdle view)
ELONGATED_ASPECT = 1.80      # above this we can tell which end is the head pole
ROUND_ASPECT = 1.15          # below this the outline is round, so it has no pointing angle


def _min_feret(points: np.ndarray) -> float:
    """Smallest caliper width of the outline (rotating calipers on the convex hull)."""
    if len(points) < 3:
        return 0.0
    try:
        hull = points[ConvexHull(points).vertices]
    except Exception:
        return 0.0
    best = np.inf
    for i in range(len(hull)):
        edge = hull[(i + 1) % len(hull)] - hull[i]
        n = np.array([-edge[1], edge[0]], dtype=float)
        norm = np.linalg.norm(n)
        if norm == 0:
            continue
        proj = hull @ (n / norm)
        best = min(best, proj.max() - proj.min())
    return float(best) if np.isfinite(best) else 0.0


def _head_direction_deg(coords: np.ndarray, centroid: np.ndarray, orient: float) -> float | None:
    """For elongated shells: direction (0-360, 0 = right, 90 = up) of the WIDER end.
    Didymo's head pole is wider than its foot pole, so this is 'which way it faces'."""
    axis = np.array([np.cos(orient), np.sin(orient)])       # (row, col) unit vector
    perp = np.array([-axis[1], axis[0]])
    rel = coords - centroid
    along, across = rel @ axis, rel @ perp
    L = along.max() - along.min()
    if L == 0:
        return None
    a_end = along > along.max() - 0.25 * L
    b_end = along < along.min() + 0.25 * L
    if a_end.sum() < 3 or b_end.sum() < 3:
        return None
    width_a = np.ptp(across[a_end])
    width_b = np.ptp(across[b_end])
    head = axis if width_a >= width_b else -axis              # (drow, dcol)
    # image rows grow downwards, so flip the row component for a normal math angle
    return float(np.degrees(np.arctan2(-head[0], head[1])) % 360)


def measure_mask(mask: np.ndarray, um_per_px: float) -> dict | None:
    props = skm.regionprops(mask.astype(np.uint8))
    if not props:
        return None
    p = props[0]
    h, w = mask.shape
    coords = p.coords.astype(float)                          # (row, col)
    feret_max = float(p.feret_diameter_max) * um_per_px
    feret_min = _min_feret(coords) * um_per_px
    perim = max(p.perimeter, 1.0)
    circ = min(1.0, 4 * np.pi * p.area / perim ** 2)
    aspect = feret_max / feret_min if feret_min > 0 else np.inf
    minr, minc, maxr, maxc = p.bbox
    row = {
        "x_um": round(p.centroid[1] * um_per_px, 3),
        "y_um": round(p.centroid[0] * um_per_px, 3),
        "length_um": round(feret_max, 3),                   # max Feret diameter
        "width_um": round(feret_min, 3),                    # min Feret diameter
        "area_um2": round(p.area * um_per_px ** 2, 3),
        "equiv_diameter_um": round(p.equivalent_diameter_area * um_per_px, 3),
        "aspect_ratio": round(aspect, 3) if np.isfinite(aspect) else None,
        "circularity": round(circ, 3),
        "solidity": round(float(p.solidity), 3),
        # 0 = horizontal, 90 = vertical (long axis of the outline); None = round, no long axis
        "orientation_deg": (round((90 - np.degrees(p.orientation)) % 180, 1)
                            if np.isfinite(aspect) and aspect >= ROUND_ASPECT else None),
        "touches_edge": bool(minr == 0 or minc == 0 or maxr >= h or maxc >= w),
        "_bbox": p.bbox,
    }
    row["head_direction_deg"] = None
    if np.isfinite(aspect) and aspect >= ELONGATED_ASPECT:
        d = _head_direction_deg(coords, np.array(p.centroid), p.orientation)
        row["head_direction_deg"] = round(d, 1) if d is not None else None
    return row


def classify(row: dict, prior: str | None) -> tuple[str, str, str]:
    """-> (species, morphotype, reason). prior = species hinted by the folder name."""
    L, W, aspect = row["length_um"], row["width_um"], row["aspect_ratio"] or 1.0
    shape = "centric" if aspect < 1.6 else "pennate" if aspect >= ELONGATED_ASPECT else "unclear"
    fits = []
    for name, s in SPECIES.items():
        lo, hi = s["length_um"]
        ok_len = 0.8 * lo <= L <= 1.2 * hi
        ok_w = s["width_um"] is None or 0.7 * s["width_um"][0] <= W <= 1.3 * s["width_um"][1]
        ok_shape = shape in (s["morphotype"], "unclear") or (s["morphotype"] == "centric" and aspect < 2.5)
        if ok_len and ok_w and ok_shape:
            fits.append(name)
    if prior in fits:
        return prior, SPECIES[prior]["morphotype"], "size + shape + sample"
    if len(fits) == 1:
        return fits[0], SPECIES[fits[0]]["morphotype"], "size + shape"
    if prior in SPECIES and L < 0.8 * SPECIES[prior]["length_um"][0]:
        return prior, SPECIES[prior]["morphotype"], "smaller than whole shell -> likely fragment"
    return "unknown", shape, "no literature size matches"


def damage(row: dict, species: str) -> str:
    if row["touches_edge"]:
        return "partial (cut by image edge)"
    if species in SPECIES and row["length_um"] < FRAGMENT_SIZE_RATIO * SPECIES[species]["length_um"][0]:
        return "fragmented"
    if row["solidity"] < FRAGMENT_SOLIDITY:
        return "fragmented"
    if row["solidity"] < CRACK_SOLIDITY:
        return "cracked"
    return "intact"


def view_type(row: dict, morphotype: str) -> str:
    """Which way a shell faces: valve view (face-on) or girdle view (side-on)."""
    aspect = row["aspect_ratio"] or 1.0
    if morphotype == "centric":
        return "valve view (face-on)" if aspect < VALVE_VIEW_ASPECT else "girdle view (side-on)"
    if morphotype == "pennate":
        return "valve view" if row["head_direction_deg"] is not None else "unclear"
    return "unclear"


def keep_object(row: dict, prior: str | None) -> bool:
    lo, hi = size_window_um(prior)
    return lo <= row["length_um"] <= hi
