"""
species.py - what each diatom in the dataset SHOULD look like, from the literature.
Sizes let us classify, filter junk and grade damage without any training labels.

Sources
- Thalassiosira pseudonana: 2.5-15 um diameter (Poulsen et al. 2023, J. Phycology;
  USGS NAS species profile); cultured cells ~3.5-3.9 um; ~18 nm pores between radial
  ribs plus a marginal ring of 6-12 fultoportulae (Wikipedia summary of the literature).
- Didymosphenia geminata: 65-161 um long, 36-41 um wide (diatoms.org, >90,000 valves);
  25-43 um wide (Patrick & Reimer 1975); 7-10 striae per 10 um.
Tune these with the lab's own numbers if they have them.
"""

SPECIES = {
    "Thalassiosira pseudonana": {
        "short": "Thaps",
        "morphotype": "centric",          # round in valve view, drum-shaped in girdle view
        "length_um": (2.5, 15.0),         # valve diameter
        "typical_length_um": (3.0, 6.0),  # what cultured cells usually measure
        "width_um": None,                 # round -> width ~ length in valve view
        "pore_um": (0.012, 0.15),         # ~18 nm nanopores up to the larger portulae
    },
    "Didymosphenia geminata": {
        "short": "Didymo",
        "morphotype": "pennate",          # long, 'coke bottle' shape with a wider head pole
        "length_um": (65.0, 161.0),
        "typical_length_um": (80.0, 140.0),
        "width_um": (25.0, 43.0),
        "pore_um": (0.1, 1.0),
    },
}

# The challenge brief: pores range from tens of nanometres to a few micrometres.
GENERIC_PORE_UM = (0.02, 3.0)

# Map the folder-name hint in manifest.csv to a species key (None = unknown / mixed).
HINT_TO_SPECIES = {
    "Thalassiosira pseudonana": "Thalassiosira pseudonana",
    "Didymosphenia geminata": "Didymosphenia geminata",
}


def size_window_um(species: str | None) -> tuple[float, float]:
    """Object sizes worth keeping in an image of this species (includes fragments)."""
    if species in SPECIES:
        lo, hi = SPECIES[species]["length_um"]
        return 0.25 * lo, 1.3 * hi   # fragments down to 1/4 size, a bit of slack on top
    return 1.0, 500.0                # unknown sample: anything diatom-sized


def pore_window_um(species: str | None) -> tuple[float, float]:
    if species in SPECIES:
        return SPECIES[species]["pore_um"]
    return GENERIC_PORE_UM
