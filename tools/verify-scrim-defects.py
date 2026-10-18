"""Prove the opacity rules' structural checks can fail.

The plugin paints exactly four elements: the four surfaces its sliders name. It
used to paint two more, and both were defects with the same shape — a second,
separately-opaque layer stacked onto an element the shipped client had already
coloured:

  * the composer's `[data-composer-seat]` band, whose own `transparent -> token`
    gradient is the transcript mask. Restating it as a flat fill of `bg-base`
    made the whole band read as a copy of the page over the composer.
  * every build-hashed `*_frame` class, reached through `[class*=frame]`. That
    also matched the chat view, the turn navigator, the attachment zoomer, a
    subagent card, the right sidebar and three frames in the document preview.

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
        "the chat rule reaches every *_frame widget again",
        PKG / "client.js",
        "\t\t\topacityChat: `html[${ART_ATTRIBUTE}] [class*=root][data-phase]`,",
        "\t\t\topacityChat: `html[${ART_ATTRIBUTE}] [class*=frame]`,",
        "still matches [class*=frame]",
    ),
    (
        "the seat becomes a rule subject again",
        PKG / "client.js",
        'opacityInput: `html[${ART_ATTRIBUTE}] [data-composer-seat][data-conversation-region="composer"] [class*=card]`,',
        'opacityInput: `html[${ART_ATTRIBUTE}] [data-composer-seat][data-conversation-region="composer"]`,',
        "paints [data-composer-seat] itself",
    ),
    (
        "a rule drops a gradient the client owns",
        PKG / "client.js",
        "\t\t\t\t\t`  ${opacityFill(key)}`,",
        "\t\t\t\t\t`  background-image: none;`,\n\t\t\t\t\t`  ${opacityFill(key)}`,",
        "sets background-image",
    ),
    (
        "the Host records a scrim again",
        PKG / "index.js",
        '\t\tselector: "html[data-dsh-gallery] [class*=root][data-phase]",',
        '\t\tselector: "html[data-dsh-gallery] [class*=root][data-phase]",\n'
        '\t\tscrim: "[data-composer-seat][data-conversation-region=\\"composer\\"]",',
        "the Host still records scrim(s)",
    ),
    (
        "the Host and the client disagree about the chat selector",
        PKG / "index.js",
        '\t\tselector: "html[data-dsh-gallery] [class*=root][data-phase]",',
        '\t\tselector: "html[data-dsh-gallery] [class*=frame]",',
        "the Host names the selector",
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
        if old == new:
            failures.append(f"{label}: the defect is a no-op")
            print(f"FAIL {label}: the defect does not change anything")
            continue
        path.write_text(original.replace(old, new, 1), encoding="utf-8", newline="\n")
        try:
            done = subprocess.run(
                [PYTHON, str(BUILD / "verify.py")],
                capture_output=True, text=True, encoding="utf-8", errors="replace",
                timeout=600, cwd=str(BUILD),
            )
        finally:
            path.write_text(original, encoding="utf-8", newline="\n")
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
        path.write_text(text, encoding="utf-8", newline="\n")

    if failures:
        print(f"\n{len(failures)} FAILURE(S)")
        return 1
    print("\nevery structural check fails when its defect is re-injected")
    return 0


if __name__ == "__main__":
    sys.exit(main())
