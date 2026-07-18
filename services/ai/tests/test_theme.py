"""Theme studio validation + ADVERSARIAL WCAG-contrast proof (app/theme.py).

The adversarial test is the proof the two round-2 HIGHs are closed: for dim/saturated seeds it computes the
REAL contrast of the CLAMPED ACCENTS (not just --text) on every surface they render as text on — including
over the generated --bg-radial center, which was the round-2 gap.
"""

import pytest
from pydantic import ValidationError

from app import color
from app.theme import PALETTE_TOKENS, ThemeSeed, derive_palette

DIM_SEEDS = [
    {"primary": "#003838", "secondary": "#1a1a4d"},  # teal / navy
    {"primary": "#0a2a0a", "secondary": "#200010"},  # deep green / wine
    {"primary": "#1a1a4d", "secondary": "#003838"},  # navy / teal
    {"primary": "#101010", "secondary": "#2a0000"},  # near-grey / oxblood
]

BG_FLAT = "#0a0a12"       # --bg (frozen)
BG_ELEV = "#100d1a"       # --bg-elev (lightest opaque text surface)
CONSTRUCT_BG = "#020802"  # --mx-bg (violet-tint construct dim-text bg)
SURFACE_RGB = "#141020"   # --surface rgba(20,16,32,.62) colour


def _radial_center(pal: dict) -> str:
    # --bg-radial = radial-gradient(circle at 50% 0%,{center},#0a0a12 55%,#050409) — the tinted center stop
    return pal["--bg-radial"].split(",", 1)[1].split(",")[0].strip()


def _surface_over(radial_center: str) -> str:
    # --surface composited over the radial center = the brightest backdrop accent-text ever sits on
    return color._to_hex(*color.composite_over(SURFACE_RGB, radial_center, 0.62))


def test_seed_rejects_nonhex_and_extra() -> None:
    with pytest.raises(ValidationError):
        ThemeSeed.model_validate({"primary": "red", "secondary": "#34e6ff"})
    with pytest.raises(ValidationError):  # extra="forbid"
        ThemeSeed.model_validate({"primary": "#b18cff", "secondary": "#34e6ff", "evil": "x"})


def test_injection_output_rejected() -> None:
    # a model OUTPUT trying to smuggle CSS is pattern-rejected → never reaches a token value
    with pytest.raises(ValidationError):
        ThemeSeed.model_validate({"primary": "red;}body{background:url(x)}", "secondary": "#34e6ff"})


def test_palette_is_exactly_the_allowlist() -> None:
    pal = derive_palette(ThemeSeed(primary="#b18cff", secondary="#34e6ff"))
    assert set(pal) == set(PALETTE_TOKENS) and len(pal) == 11


def test_all_values_are_valid_color_shapes() -> None:
    pal = derive_palette(ThemeSeed(primary="#003838", secondary="#1a1a4d"))
    for name, val in pal.items():
        assert val.startswith("#") or val.startswith("rgba(") or "gradient(" in val, (name, val)


@pytest.mark.parametrize("seed", DIM_SEEDS)
def test_adversarial_contrast_floors(seed) -> None:
    pal = derive_palette(ThemeSeed(**seed))
    center = _radial_center(pal)
    surface = _surface_over(center)
    for accent in (pal["--violet"], pal["--cyan"]):
        assert color.contrast_ratio(accent, BG_ELEV) >= 4.5, ("elev", accent)
        assert color.contrast_ratio(accent, surface) >= 4.5, ("surface-over-radial", accent)
        assert color.contrast_ratio(accent, center) >= 4.5, ("radial-center", accent)
    assert color.contrast_ratio("#ece8ff", center) >= 4.5, "--text over radial"
    assert color.contrast_ratio(pal["--violet-deep"], CONSTRUCT_BG) >= 4.5, "--violet-deep on construct bg"
    ring = color._to_hex(*color.composite_over(pal["--cyan"], BG_FLAT, 0.60))
    assert color.contrast_ratio(ring, BG_FLAT) >= 3.0, "60% --ring (WCAG 1.4.11)"
