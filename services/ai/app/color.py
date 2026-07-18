"""Pure color + WCAG-2.1 contrast helpers for the theme studio (no deps beyond re + stdlib).

Every generated palette token value is reconstructed HERE from validated hex (never the raw model string)
and clamped so a mood-generated palette stays WCAG-legible on the site's frozen dark surfaces (the studio
never touches --bg/--text). See theme.py for the four contrast floors these functions enforce.
"""

import re

_HEX = re.compile(r"#[0-9a-fA-F]{6}")


def parse_hex(s: str) -> tuple[int, int, int]:
    if not _HEX.fullmatch(s):
        raise ValueError(f"not a 6-digit hex color: {s!r}")
    return int(s[1:3], 16), int(s[3:5], 16), int(s[5:7], 16)


def _c255(v: float) -> int:
    return max(0, min(255, round(v)))


def _to_hex(r: float, g: float, b: float) -> str:
    return f"#{_c255(r):02x}{_c255(g):02x}{_c255(b):02x}"


def _lin(c: float) -> float:
    c /= 255.0
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def relative_luminance(rgb: tuple[int, int, int]) -> float:
    r, g, b = rgb
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def _lum(hex_s: str) -> float:
    return relative_luminance(parse_hex(hex_s))


def contrast_ratio(a_hex: str, b_hex: str) -> float:
    hi, lo = sorted((_lum(a_hex), _lum(b_hex)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def lighten(hex_s: str, amt: float) -> str:
    r, g, b = parse_hex(hex_s)
    return _to_hex(r + (255 - r) * amt, g + (255 - g) * amt, b + (255 - b) * amt)


def darken(hex_s: str, amt: float) -> str:
    r, g, b = parse_hex(hex_s)
    return _to_hex(r * (1 - amt), g * (1 - amt), b * (1 - amt))


def composite_over(fg_hex: str, bg_hex: str, alpha: float) -> tuple[int, int, int]:
    """sRGB alpha-composite fg over bg — the correct way to get a translucent token's rendered colour."""
    fr, fg, fb = parse_hex(fg_hex)
    br, bg, bb = parse_hex(bg_hex)
    return (
        round(alpha * fr + (1 - alpha) * br),
        round(alpha * fg + (1 - alpha) * bg),
        round(alpha * fb + (1 - alpha) * bb),
    )


def brighter(a_hex: str, b_hex: str) -> str:
    return a_hex if _lum(a_hex) >= _lum(b_hex) else b_hex


def clamp_for_contrast(hex_s: str, bg_hex: str, min_ratio: float, cap: int = 40) -> str:
    """Lighten toward white in small steps until contrast(hex,bg) >= min_ratio (or the cap). ALWAYS returns
    a freshly reconstructed hex. On a dark bg it always converges (white ~19:1); a cap hit returns the
    lightest tried (never rejects)."""
    cur = _to_hex(*parse_hex(hex_s))
    for _ in range(cap):
        if contrast_ratio(cur, bg_hex) >= min_ratio:
            return cur
        cur = lighten(cur, 0.06)
    return cur


def darken_to_max_luminance(hex_s: str, max_l: float, cap: int = 60) -> str:
    """Darken until relative_luminance <= max_l (for the near-black radial band)."""
    cur = _to_hex(*parse_hex(hex_s))
    for _ in range(cap):
        if _lum(cur) <= max_l:
            return cur
        cur = darken(cur, 0.12)
    return cur


def clamp_ring(cyan_hex: str, bg_hex: str, min_ratio: float = 3.0, alpha: float = 0.60, cap: int = 40) -> str:
    """Lighten cyan until its `alpha`-opacity composite over bg clears min_ratio (WCAG 1.4.11 focus ring).
    The text clamp alone does NOT guarantee this — a dim cyan's 60% ring can fall to ~2.3:1."""
    cur = _to_hex(*parse_hex(cyan_hex))
    for _ in range(cap):
        ring = _to_hex(*composite_over(cur, bg_hex, alpha))
        if contrast_ratio(ring, bg_hex) >= min_ratio:
            return cur
        cur = lighten(cur, 0.06)
    return cur


def to_rgba(hex_s: str, alpha: float) -> str:
    r, g, b = parse_hex(hex_s)
    return f"rgba({r},{g},{b},{alpha})"
