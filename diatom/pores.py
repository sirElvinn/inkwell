"""
pores.py - find pores (dark round holes) and report x, y, diameter in micrometres.

The expected pore size (from the literature / the challenge brief) sets the detector's
size window, and images where pores would be smaller than MIN_PORE_PX pixels are
skipped with a note instead of producing fake numbers.
"""
from __future__ import annotations

import numpy as np
from skimage.feature import blob_log

from species import pore_window_um

MIN_PORE_PX = 3.0         # detector never looks for blobs smaller than this
MIN_SMALLEST_PORE_PX = 2.0  # skip images where the smallest expected pore is below this
MAX_SIGMA_PX = 25.0       # cap for speed; very large 'pores' are usually shadows
THRESHOLD = 0.06          # LoG response threshold - raise it if you get false pores


def resolvable(um_per_px: float, species: str | None) -> tuple[bool, str]:
    lo, hi = pore_window_um(species)
    px = lo / um_per_px
    if px < MIN_SMALLEST_PORE_PX:
        return False, (f"not measured: smallest expected pores ({lo*1000:.0f} nm) are only "
                       f"{px:.1f} px at this magnification")
    return True, f"smallest expected pore = {px:.1f} px"


def detect_pores(img: np.ndarray, um_per_px: float, species: str | None,
                 label_map: np.ndarray | None = None) -> list[dict]:
    """img: 2-D uint8. label_map: int array, 0 = background, k = frustule id (optional)."""
    lo, hi = pore_window_um(species)
    r_min = max(lo / 2 / um_per_px, MIN_PORE_PX / 2)
    r_max = min(hi / 2 / um_per_px, MAX_SIGMA_PX * np.sqrt(2))
    if r_max <= r_min:
        return []
    inv = 1.0 - img.astype(float) / 255.0                  # pores are dark -> bright blobs
    blobs = blob_log(inv, min_sigma=r_min / np.sqrt(2), max_sigma=r_max / np.sqrt(2),
                     num_sigma=8, threshold=THRESHOLD, overlap=0.5)
    out = []
    for y, x, s in blobs:
        fid = 0
        if label_map is not None:
            fid = int(label_map[int(y), int(x)])
            if fid == 0:
                continue                                    # keep only pores on a shell
        out.append({
            "frustule_id": fid,
            "x_um": round(x * um_per_px, 4),
            "y_um": round(y * um_per_px, 4),
            "diameter_um": round(2 * np.sqrt(2) * s * um_per_px, 4),
        })
    return out
