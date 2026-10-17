"""Prove the manifest's DSH requirement still admits the runtime.

This is the check for the defect that shipped 1.0.0: an exact
`"@deepseek-ai/dsh-home-paths": "0.2.0-rc.2"` peer pin matched only a runtime
whose own version was literally `0.2.0-rc.2`, so the first build of the same
minor that the harness moved to was refused at composition with

    dsh-theme-gallery@1.0.0 is incompatible with DSH <version>
    (requires @deepseek-ai/dsh-home-paths 0.2.0-rc.2)

The Host evaluates this before importing the module, so the failure mode is a
plugin that is simply not there. Two things are asserted:

  1. the ranges evaluate correctly against an explicit set of runtime versions,
     and
  2. none of the DSH requirements is an exact pin.

The runtime versions are spelled out rather than read from the installation:
the point is that a later build of the same minor still loads, and the only way
to test that is to name it here.
"""

from __future__ import annotations

import json
import subprocess
import sys
from pathlib import Path

BUILD = Path(__file__).resolve().parent
# The package root is this script's parent: `tools/` sits inside the bundle's
# own directory, so there is no sibling directory to name here.
PKG = BUILD.parent

RUNTIMES = [
    "0.2.0-rc.1",   # older than this plugin's floor: must be refused
    "0.2.0-rc.2",   # the version it was written against
    "0.2.0-rc.3",   # a later prerelease of the same minor: must be admitted
    "0.2.0",
    "0.2.1",
    "0.2.9",
    "0.3.0-rc.1",   # next minor: out of range on purpose
    "1.0.0",
]

PROBE = BUILD / "_compat-probe.mjs"


def main() -> int:
    manifest = json.loads((PKG / "package.json").read_text(encoding="utf-8"))
    engines = manifest.get("engines") or {}
    peers = manifest.get("peerDependencies") or {}
    dsh_peers = {k: v for k, v in peers.items() if k == "@deepseek-ai/dsh" or k.startswith("@deepseek-ai/dsh-")}

    failures: list[str] = []

    if not isinstance(engines.get("dsh"), str):
        failures.append("the manifest declares no engines.dsh, so every dsh peer range decides silently")

    for name, range_ in dsh_peers.items():
        text = str(range_).strip()
        if not any(ch in text for ch in "<>=^~*"):
            failures.append(
                f"the manifest pins {name} to an exact version ({text}), "
                "which rejects every later build of the same minor"
            )

    if failures:
        for item in failures:
            print(f"FAIL {item}")
        return 1

    # Evaluate the ranges with the very semver module the loader uses. It lives
    # inside the packaged asar, which only the Electron binary can read.
    PROBE.write_text(
        "import semver from \"file:///D:/Software/DeepseekHarness/resources/app.asar/dsh/node_modules/semver/index.js\";\n"
        f"const RUNTIMES = {json.dumps(RUNTIMES)};\n"
        f"const MANIFEST = {json.dumps(manifest)};\n"
        "const requirements = { ...(MANIFEST.engines?.dsh ? { 'engines.dsh': MANIFEST.engines.dsh } : {}), ...Object.fromEntries(Object.entries(MANIFEST.peerDependencies || {}).filter(([k]) => k === '@deepseek-ai/dsh' || k.startsWith('@deepseek-ai/dsh-'))) };\n"
        "const rows = [];\n"
        "for (const runtime of RUNTIMES) {\n"
        "  const unmet = {};\n"
        "  for (const [name, range] of Object.entries(requirements)) {\n"
        "    const ok = semver.satisfies(runtime, range, { includePrerelease: true });\n"
        "    if (!ok) unmet[name] = range;\n"
        "  }\n"
        "  rows.push({ runtime, admitted: Object.keys(unmet).length === 0, unmet });\n"
        "}\n"
        "console.log(JSON.stringify(rows));\n",
        encoding="utf-8",
    )

    try:
        done = subprocess.run(
            [
                r"D:\Software\DeepseekHarness\resources\runtime\bin\node.cmd",
                str(PROBE),
            ],
            capture_output=True,
            text=True,
            encoding="utf-8",
            env={**__import__("os").environ, "DSH_DESKTOP_NODE_EXECUTABLE": r"D:\Software\DeepseekHarness\DeepSeek Harness.exe"},
            timeout=120,
        )
    finally:
        PROBE.unlink(missing_ok=True)

    if done.returncode != 0:
        print(f"FAIL the range probe did not run: {done.stderr.strip()[:400]}")
        return 1

    rows = json.loads(done.stdout.strip().splitlines()[-1])
    expected = {
        "0.2.0-rc.1": False,
        "0.2.0-rc.2": True,
        "0.2.0-rc.3": True,
        "0.2.0": True,
        "0.2.1": True,
        "0.2.9": True,
        "0.3.0-rc.1": False,
        "1.0.0": False,
    }
    for row in rows:
        want = expected[row["runtime"]]
        mark = "ok  " if row["admitted"] == want else "FAIL"
        print(f"  {mark} dsh {row['runtime']:<12} admitted={row['admitted']!s:<5} unmet={row['unmet']}")
        if row["admitted"] != want:
            failures.append(f"dsh {row['runtime']} admitted={row['admitted']}, expected {want}")

    if failures:
        print(f"\n{len(failures)} FAILURE(S)")
        return 1
    print("\ncompatibility ranges admit every build of the same minor")
    return 0


if __name__ == "__main__":
    sys.exit(main())
