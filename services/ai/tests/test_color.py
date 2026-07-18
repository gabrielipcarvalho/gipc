"""WCAG-2.1 contrast + colour helpers (app/color.py)."""

import pytest

from app import color


def test_contrast_canonical_pairs() -> None:
    assert round(color.contrast_ratio("#000000", "#ffffff"), 1) == 21.0
    assert 4.3 < color.contrast_ratio("#767676", "#ffffff") < 4.7  # the canonical AA grey ≈4.5:1
    assert color.contrast_ratio("#ffffff", "#ffffff") == 1.0


def test_luminance_linearization_branch() -> None:
    # low channels use the c/12.92 branch (c/255 <= 0.03928)
    assert 0 < color.relative_luminance((3, 3, 3)) < 0.005


def test_parse_hex_rejects_nonhex() -> None:
    for bad in ("red", "#fff", "#12345", "#1234567", "#gggggg", "rgb(0,0,0)", "#b18cff "):
        with pytest.raises(ValueError):
            color.parse_hex(bad)


def test_clamp_for_contrast_raises_dark_hue() -> None:
    out = color.clamp_for_contrast("#003838", "#100d1a", 4.8)
    assert color.contrast_ratio(out, "#100d1a") >= 4.8
    assert color._HEX.fullmatch(out)  # freshly reconstructed hex, never the raw input


def test_darken_to_max_luminance_band() -> None:
    out = color.darken_to_max_luminance("#b18cff", 0.004)
    assert color.relative_luminance(color.parse_hex(out)) <= 0.004


def test_clamp_ring_yields_3to1() -> None:
    out = color.clamp_ring("#0a4a4a", "#0a0a12", 3.0)  # a dim cyan whose bare 60% ring is ~2.3:1
    ring = color._to_hex(*color.composite_over(out, "#0a0a12", 0.60))
    assert color.contrast_ratio(ring, "#0a0a12") >= 3.0


def test_to_rgba_format() -> None:
    assert color.to_rgba("#b18cff", 0.45) == "rgba(177,140,255,0.45)"
