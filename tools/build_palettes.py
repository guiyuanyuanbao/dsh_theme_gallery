"""
Derive one complete DSH theme from one wallpaper.

For each reference image this produces:

  * ``theme-gallery/assets/<slug>.jpg``   the wallpaper itself (downscaled, q82)
  * ``palette.json``                      the 113-token table, both palettes, with provenance
  * ``theme-gallery/client.js``           the client template with the tables spliced in

Two things make these palettes different from a flat theme:

1. **The surface tokens are translucent.** The wallpaper is painted once on
   ``<html>``; every ``--dsw-alias-*`` surface is an ``rgba()`` value, so the
   whole UI reads as frosted glass over the artwork with no DOM targeting and
   no fighting another plugin's CSS-module class names. Surfaces are *nested*
   (frame -> column -> card), so their alphas compound, which is exactly the
   behaviour we want: the frame shows the artwork, the card stays readable.

2. **The alpha is solved, not guessed.** For each theme and palette mode the
   script searches for the *smallest* base alpha whose composited surfaces keep
   text above the contrast floors. Smallest means the most artwork visible,
   subject to the text staying legible over the actual pixels of that image.
"""
from __future__ import annotations

import colorsys
import json
import math
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

# Every path is derived from this file's own location, so the project can be
# cloned anywhere and built in place. `tools/` sits beside the package root,
# which is what makes the layout relocatable.
BUILD = Path(__file__).resolve().parent
PKG = BUILD.parent
ASSETS = PKG / "assets"
SOURCES = PKG / "sources"

IMAGES = [
    ("shatter", SOURCES / "shatter.png", "碎镜 Shatter"),
    ("portrait", SOURCES / "portrait.png", "逆光 Portrait"),
    ("stage", SOURCES / "stage.png", "舞台 Stage"),
]

BG_WIDTH = 2560
BG_QUALITY = 82

# --------------------------------------------------------------------------
# colour helpers
# --------------------------------------------------------------------------


def hsl(h: float, s: float, l: float) -> tuple[int, int, int]:
    r, g, b = colorsys.hls_to_rgb((h % 360) / 360.0, min(0.995, max(0.005, l)), min(1.0, max(0.0, s)))
    return (round(r * 255), round(g * 255), round(b * 255))


def css(rgb: tuple[int, int, int], a: float | None = None) -> str:
    r, g, b = rgb
    if a is None or a >= 0.999:
        return "#%02x%02x%02x" % (r, g, b)
    return "rgba(%d, %d, %d, %.2f)" % (r, g, b, max(0.0, min(1.0, a)))


def mix(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(round(x + (y - x) * t) for x, y in zip(a, b))


def _lin(c: float) -> float:
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def luminance(rgb) -> float:
    r, g, b = (c / 255 for c in rgb[:3])
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def contrast(fg, bg) -> float:
    hi, lo = sorted((luminance(fg), luminance(bg)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def over(fg: tuple[int, int, int], a: float, bg: tuple[float, float, float]) -> tuple[float, float, float]:
    """Composite one translucent layer over an opaque backdrop."""
    return tuple(a * f + (1 - a) * b for f, b in zip(fg, bg))


def chain(layers: list[tuple[tuple[int, int, int], float]], backdrop) -> tuple[float, float, float]:
    """Composite a stack of translucent layers, bottom-last order given top-first."""
    out = tuple(float(c) for c in backdrop[:3])
    for rgb, a in reversed(layers):
        out = over(rgb, a, out)
    return out


def as_int(rgb) -> tuple[int, int, int]:
    return tuple(int(round(max(0.0, min(255.0, c)))) for c in rgb[:3])


# --------------------------------------------------------------------------
# image analysis
# --------------------------------------------------------------------------


def analyse(path: str) -> dict:
    im = Image.open(path).convert("RGB")
    resized = im.resize((BG_WIDTH, round(im.height * BG_WIDTH / im.width)), Image.LANCZOS)
    px = np.asarray(resized).astype(np.float32) / 255.0
    flat = px.reshape(-1, 3)

    mx = flat.max(axis=1)
    mn = flat.min(axis=1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0.0)

    # --- dominant cool accent hue band
    mask = (sat > 0.35) & (mx > 0.45)
    hue_band, accent_share = None, 0.0
    if mask.any():
        # A bounded subsample of the masked pixels.
        #
        # KNOWN LIMITATION: the stride is derived from the mask COUNT, so this
        # statistic is not bit-reproducible across numpy builds. A boundary
        # pixel flipping — which a differently-rounded float32 reciprocal in the
        # saturation test will do — changes the count, and a count crossing a
        # multiple of 6000 changes the stride, resampling different pixels and
        # moving `accent_share` in its fourth decimal.
        #
        # It is left as it is deliberately. `accent_share` is REPORTED diagnostic
        # data: it is not read by any colour rule, and `verify.py` proves the 678
        # shipped token values are identical whichever way it rounds. Replacing
        # the stride with a fixed-grid sample was tried and moved the figure
        # further from the recorded one, which is a change with no benefit and a
        # silently different palette record. Anything that ever depends on this
        # number should make it deterministic first.
        sample = flat[mask][:: max(1, int(mask.sum()) // 6000)]
        hsv = np.array([colorsys.rgb_to_hsv(*p) for p in sample])
        hist, edges = np.histogram(hsv[:, 0] * 360, bins=36, range=(0, 360))
        peak = int(hist.argmax())
        thr = hist[peak] * 0.2
        i = j = peak
        while i - 1 >= 0 and hist[i - 1] >= thr:
            i -= 1
        while j + 1 < len(hist) and hist[j + 1] >= thr:
            j += 1
        hue_band = (int(edges[i]), int(edges[j + 1]))
        accent_share = float(hist[i:j + 1].sum() / max(1, hist.sum()))

    # --- sparse warm accent (the gold trim / lanterns), which drives warn states
    warm = (hsv_warm(flat, sat, mx))
    warm_share, warm_hue = warm

    # --- highlight tint: the brightest pixels ------------------------------
    #
    # Deliberately NOT `np.argsort(mx)[-top:]`. On a float32 max-channel array
    # with heavy ties — and the brightest pixels of a wallpaper are almost all
    # clipped to the same value — argsort's ordering among EQUAL keys is
    # unspecified: quicksort's pivoting decides which of the tied pixels land in
    # the slice. That made this statistic depend on numpy's internal
    # implementation rather than on the image, so rebuilding on another numpy
    # could produce a different theme.
    #
    # Instead: find the highest byte threshold whose pixel count still reaches
    # the quota, then average EVERY pixel at or above it. That is deterministic,
    # independent of pixel order, and spatially unbiased — a fixed-size slice of
    # a tied tier would be neither, because it would describe whichever corner
    # of the image happened to come first. It also uses more of the data than
    # the 0.5% slice did, which makes the tint steadier.
    #
    # The mean is taken over INTEGER channel sums rather than `ndarray.mean()`.
    # Summing a float32 array accumulates rounding error whose size depends on
    # numpy's pairwise-summation block order, which is an implementation detail
    # no other language can mirror; on these images it moves the result by one
    # byte, which is enough to change a hue and every token derived from it. A
    # byte sum is an exact integer, so both implementations compute the same
    # rational number and round it the same way.
    #
    # `solver.js` implements the identical rule, and `verify-solver.mjs` asserts
    # the two agree value for value.
    top = max(1, flat.shape[0] // 200)
    mb = np.rint(mx * 255).astype(np.int32)
    threshold = 255
    seen = int((mb == 255).sum())
    while seen < top and threshold > 0:
        threshold -= 1
        seen += int((mb == threshold).sum())
    chosen = mb >= threshold
    count = int(chosen.sum())
    sums = np.asarray(resized, dtype=np.int64).reshape(-1, 3)[chosen].sum(axis=0)
    hl = np.asarray(sums, dtype=np.float64) / (count * 255.0)
    hl_rgb = tuple(int(round(c * 255)) for c in hl)
    hh, _, _ = colorsys.rgb_to_hls(*[float(c) for c in hl])

    dark_share = float((mx < 0.25).mean())
    mean_luma = float((0.2126 * flat[:, 0] + 0.7152 * flat[:, 1] + 0.0722 * flat[:, 2]).mean())
    median = tuple(int(round(c * 255)) for c in np.median(flat, axis=0))

    # --- the pixel distribution the text has to survive, over the *served* image
    luma = 0.2126 * flat[:, 0] + 0.7152 * flat[:, 1] + 0.0722 * flat[:, 2]
    order = np.argsort(luma)
    pct = {}
    for name, q in (("p05", 0.05), ("p25", 0.25), ("p50", 0.50), ("p75", 0.75), ("p95", 0.95)):
        window = flat[order[max(0, int(len(order) * q) - 2000): int(len(order) * q) + 2000]]
        # 0..255, the same scale the token colours are on.
        pct[name] = tuple(float(c) * 255 for c in window.mean(axis=0))

    return {
        "hue_band": hue_band,
        "hue_mid": round((hue_band[0] + hue_band[1]) / 2, 1) if hue_band else 228.0,
        "accent_share": round(accent_share, 4),
        "warm_hue": warm_hue,
        "warm_share": round(warm_share, 4),
        "highlight": "#%02x%02x%02x" % hl_rgb,
        "highlight_rgb": hl_rgb,
        "highlight_hue": round(hh * 360, 1),
        "dark_share": round(dark_share, 4),
        "mean_luma": round(mean_luma, 4),
        "median": "#%02x%02x%02x" % median,
        "median_rgb": median,
        "percentiles": pct,
    }, resized


def hsv_warm(flat, sat, mx):
    """Share and median hue of the sparse warm pixels (hue 15-75 deg)."""
    import colorsys as cs
    m = (sat > 0.30) & (mx > 0.40)
    if not m.any():
        return 0.0, None
    sample = flat[m][:: max(1, int(m.sum()) // 4000)]
    hsv = np.array([cs.rgb_to_hsv(*p) for p in sample])
    hues = hsv[:, 0] * 360
    sel = (hues >= 15) & (hues <= 75)
    if sel.sum() < 20:
        return 0.0, None
    return float(sel.sum() / len(hues)), float(np.median(hues[sel]))


# --------------------------------------------------------------------------
# token table
# --------------------------------------------------------------------------

ALL_TOKENS = json.loads((BUILD / "tokens.json").read_text(encoding="utf-8"))["union"]

# Surface ladder: token -> (lightness offset, alpha offset, saturation offset).
# Alpha offsets are relative to the solved base alpha; `None` alpha means "absolute".
LADDER: list[tuple[str, float, float | None, float]] = [
    ("--dsw-alias-bg-base", 0.000, 0.00, 0.00),
    ("--dsw-alias-bg-layer-1", 0.030, 0.10, 0.02),
    ("--dsw-alias-bg-layer-2", 0.065, 0.17, 0.02),
    ("--dsw-alias-bg-layer-3", 0.110, 0.24, 0.02),
    ("--dsw-alias-bg-overlay", 0.150, 0.97, 0.03),
    ("--dsw-alias-bg-module-platform", 0.065, 0.17, 0.02),
    ("--dsw-alias-bg-multi-select", 0.065, 0.17, 0.02),
    ("--dsw-alias-bg-document-preview", 0.020, 0.30, 0.01),
    ("--dsw-specific-sidebar-fill", 0.018, 0.16, 0.06),
    ("--dsw-specific-bubble", 0.055, 0.21, 0.02),
    ("--dsw-specific-bubble-highlight", 0.085, 0.27, 0.02),
    ("--dsw-specific-input-major", 0.070, 0.23, 0.02),
    ("--dsw-specific-login-input", 0.030, 0.15, 0.02),
    ("--dsw-specific-selector", 0.060, 0.21, 0.02),
    ("--dsw-specific-tip", 0.060, 0.21, 0.02),
    ("--dsw-specific-menu", 0.170, 0.97, 0.03),
    ("--dsw-menu-surface-fill", 0.170, 0.97, 0.03),
    ("--dsw-alias-menu-group-header-fill", 0.180, 0.98, 0.03),
    ("--dsw-alias-markdown-code-block", -0.012, 0.36, 0.05),
    ("--dsw-alias-markdown-code-block-banner", 0.016, 0.38, 0.05),
    ("--dsw-alias-markdown-inline-code", 0.030, 0.32, 0.05),
    ("--dsw-alias-markdown-code-segment-selected", 0.095, 0.36, 0.02),
    ("--dsw-alias-markdown-code-segment-unselected", 0.012, 0.36, 0.05),
    ("--dsw-alias-markdown-citation", 0.042, 0.32, 0.04),
    ("--dsw-alias-markdown-tag", 0.030, 0.30, 0.04),
    ("--dsw-alias-markdown-placeholder", 0.012, 0.32, 0.04),
    ("--dsw-alias-button-elevated-fill", 0.072, 0.25, 0.02),
    ("--dsw-alias-button-floating-fill", 0.062, 0.25, 0.02),
    ("--dsw-alias-button-floating-hover", 0.092, 0.29, 0.02),
    ("--dsw-alias-button-ghost-active-fill", 0.078, 0.27, 0.02),
    ("--dsw-alias-button-ghost-active-hover", 0.108, 0.31, 0.02),
    ("--dsw-alias-button-primary-dimmed", 0.055, 0.25, 0.12),
    ("--dsw-alias-interactive-bg-hover-solid", 0.082, 0.27, 0.02),
    ("--dsw-specific-sidebar-nav-item-active", 0.115, 0.31, 0.10),
    ("--dsw-specific-sidebar-nav-item-active-accent", 0.148, 0.33, 0.10),
    ("--dsw-alias-toast-bg", 0.105, 0.96, 0.04),
    ("--dsw-alias-tooltip-bg", 0.125, 0.96, 0.04),
    ("--dsw-alias-scrollbar-bg-l1", 0.165, 0.22, 0.05),
    ("--dsw-alias-scrollbar-bg-l2", 0.205, 0.26, 0.05),
    ("--dsw-alias-scrollbar-hover-l1", 0.245, 0.28, 0.05),
    ("--dsw-alias-scrollbar-hover-l2", 0.285, 0.32, 0.05),
]

MODE_CONST = {
    #                baseL   baseS   ink_hi        ink_mid       ink_lo        ink_dim
    "dark": dict(L=0.075, S=0.30, ink=(0.955, 0.17), ink2=(0.790, 0.15), ink3=(0.640, 0.14), ink4=(0.430, 0.18)),
    "light": dict(L=0.968, S=0.22, ink=(0.130, 0.42), ink2=(0.330, 0.30), ink3=(0.455, 0.24), ink4=(0.720, 0.20)),
}


def build_mode(an: dict, mode: str, base_alpha: float, lightness_delta: float) -> dict:
    """One complete token table for one palette mode."""
    hue = an["hue_mid"]
    warm_hue = an["warm_hue"] if (an["warm_hue"] is not None and an["warm_share"] > 0.02) else 38.0
    C = MODE_CONST[mode]
    L0 = C["L"] + lightness_delta
    S0 = C["S"]
    A0 = base_alpha
    dark = mode == "dark"

    def surf(dl: float, da: float | None, ds: float) -> tuple[tuple[int, int, int], float]:
        return hsl(hue, S0 + ds, L0 + dl), (min(0.98, A0 + da) if da is not None else 0.0)

    ink_hi = hsl(hue, C["ink"][1], C["ink"][0])
    ink_mid = hsl(hue, C["ink2"][1], C["ink2"][0])
    ink_lo = hsl(hue, C["ink3"][1], C["ink3"][0])
    ink_dim = hsl(hue, C["ink4"][1], C["ink4"][0])
    # `caption` is the QUIETEST label — one step weaker than `tertiary` in both
    # palettes. "Weaker" flips sign between them, so caption's luminance
    # direction is the opposite of tertiary's: shipped, tertiary is #81858c
    # (dark) in light mode and #adb2b8 (light) in dark mode, while caption is
    # #adb2b8 and #81858c — the same two values, swapped. Deriving caption from
    # tertiary by "one more step in the same direction" therefore gets it
    # backwards in exactly one of the two palettes.
    ink_caption = hsl(hue, 0.20, 0.615) if not dark else hsl(hue, 0.20, 0.480)
    # The ink used for translucent washes: light ink on a dark UI, dark ink on a light one.
    wash = ink_hi if dark else hsl(hue, 0.45, 0.14)

    ice = hsl(an["highlight_hue"], 0.20, 0.95 if dark else 0.99)

    # accent ramps, one per mode so both palettes have usable saturation
    if dark:
        ramp = [hsl(hue, 0.58, 0.70), hsl(hue, 0.54, 0.77), hsl(hue, 0.50, 0.83), hsl(hue, 0.46, 0.89), hsl(hue, 0.42, 0.94)]
    else:
        ramp = [hsl(hue, 0.50, 0.68), hsl(hue, 0.55, 0.60), hsl(hue, 0.60, 0.52), hsl(hue, 0.64, 0.44), hsl(hue, 0.66, 0.35)]
    a1, a2, a3, a4, a5 = ramp

    # semantic states; warn follows the image's own warm accent when it has one
    if dark:
        succ = (hsl(163, 0.52, 0.60), hsl(163, 0.52, 0.72), hsl(163, 0.34, 0.16))
        warn = (hsl(warm_hue, 0.72, 0.58), hsl(warm_hue, 0.78, 0.70), hsl(warm_hue, 0.40, 0.16))
        err = (hsl(349, 0.68, 0.68), hsl(349, 0.72, 0.78))
        succ_lbl, warn_lbl = succ[0], warn[0]
    else:
        succ = (hsl(163, 0.66, 0.34), hsl(163, 0.60, 0.42), hsl(163, 0.44, 0.92))
        warn = (hsl(warm_hue, 0.74, 0.42), hsl(warm_hue, 0.76, 0.50), hsl(warm_hue, 0.68, 0.93))
        err = (hsl(349, 0.60, 0.48), hsl(349, 0.58, 0.58))
        succ_lbl, warn_lbl = succ[0], hsl(warm_hue, 0.72, 0.34)

    T: dict[str, str] = {}

    # ---- surfaces from the ladder -----------------------------------------
    for name, dl, da, ds in LADDER:
        rgb, a = surf(dl, da, ds)
        T[name] = css(rgb, None if da is not None and da >= 0.97 else a) if da is not None else css(rgb)

    # ---- the inverted family -----------------------------------------------
    #
    # Not every token is a rung on the surface ladder. A toast, a tooltip, a
    # primary button, the badge chip: these stand OFF the page rather than
    # sitting on it, and the shipped theme expresses that by making them dark
    # in BOTH palettes — the toast is `#353638` in light mode and `#43454a` in
    # dark, with `#fff` text in both.
    #
    # Treating them as ladder rungs is what produced the visible defect this
    # family exists to prevent: a near-white toast in light mode with
    # near-white text on it (1.02:1), and a near-white badge chip in dark mode
    # whose "DEEPSEEK" label was also near-white (1.17:1). Neither throws, and
    # neither shows up in a contrast check that only looks at text on the page.
    #
    # So this family gets its own recipe: `off_surface` is a dark tinted
    # neutral in both palettes, and `off_ink` is the near-white that reads on
    # it. The hue still comes from the image, so a toast is recognisably this
    # theme's toast.
    off_surface = hsl(hue, 0.16, 0.115 if not dark else 0.165)
    off_surface_raised = hsl(hue, 0.16, 0.165 if not dark else 0.215)
    off_ink = hsl(an["highlight_hue"], 0.14, 0.99)

    # The ink that goes ON `label-primary` when it is used as a fill. It is
    # always the opposite of `label-primary`, which flips between palettes, so
    # this flips with it.
    ink_on_primary = hsl(hue, 0.16, 0.99) if not dark else hsl(hue, 0.20, 0.10)

    T["--dsw-alias-toast-bg"] = css(off_surface)
    T["--dsw-alias-toast-label"] = css(off_ink)
    T["--dsw-alias-tooltip-bg"] = css(off_surface)
    T["--dsw-alias-tooltip-key-bg"] = css(mix(off_surface, (255, 255, 255), 0.18))

    # ---- surfaces that are washes or need their own recipe ------------------
    T["--dsw-alias-bg-skeleton"] = css(wash, 0.07)
    T["--dsw-alias-bg-document-selection"] = css(a2, 0.40)
    T["--dsw-alias-button-tool-bar-fill"] = css(surf(0.020, None, 0.02)[0], 0.55)
    T["--dsw-alias-button-tool-bar-hover"] = css(surf(0.050, None, 0.02)[0], 0.68)
    T["--dsw-alias-button-tool-bar-fill-invisible"] = css(surf(-0.020, None, 0.02)[0], 0.36)
    T["--dsw-alias-interactive-bg-hover"] = css(wash, 0.08 if dark else 0.06)
    T["--dsw-alias-interactive-bg-hover-accent"] = css(wash, 0.16 if dark else 0.13)
    T["--dsw-alias-interactive-bg-active"] = css(wash, 0.13 if dark else 0.10)
    T["--dsw-alias-interactive-bg-hover-danger"] = css(err[0], 0.14 if dark else 0.07)
    T["--dsw-specific-sidebar-nav-item-hover"] = css(wash, 0.08 if dark else 0.07)
    T["--dsw-alias-turn-trigger-bg"] = T["--dsw-alias-markdown-code-block"]
    T["--dsw-alias-turn-trigger-bg-hover"] = T["--dsw-alias-interactive-bg-hover"]
    T["--dsw-alias-switch-thumb"] = css(ice if not dark else hsl(hue, 0.22, 0.74))
    T["--dsw-alias-file-diff-added-bg"] = css(succ[0], 0.14 if dark else 0.12)
    T["--dsw-alias-file-diff-added-gutter"] = css(succ[0], 0.09 if dark else 0.08)
    T["--dsw-alias-file-diff-added-marker"] = css(succ[0])
    T["--dsw-alias-file-diff-deleted-bg"] = css(err[0], 0.14 if dark else 0.12)
    T["--dsw-alias-file-diff-deleted-gutter"] = css(err[0], 0.09 if dark else 0.08)
    T["--dsw-alias-file-diff-deleted-marker"] = css(err[0])
    T["--dsw-alias-code-diff-added"] = css(succ[0], 0.10)
    T["--dsw-alias-code-diff-deleted"] = css(err[0], 0.10)

    # ---- masks (never tinted by the wallpaper: they sit on top of it) -------
    T["--dsw-alias-bg-mask-1"] = "rgba(10, 14, 32, 0.24)" if not dark else "rgba(4, 6, 16, 0.56)"
    T["--dsw-alias-bg-mask-2"] = "rgba(10, 14, 32, 0.12)" if not dark else "rgba(4, 6, 16, 0.28)"
    T["--dsw-alias-bg-mask-3"] = "rgba(10, 14, 32, 0.48)" if not dark else "rgba(4, 6, 16, 0.60)"
    T["--dsw-alias-bg-mask-photo"] = "rgba(4, 6, 16, 0.88)" if not dark else "rgba(3, 4, 10, 0.90)"
    T["--dsw-alias-bg-mask-drop"] = "rgba(244, 246, 252, 0.72)" if not dark else "rgba(13, 17, 35, 0.72)"

    # ---- borders ------------------------------------------------------------
    brgb = hsl(hue, 0.45, 0.30) if not dark else hsl(hue, 0.45, 0.72)
    for name, a in (
        ("--dsw-alias-border-l1", 0.07 if not dark else 0.09),
        ("--dsw-alias-border-l2", 0.14 if not dark else 0.17),
        ("--dsw-alias-border-l2-darkmode-thin", 0.10 if not dark else 0.09),
        ("--dsw-alias-border-l3", 0.20 if not dark else 0.24),
        ("--dsw-alias-border-l4", 0.28 if not dark else 0.30),
    ):
        T[name] = css(brgb, a)
    T["--dsw-alias-border-inverted"] = "rgba(255, 255, 255, 0.70)" if not dark else "rgba(255, 255, 255, 0.08)"
    T["--dsw-alias-border-inverted2"] = "rgba(255, 255, 255, 0.84)" if not dark else "rgba(255, 255, 255, 0.12)"

    # ---- labels -------------------------------------------------------------
    T["--dsw-alias-label-primary"] = css(ink_hi)
    T["--dsw-alias-label-primary-dimmed"] = css(ink_mid)
    T["--dsw-alias-label-secondary"] = css(ink_mid)
    T["--dsw-alias-label-tertiary"] = css(ink_lo)
    T["--dsw-alias-label-caption"] = css(ink_caption)
    T["--dsw-alias-label-dimmed"] = css(ink_dim)
    T["--dsw-alias-label-primary-foreground"] = css(ink_on_primary)
    # The ink for text on a `label-primary` fill. Shipped: #fff in light,
    # bluish-800 (dark) in dark — i.e. always the opposite of the fill.
    T["--dsw-alias-label-primary-inverted"] = css(ink_on_primary)
    T["--dsw-alias-label-primary-bluish"] = css(a5 if not dark else ice)
    T["--dsw-alias-label-document-preview"] = css(ink_mid)
    T["--dsw-alias-label-deep-diving"] = css(a4 if not dark else a1)
    T["--dsw-alias-label-deep-diving-shimmer"] = css(a3, 0.55)
    T["--dsw-alias-label-shimmer"] = css(hsl(hue, 0.10, 0.05) if not dark else (255, 255, 255), 0.30 if not dark else 0.45)
    T["--dsw-alias-menu-icon"] = css(ink_mid)
    T["--dsw-alias-link"] = css(a4 if not dark else a1)

    # ---- brand + buttons ----------------------------------------------------
    # `brand-primary` and its friends are the "strong ink" family: near-black
    # in light mode, near-white in dark. They are what a primary button is
    # filled with, and `ink_on_primary` is what reads on them.
    T["--dsw-alias-brand-primary"] = css(ink_hi)
    T["--dsw-alias-brand-primary-invert"] = css(ink_hi)
    T["--dsw-alias-brand-primary-new-colorprimary-new-color"] = css(a3 if not dark else a1)
    T["--dsw-alias-brand-text"] = css(ink_hi)
    T["--dsw-alias-button-primary-fill"] = css(ink_hi)
    T["--dsw-alias-button-primary-hover"] = css(ink_mid if not dark else ice)
    T["--dsw-alias-button-contrast-fill"] = css(hsl(hue, 0.20, 0.30) if not dark else off_ink)
    T["--dsw-alias-button-ghost-active-border"] = css(hsl(hue, 0.30, 0.55) if not dark else hsl(hue, 0.28, 0.40))
    # `info-fill` / `info-hover` back the primary send button, which ships as
    # `background: var(--dsw-alias-button-info-fill); color: #fff` — a HARD-CODED
    # white label. So the binding constraint is not luminance direction but
    # "white must read on both states", and the shipped pair satisfies it by
    # staying a mid blue in both palettes: `#4176e6` (4.23:1 against white) and
    # `#7aaaff` (2.33:1), swapping which is which between modes.
    #
    # Deriving these from the general accent ramp instead produced a near-white
    # fill in dark mode (`#e9ecf6`) with white text on it — 1.18:1, an invisible
    # button. The ramp is indexed by contrast against the PAGE, and this role is
    # indexed against WHITE, so it needs its own steps rather than a ramp rung.
    if dark:
        info_fill, info_hover = hsl(hue, 0.62, 0.63), hsl(hue, 0.66, 0.44)
    else:
        info_fill, info_hover = hsl(hue, 0.66, 0.44), hsl(hue, 0.62, 0.63)
    T["--dsw-alias-button-info-fill"] = css(info_fill)
    T["--dsw-alias-button-info-hover"] = css(info_hover)

    # ---- states -------------------------------------------------------------
    T["--dsw-alias-state-business-primary"] = css(a4 if not dark else a1)
    T["--dsw-alias-state-business-tertiary"] = css(hsl(hue, 0.32, 0.92) if not dark else surf(0.065, None, 0.06)[0])
    T["--dsw-alias-state-idle-primary"] = css(hsl(hue, 0.22, 0.78) if not dark else hsl(hue, 0.26, 0.40))
    T["--dsw-alias-state-success-primary"] = css(succ[0])
    T["--dsw-alias-state-success-secondary"] = css(succ[1])
    T["--dsw-alias-state-success-tertiary"] = css(succ[2])
    T["--dsw-alias-state-warn-primary"] = css(warn[0])
    T["--dsw-alias-state-warn-secondary"] = css(warn[1])
    T["--dsw-alias-state-warn-tertiary"] = css(warn[2])
    T["--dsw-alias-state-warn-label"] = css(warn_lbl)
    T["--dsw-alias-state-error-primary"] = css(err[0])
    T["--dsw-alias-state-error-secondary"] = css(err[1])

    missing = [t for t in ALL_TOKENS if t not in T]
    extra = [t for t in T if t not in ALL_TOKENS]
    if missing or extra:
        raise SystemExit(f"token table mismatch in {mode}: missing={missing} extra={extra}")
    return {t: T[t] for t in ALL_TOKENS}


def T_alpha(value: str) -> float | None:
    if value.startswith("rgba("):
        return float(value.rsplit(",", 1)[1].rstrip(")"))
    return None


def T_rgb(value: str) -> tuple[int, int, int]:
    if value.startswith("#"):
        return tuple(int(value[i:i + 2], 16) for i in (1, 3, 5))
    parts = value[5:-1].split(",")
    return tuple(int(p) for p in parts[:3])


def opaque_floor(theme: dict, mode: str) -> str:
    """
    The flat colour the page shows when the wallpaper is not painted.

    `<html>` cannot resolve `--dsw-alias-bg-base`: the presenter writes the
    palette on `<body>`, and a custom property defined on a descendant is not
    visible to an ancestor. So the wallpaper rules need a literal, and the
    right literal is the theme's own base surface composited over its own
    scrim — the colour the page settles at once the image has painted. A
    background image that fails to load then costs the picture and nothing
    else: no white flash, no wrong-mode rectangle.
    """
    table = theme["tokens"][mode]
    base_rgb, base_a = parse_css(table["--dsw-alias-bg-base"])
    veil_rgb, veil_a = parse_css(theme["solver"][mode]["scrim"])
    composited = over(base_rgb, base_a, tuple(float(c) for c in veil_rgb))
    return css(as_int(composited))


def parse_css(value: str) -> tuple[tuple[int, int, int], float]:
    if value.startswith("#"):
        return T_rgb(value), 1.0
    parts = value[value.index("(") + 1: value.rindex(")")].split(",")
    return tuple(int(float(p)) for p in parts[:3]), (float(parts[3]) if len(parts) > 3 else 1.0)


# --------------------------------------------------------------------------
# alpha solver
# --------------------------------------------------------------------------


# The surface stacks a reader actually looks at, outermost surface first.
STACKS = {
    "frame": ["--dsw-alias-bg-base"],
    "sidebar": ["--dsw-alias-bg-base", "--dsw-specific-sidebar-fill"],
    "card": ["--dsw-alias-bg-base", "--dsw-alias-bg-layer-2"],
    "menu": ["--dsw-alias-bg-base", "--dsw-specific-menu"],
    "code": ["--dsw-alias-bg-base", "--dsw-alias-markdown-code-block"],
    "bubble": ["--dsw-alias-bg-base", "--dsw-specific-bubble"],
}
# Which ink is read on which surface, and the floor it has to clear.
#
# The floors carry a small margin over the WCAG figure they stand for. The
# percentile slices are measured on a 2560px render of each image; a browser
# displaying it at any other size resamples slightly differently, and a
# solution that lands exactly on 4.50 in this script can land on 4.49 in a
# verification that decodes the image at another scale. The margin is what
# makes "passes here" mean "passes there".
MARGIN = 0.12
RULES = [
    ("--dsw-alias-label-primary", 4.5 + MARGIN, ["frame", "sidebar", "card", "menu", "bubble", "code"]),
    ("--dsw-alias-label-primary-dimmed", 4.5 + MARGIN, ["card", "menu"]),
    ("--dsw-alias-label-secondary", 3.5 + MARGIN, ["card", "sidebar", "menu", "bubble"]),
    ("--dsw-alias-label-tertiary", 3.0 + MARGIN, ["card", "sidebar"]),
]
# The three slices of the image's own luminance distribution the reader scrolls through.
SLICES = ("p05", "p50", "p95")


def check(an: dict, tokens: dict, veil: tuple[tuple[int, int, int], float]) -> tuple[bool, float, list[str]]:
    """Composite the veil, then the real surface stacks, over the real pixels."""
    worst = math.inf
    failures: list[str] = []
    vrgb, va = veil

    def comp(token_chain: list[str], pct: str) -> tuple[int, int, int]:
        backdrop = over(vrgb, va, an["percentiles"][pct])
        layers = []
        for name in token_chain:
            v = tokens[name]
            a = T_alpha(v)
            layers.append((T_rgb(v), 1.0 if a is None else a))
        return as_int(chain(layers, backdrop))

    for ink_token, floor, names in RULES:
        ink = T_rgb(tokens[ink_token])
        for name in names:
            for pct in SLICES:
                c = contrast(ink, comp(STACKS[name], pct))
                worst = min(worst, c)
                if c < floor:
                    failures.append(f"{ink_token} on {name}@{pct} = {c:.2f} < {floor}")
    return (not failures), worst, failures


def solve(an: dict, mode: str) -> dict:
    """
    Search the veil strength, the base surface alpha, and the surface lightness
    for the combination that leaves the most artwork visible while every
    contrast floor holds.

    Two knobs pull the same way — a stronger veil and a more opaque surface both
    buy legibility by hiding the image — so the score is legibility first, then
    the *least total covering*. Covering is not the sum of the two alphas but
    the fraction of the image they jointly hide, `1 - (1-veil)(1-alpha)`; a
    neutral lightness shift is preferred over a tinted one at equal covering, so
    the image's own hue, not the solver's nudge, decides what the theme looks
    like.
    """
    dark = mode == "dark"
    hue = an["hue_mid"]
    veil_rgb = hsl(hue, 0.34 if dark else 0.24, 0.085 if dark else 0.955)
    veil_alphas = [round(0.10 + 0.04 * i, 2) for i in range(18)]           # 0.10 .. 0.78
    alphas = [round(0.30 + 0.02 * i, 2) for i in range(1, 36)]             # 0.32 .. 1.00
    deltas = [0.0, -0.010, 0.010, -0.020, 0.020] if dark else [0.0, -0.015, 0.015, -0.030, 0.030]

    best = None
    for a in alphas:
        for d in deltas:
            tokens = build_mode(an, mode, a, d)
            for va in veil_alphas:
                ok, worst, _ = check(an, tokens, (veil_rgb, va))
                cover = 1.0 - (1.0 - va) * (1.0 - a)
                # Passing solutions rank by covering, then by how far the
                # lightness had to be nudged. Failing ones rank by how close
                # they came, so the fallback is the most legible of a field
                # that could not be made legible rather than an arbitrary one.
                score = (0, round(cover, 4), abs(d)) if ok else (1, -worst)
                if best is None or score < best["score"]:
                    best = {
                        "score": score, "passes": ok, "worst": worst, "cover": cover,
                        "baseAlpha": a, "lightnessDelta": d, "veilAlpha": va,
                        "veilRgb": veil_rgb, "tokens": tokens,
                    }
    return best


# --------------------------------------------------------------------------
# main
# --------------------------------------------------------------------------


def main() -> None:
    PKG.mkdir(parents=True, exist_ok=True)
    ASSETS.mkdir(parents=True, exist_ok=True)
    themes = {}
    report = []

    for slug, path, title in IMAGES:
        an, resized = analyse(path)
        out = ASSETS / f"{slug}.jpg"
        resized.save(out, "JPEG", quality=BG_QUALITY, optimize=True, progressive=True)
        size = out.stat().st_size

        tokens = {}
        solved = {}
        for mode in ("light", "dark"):
            s = solve(an, mode)
            vrgb = s["veilRgb"]
            scrim = css(vrgb, s["veilAlpha"])
            tokens[mode] = s["tokens"]
            solved[mode] = {
                "baseAlpha": s["baseAlpha"],
                "lightnessDelta": s["lightnessDelta"],
                "veilAlpha": s["veilAlpha"],
                "veilRgb": list(vrgb),
                "scrim": scrim,
                "worstContrast": round(s["worst"], 2),
                "passes": s["passes"],
            }
            flag = "ok " if s["passes"] else "!! "
            print(f"  {flag}{slug}/{mode}: veil={s['veilAlpha']:.2f} base={s['baseAlpha']:.2f} "
                  f"dL={s['lightnessDelta']:+.3f} worst={s['worst']:.2f}")

        themes[slug] = {
            "slug": slug,
            "title": title,
            "source": Path(path).name,
            "wallpaper": f"{slug}.jpg",
            "wallpaperBytes": size,
            "analysis": {k: v for k, v in an.items() if k != "percentiles"},
            "percentiles": {k: [round(c, 1) for c in v] for k, v in an["percentiles"].items()},
            # The scrim is the same value the client carries; keeping it here too
            # means the preview sheet and the palette record can be read without
            # reaching into the solver's internals.
            "scrim": {m: solved[m]["scrim"] for m in ("light", "dark")},
            "solver": solved,
            "tokens": tokens,
        }
        report.append((slug, title, an, solved, size))

    (BUILD / "palette.json").write_text(json.dumps(themes, indent=1, ensure_ascii=False), encoding="utf-8")

    # ---- splice the tables into the client template ------------------------
    template = (BUILD / "client.template.js").read_text(encoding="utf-8")
    marker = "/* @PALETTES@ */"
    if marker not in template:
        raise SystemExit("client.template.js has no /* @PALETTES@ */ marker")
    data = {
        s: {
            "title": t["title"],
            "source": t["source"],
            "wallpaper": t["wallpaper"],
            # One scrim per palette mode: the veil the solver measured that
            # mode against, so the stylesheet hands the client the exact value
            # its contrast numbers describe.
            "scrim": {
                "light": t["solver"]["light"]["scrim"],
                "dark": t["solver"]["dark"]["scrim"],
            },
            # The opaque colour the page should have when the artwork is not
            # there — still loading, or refused by the network. It is the
            # theme's own base surface composited over its own scrim, i.e. the
            # colour the page settles at once the image is painted, so a failed
            # image costs the picture and nothing else.
            "floor": {
                mode: opaque_floor(t, mode) for mode in ("light", "dark")
            },
            # `ThemeTokens` is a FLAT `Record<string, string>` — one value per
            # token, applied as-is by the presenter, with `colorScheme` deciding
            # which base palette the document uses. The `{ light, dark }` pair
            # shape belongs to `overrideTokens`, which composes a layer over the
            # *active* theme; handing that shape to `register` installs tokens
            # literally named "light" and "dark" and leaves every real token on
            # the base palette. So each mode gets its own flat table, and the
            # plugin registers one theme per mode.
            "tokens": {
                "light": t["tokens"]["light"],
                "dark": t["tokens"]["dark"],
            },
        }
        for s, t in themes.items()
    }

    # The palettes live in their own module rather than inline in the client.
    # The Host half needs the same table: it renders the pre-paint boot script,
    # which has to know the floor colour and the wallpaper URL before any
    # plugin code runs. Duplicating 36 KB of tokens into index.js would be
    # worse than sharing one module, and `client.js` still carries no import
    # of its own — the bundle route serves it verbatim, so it cannot resolve a
    # relative specifier. The shared module is therefore plain data with no
    # imports, imported by the Host half and inlined into the client half at
    # build time by the same generator that writes both.
    body = ",\n".join(
        f"\t\t{json.dumps(slug, ensure_ascii=False)}: {json.dumps(entry, ensure_ascii=False, indent=2)}"
        for slug, entry in data.items()
    )
    theme_data = (
        "/**\n"
        " * The generated palettes — shared by both halves of the bundle.\n"
        " *\n"
        " * Written by `build_palettes.py`; do not edit by hand. The Host half\n"
        " * imports it to render the pre-paint boot script, and the client half\n"
        " * carries the same object inlined (its module is served verbatim from a\n"
        " * route, so it cannot resolve a relative import of its own).\n"
        " */\n"
        "export const GALLERY = {\n" + body + ",\n};\n\n"
        "export default GALLERY;\n"
    )
    (PKG / "theme-data.js").write_text(theme_data, encoding="utf-8")

    block = "const GALLERY = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";"

    # ---- inline the solver -------------------------------------------------
    #
    # The client half has to be able to solve a palette for an image the user
    # supplies, and `client.js` is served verbatim from a route, so it cannot
    # resolve a relative import. So `solver.js` is inlined — the ONLY transform
    # applied is stripping its `export` statements, which keeps the two copies
    # textually identical and therefore diffable. `verify.py` asserts that the
    # inlined body matches the file it came from, so a hand edit to one cannot
    # silently diverge from the other.
    solver = (BUILD / "solver.js").read_text(encoding="utf-8")
    # Drop the leading doc block: the client module has its own header, and a
    # second one would read as though the file had two introductions.
    solver = re.sub(r"\A\s*/\*\*.*?\*/\s*", "", solver, count=1, flags=re.S)
    # Remove the trailing `export { ... };` list, which a plain script cannot have.
    solver = re.sub(r"\nexport\s*\{[^}]*\};\s*\Z", "\n", solver, flags=re.S)
    if "export " in solver:
        raise SystemExit("solver.js still has an `export` after stripping; the inliner needs updating")
    solver_marker = "/* @SOLVER@ */"
    if solver_marker not in template:
        raise SystemExit("client.template.js has no /* @SOLVER@ */ marker")
    # A plain `str.replace` is safe here: neither the palette block nor the
    # solver source contains the other's marker, and `str.replace` does not
    # interpret backslashes in the replacement the way `re.sub` does — which
    # matters, because the solver is full of regex literals.
    rendered = template.replace(marker, block).replace(solver_marker, solver)
    (PKG / "client.js").write_text(rendered, encoding="utf-8")

    # ---- report ------------------------------------------------------------
    print()
    print(f"{'theme':9} {'hue':>6} {'warm':>6} {'dark%':>6} {'median':>8} {'hl':>8} "
          f"{'veil':>5} {'a·light':>7} {'a·dark':>6} {'minCR':>6} {'jpg':>7}")
    print("-" * 82)
    for slug, title, an, solved, size in report:
        print(f"{slug:9} {an['hue_mid']:>6} {str(an['warm_hue'] and round(an['warm_hue'])):>6} "
              f"{an['dark_share'] * 100:>5.1f}% {an['median']:>8} {an['highlight']:>8} "
              f"{solved['dark']['veilAlpha']:>5.2f} {solved['light']['baseAlpha']:>7} "
              f"{solved['dark']['baseAlpha']:>6} "
              f"{min(solved['light']['worstContrast'], solved['dark']['worstContrast']):>6} "
              f"{size / 1024:>6.0f}K")
    print(f"\nclient.js: {(PKG / 'client.js').stat().st_size / 1024:.1f} KB")
    print(f"palette.json: {(BUILD / 'palette.json').stat().st_size / 1024:.1f} KB")


if __name__ == "__main__":
    sys.exit(main())
