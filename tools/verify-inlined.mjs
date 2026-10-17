/**
 * The solver as it SHIPS: extracted from `client.js` and run on a real image.
 *
 * `verify-solver.mjs` proves `solver.js` matches the Python generator. This
 * proves the copy inside `client.js` matches too — and that matters, because
 * the client is served verbatim from a route and the build splices the solver
 * into it textually. A bad splice, a stale build, or an edit applied to one
 * file and not the other would leave the SHIPPED solver different from the
 * verified one, and every other check would still pass because they all read
 * `solver.js`.
 *
 * The extraction is deliberately mechanical: the solver block is taken from the
 * shipped bytes and evaluated as-is. Nothing is re-imported, so what runs here
 * is what the browser runs.
 *
 * Usage: node verify-inlined.mjs
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// `tools/` lives inside the package, so the package root is one level up.
const PKG = resolve(HERE, "..");
// The interpreter running this suite, not a path from one machine. `PYTHON`
// still overrides it for a venv or a differently-named binary.
const PYTHON = process.env.PYTHON ?? "python";

const failures = [];
const check = (ok, message) => {
	if (!ok) failures.push(message);
};

const client = readFileSync(resolve(PKG, "client.js"), "utf8");
const solver = readFileSync(resolve(HERE, "solver.js"), "utf8");

// ---- 1. the shipped block is the verified block --------------------------
{
	const normalise = (text) => text.replace(/\s+/g, " ").trim();
	const body = solver
		.replace(/^\s*\/\*\*[\s\S]*?\*\/\s*/, "")
		.replace(/\nexport\s*\{[^}]*\};\s*$/, "\n");
	check(
		normalise(client).includes(normalise(body)),
		"the shipped client.js does not contain the verified solver body — rebuild, or the two have drifted",
	);
}

// ---- 2. extract it from the shipped bytes --------------------------------
//
// The block is located by its first and last CODE declarations rather than by a
// comment: the build strips the solver's leading doc block, and the section
// banners between its parts are comments too, so any marker made of prose would
// break the moment the commentary changed.
const START = "const ONE_SIXTH = 1 / 6;";
const block = client.slice(client.indexOf(START));
check(client.indexOf(START) >= 0, "the shipped client has no solver: `const ONE_SIXTH` was not found");
// `solvePixels` is the solver's last declaration; the block ends at the closing
// brace of that function, which is the boundary the inliner leaves behind.
const LAST = "function solvePixels(rgba, width, height) {";
const lastAt = block.indexOf(LAST);
check(lastAt >= 0, "the shipped client has no `solvePixels`, so the solver was not inlined");
if (client.indexOf(START) < 0 || lastAt < 0) {
	console.error("FAILURE: the shipped solver block is not where the inliner puts it");
	process.exit(1);
}
/**
 * The end of the `solvePixels` declaration, by counting braces.
 *
 * A regex or a `"\n}\n"` search is not enough: the function contains object
 * literals and template strings, so a line that is exactly `}` can appear
 * inside it. Counting braces from the opening one, while skipping strings and
 * comments, is what actually finds the end.
 *
 * @param text - source beginning at `function solvePixels(...) {`
 * @returns the index just past the closing brace.
 */
function endOfFunction(text) {
	let depth = 0;
	let started = false;
	let i = 0;
	while (i < text.length) {
		const c = text[i];
		// Strings and template literals: skip to the matching quote so a brace
		// inside one is not counted. Escapes are honoured.
		if (c === '"' || c === "'" || c === "`") {
			const quote = c;
			i++;
			while (i < text.length && text[i] !== quote) {
				if (text[i] === "\\") i++;
				i++;
			}
			i++;
			continue;
		}
		if (c === "/" && text[i + 1] === "/") {
			while (i < text.length && text[i] !== "\n") i++;
			continue;
		}
		if (c === "/" && text[i + 1] === "*") {
			i += 2;
			while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++;
			i += 2;
			continue;
		}
		if (c === "{") {
			depth++;
			started = true;
		} else if (c === "}") {
			depth--;
			if (started && depth === 0) return i + 1;
		}
		i++;
	}
	return text.length;
}
const solverBlock = block.slice(0, lastAt + endOfFunction(block.slice(lastAt)));
check(!/\bexport\b/.test(solverBlock), "the shipped solver block still contains an export statement");

const WANTED = [
	"solvePixels", "analysePixels", "buildMode", "solve", "checkTokens",
	"opaqueFloor", "hsl", "contrast", "ALL_TOKENS", "parseCss", "pyRound", "hueBin",
];
const factory = new Function(`${solverBlock}\nreturn { ${WANTED.join(", ")} };`);
let shipped;
try {
	shipped = factory();
} catch (error) {
	failures.push(`the shipped solver block does not evaluate: ${error.message}`);
	console.error(`${failures.length} FAILURE(S)`);
	for (const f of failures) console.error("  x", f);
	process.exit(1);
}
for (const name of WANTED) {
	check(typeof shipped[name] === "function" || typeof shipped[name] === "object", `${name} is missing from the shipped block`);
}

// ---- 3. run the shipped copy over a real image ---------------------------
//
// The pixels come from Python, at the same 2560px width the client resamples
// to, so both languages see identical input. The tokens that come out are
// compared against `palette.json` — the generator's own record — which closes
// the loop from the shipped bytes back to the Python original.
const palette = JSON.parse(readFileSync(resolve(HERE, "palette.json"), "utf8"));

function pixels(path) {
	const script = `
import json, sys
from PIL import Image
im = Image.open(sys.argv[1]).convert("RGB")
w = 2560
im = im.resize((w, round(im.height * w / im.width)), Image.LANCZOS)
buf = im.tobytes()
sys.stdout.buffer.write(json.dumps({"w": im.width, "h": im.height, "n": len(buf)}).encode("ascii") + b"\\n")
sys.stdout.buffer.write(buf)
sys.stdout.buffer.flush()
`;
	const out = execFileSync(PYTHON, ["-c", script, path], { maxBuffer: 512 * 1024 * 1024 });
	const nl = out.indexOf(0x0a);
	const meta = JSON.parse(out.subarray(0, nl).toString("ascii"));
	const rgb = out.subarray(nl + 1, nl + 1 + meta.n);
	check(rgb.length === meta.n, `pixel payload truncated: ${rgb.length} of ${meta.n}`);
	const rgba = new Uint8ClampedArray(meta.w * meta.h * 4);
	for (let i = 0, j = 0; i < meta.n; i += 3, j += 4) {
		rgba[j] = rgb[i];
		rgba[j + 1] = rgb[i + 1];
		rgba[j + 2] = rgb[i + 2];
		rgba[j + 3] = 255;
	}
	return { rgba, width: meta.w, height: meta.h };
}

let tokensChecked = 0;
for (const slug of Object.keys(palette)) {
	const record = palette[slug];
	// The ORIGINAL source image, because that is what `palette.json` records;
	// the served JPEG is a lossy re-encode of the same pixels.
	const { rgba, width, height } = pixels(resolve(HERE, "..", "sources", record.source));
	let result;
	try {
		result = shipped.solvePixels(rgba, width, height);
	} catch (error) {
		failures.push(`${slug}: the shipped solver threw — ${error.message}`);
		continue;
	}
	for (const mode of ["light", "dark"]) {
		const mine = result.tokens[mode];
		const theirs = record.tokens[mode];
		const names = Object.keys(theirs);
		const differ = names.filter((n) => mine[n] !== theirs[n]);
		if (differ.length > 0) {
			const sample = differ.slice(0, 3).map((n) => `${n}: shipped=${mine[n]} python=${theirs[n]}`);
			failures.push(`${slug}/${mode}: ${differ.length}/${names.length} tokens differ — ${sample.join(" | ")}`);
		}
		tokensChecked += names.length - differ.length;
		// The derived values the client paints with.
		check(result.scrim[mode] === record.solver[mode].scrim, `${slug}/${mode}: scrim is ${result.scrim[mode]}`);
		check(
			Math.abs(result.solver[mode].worstContrast - record.solver[mode].worstContrast) <= 0.02,
			`${slug}/${mode}: worst contrast is ${result.solver[mode].worstContrast}, python ${record.solver[mode].worstContrast}`,
		);
	}
}

// ---- 4. the shipped copy solves arbitrary images too ---------------------
//
// A user's picture is not one of the shipped three, so the shipped solver has
// to handle whatever it is handed: every table complete, every value a colour.
{
	const side = 64;
	const make = (fn) => {
		const rgba = new Uint8ClampedArray(side * side * 4);
		for (let y = 0; y < side; y++) {
			for (let x = 0; x < side; x++) {
				const [r, g, b] = fn(x / (side - 1), y / (side - 1));
				const i = (y * side + x) * 4;
				rgba[i] = r; rgba[i + 1] = g; rgba[i + 2] = b; rgba[i + 3] = 255;
			}
		}
		return { rgba, width: side, height: side };
	};
	const COLOUR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i;
	const characters = [
		["black", () => [0, 0, 0]],
		["white", () => [255, 255, 255]],
		["a gradient", (u, v) => [20 + u * 200, 40 + v * 150, 200 - u * 100]],
		["a checkerboard", (u, v) => ((u < 0.5) === (v < 0.5) ? [0, 0, 0] : [255, 255, 255])],
		["one flat tone", () => [90, 140, 210]],
	];
	for (const [label, fn] of characters) {
		const image = make(fn);
		let result;
		try {
			result = shipped.solvePixels(image.rgba, image.width, image.height);
		} catch (error) {
			failures.push(`shipped solver threw on ${label}: ${error.message}`);
			continue;
		}
		for (const mode of ["light", "dark"]) {
			const tokens = result.tokens[mode];
			if (Object.keys(tokens).length !== shipped.ALL_TOKENS.length) {
				failures.push(`shipped solver on ${label}/${mode}: ${Object.keys(tokens).length} tokens`);
			}
			const bad = Object.entries(tokens).filter(([, v]) => !COLOUR.test(v));
			if (bad.length > 0) failures.push(`shipped solver on ${label}/${mode}: ${bad.length} malformed values`);
			if (!COLOUR.test(result.scrim[mode])) failures.push(`shipped solver on ${label}/${mode}: bad scrim`);
			if (!COLOUR.test(result.floor[mode])) failures.push(`shipped solver on ${label}/${mode}: bad floor`);
		}
	}
}

if (failures.length > 0) {
	console.error(`${failures.length} FAILURE(S)`);
	for (const f of failures.slice(0, 30)) console.error("  x", f);
	if (failures.length > 30) console.error(`  ... and ${failures.length - 30} more`);
	process.exit(1);
}
console.log(
	`inlined solver: the shipped client.js carries the verified solver — ` +
	`${tokensChecked} tokens reproduced from the Python generator, arbitrary images solved in full`,
);
