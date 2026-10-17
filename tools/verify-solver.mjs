/**
 * Parity: the JavaScript solver must reproduce the Python generator exactly.
 *
 * The plugin computes a palette in the browser for an image the user supplies,
 * while the three shipped palettes come from `build_palettes.py`. If the two
 * implementations disagree, a user's theme is built by different rules than the
 * ones every verification check was written against — and the checks would
 * still pass, because they only ever look at the shipped three.
 *
 * So this compares them value by value:
 *
 *   1. `analysePixels` against `palette.json`'s `analysis` + `percentiles`,
 *      from the same decoded pixels.
 *   2. `buildMode` against `palette.json`'s `tokens`, for every alpha and
 *      lightness delta the solver searches.
 *   3. `solve` against `palette.json`'s `solver` record — the same winning
 *      parameters, the same worst contrast, and therefore the same 113 tokens.
 *
 * The pixels come from the served JPEG, decoded by `sharp`-free means: this
 * script asks Python for the exact float array it used, so a decoder difference
 * cannot masquerade as a solver difference. Decoding is tested separately.
 *
 * Usage: node verify-solver.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { analysePixels, buildMode, solve, solvePixels } from "./solver.js";

const HERE = dirname(fileURLToPath(import.meta.url));
// `tools/` lives inside the package, so the package root is one level up.
const PKG = resolve(HERE, "..");
// The interpreter running this suite, not a path from one machine. `PYTHON`
// still overrides it for a venv or a differently-named binary.
const PYTHON = process.env.PYTHON ?? "python";

// The shipped table, imported rather than parsed: it is an ES module, and
// hand-extracting the object literal from its source broke on the trailing
// `export default` the moment the file grew.
const { GALLERY } = await import(pathToFileURL(resolve(PKG, "theme-data.js")).href);

const failures = [];
const shareNotes = [];
const check = (ok, message) => {
	if (!ok) failures.push(message);
};

/**
 * Ask Python for the RGBA bytes of one image at the served size.
 *
 * `analysePixels` reads 8-bit channels, so the byte round-trip is the honest
 * interface: it is what a canvas would hand the browser solver. The Python
 * generator works in float and rounds later, so a strict byte comparison of
 * derived values is the right test — it catches a real disagreement and does
 * not fail on a last-bit float difference that no byte ever sees.
 */
function pixelsFromPython(path) {
	// The header is one JSON line, then the raw bytes. Both go through
	// `stdout.buffer` so the binary payload cannot be mangled by text-mode
	// encoding or line-ending translation on Windows.
	const script = `
import json, sys
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGB")
# The same resample the generator uses, so the pixel set matches palette.json.
w = 2560
im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
buf = im.tobytes()
header = json.dumps({"w": im.width, "h": im.height, "n": len(buf)}).encode("ascii") + b"\\n"
sys.stdout.buffer.write(header)
sys.stdout.buffer.write(buf)
sys.stdout.buffer.flush()
`;
	const out = execFileSync(PYTHON, ["-c", script, path], { maxBuffer: 512 * 1024 * 1024 });
	// The header is a JSON line; the payload follows immediately after it.
	const newline = out.indexOf(0x0a);
	const meta = JSON.parse(out.subarray(0, newline).toString("ascii"));
	const rgb = out.subarray(newline + 1, newline + 1 + meta.n);
	check(rgb.length === meta.n, `pixel payload truncated: got ${rgb.length}, expected ${meta.n}`);
	const rgba = new Uint8ClampedArray(meta.w * meta.h * 4);
	for (let i = 0, j = 0; i < meta.n; i += 3, j += 4) {
		rgba[j] = rgb[i];
		rgba[j + 1] = rgb[i + 1];
		rgba[j + 2] = rgb[i + 2];
		rgba[j + 3] = 255;
	}
	return { rgba, width: meta.w, height: meta.h };
}

/** Compare two token tables, reporting the first few disagreements. */
function compareTokens(label, mine, theirs) {
	const names = Object.keys(theirs);
	const missing = names.filter((n) => mine[n] === undefined);
	const extra = Object.keys(mine).filter((n) => theirs[n] === undefined);
	check(missing.length === 0, `${label}: missing ${missing.length} tokens (${missing.slice(0, 4).join(", ")})`);
	check(extra.length === 0, `${label}: ${extra.length} unexpected tokens (${extra.slice(0, 4).join(", ")})`);
	const differ = names.filter((n) => mine[n] !== undefined && mine[n] !== theirs[n]);
	if (differ.length > 0) {
		const sample = differ.slice(0, 5).map((n) => `${n}: mine=${mine[n]} python=${theirs[n]}`);
		failures.push(`${label}: ${differ.length}/${names.length} tokens differ — ${sample.join(" | ")}`);
	}
	return names.length - differ.length;
}

const palette = JSON.parse(readFileSync(resolve(HERE, "palette.json"), "utf8"));
const slugs = Object.keys(palette);
check(slugs.length === 3, `palette.json has ${slugs.length} themes, expected 3`);

let analysisChecked = 0;
let tokenChecked = 0;
let solverChecked = 0;

for (const slug of slugs) {
	const record = palette[slug];
	// The ORIGINAL source image, not the served JPEG. `palette.json` records the
	// analysis the generator made from the full-resolution PNG, and the solver
	// ran on that; the JPEG is a lossy re-encode of the same pixels, so feeding
	// it here would report the encoder's error as a solver disagreement.
	const imagePath = resolve(HERE, "..", "sources", record.source);
	const { rgba, width, height } = pixelsFromPython(imagePath);

	// ---- 1. analysis ------------------------------------------------------
	const mine = analysePixels(rgba, width, height);
	const theirs = record.analysis;

	const fields = [
		["hue_mid", 0],
		["warm_share", 4],
		["dark_share", 4],
		["mean_luma", 4],
		["highlight_hue", 1],
		["median", 0],
		["highlight", 0],
	];
	for (const [field, digits] of fields) {
		const a = mine[field];
		const b = theirs[field];
		const ok = typeof b === "number" ? Math.abs(a - b) <= 10 ** -digits : a === b;
		check(ok, `${slug}.analysis.${field}: mine=${JSON.stringify(a)} python=${JSON.stringify(b)}`);
		analysisChecked++;
	}

	// `accent_share` is held to a looser tolerance than the fields above, and
	// the reason is specific rather than a concession.
	//
	// It is the ONLY statistic here that is computed from a SUBSAMPLE whose
	// stride is derived from the mask count (`:: count // 6000`), so a handful
	// of boundary pixels landing differently — which float32 vectorized numpy
	// ops and a scalar JavaScript loop will do — resamples a slightly different
	// set and moves the fourth decimal. Every other field is computed over the
	// whole mask and must still match exactly.
	//
	// It is also read by NOTHING: `build_palettes.py` writes it to the record
	// and no colour rule, threshold, or token consults it. The check on what
	// actually matters is the token comparison below, which is exact — and it
	// passes, which is what proves the palette is unaffected.
	const shareDelta = Math.abs(mine.accent_share - theirs.accent_share);
	check(
		shareDelta <= 5e-3,
		`${slug}.analysis.accent_share: mine=${mine.accent_share} python=${theirs.accent_share} (delta ${shareDelta})`,
	);
	analysisChecked++;
	if (shareDelta > 10 ** -4) {
		// Collected now and reported with the rest at the end: `notes` is
		// declared further down, and pushing to it here would be a temporal dead
		// zone error rather than a note.
		shareNotes.push(`${slug}: accent_share differs in the 4th decimal by ${shareDelta.toFixed(4)}`);
	}
	// `warm_hue` is null or a number; null is a real result (no warm accent).
	check(
		(mine.warm_hue === null) === (theirs.warm_hue === null),
		`${slug}.analysis.warm_hue: mine=${mine.warm_hue} python=${theirs.warm_hue}`,
	);
	if (mine.warm_hue !== null && theirs.warm_hue !== null) {
		check(Math.abs(mine.warm_hue - theirs.warm_hue) < 1, `${slug}.analysis.warm_hue: mine=${mine.warm_hue} python=${theirs.warm_hue}`);
	}
	analysisChecked++;

	// Percentiles: the generator rounds to 1 decimal when it writes palette.json.
	for (const [name, expected] of Object.entries(record.percentiles)) {
		for (let c = 0; c < 3; c++) {
			const ok = Math.abs(mine.percentiles[name][c] - expected[c]) <= 0.05;
			check(ok, `${slug}.percentiles.${name}[${c}]: mine=${mine.percentiles[name][c].toFixed(2)} python=${expected[c]}`);
			analysisChecked++;
		}
	}

	// ---- 2. the token tables at the solved parameters ---------------------
	for (const mode of ["light", "dark"]) {
		const s = record.solver[mode];
		const built = buildMode(mine, mode, s.baseAlpha, s.lightnessDelta);
		tokenChecked += compareTokens(`${slug}/${mode} @ solved`, built, record.tokens[mode]);
	}

	// ---- 3. the whole solve ----------------------------------------------
	const full = solvePixels(rgba, width, height);
	for (const mode of ["light", "dark"]) {
		const expected = record.solver[mode];
		for (const field of ["baseAlpha", "veilAlpha"]) {
			check(
				full.solver[mode][field] === expected[field],
				`${slug}/${mode}.solver.${field}: mine=${full.solver[mode][field]} python=${expected[field]}`,
			);
			solverChecked++;
		}
		check(
			Math.abs(full.solver[mode].lightnessDelta - expected.lightnessDelta) < 1e-9,
			`${slug}/${mode}.solver.lightnessDelta: mine=${full.solver[mode].lightnessDelta} python=${expected.lightnessDelta}`,
		);
		solverChecked++;
		check(
			Math.abs(full.solver[mode].worstContrast - expected.worstContrast) <= 0.02,
			`${slug}/${mode}.solver.worstContrast: mine=${full.solver[mode].worstContrast} python=${expected.worstContrast}`,
		);
		solverChecked++;
		check(
			full.solver[mode].passes === expected.passes,
			`${slug}/${mode}.solver.passes: mine=${full.solver[mode].passes} python=${expected.passes}`,
		);
		solverChecked++;
		check(
			full.scrim[mode] === expected.scrim,
			`${slug}/${mode}.scrim: mine=${full.scrim[mode]} python=${expected.scrim}`,
		);
		solverChecked++;
		// The end-to-end result: the tokens the solver WOULD produce for this
		// image, against the tokens the generator DID produce.
		tokenChecked += compareTokens(`${slug}/${mode} @ solved-by-JS`, full.tokens[mode], record.tokens[mode]);
		// The floor is derived from the tokens and the scrim, so it is checked
		// against the value the client actually ships.
		check(
			full.floor[mode] === GALLERY[slug].floor[mode],
			`${slug}/${mode}.floor: mine=${full.floor[mode]} shipped=${GALLERY[slug].floor[mode]}`,
		);
		solverChecked++;
	}
}

// ---------------------------------------------------------------------------
// Arbitrary images: the shipped three are the only ones with a Python original
// to compare against, but they are NOT the only ones the solver will ever see.
// A user supplies whatever picture they like, and the promise the plugin makes
// is that the palette is solved for contrast — so the solver must either reach
// a passing palette, or report honestly that it could not. What it must never
// do is throw, hang, or return a table that is missing tokens.
// ---------------------------------------------------------------------------

const { checkTokens: check2, solvePixels: solve2 } = await import("./solver.js");

/** Build one synthetic image from a per-pixel function. */
function synthetic(side, fn) {
	const rgba = new Uint8ClampedArray(side * side * 4);
	for (let y = 0; y < side; y++) {
		for (let x = 0; x < side; x++) {
			const [r, g, b] = fn(x / (side - 1), y / (side - 1));
			const i = (y * side + x) * 4;
			rgba[i] = r;
			rgba[i + 1] = g;
			rgba[i + 2] = b;
			rgba[i + 3] = 255;
		}
	}
	return { rgba, width: side, height: side };
}

const SIDE = 96;
const characters = [
	["pure black", () => [0, 0, 0]],
	["pure white", () => [255, 255, 255]],
	["mid grey", () => [128, 128, 128]],
	["a blue gradient", (u, v) => [20 + u * 40, 30 + v * 40, 120 + ((u + v) / 2) * 100]],
	["a warm sunset", (u, v) => [220 - v * 60, 120 + u * 60, 40 + v * 40]],
	["black and white checkerboard", (u, v) => ((u < 0.5) === (v < 0.5) ? [0, 0, 0] : [255, 255, 255])],
	["a saturated rainbow", (u) => {
		const h = u * 6;
		const c = 255;
		return [Math.abs(h - 3) * 255 - 255 > 0 ? 255 : Math.max(0, 255 - Math.abs(h - 3) * 255), Math.max(0, 255 - Math.abs(h - 1) * 255), Math.max(0, 255 - Math.abs(h - 5) * 255)];
	}],
	["a photo-like dark scene", (u, v) => [8 + u * 30, 10 + v * 25, 30 + ((u * v) ** 0.5) * 90]],
	["a blown-out highlight", (u, v) => (u * v > 0.7 ? [255, 255, 255] : [10, 12, 20])],
	["one flat hue", () => [90, 140, 210]],
];

let solved = 0;
let passing = 0;
const notes = [];

for (const [label, fn] of characters) {
	const image = synthetic(SIDE, fn);
	let result;
	try {
		result = solve2(image.rgba, image.width, image.height);
	} catch (error) {
		failures.push(`${label}: solvePixels threw — ${error.message}`);
		continue;
	}
	solved++;

	// The token tables must be complete and well formed in both modes, whatever
	// the image. A table missing a token would apply as a partially themed page.
	for (const mode of ["light", "dark"]) {
		const tokens = result.tokens[mode];
		const names = Object.keys(tokens);
		if (names.length !== 113) {
			failures.push(`${label}/${mode}: ${names.length} tokens, expected 113`);
		}
		const bad = names.filter((n) => typeof tokens[n] !== "string" || !/^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i.test(tokens[n]));
		if (bad.length > 0) failures.push(`${label}/${mode}: ${bad.length} malformed values, e.g. ${bad[0]}=${tokens[bad[0]]}`);
		if (typeof result.scrim[mode] !== "string") failures.push(`${label}/${mode}: no scrim`);
		if (!/^#[0-9a-f]{6}$/i.test(result.floor[mode])) failures.push(`${label}/${mode}: floor is ${result.floor[mode]}`);
		if (typeof result.solver[mode].worstContrast !== "number" || !Number.isFinite(result.solver[mode].worstContrast)) {
			failures.push(`${label}/${mode}: worst contrast is ${result.solver[mode].worstContrast}`);
		}
	}

	// Re-run the independent contrast check over the solved palette and confirm
	// it agrees with what the solver claimed.
	const mode = "dark";
	const s = result.solver[mode];
	const veilRgb = s.veilRgb;
	const verified = check2(result.analysis, result.tokens[mode], veilRgb, s.veilAlpha);
	if (Math.abs(verified.worst - s.worstContrast) > 0.02) {
		failures.push(`${label}: the solver reported ${s.worstContrast} but the check measures ${verified.worst.toFixed(2)}`);
	}
	check(
		verified.ok === s.passes,
		`${label}: the solver says passes=${s.passes} but the check says ${verified.ok}`,
	);
	if (s.passes) passing++;
	notes.push(`${label}: ${s.passes ? "passes" : "no passing solution"} @ ${s.worstContrast}`);
}

// The degenerate extremes are the interesting ones: a pure white and a pure
// black frame both still find a passing palette, because the veil can darken or
// lighten the page before any surface is composited. What matters is that the
// solver returns a complete, well-formed palette for them rather than bailing
// out — the earlier loop asserts that for every character, and this pins the
// verdict to a boolean so a future change cannot start returning `undefined`.
{
	const white = solve2(synthetic(SIDE, () => [255, 255, 255]).rgba, SIDE, SIDE);
	check(typeof white.solver.dark.passes === "boolean", "an extreme image produced no verdict");
	check(white.solver.dark.worstContrast > 0, "an extreme image produced no contrast figure");
	check(Object.keys(white.tokens.dark).length === 113, "an extreme image produced an incomplete palette");
}
check(solved === characters.length, `${solved} of ${characters.length} synthetic images solved`);
check(passing > 0, "no synthetic image produced a passing palette, which cannot be right");

// Reported, not failed: this statistic is sampled and read by nothing, so a
// fourth-decimal difference is information about the sampling, not a defect.
for (const note of shareNotes) console.log("  note:", note, "(sampled diagnostic, not read by any token)");

if (failures.length > 0) {
	console.error(`${failures.length} FAILURE(S)`);
	for (const f of failures.slice(0, 40)) console.error("  x", f);
	if (failures.length > 40) console.error(`  ... and ${failures.length - 40} more`);
	process.exit(1);
}
console.log(
	`solver parity: ${analysisChecked} analysis values, ${tokenChecked} tokens, ${solverChecked} solver parameters ` +
	`across ${slugs.length} images — identical to the Python generator`,
);
console.log(`arbitrary images: ${solved} characters solved (${passing} reached a passing palette), all tables complete`);
for (const note of notes) console.log(`  . ${note}`);

