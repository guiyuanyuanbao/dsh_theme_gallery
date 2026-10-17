"""
Render one preview sheet for the three themes.

Each row is one image: the wallpaper as it is actually served (with the solved
scrim applied, so the sheet shows what the page shows rather than a brightened
version of it), then the palette roles that matter, then the measured contrast.

This is a contact sheet for reading, not a mock of the UI — the plugin is the
only thing that renders the real interface.
"""
from __future__ import annotations

import json
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

BUILD = Path(__file__).resolve().parent
PKG = BUILD.parent

PANEL_W = 420
PANEL_H = 300
ROW_GAP = 22
SWATCH_H = 42
HEADER_H = 74
LABEL_W = 150
MARGIN = 28

# The roles a reader needs to judge a palette, in reading order.
ROLES = [
    ("page", "--dsw-alias-bg-base"),
    ("raised", "--dsw-alias-bg-layer-2"),
    ("sidebar", "--dsw-specific-sidebar-fill"),
    ("menu", "--dsw-specific-menu"),
    ("code", "--dsw-alias-markdown-code-block"),
    ("brand", "--dsw-alias-brand-primary-new-colorprimary-new-color"),
    ("text", "--dsw-alias-label-primary"),
    ("muted", "--dsw-alias-label-tertiary"),
    ("ok", "--dsw-alias-state-success-primary"),
    ("warn", "--dsw-alias-state-warn-primary"),
    ("error", "--dsw-alias-state-error-primary"),
]

# The pairs that live on a filled control rather than on the page. These are
# where a "every token is a surface" model fails silently, so the sheet shows
# them explicitly: each chip is the control's fill with its own label on it.
ON_PRIMARY = [
    ("badge", "--dsw-alias-label-primary", "--dsw-alias-label-primary-inverted"),
    ("button", "--dsw-alias-button-primary-fill", "--dsw-alias-label-primary-inverted"),
    ("send", "--dsw-alias-button-info-fill", "#ffffff"),
    ("toast", "--dsw-alias-toast-bg", "--dsw-alias-toast-label"),
    ("tooltip", "--dsw-alias-tooltip-bg", "--dsw-alias-toast-label"),
]


def parse(value: str):
    if value.startswith("#"):
        h = value[1:]
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)), 1.0
    parts = value[value.index("(") + 1: value.rindex(")")].split(",")
    rgb = tuple(int(float(p)) for p in parts[:3])
    alpha = float(parts[3]) if len(parts) > 3 else 1.0
    return rgb, alpha


def _lin(c):
    c /= 255
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def luminance(rgb):
    r, g, b = (_lin(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast(fg, bg):
    hi, lo = sorted((luminance(fg), luminance(bg)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def over(fg, a, bg):
    return tuple(a * f + (1 - a) * b for f, b in zip(fg, bg))


def font(size, bold=False):
    """
    A face with CJK coverage.

    The theme titles are Chinese and the sheet carries them verbatim, so a
    Latin-only face renders them as tofu boxes — which is exactly what the
    first version of this sheet did. Microsoft YaHei ships with Windows and
    covers both scripts; Segoe UI is the fallback for a host without it.
    """
    candidates = (
        ("msyhbd.ttc", "msyh.ttc") if bold else ("msyh.ttc",)
    ) + (
        ("seguisb.ttf", "segoeuib.ttf") if bold else ("segoeui.ttf", "arial.ttf")
    )
    for name in candidates:
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main() -> None:
    themes = json.loads((BUILD / "palette.json").read_text(encoding="utf-8"))
    slugs = list(themes)

    width = MARGIN * 2 + PANEL_W + 18 + LABEL_W + 12 * (SWATCH_H + 4) + 120
    height = HEADER_H + len(slugs) * (PANEL_H + ROW_GAP) + 230
    sheet = Image.new("RGB", (width, height), (16, 17, 22))
    draw = ImageDraw.Draw(sheet)

    draw.text((MARGIN, 20), "画廊 Gallery — shipped wallpapers and their solved palettes",
              font=font(23, True), fill=(238, 240, 248))
    draw.text((MARGIN, 50),
              "wallpaper shown at the solved scrim · swatches are the token values applied as an override layer · "
              "contrast measured on the composited surface",
              font=font(13), fill=(150, 156, 176))

    for index, slug in enumerate(slugs):
        theme = themes[slug]
        y = HEADER_H + index * (PANEL_H + ROW_GAP)

        # ---- the wallpaper, at the scrim the plugin actually paints ---------
        art = Image.open(PKG / "assets" / theme["wallpaper"]).convert("RGB")
        scale = max(PANEL_W / art.width, PANEL_H / art.height)
        art = art.resize((round(art.width * scale), round(art.height * scale)), Image.LANCZOS)
        left = (art.width - PANEL_W) // 2
        top = (art.height - PANEL_H) // 2
        art = art.crop((left, top, left + PANEL_W, top + PANEL_H))

        # The dark scrim is the darker of the two, so the panel shows the
        # harder case; the light scrim is a near-white veil and would wash the
        # artwork out to a pale rectangle.
        veil_rgb, veil_a = parse(theme["scrim"]["dark"])
        veil = Image.new("RGB", art.size, veil_rgb)
        veiled = Image.blend(art, veil, veil_a)

        sheet.paste(veiled, (MARGIN, y))
        draw.rectangle([MARGIN, y, MARGIN + PANEL_W - 1, y + PANEL_H - 1],
                       outline=(58, 62, 80), width=1)
        draw.text((MARGIN + 10, y + PANEL_H - 26), f"{theme['title']}   {theme['source']}",
                  font=font(13, True), fill=(240, 243, 252))

        # ---- both palettes as swatch rows -----------------------------------
        x = MARGIN + PANEL_W + 18
        label_x = x + 12 * (SWATCH_H + 4) + 10

        for row, mode in enumerate(("dark", "light")):
            table = theme["tokens"][mode]
            row_y = y + row * 92
            draw.text((x, row_y), f"{mode} palette", font=font(12, True), fill=(196, 202, 224))
            # Each mode's swatches composite over THAT mode's page colour: a
            # translucent light-mode surface shown over a dark backdrop is a
            # colour nobody will ever see.
            page = parse(table["--dsw-alias-bg-base"])[0]
            for i, (role, token) in enumerate(ROLES):
                rgb, alpha = parse(table[token])
                shown = tuple(int(round(c)) for c in over(rgb, alpha, page))
                cell = (x + i * (SWATCH_H + 4), row_y + 18)
                draw.rectangle([cell[0], cell[1], cell[0] + SWATCH_H - 1, cell[1] + SWATCH_H - 1],
                               fill=shown, outline=(70, 74, 92), width=1)
                if row == 0:
                    draw.text((cell[0], cell[1] + SWATCH_H + 4), role, font=font(10), fill=(168, 174, 196))

        # ---- the on-primary chips -------------------------------------------
        # Drawn as the control actually renders: fill, with its own label on
        # top. A wrong pairing shows up here as unreadable text rather than as
        # a number the reader has to interpret.
        chip_x = x
        chip_y = y + 2 * 92 + 6
        draw.text((chip_x, chip_y - 18), "text on filled controls", font=font(12, True), fill=(196, 202, 224))
        for label, bg_token, fg_token in ON_PRIMARY:
            table = theme["tokens"]["dark"]
            page = parse(table["--dsw-alias-bg-base"])[0]
            brgb, balpha = parse(table[bg_token])
            fill = tuple(int(round(c)) for c in over(brgb, balpha, page))
            if fg_token.startswith("#"):
                ink = parse(fg_token)[0]
            else:
                irgb, ialpha = parse(table[fg_token])
                ink = tuple(int(round(c)) for c in over(irgb, ialpha, fill))
            w, hgt = 74, 30
            draw.rounded_rectangle([chip_x, chip_y, chip_x + w - 1, chip_y + hgt - 1],
                                   radius=6, fill=fill, outline=(80, 84, 104), width=1)
            tw = draw.textlength(label, font=font(12, True))
            draw.text((chip_x + (w - tw) / 2, chip_y + 8), label, font=font(12, True), fill=ink)
            chip_x += w + 6

        # ---- the measured contrast ------------------------------------------
        stacks = {
            "card": ["--dsw-alias-bg-base", "--dsw-alias-bg-layer-2"],
            "sidebar": ["--dsw-alias-bg-base", "--dsw-specific-sidebar-fill"],
        }
        for row, mode in enumerate(("dark", "light")):
            table = theme["tokens"][mode]
            lines = []
            for name, chain in stacks.items():
                bg = None
                for token in chain:
                    rgb, alpha = parse(table[token])
                    bg = rgb if bg is None else tuple(int(round(c)) for c in over(rgb, alpha, bg))
                ink, _ = parse(table["--dsw-alias-label-primary"])
                lines.append(f"primary on {name}: {contrast(ink, bg):.1f}:1")
            solver = theme["solver"][mode]
            lines.append(f"veil {solver['veilAlpha']:.2f} · base alpha {solver['baseAlpha']:.2f} "
                         f"· worst {solver['worstContrast']:.2f}:1")
            for i, line in enumerate(lines):
                draw.text((label_x, y + row * 92 + 18 + i * 17), line,
                          font=font(12), fill=(178, 184, 206))

    # ---- the footer --------------------------------------------------------
    foot = height - 210
    draw.line([(MARGIN, foot - 14), (width - MARGIN, foot - 14)], fill=(52, 56, 72), width=1)
    draw.text((MARGIN, foot), "What is registered", font=font(15, True), fill=(226, 230, 244))
    counts = [
        f"{len(slugs)} shipped images × 2 palettes, each carrying all 113 alias tokens",
        "the palette is applied with theme.overrideTokens, so the Appearance row keeps owning light/dark",
        "the wallpaper is painted as the background of <html>, the canvas layer — no z-index, no layer to fight",
        "surfaces are translucent rgba(), so the artwork reads through the shell's own backgrounds",
        "the switcher is a sidebar-foot action: click cycles every wallpaper, shipped and custom, then none",
        "text contrast is solved per image, not assumed: the alphas are the smallest that clear the floors",
        "you can add your own: upload a picture or paste a link, and this same solver runs in the browser",
        "each palette's swatches are composited over its own page colour, so the sheet shows what the UI shows",
    ]
    for i, line in enumerate(counts):
        draw.text((MARGIN, foot + 26 + i * 20), "· " + line, font=font(12.5), fill=(160, 166, 190))

    out = PKG / "preview.png"
    sheet.save(out, "PNG", optimize=True)
    print(f"{out}  {sheet.width}x{sheet.height}  {out.stat().st_size / 1024:.0f} KB")


if __name__ == "__main__":
    main()
