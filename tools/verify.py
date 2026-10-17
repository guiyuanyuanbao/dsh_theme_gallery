"""
Independent verification of the generated bundle.

`build_palettes.py` decides the palettes; this script re-derives the contrast
of the finished artifacts from the finished `client.js` and the finished JPEGs
rather than from anything the builder kept in memory. It parses the emitted
JavaScript, decodes the emitted image, and re-runs the compositing maths from
scratch — so a mistake in the builder's own bookkeeping cannot hide here.

Checks, in order:

  1. `client.js` is syntactically valid JavaScript and registers exactly one
     module whose id matches the composition row's package name.
  2. Its token tables carry exactly the alias tokens the live theme service
     publishes — no more, no fewer.
  3. Every token value is a legal CSS colour.
  4. Every wallpaper the tables name exists, decodes, and is a JPEG.
  5. Contrast, recomputed from the decoded pixels and the emitted tokens, still
     clears the floors the builder claimed.
  6. The host half parses and declares the route the client module requests.
"""
from __future__ import annotations

import json
import math
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

from dsh_paths import find_dsh_packages

BUILD = Path(__file__).resolve().parent
PKG = BUILD.parent

# The floors the builder targets, restated here so a change in one file cannot
# quietly move the bar in the other. These are the WCAG figures, not the
# builder's margin: verification asserts the requirement, not the cushion.
RULES = [
    ("--dsw-alias-label-primary", 4.5, ["frame", "sidebar", "card", "menu", "bubble", "code"]),
    ("--dsw-alias-label-primary-dimmed", 4.5, ["card", "menu"]),
    ("--dsw-alias-label-secondary", 3.5, ["card", "sidebar", "menu", "bubble"]),
    ("--dsw-alias-label-tertiary", 3.0, ["card", "sidebar"]),
]
STACKS = {
    "frame": ["--dsw-alias-bg-base"],
    "sidebar": ["--dsw-alias-bg-base", "--dsw-specific-sidebar-fill"],
    "card": ["--dsw-alias-bg-base", "--dsw-alias-bg-layer-2"],
    "menu": ["--dsw-alias-bg-base", "--dsw-specific-menu"],
    "code": ["--dsw-alias-bg-base", "--dsw-alias-markdown-code-block"],
    "bubble": ["--dsw-alias-bg-base", "--dsw-specific-bubble"],
}
SLICES = (0.05, 0.50, 0.95)

CSS_COLOUR = re.compile(
    r"^(?:#[0-9a-fA-F]{3}|#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}"
    r"|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)"
    r"|hsla?\([^)]*\))$"
)

failures: list[str] = []
notes: list[str] = []


def fail(message: str) -> None:
    failures.append(message)


# --------------------------------------------------------------------------
# 1. the client module parses and registers one module under the right id
# --------------------------------------------------------------------------


def check_syntax(client_js: Path, package_name: str) -> str:
    source = client_js.read_text(encoding="utf-8")
    # The file may open with a doc comment; what matters is that the first
    # statement is the loader registration and nothing runs before it.
    head = re.sub(r"^\s*(?:/\*.*?\*/\s*|//[^\n]*\n\s*)*", "", source, count=1, flags=re.S)
    if not head.startswith("window.__ModuleLoader__.load({"):
        fail(f"client.js does not open with the loader registration; starts {head[:60]!r}")
    ids = re.findall(r'\bid:\s*"([^"]+)"', source)
    if not ids or ids[0] != package_name:
        fail(f"client.js registers id {ids[0] if ids else None!r}, expected {package_name!r}")

    # Run it the way the browser will: a stub loader captures the registration,
    # then the factory is invoked with a stub `require`. A syntax error or a
    # factory that throws on materialization both surface here.
    harness = BUILD / "_syntax_check.mjs"
    harness.write_text(
        "const captured = [];\n"
        "globalThis.window = { __ModuleLoader__: { load: (r) => captured.push(r) } };\n"
        "await import(new URL(process.argv[2], 'file:///').href);\n"
        "if (captured.length !== 1) { console.error('registrations: ' + captured.length); process.exit(2); }\n"
        "const reg = captured[0];\n"
        "const React = { createElement: (...a) => ({ a }), useState: () => [undefined, () => {}], "
        "useEffect: () => {}, useMemo: (f) => f(), useSyncExternalStore: () => undefined };\n"
        "const plugin = reg.factory((name) => {\n"
        "  if (name === 'react') return React;\n"
        "  throw new Error('unexpected require: ' + name);\n"
        "});\n"
        "if (typeof plugin !== 'object' || plugin === null) { console.error('factory returned ' + typeof plugin); process.exit(3); }\n"
        "if (typeof plugin.apply !== 'function') { console.error('plugin has no apply'); process.exit(4); }\n"
        "if (!Array.isArray(plugin.inject)) { console.error('plugin has no inject array'); process.exit(5); }\n"
        "console.log(JSON.stringify({ id: reg.id, inject: plugin.inject }));\n",
        encoding="utf-8",
    )
    done = subprocess.run(
        ["node", str(harness), client_js.resolve().as_uri()],
        capture_output=True, text=True, encoding="utf-8", timeout=120,
    )
    if done.returncode != 0:
        fail(f"client.js did not load: rc={done.returncode} {done.stderr.strip()[:400]}")
        return source
    info = json.loads(done.stdout.strip().splitlines()[-1])
    notes.append(f"module id {info['id']!r}, inject {info['inject']}")
    if "theme" not in info["inject"] or "slots" not in info["inject"]:
        fail(f"plugin inject is {info['inject']}, expected to include theme and slots")
    return source


# --------------------------------------------------------------------------
# 2/3. the token tables
# --------------------------------------------------------------------------


def check_tables(source: str) -> dict:
    match = re.search(r"const GALLERY = (\{.*?\});\n", source, re.S)
    if match is None:
        fail("client.js carries no GALLERY table")
        return {}
    try:
        gallery = json.loads(match.group(1))
    except json.JSONDecodeError as error:
        fail(f"GALLERY is not valid JSON: {error}")
        return {}

    live = json.loads((BUILD / "tokens.json").read_text(encoding="utf-8"))["union"]
    expected = set(live)

    for slug, entry in gallery.items():
        for mode in ("light", "dark"):
            table = entry["tokens"].get(mode)
            if table is None:
                fail(f"{slug}/{mode}: no token table")
                continue
            got = set(table)
            if got != expected:
                fail(f"{slug}/{mode}: {len(got)} tokens, expected {len(expected)}; "
                     f"missing={sorted(expected - got)[:6]} extra={sorted(got - expected)[:6]}")
            bad = [n for n, v in table.items() if not CSS_COLOUR.match(v)]
            if bad:
                fail(f"{slug}/{mode}: non-colour values for {bad[:6]}")
        for key in ("title", "source", "wallpaper", "scrim", "tokens", "floor"):
            if key not in entry:
                fail(f"{slug}: entry has no {key!r}")
        for mode in ("light", "dark"):
            if mode not in entry.get("scrim", {}):
                fail(f"{slug}: scrim has no {mode!r}")
            floor = entry.get("floor", {}).get(mode)
            if floor is None:
                fail(f"{slug}: floor has no {mode!r}")
            elif not CSS_COLOUR.match(floor) or floor.startswith("rgba"):
                fail(f"{slug}/{mode}: floor {floor!r} is not an opaque CSS colour")
    notes.append(f"{len(gallery)} images x 2 palettes x {len(expected)} tokens = "
                 f"{len(gallery) * 2 * len(expected)} values checked")
    return gallery


# --------------------------------------------------------------------------
# 4/5. the artwork, and contrast recomputed from it
# --------------------------------------------------------------------------


def _lin(c: float) -> float:
    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4


def luminance(rgb) -> float:
    r, g, b = (c / 255 for c in rgb[:3])
    return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)


def contrast(fg, bg) -> float:
    hi, lo = sorted((luminance(fg), luminance(bg)), reverse=True)
    return (hi + 0.05) / (lo + 0.05)


def parse_colour(value: str) -> tuple[tuple[int, int, int], float]:
    if value.startswith("#"):
        hexits = value[1:]
        if len(hexits) == 3:
            hexits = "".join(c * 2 for c in hexits)
        return tuple(int(hexits[i:i + 2], 16) for i in (0, 2, 4)), 1.0
    parts = value[value.index("(") + 1: value.rindex(")")].split(",")
    rgb = tuple(int(float(p)) for p in parts[:3])
    alpha = float(parts[3]) if len(parts) > 3 else 1.0
    return rgb, alpha


def check_contrast(gallery: dict) -> None:
    for slug, entry in gallery.items():
        path = PKG / "assets" / entry["wallpaper"]
        if not path.exists():
            fail(f"{slug}: wallpaper {path.name} is missing")
            continue
        with Image.open(path) as im:
            if im.format != "JPEG":
                fail(f"{slug}: wallpaper is {im.format}, expected JPEG")
            im = im.convert("RGB").resize((640, round(im.height * 640 / im.width)), Image.LANCZOS)
            flat = np.asarray(im).astype(np.float32).reshape(-1, 3)
        luma = 0.2126 * flat[:, 0] + 0.7152 * flat[:, 1] + 0.0722 * flat[:, 2]
        order = np.argsort(luma)

        for mode in ("light", "dark"):
            table = entry["tokens"][mode]
            veil_rgb, veil_a = parse_colour(entry["scrim"][mode])
            worst = math.inf
            worst_at = ""
            for q in SLICES:
                idx = int(len(order) * q)
                window = flat[order[max(0, idx - 800): idx + 800]]
                pixel = window.mean(axis=0)
                veiled = np.array([veil_a * v + (1 - veil_a) * p for v, p in zip(veil_rgb, pixel)])
                for ink_token, floor, names in RULES:
                    ink, _ = parse_colour(table[ink_token])
                    for name in names:
                        out = veiled.copy()
                        for token in STACKS[name]:
                            rgb, a = parse_colour(table[token])
                            out = a * np.array(rgb, dtype=np.float64) + (1 - a) * out
                        c = contrast(ink, tuple(int(round(x)) for x in out))
                        if c < worst:
                            worst, worst_at = c, f"{ink_token} on {name}@p{int(q * 100)}"
                        if c < floor:
                            fail(f"{slug}/{mode}: {ink_token} on {name}@p{int(q * 100)} = {c:.2f} < {floor}")
            notes.append(f"{slug}/{mode}: veil {entry['scrim'][mode]}, worst contrast {worst:.2f} ({worst_at})")


# --------------------------------------------------------------------------
# 6. the host half
# --------------------------------------------------------------------------


def check_host() -> None:
    """
    The host half imports under the SAME rules the profile loader applies.

    A bundle installed into a profile is a *linked root*: its files live outside
    the profiles tree, so ordinary `node_modules` lookup from its directory finds
    nothing, and a bare import of a platform package would fail. The loader's
    rule for that case (`routeLinked` in `dsh-app-boot`) is to route the request
    to the installation's own copy when the importing package's manifest lists
    the name in `peerDependencies` — which is why `dsh-settings` declares
    `@deepseek-ai/schemastery` as a peer.

    So this check does two things at once: it proves the host half is loadable,
    and it proves the manifest declares what the host half imports. A missing
    peer declaration passes every static check and fails only at activation,
    where the cost is a dead plugin row, so it is asserted here.

    `node --input-type=module` runs with the real resolver, and a small loader
    hook adds exactly the peer redirects the manifest asks for — no more, so a
    bare import that is NOT declared still fails, as it would in the profile.

    The peer redirects need a DSH installation to point at, which a bare clone
    on a CI runner does not have. That case SKIPS this check with a note rather
    than failing: the check's subject is this package's manifest, and reporting
    "no DSH here" as a defect of the package would make the suite unrunnable
    anywhere but a developer's machine.
    """
    host = PKG / "index.js"
    manifest = json.loads((PKG / "package.json").read_text(encoding="utf-8"))
    peers = manifest.get("peerDependencies", {})

    # Resolve each declared peer from the installation anchor, which is the
    # first of the loader's two anchors. `dsh_paths` finds the installation
    # rather than assuming one machine's layout; a bare clone has none, and then
    # this check has nothing to resolve against and is skipped.
    anchor = find_dsh_packages()
    if anchor is None:
        notes.append("host import check SKIPPED: no DSH installation found (set DSH_ROOT to enable it)")
        return
    redirects = {}
    for name in peers:
        directory = anchor / name.split("/")[-1]
        entry = None
        try:
            peer = json.loads((directory / "package.json").read_text(encoding="utf-8"))
            entry = (peer.get("exports", {}).get(".") or {}).get("import") or peer.get("module") or peer.get("main")
        except (OSError, ValueError):
            entry = None
        if entry is None:
            fail(f"declared peer {name} is not resolvable from the installation anchor")
            return
        redirects[name] = (directory / entry).as_uri()

    hook = BUILD / "_peer-resolver.mjs"
    probe = BUILD / "_host-probe.mjs"
    hook.write_text(
        "// Generated by verify.py; emulates the profile loader's linked-root peer rule.\n"
        f"const REDIRECTS = {json.dumps(redirects)};\n"
        "export async function resolve(specifier, context, next) {\n"
        "  const url = REDIRECTS[specifier];\n"
        "  if (url !== undefined) return { url, shortCircuit: true };\n"
        "  return next(specifier, context);\n"
        "}\n",
        encoding="utf-8",
    )
    probe.write_text(
        "// Generated by verify.py.\n"
        'import { register } from "node:module";\n'
        'register("./_peer-resolver.mjs", import.meta.url);\n'
        f"const m = await import({json.dumps(host.as_uri())});\n"
        "if (typeof m.apply !== 'function') { console.error('no apply'); process.exit(2); }\n"
        "if (!Array.isArray(m.inject) || !m.inject.includes('webServer')) { console.error('no webServer inject'); process.exit(3); }\n"
        "if (m.Config === undefined) { console.error('no Config'); process.exit(4); }\n"
        "console.log(JSON.stringify({ name: m.name, inject: m.inject }));\n",
        encoding="utf-8",
    )
    try:
        done = subprocess.run(
            ["node", str(probe)], capture_output=True, text=True, encoding="utf-8", timeout=120,
            cwd=str(BUILD),
        )
    finally:
        hook.unlink(missing_ok=True)
        probe.unlink(missing_ok=True)
    if done.returncode != 0:
        fail(f"host half did not import: rc={done.returncode} {done.stderr.strip()[:400]}")
        return
    info = json.loads(done.stdout.strip().splitlines()[-1])
    notes.append(f"host name {info['name']!r}, inject {info['inject']}, peers {sorted(peers)}")

    host_source = host.read_text(encoding="utf-8")
    client = (PKG / "client.js").read_text(encoding="utf-8")
    if "/theme-gallery/" not in client:
        fail("client.js does not reference the /theme-gallery/ route")
    if '"prefix"' not in host_source:
        fail("host half does not register a prefix route")
    row = (PKG / "cordis.patch.yml").read_text(encoding="utf-8")
    if "- insert:" not in row:
        fail("cordis.patch.yml does not insert the row")
    if '"dsh-theme-gallery"' not in row:
        fail("cordis.patch.yml does not name the package")

    # ---- the durable preference ------------------------------------------
    # The whole point of the Config is that Settings can write it, which needs
    # volatile fields: `settings.describe()` projects only those into a form.
    # Comments are stripped first — this file's own doc block names
    # `.volatile()`, and counting that prose as a field would let a genuinely
    # non-volatile field pass.
    code = strip_comments(host_source)
    # The field list is READ FROM THE SOURCE, not written here. A hardcoded
    # tuple silently stops covering a field the moment the schema grows, which
    # is exactly what happened when the per-page opacity fields were added: the
    # suite kept passing while asserting nothing about them.
    declared_fields = re.findall(r"^\s*(\w+):\s*(.+?),?$", code, re.M)
    # Only the entries inside the Config object are fields; the module's other
    # top-level bindings are not. The Config block is bounded by its own
    # declaration and the closing brace that ends it.
    config_block = re.search(r"export const Config = z\.object\(\{(.*?)\n\}\);", code, re.S)
    if config_block is None:
        fail("host half does not export a Config object")
        config_fields = []
    else:
        config_fields = re.findall(r"^\s*(\w+):\s*(.+?),?$", config_block.group(1), re.M)
    for field in ("wallpaper", "dim", "blur"):
        if field not in [name for name, _ in config_fields]:
            fail(f"host Config no longer declares the {field!r} field, which the rest of the plugin reads")
    # ONE opacity field, holding a per-theme, per-surface map.
    #
    # It is deliberately not three scalar fields. Opacity belongs to a theme:
    # a value tuned for 碎镜 must not follow the user onto 舞台, because the
    # artwork behind the settings panel — and therefore how much opacity that
    # panel needs — differs per image. The shape is checked below, since a
    # `z.dict(z.number())` here would typecheck in the source and still reject
    # every write the client makes.
    opacity_fields = [name for name, _ in config_fields if name.startswith("opacity")]
    if opacity_fields != ["opacity"]:
        fail(f"host Config declares opacity field(s) {opacity_fields}, expected exactly one map named 'opacity'")
    for field, declaration in config_fields:
        # The declaration runs to the end of its line, not to the first comma:
        # a `z.union([...])` argument list contains commas, and stopping at one
        # would read a truncated declaration and misreport the field.
        if ".volatile()" not in declaration:
            fail(f"host Config field {field!r} is not volatile, so Settings cannot edit it")
    # Every Config field must be consumed by the client, or the schema is
    # advertising a control that does not exist.
    for field, _ in config_fields:
        if field not in client:
            fail(f"client.js never references the Config field {field!r}")
    # The map must be nested: theme -> surface -> number. A single-level
    # `z.dict(z.number())` typechecks as a schema and then rejects every
    # per-surface write with "expected number but got [object Object]" — which is
    # exactly what happened, and why this is asserted rather than assumed.
    if "z.dict(z.dict(" not in host_source:
        fail("the opacity field is not a nested dict, so a per-surface write would be rejected")
    if "min(0).max(100)" not in host_source:
        fail("the opacity field declares no 0..100 bound, so an out-of-range write would be accepted")

    # ---- the per-surface opacity tables ----------------------------------
    # One surface per adjustable page, each with a variable, a selector, and the
    # token whose colour it re-states. The rule is generated from these, so a
    # surface missing from any one of them is a slider that silently does
    # nothing.
    client_code = strip_comments(client)
    for suffix in ("panel", "sidebar", "chat", "input"):
        if f"--dsh-gallery-opacity-{suffix}" not in client_code:
            fail(f"client.js declares no CSS variable for the {suffix} surface")
    for surface in ("opacityPanel", "opacitySidebar", "opacityChat", "opacityInput"):
        for table in ("OPACITY_VARIABLES", "OPACITY_SELECTORS", "OPACITY_TOKENS"):
            # The block is delimited by its own closing brace at the table's
            # indentation, NOT by the first `}` after the opening one: the
            # selector values are template literals interpolating
            # `${ART_ATTRIBUTE}`, so a `[^}]*` scan stops inside the first entry
            # and reports the later surfaces as missing.
            block = re.search(rf"const {table} = \{{(.*?)\n\t\t\}};", client_code, re.S)
            if block is None:
                fail(f"client.js has no {table} table")
            elif f"{surface}:" not in block.group(1):
                fail(f"the {surface} surface is missing from {table}, so its rule cannot be generated")
    if "color-mix(" not in client_code:
        fail("client.js never uses color-mix, so the opacity control cannot set a token's alpha")
    # The colour must be forced opaque before mixing. Mixing the token as-is
    # scales its alpha DOWN, so 100% could never exceed the solved alpha and the
    # one adjustment this control exists for would be unreachable.
    if "rgb(from" not in client_code:
        fail("the opacity rules do not force the token opaque, so they could only reduce alpha "
             "and never reach the values a user actually needs")
    # Per-theme recall: the value must be looked up by theme, and an absent
    # theme must fall back to the palette's own solved alpha.
    for helper in ("opacityFor", "surfacePercent"):
        if f"function {helper}(" not in client_code:
            fail(f"client.js has no {helper} helper, so per-theme recall or its fallback is missing")
    if "delete next[theme]" not in client_code:
        fail("client.js never removes a theme's entry, so 'restore solved' cannot be expressed")

    # The lookup and its fallback, evaluated as shipped code with a real palette
    # rather than re-implemented here. This is the subtlest rule in the feature:
    # a stored value must win, an absent one must fall back to the palette's own
    # solved alpha, and 0 must NOT be mistaken for "absent" — collapsing those
    # would make the fully-transparent end of the slider impossible to store.
    helpers = {}
    for name in ("opacityFor", "surfacePercent"):
        found = re.search(rf"function {name}\(.*?\n\t\t\t\}}", client_code, re.S)
        if found is None:
            fail(f"could not extract {name} from client.js")
            helpers[name] = ""
        else:
            helpers[name] = found.group(0)
    palette = json.loads((BUILD / "palette.json").read_text(encoding="utf-8"))
    shatter = palette["shatter"]
    probe = (
        "const OPACITY_RANGE = { min: 0, max: 100, step: 1, fallback: 100 };\n"
        "const OPACITY_TOKENS = " + json.dumps({
            "opacityPanel": "--dsw-alias-bg-layer-2",
            "opacitySidebar": "--dsw-specific-sidebar-fill",
            "opacityChat": "--dsw-alias-bg-base",
            "opacityInput": "--dsw-specific-input-major",
        }) + ";\n"
        "function parseAlpha(value) { if (!value.startsWith('rgba(')) return undefined;"
        " return Number(value.slice(value.lastIndexOf(',') + 1, -1)); }\n"
        "function clamp(value, range) { const n = typeof value === 'number' ? value : Number(value);"
        " if (!Number.isFinite(n)) return range.fallback;"
        " return Math.min(range.max, Math.max(range.min, n)); }\n"
        f"const ENTRY = {json.dumps({'tokens': shatter['tokens']})};\n"
        "let state = { opacity: {}, scheme: 'dark', wallpaper: 'shatter' };\n"
        + helpers["opacityFor"] + "\n" + helpers["surfacePercent"] + "\n"
        "const out = {};\n"
        # `undefined` is a real answer here and JSON.stringify DROPS such keys,
        # so each one is coerced to null explicitly rather than silently
        # vanishing from the result and reading as "not checked".
        "const orNull = (v) => (v === undefined ? null : v);\n"
        "out.absent = orNull(surfacePercent(ENTRY, 'opacityPanel'));\n"
        "out.stored = (state.opacity = { shatter: { opacityPanel: 80 } }, orNull(opacityFor('shatter', 'opacityPanel')));\n"
        "out.zero = (state.opacity = { shatter: { opacityPanel: 0 } }, orNull(opacityFor('shatter', 'opacityPanel')));\n"
        "out.otherTheme = (state.opacity = { stage: { opacityPanel: 30 } }, orNull(opacityFor('shatter', 'opacityPanel')));\n"
        "out.resolved = (state.opacity = { stage: { opacityPanel: 30 } },"
        " orNull(opacityFor('shatter', 'opacityPanel') ?? surfacePercent(ENTRY, 'opacityPanel')));\n"
        "console.log(JSON.stringify(out));\n"
    )
    probe_run = subprocess.run(
        ["node", "--input-type=module", "-e", probe],
        capture_output=True, text=True, encoding="utf-8", timeout=60,
    )
    if probe_run.returncode != 0:
        fail(f"the opacity helpers did not evaluate: {probe_run.stderr.strip()[:300]}")
    else:
        got = json.loads(probe_run.stdout.strip().splitlines()[-1])
        dark = shatter["tokens"]["dark"]
        want_absent = round(parse_colour(dark["--dsw-alias-bg-layer-2"])[1] * 100)
        if got["absent"] != want_absent:
            fail(f"the solved-alpha fallback gives {got['absent']}, expected {want_absent} for shatter/dark")
        if got["stored"] != 80:
            fail(f"a stored value resolved to {got['stored']}, expected 80")
        if got["zero"] != 0:
            fail(f"a stored 0 resolved to {got['zero']} — 0 must be a real value, not 'absent'")
        if got["otherTheme"] is not None:
            fail(f"another theme's entry leaked into this theme's lookup: {got['otherTheme']}")
        if got["resolved"] != want_absent:
            fail(f"an unconfigured theme resolved to {got['resolved']}, expected its solved {want_absent}")
        notes.append(f"opacity lookup: stored wins, 0 is real, absent falls back to the solved "
                     f"{want_absent}% (per theme, per surface)")
    # Rules are generated at runtime from tables rather than written out, so the
    # source text contains no literal rule to match. What matters is what the
    # generator PRODUCES, which is checked by evaluating it rather than by
    # grepping for its output.
    gen = re.search(r"function opacityRules\(\) \{(.*?)\n\t\t\}", client_code, re.S)
    fill = re.search(r"function opacityFill\(key\) \{(.*?)\n\t\t\}", client_code, re.S)
    if gen is None:
        fail("client.js has no opacityRules generator, so no page opacity can be applied")
    elif fill is None:
        fail("client.js has no opacityFill helper, so a surface and its scrim could paint "
             "two different alphas")
    else:
        # The generator is evaluated with the client's OWN tables, lifted from
        # the bundle, not with a copy written here. A copy would test this
        # verifier rather than the shipped code.
        tables = {}
        for name in ("OPACITY_VARIABLES", "OPACITY_SELECTORS", "OPACITY_TOKENS", "OPACITY_SCRIMS"):
            found = re.search(rf"const {name} = \{{(.*?)\n\t\t\}};", client_code, re.S)
            if found is None:
                fail(f"client.js has no {name} table, so the opacity rules cannot be generated")
                tables[name] = "{}"
            else:
                tables[name] = "{" + found.group(1) + "}"
        # The gate attribute is read from the source too, because the selectors
        # interpolate it.
        gate_name = re.search(r'const ART_ATTRIBUTE = "([^"]+)"', client_code)
        art_attribute = gate_name.group(1) if gate_name is not None else "data-dsh-gallery"
        script = (
            # The selectors interpolate the gate attribute, so it is lifted from
            # the same source rather than assumed here.
            f"const ART_ATTRIBUTE = {json.dumps(art_attribute)};\n"
            f"const OPACITY_VARIABLES = {tables['OPACITY_VARIABLES']};\n"
            f"const OPACITY_SELECTORS = {tables['OPACITY_SELECTORS']};\n"
            f"const OPACITY_TOKENS = {tables['OPACITY_TOKENS']};\n"
            f"const OPACITY_SCRIMS = {tables['OPACITY_SCRIMS']};\n"
            f"function opacityFill(key) {{{fill.group(1)}}}\n"
            f"function opacityRules() {{{gen.group(1)}}}\n"
            "console.log(JSON.stringify({ css: opacityRules(), selectors: OPACITY_SELECTORS,\n"
            "  variables: OPACITY_VARIABLES, tokens: OPACITY_TOKENS, scrims: OPACITY_SCRIMS }));\n"
        )
        build = subprocess.run(
            ["node", "--input-type=module", "-e", script],
            capture_output=True, text=True, encoding="utf-8", timeout=60,
        )
        if build.returncode != 0:
            fail(f"the opacityRules generator did not evaluate: {build.stderr.strip()[:300]}")
        else:
            produced = json.loads(build.stdout.strip().splitlines()[-1])
            css = produced["css"]
            surface_count = len(produced["variables"])
            scrim_count = len(produced["scrims"])
            # A scrim that IS its surface is folded into a single rule carrying
            # both declarations, so it does not add a second rule for the same
            # element. Counting it twice here would demand a duplicate rule.
            folded = sum(
                1 for key, scrim in produced["scrims"].items()
                if produced["selectors"].get(key) == scrim
            )
            total = surface_count + scrim_count - folded
            gated = re.findall(r"(html\[data-dsh-gallery\][^{]*)\{", css)
            if len(gated) != total:
                fail(f"opacityRules produced {len(gated)} gated rule(s), "
                     f"expected {total} — one per surface plus one per scrim, with a "
                     "self-covering scrim folded into its surface's rule")
            for token in ("--dsw-alias-bg-layer-2", "--dsw-specific-sidebar-fill",
                          "--dsw-alias-bg-base", "--dsw-specific-input-major"):
                if f"var({token})" not in css:
                    fail(f"no produced rule re-states {token}, so that surface would ignore its slider")
            if css.count("color-mix(in srgb,") != total:
                fail("the produced rules do not all set alpha through color-mix")            # Every produced rule must force its token opaque. Without it the
            # rule scales alpha down and the requested value is unreachable
            # whenever it exceeds what the palette solved.
            if css.count("rgb(from") != total:
                fail(f"only {css.count('rgb(from')} of {total} produced rules force the token opaque, "
                     "so the rest can only reduce alpha")
            if "/ 1)" not in css:
                fail("the produced rules do not pin alpha to 1 before mixing, so the token's own "
                     "alpha would still leak into the result")

            # No element may be painted by two rules. A scrim that IS its surface
            # is folded into one rule carrying both declarations; if the generator
            # regresses to emitting both, the surface rule and the scrim rule would
            # target the same element and the outcome would depend on their order —
            # and no per-rule assertion can see that, because each rule on its own
            # is well formed.
            selectors_seen = re.findall(r"(html\[data-dsh-gallery\][^{]*)\{", css)
            duplicates = sorted({s.strip() for s in selectors_seen if selectors_seen.count(s) > 1})
            if duplicates:
                fail(f"opacityRules emits {len(duplicates)} selector(s) twice ({duplicates[0].strip()}), "
                     "so one element is painted by two rules and the result depends on their order")

            # ---- each scrim: anchored under its surface, and flat ----
            # Three separate properties, and each has been a real defect:
            #   * the anchor gives the rule enough specificity to beat the
            #     client's own `.Root[data-phase] .Seat` rule. Without it the
            #     declaration is dropped by the cascade and the "fix" is a no-op
            #     that still passes a grep for the selector.
            #   * `background-image: none` removes the `transparent -> token`
            #     ramp, which is the hole itself. A `background-color` alone
            #     leaves the ramp in place, because the client paints it through
            #     the `background` shorthand, which resets the colour.
            #   * the fill has to be the surface's OWN declaration, so a scrim
            #     cannot paint a different alpha from the surface above it.
            for key, scrim in produced["scrims"].items():
                if key not in produced["variables"]:
                    fail(f"a scrim is declared for {key}, which is not a surface")
                    continue
                # The scrim element is usually a descendant of its surface, and
                # then the two selectors concatenate — which is also what gives
                # the rule the specificity to beat the client's own. When the
                # scrim IS the surface (the prompt box paints the very gradient
                # it has to drop), the generator emits the selector once with
                # both declarations instead of repeating the element.
                surface_selector = produced["selectors"][key]
                expected_selector = (
                    surface_selector if surface_selector == scrim
                    else f"{surface_selector} {scrim}"
                )
                rule = re.search(rf"{re.escape(expected_selector)} \{{([^}}]*)\}}", css)
                if rule is None:
                    fail(f"the {key} scrim rule is not anchored under its own surface selector "
                         f"({expected_selector}), so the shipped client's own rule outranks it "
                         "and the scrim keeps its transparent start")
                    continue
                # Anchoring is not only a naming choice: the shipped client paints
                # the composer seat through `.Dc7zOa_root[data-phase=active]
                # .Dc7zOa_composerSeat`, which is specificity (0,3,0) — two classes
                # and one attribute. The plugin's rule must beat that on the
                # attribute/class level OR, failing which, carry a type selector
                # that only decides once those levels tie. Counting raw
                # class-or-attribute tokens is what matters; the leading `html`
                # then breaks the tie.
                levels = len(re.findall(r"\[[^\]]*\]|\.[A-Za-z0-9_-]+", expected_selector))
                if levels < 3:
                    fail(f"the {key} scrim selector has {levels} class-or-attribute level(s); "
                         "the shipped client's own rule uses three, so this one would lose "
                         "the cascade")
                body = rule.group(1)
                if "background-image: none;" not in body:
                    fail(f"the {key} scrim rule does not drop the client's gradient, so the "
                         "transparent start stays and content keeps showing through")
                if produced["tokens"][key] not in body:
                    fail(f"the {key} scrim rule does not restate its surface's token")
                # The scrim must emit the surface's OWN declaration, character for
                # character, so the two cannot disagree about the alpha.
                expected_fill = (
                    f"color-mix(in srgb, rgb(from var({produced['tokens'][key]}) r g b / 1)"
                    f" var({produced['variables'][key]}, 100%), transparent)"
                )
                if expected_fill not in body:
                    fail(f"the {key} scrim rule does not paint the surface's own colour at the "
                         "surface's own alpha, so the two can disagree")

            # ---- the Host's inventory and the client's tables must agree ----
            # index.js records the surfaces and their scrims; the client owns the
            # rules. They are separate bundles that cannot import each other, so
            # this comparison is the only thing keeping them in step. A surface
            # added on one side alone is a slider that silently does nothing.
            inventory = re.search(r"export const OPACITY_SURFACES = (\[.*?\n\]);", host_source, re.S)
            if inventory is None:
                fail("index.js declares no OPACITY_SURFACES table, so the surface inventory "
                     "is not recorded anywhere")
            else:
                read_back = subprocess.run(
                    ["node", "--input-type=module", "-e",
                     f"console.log(JSON.stringify({inventory.group(1)}));"],
                    capture_output=True, text=True, encoding="utf-8", timeout=60,
                )
                if read_back.returncode != 0:
                    fail(f"index.js's OPACITY_SURFACES did not evaluate: {read_back.stderr.strip()[:200]}")
                else:
                    declared = json.loads(read_back.stdout.strip().splitlines()[-1])
                    declared_keys = [entry["key"] for entry in declared]
                    if sorted(declared_keys) != sorted(produced["variables"]):
                        fail(f"the Host declares surfaces {declared_keys} but the client paints "
                             f"{sorted(produced['variables'])}, so at least one has no effect")
                    declared_scrims = {e["key"]: e.get("scrim") for e in declared if e.get("scrim")}
                    if declared_scrims != produced["scrims"]:
                        fail(f"the Host records scrims {declared_scrims} but the client paints "
                             f"{produced['scrims']}")
                    for entry in declared:
                        key = entry["key"]
                        if produced["variables"].get(key) != entry["variable"]:
                            fail(f"{key}: the Host names the variable {entry['variable']} but the "
                                 f"client writes {produced['variables'].get(key)}")
                        if produced["selectors"].get(key) != entry["selector"]:
                            fail(f"{key}: the Host names the selector {entry['selector']} but the "
                                 f"client paints {produced['selectors'].get(key)}")
                    notes.append(
                        f"per-page opacity: {surface_count} surface rule(s) and {scrim_count} scrim "
                        f"rule(s), each setting an absolute alpha, and the Host inventory matches "
                        "the client's tables"
                    )
    # The client must clear the variables when no wallpaper is selected.
    if "removeProperty(variable)" not in client_code:
        fail("client.js never removes the opacity variables, so they survive switching the wallpaper off")
    # A backtick anywhere in the stylesheet body would terminate the template
    # literal that holds it. The build splices real CSS into a JS template, so
    # this is the one class of typo that produces a broken bundle rather than a
    # wrong one.
    stylesheet_body = re.search(r"function stylesheet\(\) \{\s*return `(.*?)`;", client_code, re.S)
    if stylesheet_body is not None and "`" in stylesheet_body.group(1):
        fail("a backtick survives inside the stylesheet template literal, which breaks the bundle")
    # The client must read and write the same namespace the Host row owns.
    entry = re.search(r'const ENTRY_ID = "([^"]+)"', client)
    if entry is None:
        fail("client.js has no ENTRY_ID")
    elif entry.group(1) != manifest["name"].replace("dsh-", "", 1):
        fail(f"client ENTRY_ID {entry.group(1)!r} does not match the patch row id")
    if "configForms" not in client:
        fail("client.js never reaches the config form, so nothing can be persisted")
    # `configForms` must be optional: declaring it in `inject` would make the
    # wallpaper inactive in a composition without Settings.
    declared = re.search(r"inject:\s*\[([^\]]*)\]", client)
    if declared and "configForms" in declared.group(1):
        fail("client.js declares configForms in inject, which would disable the wallpaper without Settings")
    if 'ctx.inject(["configForms"]' not in client:
        fail("client.js does not take configForms through ctx.inject")
    # The settings surface itself.
    if "settings.section" not in client:
        fail("client.js registers no settings.section page")
    # This plugin renders its own page, so the auto-generated one must be off.
    if "configure({ auto: false }" not in host_source.replace("'", '"'):
        fail("host half does not disable the auto-generated settings page for its own Config")

    # ---- the pre-paint gate ----------------------------------------------
    # The canvas rules are gated on an attribute, and the gate has to be set by
    # a HEAD script: a body script runs after the head stylesheet has been
    # matched, so the first paint can land in between and the whole injection
    # buys nothing. This is the difference between the feature working and the
    # feature looking like it works.
    gate = re.search(r"document\.documentElement\.setAttribute\(\s*['\"]data-dsh-gallery['\"]", host_source)
    if gate is None:
        fail("the boot script never sets the data-dsh-gallery gate, so the canvas rules never match")
    else:
        placement = re.search(r'kind:\s*"script",\s*placement:\s*"(\w+)"', host_source)
        if placement is None:
            fail("the boot injection has no script row")
        elif placement.group(1) != "head":
            fail(f"the boot gate script is placed in '{placement.group(1)}', but it must run in 'head' "
                 "to precede the first paint")
    # The scheme rules must be orderable: the bare dark rule, then the media
    # query, then the attribute overrides. Dropping the attribute rules leaves
    # an explicit light preference painted with the dark scrim whenever the OS
    # disagrees with it.
    for selector in ('[data-ds-theme-source="light"]', '[data-ds-theme-source="dark"]',
                     "prefers-color-scheme: light"):
        if selector not in host_source:
            fail(f"the boot style has no rule for {selector}, so that scheme resolves to the wrong scrim")
    notes.append(f"durable Config: {len(config_fields)} volatile fields "
                 f"(one per-theme opacity map), own settings page, "
                 "optional configForms, head-ordered gate")

    # ---- the custom-theme library ----------------------------------------
    # The Host must ship the store, the API, and the wiring that lets a custom
    # id resolve at index-render time. Each of these is a separate module or a
    # separate call, so a partial implementation would still import cleanly and
    # fail only when a user tried to add a wallpaper.
    for module in ("store.js", "api.js"):
        if not (PKG / module).exists():
            fail(f"{module} is missing from the bundle")
    store_source = (PKG / "store.js").read_text(encoding="utf-8")
    api_source = (PKG / "api.js").read_text(encoding="utf-8")

    # The index write must be atomic, because the boot script reads it on every
    # index render: a truncated file would make the wallpaper silently vanish.
    if "rename(" not in store_source or "tmp" not in store_source:
        fail("store.js does not write its index through a temporary file and a rename")
    # The store lives under the Harness home, not beside the package and not in
    # the process's working directory. The check is on the CALL, not on the
    # import: `dshHomePath` appears in the import line whatever the constructor
    # does, so matching the name alone would pass a store rooted anywhere.
    if not re.search(r"dshHomePath\s*\(", store_source):
        fail("store.js imports the home resolver but never calls it, so the library is not under the Harness home")
    # Writers must be serialised, or two concurrent adds lose one theme.
    if "this.tail" not in store_source:
        fail("store.js does not serialise its writers")
    # The synchronous boot path needs the mirror; without it the pre-paint
    # script cannot see a custom theme and paints the plain canvas.
    if "cached(" not in store_source:
        fail("store.js has no synchronous cache for the boot injection path")
    if "store.cached(" not in host_source:
        fail("the host boot injection does not resolve custom themes through the store cache")
    # A palette arrives from untyped client JavaScript and is applied straight to
    # the document, so the values must be checked as CSS colours. The check
    # looks for the GUARD, not for the string `COLOUR`: a regex that is defined
    # but never applied still contains its own name, and that is exactly the
    # shape of this defect — so what is asserted is that the value is tested
    # inside the loop that walks the token table.
    if "const COLOUR" not in api_source:
        fail("api.js defines no CSS-colour pattern")
    token_loop = re.search(r"for \(const \[name, colour\] of Object\.entries\(tokens\)\)\s*\{(.*?)\n\t\t\}", api_source, re.S)
    if token_loop is None:
        fail("api.js has no loop validating the posted token table")
    elif "COLOUR.test(colour)" not in token_loop.group(1):
        fail("api.js does not test each token VALUE as a CSS colour, so a value could break out of the declaration")
    if "is not a theme token" not in api_source:
        fail("api.js does not validate token names")
    # A URL fetch is an outbound request to a user-supplied address.
    for guard in ("http:", "https:", "MAX_IMAGE_BYTES", "FETCH_TIMEOUT_MS"):
        if guard not in store_source:
            fail(f"store.js does not guard the URL fetch with {guard}")
    if "reader.cancel" not in store_source:
        fail("store.js does not cancel an oversized stream, so a lying server could exhaust memory")
    # The body ceiling must be derived from the image ceiling, not chosen as a
    # round number. The body is a base64 data URL, so it is 4/3 of the image
    # plus the palette; a round-number limit rejects legitimate 2560px uploads
    # with an error that names the wrong limit.
    if "MAX_BODY_BYTES" not in api_source:
        fail("api.js defines no request-body ceiling")
    elif not re.search(r"MAX_BODY_BYTES\s*=\s*[^;]*MAX_IMAGE_BYTES", api_source):
        fail("api.js does not derive its body ceiling from the image ceiling, so a legitimate upload can cross it")
    notes.append("custom library: store, api, atomic index, synchronous boot cache, URL guards")

    # ---- the solver is inlined, not copied -------------------------------
    # `client.js` cannot import, so the solver is spliced into it at build time.
    # If the two ever drift, a user's theme is built by different rules than the
    # ones every contrast check was written against — and the checks would still
    # pass, because they only look at the three shipped palettes.
    solver_source = (BUILD / "solver.js").read_text(encoding="utf-8")
    body = re.sub(r"\A\s*/\*\*.*?\*/\s*", "", solver_source, count=1, flags=re.S)
    body = re.sub(r"\nexport\s*\{[^}]*\};\s*\Z", "\n", body, flags=re.S)
    # Whitespace-insensitive: the splice is textual, and only a real difference
    # in code should fail this.
    normalise = lambda text: re.sub(r"\s+", " ", text).strip()
    if normalise(body) not in normalise(client):
        fail("client.js does not contain the current solver.js — rebuild, or the two have drifted")
    if "export " in body:
        fail("solver.js still exports something after stripping, which a plain script cannot have")
    notes.append("the inlined solver matches solver.js exactly")


def strip_comments(source: str) -> str:
    """
    Remove block and line comments from JavaScript source.

    Several checks below look for the ABSENCE of a call — `theme.register`,
    a literal colour, a hard-coded namespace — and this file's own prose
    explains the history that produced those absences. Without this, a check
    fails on the documentation of the defect it exists to prevent.

    String literals are preserved: the checks that use this are all about code
    structure, and a doc comment is the only place these names appear in prose.
    """
    without_block = re.sub(r"/\*.*?\*/", " ", source, flags=re.S)
    return re.sub(r"(?m)^\s*//.*$", " ", without_block)


def check_flatness(source: str, gallery: dict) -> None:
    """
    Every value handed to `theme.overrideTokens` must be a COLOUR STRING.

    `ThemeTokenOverrides` is `Record<string, { light: string, dark: string }>`:
    each token carries one value per mode and the service picks the half that
    matches the resolved scheme. The flat `Record<string, string>` shape belongs
    to `theme.register`, which takes one `colorScheme` for the whole table.

    The two are easy to confuse and each fails silently in the other's place.
    Handing the pair shape to `register` installs tokens literally named
    "light" and "dark" and leaves every real token on the base palette; handing
    a flat table to `overrideTokens` throws a teaching error at runtime. So both
    halves are asserted here rather than left to inspection.

    The generated tables are stored FLAT — one table per mode, which is the
    natural shape to solve and to compare against `tokens.json`. The client
    pairs them at the `overrideTokens` boundary (`pairedTokens`), so what is
    checked here is the stored shape plus the pairing function's contract.
    """
    for slug, entry in gallery.items():
        for mode, table in entry["tokens"].items():
            for name, value in table.items():
                if not isinstance(value, str):
                    fail(f"{slug}/{mode}: token {name} is {type(value).__name__}, not a string")
                    return
    # The stored tables must reach `overrideTokens` as pairs, not as-is.
    if "overrideTokens" not in source:
        fail("client.js never calls theme.overrideTokens, so the wallpaper palette is never applied")
        return
    if "function pairedTokens" not in source:
        fail("client.js has no pairedTokens(), so the flat tables cannot become override pairs")
        return
    # The pairing must produce both halves from the two stored tables, and must
    # not silently drop a token that only one mode defines.
    if "entry.tokens.light" not in source or "entry.tokens.dark" not in source:
        fail("pairedTokens() does not read both stored mode tables")
        return
    # A leftover `register` call would fight the Appearance row for ownership of
    # the palette, which is the defect overrideTokens exists to remove. Comments
    # are stripped first: this file's own prose explains that history, and
    # matching it would fail the check on its documentation.
    if re.search(r"\btheme\.register\s*\(", strip_comments(source)):
        fail("client.js still calls theme.register, which would replace the user's light/dark choice")
        return
    notes.append("all stored token tables are flat colour maps; the client pairs them for overrideTokens")


def check_canvas_scope(source: str) -> None:
    """
    The wallpaper rule targets `<html>`, which cannot see the palette.

    The presenter writes `--dsw-alias-*` on `<body>`. A custom property defined
    on a descendant does not reach an ancestor, so a `var(--dsw-alias-…)` inside
    a rule whose subject is `html` resolves to nothing and the declaration is
    dropped — silently, and only on the element carrying the artwork.

    The check is deliberately scoped to the `html[...]` rule. The switcher's own
    classes live in the same stylesheet and DO sit inside `<body>`, where every
    palette token resolves normally; flagging those would be a false positive
    that pushes the plugin away from the theme tokens it is supposed to use.

    The plugin's own variables are declared in the stylesheet through template
    constants (`${FLOOR_VARIABLE}` and friends), so the emitted text is
    interpolated before it is checked: reading the raw source would see the
    placeholder name and miss the real one.
    """
    style = re.search(r"function stylesheet\(\)\s*\{\s*return `(.*?)`;\s*\}", source, re.S)
    if style is None:
        fail("client.js has no stylesheet() function to inspect")
        return

    # Resolve the `${CONST}` placeholders the way the browser will see them.
    # Every template constant is collected, not just the `*_VARIABLE` ones: the
    # attribute name is interpolated into selectors too, and a pattern that
    # matched only variables would leave it unresolved and then report the
    # plugin's own placeholder as a defect.
    constants = dict(re.findall(r'const ([A-Z][A-Z0-9_]*) = "([^"]*)";', source))
    css = style.group(1)
    for name, value in constants.items():
        css = css.replace("${" + name + "}", value)
    leftover = sorted(set(re.findall(r"\$\{(\w+)\}", css)))
    if leftover:
        fail(f"stylesheet has unresolved template placeholders: {leftover}")
        return
    # The stylesheet is a template literal, so a backtick anywhere inside it —
    # including in a CSS comment — terminates the string early. That produces a
    # syntax error in the built file, which the syntax check above catches, but
    # naming the cause here saves the reader a trip through the generated file.
    if "`" in css:
        fail("the stylesheet template literal contains a backtick, which terminates it early")
        return

    own = {n for n in constants.values() if n.startswith("--dsh-gallery-")}
    # Every rule whose subject is the canvas: the plain rule, the scheme rules,
    # and the `::before` blur layer. A pattern anchored on `{` immediately after
    # the attribute list would miss `::before`, which is the one block that
    # carries the blur variable.
    blocks = re.findall(r"html\[[^\]]+\](?:::before)?\s*\{(.*?)\}", css, re.S)
    if not blocks:
        fail("stylesheet has no html[...] rule carrying the wallpaper")
        return
    # The palette must never be read from the canvas: `--dsw-alias-*` is written
    # on `<body>`, and a custom property defined on a descendant does not reach
    # an ancestor, so such a declaration resolves to nothing — silently, and
    # only on the element carrying the artwork.
    floor_used = False
    for block in blocks:
        used = set(re.findall(r"var\((--[\w-]+)", block))
        leaked = {name for name in used if name.startswith("--dsw-")}
        if leaked:
            fail(f"the html canvas rule reads body-scoped palette variables: {sorted(leaked)}")
        if "--dsh-gallery-floor" in used:
            floor_used = True
    if not floor_used:
        fail("the html canvas rule has no background-color using the floor colour")

    # Every variable the canvas reads must be declared by BOTH halves: the
    # stylesheet for the steady state, and the Host's boot script for the
    # pre-plugin interval. A variable only one half sets is a value that is
    # missing exactly when it is most visible.
    host = (PKG / "index.js").read_text(encoding="utf-8")
    for name in sorted(own):
        if name not in host:
            fail(f"the host boot script never sets {name}, which the canvas rule reads")
    notes.append("canvas rule uses only the plugin's own variables; switcher rules use palette tokens")


def check_roles(gallery: dict) -> None:
    """
    Every token must sit on the same side of the page as the shipped one, in
    each palette independently.

    This is the check that catches the whole "stand-off surface" class at once.
    A generator that models every token as a rung on the surface ladder pushes
    the toast, the tooltip, the primary button and the badge chip to the wrong
    side of the page — and because those carry their own ink, the result is a
    near-white toast with near-white text on it. Nothing throws, and a contrast
    check that only looks at text on the page sees nothing wrong.

    Comparing polarity per mode (rather than "which palette is lighter") is
    what makes this robust: luminance is compressed at the dark end, where two
    visibly different greys sit 0.02 apart, but "is this above or below the
    page" stays unambiguous.

    `roles.json` is extracted from the shipped stylesheet by `extract_roles.py`.
    """
    roles_path = BUILD / "roles.json"
    if not roles_path.exists():
        fail("roles.json is missing; run extract_roles.py first")
        return
    roles = json.loads(roles_path.read_text(encoding="utf-8"))

    def _lin(c: float) -> float:
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    def luminance(rgb) -> float:
        r, g, b = (c / 255 for c in rgb[:3])
        return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)

    def parse(value: str):
        v = value.strip()
        if v.startswith("#"):
            h = v[1:]
            if len(h) == 3:
                h = "".join(c * 2 for c in h)
            return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4)), 1.0
        parts = v[v.index("(") + 1: v.rindex(")")].split(",")
        rgb = tuple(int(float(p)) for p in parts[:3])
        return rgb, (float(parts[3]) if len(parts) > 3 else 1.0)

    checked = 0
    for slug, entry in gallery.items():
        for mode in ("light", "dark"):
            table = entry["tokens"][mode]
            page_rgb, _ = parse(table["--dsw-alias-bg-base"])
            page_lum = luminance(page_rgb)
            for name, role in roles.items():
                value = table.get(name)
                if value is None:
                    continue
                rgb, alpha = parse(value)
                shown = tuple(alpha * c + (1 - alpha) * b for c, b in zip(rgb, page_rgb))
                delta = luminance(shown) - page_lum
                mine = "below" if delta < -0.02 else "above" if delta > 0.02 else "same"
                theirs = role[mode]["polarity"]
                # `same` on either side is the page itself; only a real
                # disagreement about the side counts.
                if "same" in (mine, theirs):
                    continue
                if mine != theirs:
                    fail(f"{slug}/{mode}: {name} sits {mine} the page, shipped sits {theirs} "
                         f"(mine={value}, shipped={role[mode]['raw']})")
                checked += 1

    notes.append(f"{checked} token polarities match the shipped theme")


def check_on_primary(gallery: dict) -> None:
    """
    Text drawn ON a filled control must read on it.

    These pairs are invisible to a check that only measures text on the page,
    and they are exactly where the stand-off surfaces failed. The floors are
    the WCAG ones for the text size these controls use.
    """
    def _lin(c: float) -> float:
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

    def luminance(rgb) -> float:
        r, g, b = (c / 255 for c in rgb[:3])
        return 0.2126 * _lin(r) + 0.7152 * _lin(g) + 0.0722 * _lin(b)

    def parse(value: str):
        v = value.strip()
        if v.startswith("#"):
            h = v[1:]
            if len(h) == 3:
                h = "".join(c * 2 for c in h)
            return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
        parts = v[v.index("(") + 1: v.rindex(")")].split(",")
        return tuple(int(float(p)) for p in parts[:3])

    def contrast(a, b) -> float:
        hi, lo = sorted((luminance(a), luminance(b)), reverse=True)
        return (hi + 0.05) / (lo + 0.05)

    # (label, background token, foreground token, floor)
    PAIRS = [
        ("badge chip", "--dsw-alias-label-primary", "--dsw-alias-label-primary-inverted", 4.5),
        ("remove button", "--dsw-alias-button-contrast-fill", "--dsw-alias-label-primary-inverted", 4.5),
        ("primary button", "--dsw-alias-button-primary-fill", "--dsw-alias-label-primary-inverted", 4.5),
        ("toast", "--dsw-alias-toast-bg", "--dsw-alias-toast-label", 4.5),
        ("tooltip", "--dsw-alias-tooltip-bg", "--dsw-alias-toast-label", 4.5),
        # The send button ships `color: #fff` hard-coded, so white is the ink.
        ("send button", "--dsw-alias-button-info-fill", None, 3.0),
        ("send button hover", "--dsw-alias-button-info-hover", None, 3.0),
    ]

    worst = 999.0
    for slug, entry in gallery.items():
        for mode in ("light", "dark"):
            table = entry["tokens"][mode]
            for label, bg, fg, floor in PAIRS:
                back = parse(table[bg])
                ink = (255, 255, 255) if fg is None else parse(table[fg])
                c = contrast(back, ink)
                worst = min(worst, c)
                if c < floor:
                    fail(f"{slug}/{mode}: {label} — {fg or '#ffffff'} on {bg} = {c:.2f} < {floor}")
    notes.append(f"on-primary pairs all clear their floors (worst {worst:.2f}:1)")


def main() -> int:
    package = json.loads((PKG / "package.json").read_text(encoding="utf-8"))
    name = package["name"]

    source = check_syntax(PKG / "client.js", name)
    gallery = check_tables(source)
    if gallery:
        check_flatness(source, gallery)
        check_roles(gallery)
        check_on_primary(gallery)
        check_contrast(gallery)
    check_canvas_scope(source)
    check_host()

    print("\n".join(f"  . {n}" for n in notes))
    if failures:
        print(f"\n{len(failures)} FAILURE(S)")
        for f in failures[:40]:
            print("  x", f)
        return 1
    print("\nall checks passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
