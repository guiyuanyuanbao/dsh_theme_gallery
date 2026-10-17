"""Prove the KNOWN_VARIANTS guard rejects a selector missing one of its guards.

Both halves are changed together so the only remaining fault is the missing
`:not()`. Changing one side alone would trip the Host/client inventory mismatch
first, which is a different check and would prove nothing about this one.
"""

import pathlib
import shutil
import subprocess
import sys

BUILD = pathlib.Path(__file__).resolve().parent
PKG = BUILD.parent

FULL = "[class*=tabHost]:not([class*=tabHostHeader]):not([class*=tabHostBody])"
MISSING_HEADER = "[class*=tabHost]:not([class*=tabHostBody])"


def main() -> int:
    targets = [PKG / "client.js", PKG / "index.js"]
    originals = {p: p.read_text(encoding="utf-8") for p in targets}

    if not all(FULL in text for text in originals.values()):
        print("SKIP the full selector is not in both halves")
        return 1

    try:
        for path, text in originals.items():
            path.write_text(text.replace(FULL, MISSING_HEADER), encoding="utf-8")
        done = subprocess.run(
            [sys.executable, str(BUILD / "verify.py")],
            capture_output=True, text=True, encoding="utf-8", errors="replace",
            timeout=600, cwd=str(BUILD),
        )
    finally:
        for path, text in originals.items():
            path.write_text(text, encoding="utf-8")

    output = done.stdout + done.stderr
    if done.returncode == 0:
        print("FAIL verify.py accepted a selector missing the tabHostHeader guard")
        return 1
    if "without excluding" not in output:
        print("FAIL failed, but not for the missing guard:")
        print(output[-800:])
        return 1
    line = next((l.strip() for l in output.splitlines() if "without excluding" in l), "")
    print(f"ok   the missing tabHostHeader guard is rejected\n       -> {line[:170]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
