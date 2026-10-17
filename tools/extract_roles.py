"""
Extract every shipped alias token's ROLE into `roles.json`.

A token's role is its **polarity relative to the page it sits on**: is it
lighter than `bg-base` in that palette, or darker? That is the design intent a
generator has to reproduce, and unlike "which palette is lighter" it is robust
for the dark end of the ramp, where luminance is compressed and two visibly
different greys sit 0.02 apart.

It reads directly as the design vocabulary:

  * a **surface** sits BELOW the page in light mode and ABOVE it in dark —
    polarity flips;
  * an **ink** does the same, which is why text is legible in both;
  * a **stand-off** surface (toast, tooltip, the badge chip) is *darker* than
    the page in light mode and *lighter* than it in dark, exactly like a
    surface — but it carries its own ink, so a generator that files it under
    "another rung on the ladder" gives it page-coloured text;
  * a **fixed accent** (the semantic state colours) keeps its hue and sits
    below the page in light, above in dark.

A token whose shipped value is within a small band of the page is `same`, and
carries no constraint.
"""
from __future__ import annotations

import json
import re
from pathlib import Path

from dsh_paths import dsh_theme_client

BUILD = Path(__file__).resolve().parent

# Polarity is reported only when the token is clearly off the page. Below this
# band the value IS the page (bg-base itself, and masks that do not move it).
BAND = 0.02


def theme_path() -> Path:
    """The shipped theme bundle, wherever DSH happens to be installed.

    Resolved on use rather than at import: this module is imported by tooling
    that may only want the helpers, and a clone with no DSH installation should
    get the actionable message from `dsh_paths` when it actually reads tokens,
    not at import time. See `dsh_paths.py` for the lookup order and the
    DSH_ROOT override.
    """
    return dsh_theme_client()


def _lin(c: float) -> float:
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def luminance(rgb) -> float:
    r, g, b = (c / 255 for c in rgb[:3])
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def parse(value: str):
    """A CSS colour as (rgb, alpha)."""
    v = value.strip()
    if v.startswith("#"):
        h = v[1:]
        if len(h) == 3:
            h = "".join(c * 2 for c in h)
        if len(h) == 8:
            return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)), int(h[6:8], 16) / 255
        return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)), 1.0
    parts = v[v.index("(") + 1: v.rindex(")")].split(",")
    rgb = tuple(int(float(p)) for p in parts[:3])
    return rgb, (float(parts[3]) if len(parts) > 3 else 1.0)


def collect(text: str) -> tuple[dict, dict]:
    light: dict[str, str] = {}
    dark: dict[str, str] = {}
    for m in re.finditer(r"(body(?:\[data-ds-dark-theme\])?)\{([^{}]*)\}", text):
        sel, body = m.group(1), m.group(2)
        (dark if "dark" in sel else light).update(re.findall(r"(--dsw-[\w-]+)\s*:\s*([^;}]+)", body))
    return light, dark


def resolve(name: str, table: dict[str, str], seen=None) -> str | None:
    seen = seen or set()
    if name in seen:
        return None
    seen.add(name)
    raw = table.get(name)
    if raw is None:
        return None
    raw = raw.strip()
    m = re.fullmatch(r"var\((--[\w-]+)\)", raw)
    if m:
        return resolve(m.group(1), table, seen)
    if raw.startswith("color-mix") or raw.startswith("var("):
        return None
    return raw


def main() -> None:
    light, dark = collect(theme_path().read_text(encoding="utf-8"))

    page: dict[str, tuple] = {}
    for mode, table in (("light", light), ("dark", dark)):
        base = resolve("--dsw-alias-bg-base", table)
        page[mode] = parse(base)[0] if base else ((255, 255, 255) if mode == "light" else (21, 21, 23))

    roles: dict[str, dict] = {}
    skipped: list[str] = []
    for name in sorted(n for n in light if n.startswith("--dsw-alias-")):
        entry: dict[str, object] = {}
        for mode, table in (("light", light), ("dark", dark)):
            raw = resolve(name, table)
            if raw is None:
                entry = {}
                break
            try:
                rgb, alpha = parse(raw)
            except (ValueError, IndexError):
                entry = {}
                break
            # Composite onto the page: a translucent token's polarity is only
            # meaningful once it has landed on something.
            shown = tuple(alpha * c + (1 - alpha) * b for c, b in zip(rgb, page[mode]))
            lum = luminance(shown)
            delta = lum - luminance(page[mode])
            entry[mode] = {
                "raw": raw,
                "shown": [round(c, 1) for c in shown],
                "lum": round(lum, 4),
                "polarity": "below" if delta < -BAND else "above" if delta > BAND else "same",
            }
        if not entry:
            skipped.append(name)
            continue
        roles[name] = {
            "light": entry["light"],
            "dark": entry["dark"],
            "flips": entry["light"]["polarity"] != entry["dark"]["polarity"],
        }

    (BUILD / "roles.json").write_text(json.dumps(roles, indent=1), encoding="utf-8")

    def group(pred):
        return [n for n, r in roles.items() if pred(r)]

    flips = group(lambda r: r["flips"])
    fixed = group(lambda r: not r["flips"])
    print(f"{len(roles)} alias tokens given a role; {len(skipped)} unresolved (color-mix or indirect)")
    print(f"  polarity flips between palettes : {len(flips)}   (surfaces, inks, stand-off)")
    print(f"  polarity fixed                  : {len(fixed)}")
    print()
    print("POLARITY-FIXED tokens — same side of the page in both palettes:")
    for n in sorted(fixed):
        r = roles[n]
        print(f"  {n:52} light {r['light']['polarity']:5} ({r['light']['raw']:22}) "
              f"dark {r['dark']['polarity']:5} ({r['dark']['raw']})")


if __name__ == "__main__":
    main()
