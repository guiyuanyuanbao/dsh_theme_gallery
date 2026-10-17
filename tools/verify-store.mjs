/**
 * The custom-theme store, exercised against a real temporary directory.
 *
 * `store.js` is the only part of this plugin that writes to the user's disk, so
 * it is tested against a real filesystem rather than a stub: the atomicity of
 * the index write, the survival of a truncated index, and the removal ordering
 * are all properties of the syscalls, not of the code's shape.
 *
 * The URL fetch is tested against an injected `fetch`, which is why that
 * parameter exists.
 *
 * Usage: node verify-store.mjs
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { MAX_IMAGE_BYTES, Store, fetchImage, newThemeId, sniffImage } from "./../store.js";

const failures = [];
const check = (ok, message) => {
	if (!ok) failures.push(message);
};

const home = mkdtempSync(join(tmpdir(), "gallery-store-"));
const store = new Store(home);

/** A minimal valid JPEG: SOI + APP0 + EOI. Enough for the signature check. */
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0xff, 0xd9]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);

/** One complete stored record. */
const record = (id, title = "Test") => ({
	id,
	title,
	image: `${id}.jpg`,
	added: 1700000000000,
	palette: {
		tokens: { light: { "--dsw-alias-bg-base": "#fff" }, dark: { "--dsw-alias-bg-base": "#000" } },
		scrim: { light: "rgba(1,2,3,0.10)", dark: "rgba(1,2,3,0.20)" },
		floor: { light: "#f0f0f0", dark: "#101010" },
	},
});

// ---------------------------------------------------------------- signatures

check(sniffImage(JPEG) === "image/jpeg", `JPEG sniffed as ${sniffImage(JPEG)}`);
check(sniffImage(PNG) === "image/png", `PNG sniffed as ${sniffImage(PNG)}`);
check(sniffImage(new TextEncoder().encode("<!doctype html>")) === undefined, "HTML was accepted as an image");
check(sniffImage(new TextEncoder().encode('{"error":"nope"}')) === undefined, "JSON was accepted as an image");
check(sniffImage(new Uint8Array()) === undefined, "an empty buffer was accepted as an image");
check(sniffImage(new Uint8Array([0xff])) === undefined, "a one-byte buffer was accepted as an image");
{
	// AVIF carries its brand at offset 4, so a naive prefix test would accept
	// any ISO-BMFF file — including an MP4.
	const avif = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66]);
	const mp4 = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]);
	check(sniffImage(avif) === "image/avif", `AVIF sniffed as ${sniffImage(avif)}`);
	check(sniffImage(mp4) === undefined, "an MP4 was accepted as an image");
}

// ------------------------------------------------------------------- storage

// A fresh home is an empty library, not an error.
{
	const fresh = new Store(join(home, "fresh"));
	const { themes, error } = await fresh.read();
	check(themes.length === 0, `a fresh store has ${themes.length} themes`);
	check(error === undefined, `a fresh store reported an error: ${error}`);
}

// Add, read back, and confirm the image landed.
{
	const id = newThemeId();
	check(/^[a-z0-9-]{4,64}$/.test(id), `generated id ${id} is not a safe file name`);
	await store.putImage(id, JPEG);
	await store.mutate((themes) => [...themes, record(id, "第一张")]);
	const { themes } = await store.read();
	check(themes.length === 1, `after one add, ${themes.length} themes`);
	check(themes[0]?.title === "第一张", `title round-tripped as ${themes[0]?.title}`);
	check(existsSync(store.imagePath(`${id}.jpg`)), "the image was not written");
	const onDisk = JSON.parse(readFileSync(store.indexPath, "utf8"));
	check(onDisk.version === 1, `index version is ${onDisk.version}`);
}

// Two concurrent adds must both survive: the writer chain is what guarantees it.
{
	const before = (await store.read()).themes.length;
	const ids = [newThemeId(), newThemeId(), newThemeId()];
	await Promise.all(ids.map(async (id) => {
		await store.putImage(id, JPEG);
		await store.mutate((themes) => [...themes, record(id, `并发 ${id}`)]);
	}));
	const after = (await store.read()).themes;
	check(after.length === before + 3, `three concurrent adds left ${after.length - before} of 3 themes`);
	for (const id of ids) check(after.some((t) => t.id === id), `concurrent add ${id} was lost`);
}

// A rename is a read-modify-write of the same record.
{
	const { themes } = await store.read();
	const target = themes[0];
	await store.mutate((list) => list.map((t) => (t.id === target.id ? { ...t, title: "改名" } : t)));
	const again = await store.get(target.id);
	check(again?.title === "改名", `rename produced ${again?.title}`);
}

// Removing a theme removes its image too, and only its image.
{
	const { themes } = await store.read();
	const victim = themes[0];
	const survivor = themes[1];
	const removed = await store.remove(victim.id);
	check(removed === true, "remove() reported the theme did not exist");
	check(!existsSync(store.imagePath(victim.image)), "the removed theme's image is still on disk");
	check(existsSync(store.imagePath(survivor.image)), "removing one theme deleted another's image");
	check((await store.get(victim.id)) === undefined, "the removed theme is still in the index");
	check((await store.remove(victim.id)) === false, "removing twice reported success");
}

// A record missing its palette is skipped, so the user cannot select a theme
// that would apply no tokens.
{
	const id = newThemeId();
	await store.mutate((themes) => [...themes, { id, title: "half", image: `${id}.jpg` }]);
	const { themes } = await store.read();
	check(!themes.some((t) => t.id === id), "a record with no palette was offered as a theme");
	await store.mutate((list) => list.filter((t) => t.id !== id));
}

// A record whose id would escape the image directory is skipped.
{
	for (const bad of ["../../etc/passwd", "a/b", "..", "", "x".repeat(65)]) {
		await store.mutate((themes) => [...themes, { ...record("placeholder"), id: bad }]);
	}
	const { themes } = await store.read();
	const leaked = themes.filter((t) => !/^[a-z0-9-]{4,64}$/.test(t.id));
	check(leaked.length === 0, `unsafe ids survived the read: ${leaked.map((t) => t.id).join(", ")}`);
}

// -------------------------------------------------------------- bad indexes

// A truncated index must not throw, and must not lose the file: the user can
// still repair it by hand.
{
	const path = store.indexPath;
	const good = readFileSync(path, "utf8");
	writeFileSync(path, good.slice(0, Math.floor(good.length / 2)), "utf8");
	const { themes, error } = await store.read();
	check(themes.length === 0, `a truncated index produced ${themes.length} themes`);
	check(typeof error === "string" && error.length > 0, "a truncated index reported no error");
	// And the store recovers on the next write.
	await store.mutate(() => [record(newThemeId(), "after corruption")]);
	check((await store.read()).themes.length === 1, "the store did not recover from a corrupt index");
	writeFileSync(path, good, "utf8");
}

// An index that is valid JSON but not an object, or has no themes array.
{
	for (const junk of ["null", "42", '"a string"', "[]", "{}", '{"themes":"nope"}']) {
		writeFileSync(store.indexPath, junk, "utf8");
		const { themes } = await store.read();
		check(Array.isArray(themes) && themes.length === 0, `index ${junk} produced ${JSON.stringify(themes)}`);
	}
}

// An index larger than the ceiling is refused rather than parsed.
{
	writeFileSync(store.indexPath, `{"themes":[]}${" ".repeat(5 * 1024 * 1024)}`, "utf8");
	const { error } = await store.read();
	check(typeof error === "string", "an oversized index reported no error");
	rmSync(store.indexPath, { force: true });
}

// The atomic write must leave no temporary files behind.
{
	await store.mutate(() => [record(newThemeId(), "clean")]);
	const leftovers = (await import("node:fs")).readdirSync(store.root).filter((name) => name.endsWith(".tmp"));
	check(leftovers.length === 0, `temporary files were left behind: ${leftovers.join(", ")}`);
}

// ------------------------------------------------------------ the URL fetch

const okImage = (bytes = JPEG, type = "image/jpeg", extra = {}) => async () => ({
	ok: true,
	status: 200,
	statusText: "OK",
	headers: new Headers({ "content-type": type, ...extra }),
	body: undefined,
	arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
});

const cases = [
	["a plain image URL", "https://example.com/a.jpg", okImage(), true, undefined],
	["a PNG", "https://example.com/a.png", okImage(PNG, "image/png"), true, undefined],
	["a 404", "https://example.com/missing.jpg", async () => ({ ok: false, status: 404, statusText: "Not Found", headers: new Headers() }), false, "404"],
	["an HTML error page", "https://example.com/x", okImage(new TextEncoder().encode("<!doctype html><h1>hi"), "text/html"), false, "not an image"],
	["a JSON error", "https://example.com/x", okImage(new TextEncoder().encode('{"a":1}'), "application/json"), false, "application/json"],
	["an empty body", "https://example.com/x", okImage(new Uint8Array(), "image/jpeg"), false, "empty"],
	["a file URL", "file:///C:/Windows/win.ini", okImage(), false, "http and https"],
	["a javascript URL", "javascript:alert(1)", okImage(), false, "http and https"],
	["a data URL", "data:image/png;base64,AAAA", okImage(), false, "http and https"],
	["not a URL", "just some words", okImage(), false, "valid URL"],
	["an oversized declared length", "https://example.com/x", okImage(JPEG, "image/jpeg", { "content-length": String(MAX_IMAGE_BYTES + 1) }), false, "limit"],
];

for (const [label, url, impl, shouldPass, expect] of cases) {
	let result;
	let error;
	try {
		result = await fetchImage(url, impl);
	} catch (thrown) {
		error = thrown;
	}
	if (shouldPass) {
		check(error === undefined, `${label}: rejected with ${error?.message}`);
		check(result?.bytes?.length === (url.endsWith(".png") ? PNG.length : JPEG.length), `${label}: wrong byte count`);
	} else {
		check(error !== undefined, `${label}: was accepted`);
		if (error !== undefined && expect !== undefined) {
			check(error.message.includes(expect), `${label}: message ${JSON.stringify(error.message)} does not mention ${JSON.stringify(expect)}`);
		}
	}
}

// A stream that exceeds the ceiling is cut off DURING the read, so a server
// that lies about its length cannot exhaust memory.
{
	let pulled = 0;
	const chunk = new Uint8Array(1024 * 1024);
	const endless = async () => ({
		ok: true,
		status: 200,
		statusText: "OK",
		headers: new Headers({ "content-type": "image/jpeg" }),
		body: {
			getReader: () => ({
				read: async () => {
					pulled++;
					if (pulled > 100) return { done: true, value: undefined };
					return { done: false, value: chunk };
				},
				cancel: async () => {
					pulled = -1;
				},
			}),
		},
	});
	let error;
	try {
		await fetchImage("https://example.com/endless.jpg", endless);
	} catch (thrown) {
		error = thrown;
	}
	check(error !== undefined, "an endless stream was accepted");
	check(error?.message.includes("limit"), `an endless stream failed with ${JSON.stringify(error?.message)}`);
	check(pulled === -1, "the endless stream was not cancelled after the ceiling");
	check(pulled !== 100, "the reader ran to completion instead of stopping at the ceiling");
}

// A redirect to a non-http scheme is refused by the platform fetch; the
// important half is that we do not follow it ourselves.
{
	let requested;
	const impl = async (url) => {
		requested = url;
		return { ok: false, status: 302, statusText: "Found", headers: new Headers({ location: "file:///etc/passwd" }) };
	};
	let error;
	try {
		await fetchImage("https://example.com/redirect", impl);
	} catch (thrown) {
		error = thrown;
	}
	check(error !== undefined, "a 302 was treated as success");
	check(requested === "https://example.com/redirect", `the fetch was sent to ${requested}`);
}

// A relative URL is not a URL.
{
	let error;
	try {
		await fetchImage("/local/path.jpg", async () => ({ ok: true, headers: new Headers() }));
	} catch (thrown) {
		error = thrown;
	}
	check(error !== undefined, "a relative path was accepted as a URL");
}

rmSync(home, { recursive: true, force: true });

if (failures.length > 0) {
	console.error(`${failures.length} FAILURE(S)`);
	for (const f of failures) console.error("  x", f);
	process.exit(1);
}
console.log(`store: signatures, ${cases.length} fetch cases, atomicity, concurrency, corruption recovery — all passed`);

