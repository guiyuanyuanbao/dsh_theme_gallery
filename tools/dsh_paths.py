"""Locate the DSH installation this checkout is being verified against.

Two scripts need to read files that belong to DSH rather than to this project:
`extract_roles.py` reads the shipped theme stylesheet to recover each token's
polarity, and `verify.py` resolves the peer dependencies a profile would
provide. Both used to hardcode one machine's install path, which made the
project unbuildable anywhere else.

The lookup is deliberately a search rather than a fixed path. `DSH_ROOT` wins
when set, because that is the only form that works for a non-standard install;
otherwise the usual locations are tried, and `dsh` on PATH is used as a last
resort. Every failure names what was looked for and how to point at it, because
the alternative — an `FileNotFoundError` from deep inside a token loop — tells
the reader nothing.
"""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

#: Relative to a DSH package root, the directory holding every `@deepseek-ai` package.
_PACKAGES = Path("node_modules") / "@deepseek-ai"


def _candidates() -> list[Path]:
    """Every DSH package root worth trying, most specific first."""
    found: list[Path] = []

    override = os.environ.get("DSH_ROOT", "").strip()
    if override:
        root = Path(override).expanduser()
        # Accept either the `@deepseek-ai/dsh` package itself or the directory
        # that contains it, since both are natural things to paste.
        found.append(root)
        found.append(root / "dsh")

    home = Path.home()
    # npm -g on Windows, then the usual POSIX prefixes.
    for prefix in (
        home / "AppData" / "Roaming" / "npm",
        Path("/usr/local/lib"),
        Path("/usr/lib"),
    ):
        found.append(prefix / "@deepseek-ai" / "dsh")
        found.append(prefix / "node_modules" / "@deepseek-ai" / "dsh")

    # A `dsh` executable on PATH can tell us where it lives.
    executable = shutil.which("dsh")
    if executable is not None:
        try:
            resolved = Path(executable).resolve()
        except OSError:
            resolved = Path(executable)
        found.append(resolved.parent / "node_modules" / "@deepseek-ai" / "dsh")
        found.append(resolved.parent.parent)

    return found


def find_dsh_packages() -> Path | None:
    """The `@deepseek-ai` directory inside a DSH installation, or None.

    Use this where a missing installation is an ordinary outcome — a CI runner
    has no DSH — rather than a mistake by the reader.
    """
    for candidate in _candidates():
        if (candidate / _PACKAGES).is_dir():
            return candidate / _PACKAGES
    return None


def dsh_packages() -> Path:
    """The `@deepseek-ai` directory inside a DSH installation.

    @returns the directory holding `dsh-client-ui-theme`, `schemastery`, and the
        other peers.
    @throws SystemExit with an actionable message when no installation is found.
    """
    found = find_dsh_packages()
    if found is not None:
        return found
    tried = "\n".join(f"  {candidate}" for candidate in _candidates())
    sys.exit(
        "could not find a DSH installation to verify against.\n"
        "Looked for node_modules/@deepseek-ai under:\n"
        f"{tried}\n"
        "Set DSH_ROOT to the directory holding the dsh package, e.g.\n"
        "  DSH_ROOT=/path/to/node_modules/@deepseek-ai/dsh python tools/verify.py"
    )


def dsh_theme_client() -> Path:
    """The shipped theme plugin's browser bundle, which defines every alias token."""
    path = dsh_packages() / "dsh-client-ui-theme" / "lib" / "client.js"
    if not path.is_file():
        sys.exit(f"expected the theme plugin at {path}, but it is not there")
    return path


if __name__ == "__main__":
    # Running the module directly is the documented way to check the lookup.
    print(f"packages: {dsh_packages()}")
    print(f"theme:    {dsh_theme_client()}")
