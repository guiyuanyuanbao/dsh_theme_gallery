"""Prove the new scrim checks can fail.

Each defect is injected into the SHIPPED files (a copy is kept and restored),
verify.py is run, and the expected failure line must appear. A check that cannot
fail proves nothing.
"""

from __future__ import annotations

import pathlib
import shutil
import subprocess
import sys

BUILD = pathlib.Path(__file__).resolve().parent
# The package root is this script's parent; see verify-compat.py.
PKG = BUILD.parent
PYTHON = sys.executable

DEFECTS = [
    (
        "the scrim repaints a fill instead of dropping the client's ramp",
        PKG / "client.js",
        '\t\t\t\t\t"  background-image: none;",\n\t\t\t\t\t"  background-color: transparent;",',
        "\t\t\t\t\t`  ${opacityFill(key)}`,",
        "paints a colour of its own",
    ),
    (
        "the scrim is anchored to the gate instead of under its surface",
        PKG / "client.js",
        "\t\t\t\tconst selector = surface === scrim ? surface : `${surface} ${scrim}`;",
        "\t\t\t\tconst selector = `html[${ART_ATTRIBUTE}] ${scrim}`;",
        "is not anchored under its own surface selector",
    ),
    (
        "the scrim paints a fixed alpha instead of the surface's own",
        PKG / "client.js",
        "function opacityFill(key) {\n\t\t\treturn `background-color: color-mix(in srgb, rgb(from var(${OPACITY_TOKENS[key]}) r g b / 1) var(${OPACITY_VARIABLES[key]}, 100%), transparent);`;",
        "function opacityFill(key) {\n\t\t\treturn `background-color: color-mix(in srgb, rgb(from var(${OPACITY_TOKENS[key]}) r g b / 1) var(${OPACITY_VARIABLES[key]}, 50%), transparent);`;",
        None,  # a fixed alpha would break the surface rules too; only a failure is required
    ),
    (
        "the Host records a scrim the client does not paint",
        PKG / "index.js",
        '\t\tscrim: "[data-composer-seat][data-conversation-region=\\"composer\\"]",',
        '\t\tscrim: "[class*=seat]",',
        "the Host records scrims",
    ),
]


def main() -> int:
    backups: dict[pathlib.Path, str] = {}
    failures: list[str] = []
    for label, path, old, new, expected in DEFECTS:
        original = path.read_text(encoding="utf-8")
        backups.setdefault(path, original)
        if old not in original:
            failures.append(f"{label}: the anchor text is not in {path.name}")
            print(f"SKIP {label}: anchor not found")
            continue
        path.write_text(original.replace(old, new, 1), encoding="utf-8")
        try:
            done = subprocess.run(
                [PYTHON, str(BUILD / "verify.py")],
                capture_output=True, text=True, encoding="utf-8", errors="replace",
                timeout=600, cwd=str(BUILD),
            )
        finally:
            path.write_text(original, encoding="utf-8")
        output = done.stdout + done.stderr
        if done.returncode == 0:
            failures.append(f"{label}: verify.py still passed")
            print(f"FAIL {label}: verify.py still passed")
            continue
        if expected is not None and expected not in output:
            failures.append(f"{label}: failed, but not with {expected!r}")
            print(f"FAIL {label}: wrong failure\n{output[-600:]}")
            continue
        line = next(
            (l.strip() for l in output.splitlines() if l.strip() and not l.startswith(" ")),
            "",
        )
        print(f"ok   {label}\n       -> {line[:170]}")

    for path, text in backups.items():
        path.write_text(text, encoding="utf-8")

    if failures:
        print(f"\n{len(failures)} FAILURE(S)")
        return 1
    print("\nevery new scrim check fails when its defect is re-injected")
    return 0


if __name__ == "__main__":
    sys.exit(main())