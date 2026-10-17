/**
 * The Host API, exercised over real HTTP against a real store.
 *
 * The routes are the trust boundary: the browser posts a palette and image
 * bytes that it computed, and the Host decides what to write to the user's
 * disk and what to serve back. So this drives the actual handler through
 * `node:http` rather than calling its functions, because the properties worth
 * checking — body limits, method handling, path traversal, status codes — are
 * properties of the HTTP surface.
 *
 * Usage: node verify-api.mjs
 */
import { createServer } from "node:http";
import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MAX_IMAGE_BYTES, Store } from "./../store.js";

const failures = [];
const check = (ok, message) => {
	if (!ok) failures.push(message);
};

// The handler under test is `api()` in index.js, which is not exported. Rather
// than widen the module's surface for a test, the router is rebuilt here from
// the same pieces: this file's job is to prove the CONTRACT (paths, methods,
// validation, limits), and a router that drifts from the real one would fail
// the end-to-end check in verify-host.mjs, which drives the real `apply`.
const ROUTE = "/theme-gallery";

/** A minimal valid JPEG. */
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9]);

/** A complete, valid palette payload: 113 tokens per mode. */
function goodPalette() {
	const tokens = (base) => {
		const out = {};
		for (let i = 0; i < 113; i++) out[`--dsw-alias-token-${i}`] = i % 2 === 0 ? base : "rgba(10, 20, 30, 0.44)";
		return out;
	};
	return {
		tokens: { light: tokens("#fdfdfe"), dark: tokens("#0a0c12") },
		scrim: { light: "rgba(241, 242, 246, 0.18)", dark: "rgba(14, 18, 29, 0.18)" },
		floor: { light: "#f6f7f9", dark: "#0c0f18" },
		analysis: { hue_mid: 225, median: "#323f6c" },
	};
}

const home = mkdtempSync(join(tmpdir(), "gallery-api-"));
const store = new Store(home);
const { api } = await import("./../api.js");
const handle = api(store);

const server = createServer((req, res) => {
	handle(req, res).catch((error) => {
		res.writeHead(500, { "content-type": "application/json" });
		res.end(JSON.stringify({ error: String(error) }));
	});
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}${ROUTE}/api`;

/** One request, with the status and parsed body returned rather than thrown. */
async function call(action, { method = "GET", body, headers = {}, raw } = {}) {
	const init = { method, headers: { ...headers } };
	if (raw !== undefined) {
		init.body = raw;
	} else if (body !== undefined) {
		init.body = JSON.stringify(body);
		init.headers["content-type"] = "application/json";
	}
	const response = await fetch(`${base}/${action}`, init);
	const text = await response.text();
	let json;
	try {
		json = JSON.parse(text);
	} catch {
		json = undefined;
	}
	return { status: response.status, json, text, headers: response.headers };
}

// ------------------------------------------------------------ the empty library

{
	const r = await call("themes");
	check(r.status === 200, `GET themes on an empty library returned ${r.status}`);
	check(Array.isArray(r.json?.themes) && r.json.themes.length === 0, `empty library returned ${r.text}`);
}

// ------------------------------------------------------------------ adding

let added;
/**
 * How many uploads have been ACCEPTED so far.
 *
 * Every later count is taken against this instead of an absolute number: the
 * assertions below are about what a rejected request did or did not write, and
 * an absolute figure silently rewrites their meaning whenever a case is added
 * above them.
 */
let successes = 0;
{
	const r = await call("add", {
		method: "POST",
		body: { source: "upload", title: "我的壁纸", data: JPEG.toString("base64"), palette: goodPalette() },
	});
	check(r.status === 200, `a valid upload returned ${r.status}: ${r.text}`);
	check(typeof r.json?.id === "string" && /^[a-z0-9-]{4,64}$/.test(r.json.id), `id is ${JSON.stringify(r.json?.id)}`);
	check(r.json?.title === "我的壁纸", `title round-tripped as ${JSON.stringify(r.json?.title)}`);
	added = r.json;
	successes++;
}

{
	const r = await call("themes");
	check(r.json?.themes?.length === 1, `after one add, ${r.json?.themes?.length} themes`);
	// The list must NOT carry the token tables: rendering a card needs a name and
	// an image, and 20 KB of palette per theme would be shipped to draw a list.
	const entry = r.json?.themes?.[0];
	check(entry?.palette === undefined, "the theme list leaked the full palette");
	check(typeof entry?.worstContrast === "number", `the list has no worstContrast: ${JSON.stringify(entry)}`);
	check(existsSync(store.imagePath(`${added.id}.jpg`)), "the uploaded image was not written");
}

{
	const r = await call(`theme?id=${added.id}`);
	check(r.status === 200, `GET theme returned ${r.status}`);
	check(Object.keys(r.json?.palette?.tokens?.light ?? {}).length === 113, "the fetched theme lost tokens");
	check(r.json?.palette?.floor?.dark === "#0c0f18", `floor is ${r.json?.palette?.floor?.dark}`);
}

// --------------------------------------------------------------- validation

const bad = [
	["no palette", { source: "upload", data: JPEG.toString("base64") }, "palette"],
	["a palette with no dark table", { source: "upload", data: JPEG.toString("base64"), palette: { tokens: { light: { "--dsw-a": "#fff" } } } }, "light scrim"],
	["a palette with dark tokens but no dark scrim", {
		source: "upload", data: JPEG.toString("base64"),
		palette: { tokens: goodPalette().tokens, scrim: { light: "rgba(1,2,3,0.1)" }, floor: goodPalette().floor },
	}, "dark scrim"],
	["too few tokens", { source: "upload", data: JPEG.toString("base64"), palette: { ...goodPalette(), tokens: { light: { "--dsw-a": "#fff" }, dark: { "--dsw-a": "#000" } } } }, "only"],
	["a non-token name", {
		source: "upload", data: JPEG.toString("base64"),
		palette: { ...goodPalette(), tokens: { light: { ...goodPalette().tokens.light, "color": "#fff" }, dark: goodPalette().tokens.dark } },
	}, "not a theme token"],
	["a colour that breaks out of the declaration", {
		source: "upload", data: JPEG.toString("base64"),
		palette: { ...goodPalette(), tokens: { light: { ...goodPalette().tokens.light, "--dsw-alias-bg-base": "red;}html{display:none" }, dark: goodPalette().tokens.dark } },
	}, "not a CSS colour"],
	["a missing scrim", { source: "upload", data: JPEG.toString("base64"), palette: { ...goodPalette(), scrim: { light: "rgba(1,2,3,0.1)" } } }, "dark scrim"],
	["no image data", { source: "upload", palette: goodPalette() }, "no image data"],
	["data that is not base64", { source: "upload", data: "not base64 !!!", palette: goodPalette() }, "base64"],
	["bytes that are not an image", { source: "upload", data: Buffer.from("<html>hi</html>").toString("base64"), palette: goodPalette() }, "not a JPEG"],
	["an empty image", { source: "upload", data: "", palette: goodPalette() }, "no image data"],
	["an unknown source", { source: "magic", data: JPEG.toString("base64"), palette: goodPalette() }, "unknown source"],
	["a URL with no url", { source: "url", palette: goodPalette() }, "no URL"],
	["a file URL", { source: "url", url: "file:///C:/Windows/win.ini", palette: goodPalette() }, "http and https"],
];

for (const [label, body, expect] of bad) {
	const r = await call("add", { method: "POST", body });
	check(r.status === 400, `${label}: returned ${r.status}, expected 400 (${r.text.slice(0, 120)})`);
	check(
		typeof r.json?.error === "string" && r.json.error.toLowerCase().includes(expect.toLowerCase()),
		`${label}: error ${JSON.stringify(r.json?.error)} does not mention ${JSON.stringify(expect)}`,
	);
}

// Malformed JSON, and a body that is not JSON at all.
{
	const r = await call("add", { method: "POST", raw: "{not json", headers: { "content-type": "application/json" } });
	check(r.status === 400, `malformed JSON returned ${r.status}`);
	check(r.json?.error?.includes("JSON"), `malformed JSON said ${JSON.stringify(r.json?.error)}`);
}

// An oversized body is refused, and refused without buffering it all.
//
// The ceiling is derived from the image limit rather than a round number, so
// the test scales with it: a hard-coded 3 MB would stop testing the ceiling the
// moment the ceiling moved past it.
{
	const bodyLimit = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 1024 * 1024;
	const huge = JSON.stringify({ source: "upload", data: "A".repeat(bodyLimit + 1024), palette: goodPalette() });
	const r = await call("add", { method: "POST", raw: huge, headers: { "content-type": "application/json" } });
	check(r.status === 400, `an oversized body returned ${r.status}`);
	check(r.json?.error?.toLowerCase().includes("limit"), `an oversized body said ${JSON.stringify(r.json?.error)}`);
}

// A realistic upload must FIT. The client re-encodes at 2560px q86, and the
// base64 of a detailed image of that size is the largest legitimate body this
// API will ever see, so the ceiling has to clear it. This guards the exact
// regression a round-number limit caused: a correct upload rejected as too
// large, with an error that named the wrong limit.
{
	const realistic = Buffer.alloc(1024 * 1024 * 1.5);
	realistic.fill(0x42);
	realistic.set([0xff, 0xd8, 0xff], 0);
	const data = `data:image/jpeg;base64,${realistic.toString("base64")}`;
	const payload = JSON.stringify({ source: "upload", title: "大图", data, palette: goodPalette() });
	const bodyLimit = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 1024 * 1024;
	check(
		Buffer.byteLength(payload) < bodyLimit,
		`a 1.5 MB image produced a ${Math.round(Buffer.byteLength(payload) / 1024)} KB body, over the ${Math.round(bodyLimit / 1024)} KB limit`,
	);
	const r = await call("add", { method: "POST", raw: payload, headers: { "content-type": "application/json" } });
	check(r.status === 200, `a 1.5 MB image was rejected: ${r.status} ${r.text.slice(0, 160)}`);
	if (r.status === 200) successes++;
}

// A bad request must not have written anything. The count is taken relative to
// what the SUCCESSFUL cases above legitimately created — one theme per accepted
// upload — so this keeps its meaning as cases are added.
{
	const expected = successes;
	const r = await call("themes");
	check(
		r.json?.themes?.length === expected,
		`the library holds ${r.json?.themes?.length} themes, but only ${expected} successful adds ran — a rejected request wrote something`,
	);
}

// ------------------------------------------------------- the URL probe
//
// `probe` fetches bytes for the browser to analyse, and must NOT create a
// library entry: the palette cannot exist yet, so a record written here would
// be one the library hides and nobody deletes.
{
	const before = (await call("themes")).json?.themes?.length;
	const r = await call("probe", { method: "POST", body: { url: "file:///C:/Windows/win.ini" } });
	check(r.status === 400, `probing a file URL returned ${r.status}`);
	check(r.json?.error?.includes("http and https"), `probing a file URL said ${JSON.stringify(r.json?.error)}`);

	const noUrl = await call("probe", { method: "POST", body: {} });
	check(noUrl.status === 400, `probing with no URL returned ${noUrl.status}`);

	const after = (await call("themes")).json?.themes?.length;
	check(after === before, `probe changed the library: ${before} -> ${after}`);
}

// The URL fetch is exercised against a local server, so the whole path —
// fetch, sniff, base64 — runs for real rather than against an injected stub.
{
	const image = createServer((_req, res) => {
		res.writeHead(200, { "content-type": "image/jpeg", "content-length": String(JPEG.length) });
		res.end(JPEG);
	});
	await new Promise((resolve) => image.listen(0, "127.0.0.1", resolve));
	const imageUrl = `http://127.0.0.1:${image.address().port}/a.jpg`;

	const ok = await call("probe", { method: "POST", body: { url: imageUrl } });
	check(ok.status === 200, `probing a real image returned ${ok.status}: ${ok.text.slice(0, 120)}`);
	check(ok.json?.type === "image/jpeg", `probe reported type ${ok.json?.type}`);
	check(Buffer.from(ok.json?.data ?? "", "base64").equals(JPEG), "probe did not round-trip the bytes");
	check(ok.json?.bytes === JPEG.length, `probe reported ${ok.json?.bytes} bytes`);

	// The fetched bytes can be handed straight back as an upload, which is the
	// flow the client uses for a URL.
	const added = await call("add", {
		method: "POST",
		body: { source: "upload", title: "来自链接", data: ok.json.data, palette: goodPalette() },
	});
	check(added.status === 200, `adding the probed image returned ${added.status}`);
	successes++;

	// A server answering with HTML must be refused.
	const html = createServer((_req, res) => {
		res.writeHead(200, { "content-type": "text/html" });
		res.end("<html>not an image</html>");
	});
	await new Promise((resolve) => html.listen(0, "127.0.0.1", resolve));
	const bad = await call("probe", { method: "POST", body: { url: `http://127.0.0.1:${html.address().port}/` } });
	check(bad.status === 400, `probing HTML returned ${bad.status}`);
	check(bad.json?.error?.includes("not an image"), `probing HTML said ${JSON.stringify(bad.json?.error)}`);

	// A connection that is refused must be a clean error, not a crash.
	const dead = await call("probe", { method: "POST", body: { url: "http://127.0.0.1:1/none.jpg" } });
	check(dead.status === 400, `probing a dead port returned ${dead.status}`);
	check(typeof dead.json?.error === "string", "probing a dead port returned no error message");

	image.close();
	html.close();
}

// ------------------------------------------------------------------ renaming

{
	const r = await call("rename", { method: "POST", body: { id: added.id, title: "  新   名字  " } });
	check(r.status === 200, `rename returned ${r.status}`);
	check(r.json?.title === "新 名字", `rename normalised to ${JSON.stringify(r.json?.title)}`);
}

{
	// Control characters and an essay both have to be tamed, because the title
	// is rendered in Settings and stored in the JSON index.
	const r = await call("rename", { method: "POST", body: { id: added.id, title: `a\u0000b\nc${"x".repeat(200)}` } });
	check(r.status === 200, `rename with junk returned ${r.status}`);
	check(!/[\u0000-\u001f]/.test(r.json?.title ?? ""), `the title kept control characters: ${JSON.stringify(r.json?.title)}`);
	check((r.json?.title ?? "").length <= 60, `the title is ${r.json?.title?.length} characters`);
}

{
	const r = await call("rename", { method: "POST", body: { id: "nosuchtheme", title: "x" } });
	check(r.status === 404, `renaming an unknown theme returned ${r.status}`);
}

{
	const r = await call("rename", { method: "POST", body: { title: "x" } });
	check(r.status === 400, `renaming without an id returned ${r.status}`);
}

// ------------------------------------------------------------------ removing
//
// The probe section above added a theme of its own, so every count from here on
// is taken relative to the library rather than against an absolute number —
// otherwise adding a case earlier in the file silently rewrites the meaning of
// a later assertion.
{
	const before = (await call("themes")).json?.themes ?? [];
	const victim = before.find((theme) => theme.title === "我的壁纸") ?? before[0];
	const r = await call("remove", { method: "POST", body: { id: victim.id } });
	check(r.status === 200, `remove returned ${r.status}`);
	check(!existsSync(store.imagePath(`${victim.id}.jpg`)), "remove left the image on disk");
	const after = (await call("themes")).json?.themes ?? [];
	check(after.length === before.length - 1, `remove left ${after.length} of ${before.length} themes`);
	check(!after.some((theme) => theme.id === victim.id), "remove left the theme in the library");
	added = victim;
}

{
	const r = await call("remove", { method: "POST", body: { id: added.id } });
	check(r.status === 404, `removing twice returned ${r.status}`);
}

// ------------------------------------------------------- methods and paths

{
	for (const [action, method] of [["themes", "POST"], ["add", "GET"], ["remove", "GET"], ["rename", "GET"], ["theme", "POST"]]) {
		const r = await call(action, { method, body: method === "POST" ? {} : undefined });
		check(r.status === 404 || r.status === 405, `${method} ${action} returned ${r.status}, expected 404 or 405`);
	}
}

{
	const r = await call("nonsense");
	check(r.status === 404, `an unknown action returned ${r.status}`);
	check(r.json?.error?.includes("unknown action"), `an unknown action said ${JSON.stringify(r.json?.error)}`);
}

// The image route must refuse a name no theme claims, and must not be talked
// into serving a path. These go through the store directly, because the file
// route lives in the router in index.js; verify-host.mjs drives that one.
{
	for (const name of ["../../package.json", "..%2f..%2fpackage.json", "index.js", "nosuch.jpg", ""]) {
		const { themes } = await store.read();
		const claimed = themes.some((theme) => theme.image === name);
		check(!claimed, `the store claims ${JSON.stringify(name)} as an image`);
	}
}

// ------------------------------------------------------------- persistence

{
	// A theme written through the API must survive a brand-new Store over the
	// same home, which is what a restart looks like.
	const r = await call("add", {
		method: "POST",
		body: { source: "upload", title: "持久化", data: JPEG.toString("base64"), palette: goodPalette() },
	});
	check(r.status === 200, `the persistence add returned ${r.status}`);
	const written = (await call("themes")).json?.themes?.length ?? 0;
	const reopened = new Store(home);
	const { themes } = await reopened.read();
	check(themes.length === written, `a fresh store saw ${themes.length} themes, the API reported ${written}`);
	const mine = themes.find((theme) => theme.title === "持久化");
	check(mine !== undefined, "the persisted theme is missing from the reopened library");
	check(Object.keys(mine?.palette?.tokens?.dark ?? {}).length === 113, "the reopened theme lost its dark palette");
	// And the synchronous boot cache, which is what paints before first paint.
	const fresh = new Store(home);
	await fresh.refresh();
	check(fresh.cached(mine.id)?.wallpaper === mine.image, "the boot cache did not resolve the theme");
	check(fresh.cached("nosuch") === undefined, "the boot cache resolved an unknown id");
	check(Object.keys(fresh.cachedAll()).length === themes.length, "cachedAll did not return the whole library");
	check(fresh.cachedAll()[mine.id]?.tokens?.light !== undefined, "cachedAll dropped the token tables");
	// The index on disk must be valid JSON with a version marker.
	const onDisk = JSON.parse(readFileSync(reopened.indexPath, "utf8"));
	check(onDisk.version === 1, `the index version is ${onDisk.version}`);
}

server.close();
rmSync(home, { recursive: true, force: true });

if (failures.length > 0) {
	console.error(`${failures.length} FAILURE(S)`);
	for (const f of failures) console.error("  x", f);
	process.exit(1);
}
console.log(`api: ${bad.length + 12} rejection cases, add/get/rename/remove, persistence across reopen — all passed`);



