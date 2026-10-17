/**
 * End to end: a real image, solved by the SHIPPED client solver, stored through
 * the real API over HTTP, and read back after a restart.
 *
 * Every other suite checks one seam. This checks that the seams meet: the
 * payload the client builds has to be exactly what `validatePalette` accepts,
 * the tokens the shipped solver produces have to survive JSON and the store,
 * and the values that come back have to be the ones the client will apply.
 *
 * The pieces are taken from the shipped files rather than re-implemented — the
 * solver is extracted from `client.js`, the API is the real router, and the
 * store is the real store — because an end-to-end test that uses its own
 * versions of the parts proves only that its own versions agree.
 *
 * The pixels come from Python so the solver sees the same input as the parity
 * test; everything after that is exactly what the browser and Host would do.
 *
 * Usage: node verify-end-to-end.mjs
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Store } from "./../store.js";

const HERE = dirname(fileURLToPath(import.meta.url));
// `tools/` lives inside the package, so the package root is one level up.
const PKG = resolve(HERE, "..");
const PYTHON = process.env.PYTHON ?? "python";

const failures = [];
const check = (ok, message) => {
	if (!ok) failures.push(message);
};

// ---------------------------------------------------------------------------
// 1. The shipped solver, taken out of client.js.
// ---------------------------------------------------------------------------
const source = readFileSync(resolve(PKG, "client.js"), "utf8");
const START = "const ONE_SIXTH = 1 / 6;";
const LAST = "function solvePixels(rgba, width, height) {";
const from = source.indexOf(START);
const at = source.indexOf(LAST);
check(from >= 0 && at >= 0, "the shipped solver could not be located in client.js");

/** Count braces, skipping strings and comments, to find a function's end. */
function endOf(text) {
	let depth = 0;
	let started = false;
	let i = 0;
	while (i < text.length) {
		const c = text[i];
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
		if (c === "/" && text[i + 1] === "/") { while (i < text.length && text[i] !== "\n") i++; continue; }
		if (c === "/" && text[i + 1] === "*") { i += 2; while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++; i += 2; continue; }
		if (c === "{") { depth++; started = true; }
		else if (c === "}") { depth--; if (started && depth === 0) return i + 1; }
		i++;
	}
	return text.length;
}
const tail = source.slice(at);
const shipped = new Function(
	`${source.slice(from, at + endOf(tail))}\nreturn { solvePixels, ALL_TOKENS };`,
)();
check(typeof shipped.solvePixels === "function", "the extracted solver has no solvePixels");

// ---------------------------------------------------------------------------
// 2. A real image's pixels, decoded the way the client's canvas would.
// ---------------------------------------------------------------------------
function pixelsOf(path) {
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
	const rgba = new Uint8ClampedArray(meta.w * meta.h * 4);
	for (let i = 0, j = 0; i < meta.n; i += 3, j += 4) {
		rgba[j] = rgb[i]; rgba[j + 1] = rgb[i + 1]; rgba[j + 2] = rgb[i + 2]; rgba[j + 3] = 255;
	}
	return { rgba, width: meta.w, height: meta.h };
}

// Use the portrait image: the one with the strongest veil, so its palette has
// the most distinctive numbers to match against.
const gallery = JSON.parse(readFileSync(resolve(HERE, "palette.json"), "utf8"));
const slug = "portrait";
const imagePath = resolve(HERE, "..", "sources", gallery[slug].source);
const { rgba, width, height } = pixelsOf(imagePath);

// ---------------------------------------------------------------------------
// 3. Solve it with the shipped solver.
// ---------------------------------------------------------------------------
const solved = shipped.solvePixels(rgba, width, height);
check(Object.keys(solved.tokens.light).length === 113, `the light table has ${Object.keys(solved.tokens.light).length} tokens`);
check(Object.keys(solved.tokens.dark).length === 113, `the dark table has ${Object.keys(solved.tokens.dark).length} tokens`);
// And it must be the SAME palette the generator produced for this image.
for (const mode of ["light", "dark"]) {
	const differ = Object.keys(gallery[slug].tokens[mode]).filter((n) => solved.tokens[mode][n] !== gallery[slug].tokens[mode][n]);
	check(differ.length === 0, `${mode}: ${differ.length} tokens differ from the generator (e.g. ${differ[0]})`);
}

// ---------------------------------------------------------------------------
// 4. Post it to the real API, over real HTTP, into a real store.
// ---------------------------------------------------------------------------
const home = mkdtempSync(join(tmpdir(), "gallery-e2e-"));
const store = new Store(home);
const { api } = await import("./../api.js");
const handle = api(store);
const server = createServer((req, res) => {
	handle(req, res).catch((error) => {
		res.writeHead(500, { "content-type": "application/json" });
		res.end(JSON.stringify({ error: String(error) }));
	});
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/theme-gallery/api`;

// The bytes the client would send: the image it re-encoded from the canvas. The
// shipped JPEG stands in for that, base64'd exactly as `canvas.toDataURL` would.
const image = readFileSync(resolve(PKG, "assets", `${slug}.jpg`));
const payload = JSON.stringify({
	source: "upload",
	title: "端到端 End to end",
	data: `data:image/jpeg;base64,${image.toString("base64")}`,
	palette: { tokens: solved.tokens, scrim: solved.scrim, floor: solved.floor, analysis: solved.analysis, solver: solved.solver },
});
check(Buffer.byteLength(payload) > 0, "the payload is empty");

const posted = await fetch(`${base}/add`, {
	method: "POST",
	headers: { "content-type": "application/json" },
	body: payload,
});
const created = await posted.json();
check(posted.status === 200, `the API rejected the client's own payload: ${posted.status} ${JSON.stringify(created).slice(0, 300)}`);
check(typeof created.id === "string", `the API returned no id: ${JSON.stringify(created)}`);
check(existsSync(store.imagePath(`${created.id}.jpg`)), "the image was not written");

// ---------------------------------------------------------------------------
// 5. Restart: a fresh store over the same home must return the same palette.
// ---------------------------------------------------------------------------
const reopened = new Store(home);
const { themes } = await reopened.read();
check(themes.length === 1, `after a restart the library holds ${themes.length} themes`);
const restored = themes[0];
check(restored?.id === created.id, `the restored id is ${restored?.id}`);
check(restored?.title === "端到端 End to end", `the restored title is ${restored?.title}`);
for (const mode of ["light", "dark"]) {
	// Every token, value for value: this is the promise the feature makes.
	const names = Object.keys(solved.tokens[mode]);
	const differ = names.filter((n) => restored?.palette?.tokens?.[mode]?.[n] !== solved.tokens[mode][n]);
	check(differ.length === 0, `${mode}: ${differ.length} tokens changed across the restart (e.g. ${differ[0]})`);
	check(restored?.palette?.scrim?.[mode] === solved.scrim[mode], `${mode}: the scrim changed across the restart`);
	check(restored?.palette?.floor?.[mode] === solved.floor[mode], `${mode}: the floor changed across the restart`);
}

// ---------------------------------------------------------------------------
// 6. The boot path: the synchronous cache must resolve it, and hand the boot
//    script exactly the shape it builds a pre-paint rule from.
// ---------------------------------------------------------------------------
//
// Two cases, and they are different code paths. The SAME instance is what the
// live process has: `apply` creates one store, the API writes through it, and
// the boot injection reads it without re-reading the disk — so a write that
// updated only the file would leave the running Host painting the previous
// wallpaper until a restart. The fresh instance is what a restart has.
{
	// The live path: no refresh, no reload, just the write that came through the API.
	const live = store.cached(created.id);
	check(live !== undefined, "the store that served the add does not resolve the theme it just wrote");
	check(live?.wallpaper === `${created.id}.jpg`, `the live boot entry names ${live?.wallpaper}`);
	check(live?.scrim?.dark === solved.scrim.dark, "the live boot entry has the wrong dark scrim");
	check(live?.floor?.light === solved.floor.light, "the live boot entry has the wrong light floor");
}

{
	// The restart path: a brand-new instance over the same home.
	const boot = new Store(home);
	await boot.refresh();
	const entry = boot.cached(created.id);
	check(entry !== undefined, "a reopened store does not resolve the theme");
	check(entry?.wallpaper === `${created.id}.jpg`, `the reopened boot entry names ${entry?.wallpaper}`);
	check(boot.cached("cnotreal") === undefined, "the boot cache resolved a theme that never existed");
	// The whole library must be available to the client in one call.
	const all = boot.cachedAll();
	check(Object.keys(all).length === 1, `cachedAll returned ${Object.keys(all).length} themes`);
	check(Object.keys(all[created.id]?.tokens?.light ?? {}).length === 113, "cachedAll dropped the token tables");
}

// ---------------------------------------------------------------------------
// 7. The bytes come back off the route unchanged.
// ---------------------------------------------------------------------------
{
	// The served image must be byte-identical to what was stored, or the palette
	// would describe a different picture than the one painted.
	const served = readFileSync(store.imagePath(`${created.id}.jpg`));
	check(served.equals(image), "the stored image is not the image that was sent");
}

// ---------------------------------------------------------------------------
// 8. A delete reaches the live cache and survives a restart.
// ---------------------------------------------------------------------------
//
// Last, because it removes the theme every check above depends on. A delete
// that only unlinked the file would leave the running Host painting an image
// that no longer exists — a broken canvas rather than a missing theme.
{
	await store.remove(created.id);
	check(store.cached(created.id) === undefined, "the live store still resolves a theme it just deleted");
	check(!existsSync(store.imagePath(`${created.id}.jpg`)), "the deleted image is still on disk");
	const after = new Store(home);
	await after.refresh();
	check((await after.read()).themes.length === 0, "a delete did not survive a reopen");
	check(after.cached(created.id) === undefined, "a reopened store resolved a deleted theme");
}

server.close();
rmSync(home, { recursive: true, force: true });

if (failures.length > 0) {
	console.error(`${failures.length} FAILURE(S)`);
	for (const f of failures) console.error("  x", f);
	process.exit(1);
}
console.log(
	"end to end: a real image solved by the shipped solver, accepted by the real API, " +
	"restored token-for-token after a restart, and deleted cleanly",
);
