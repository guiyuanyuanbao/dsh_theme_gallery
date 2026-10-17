/**
 * The custom-theme store.
 *
 * A theme the user adds is two things: image bytes, and the palette derived
 * from them. Both live here, under `$DSH_HOME/theme-gallery/v1/`:
 *
 *     ~/.dsh/theme-gallery/v1/index.json      the library: id, title, palette
 *     ~/.dsh/theme-gallery/v1/images/<id>.jpg the artwork, as re-encoded
 *
 * ## Why the library is a directory and not a Config field
 *
 * The plugin's `Config` is the right home for a *choice* — which wallpaper,
 * how much dimming — and it is the wrong home for a *library*. A single
 * palette is 113 tokens per mode, about 20 KB of JSON; ten custom themes in
 * `cordis.patch.yml` would be 200 KB of generated colour values in a file the
 * user is invited to read and edit, and every Settings write would rewrite all
 * of it. So the split is:
 *
 *   - the library is data, and lives in the Harness home next to the
 *     attachments the Harness already stores there;
 *   - the selection is a preference, and lives in the profile patch.
 *
 * The consequence worth stating: the library is **per Harness home** and the
 * selection is **per profile**, so two profiles share one library and each
 * remembers its own wallpaper. That is the behaviour a library should have.
 *
 * ## Why every write is a rename
 *
 * `index.json` is read on every index render (the boot script needs the
 * selected theme's floor colour before the first paint) and rewritten on every
 * add, rename, or delete. A write that is interrupted halfway leaves a
 * truncated file, and a truncated index means the selected wallpaper silently
 * disappears — the boot script finds no entry and paints the plain canvas. So
 * the write goes to a temporary file in the same directory and is then renamed
 * over the target, which is atomic on both NTFS and POSIX. The shipped
 * attachment service stages its objects the same way.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { dshHomePath } from "@deepseek-ai/dsh-home-paths";

/** Store layout version. A future format change writes a sibling directory. */
const VERSION = "v1";

/** Largest accepted image, in bytes. Matches the Harness attachment ceiling. */
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** Largest accepted index, so a corrupt file cannot exhaust memory. */
const MAX_INDEX_BYTES = 4 * 1024 * 1024;

/** How long a URL fetch may take before it is abandoned. */
export const FETCH_TIMEOUT_MS = 15000;

/** Magic bytes for the image formats the browser can decode. */
const SIGNATURES = [
	["image/jpeg", [0xff, 0xd8, 0xff]],
	["image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
	["image/gif", [0x47, 0x49, 0x46, 0x38]],
	["image/webp", [0x52, 0x49, 0x46, 0x46]],
	["image/bmp", [0x42, 0x4d]],
	["image/avif", [0x00, 0x00, 0x00]],
];

/**
 * Identify an image from its leading bytes.
 *
 * The Host has no image decoder, so this is the only check it can make on its
 * own. It is deliberately shallow: its job is to reject a text file or an HTML
 * error page before it is stored and served back as an image, not to validate
 * the image. The browser already decoded the picture to derive the palette, so
 * anything that reaches here has been decoded once; this is the second,
 * independent look at the bytes that will actually be written to disk.
 *
 * @param {Uint8Array} bytes - the candidate image.
 * @returns {string|undefined} the media type, or undefined when unrecognised.
 */
export function sniffImage(bytes) {
	for (const [type, signature] of SIGNATURES) {
		if (bytes.length < signature.length) continue;
		// AVIF is ISO-BMFF, so the format marker is the `ftyp` box at offset 4
		// and the real answer is the BRAND at offset 8. Checking only for `ftyp`
		// would accept an MP4, which shares the box; only the AVIF brands count.
		if (type === "image/avif") {
			if (bytes.length < 12) continue;
			const box = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
			if (box !== "ftyp") continue;
			const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
			if (brand === "avif" || brand === "avis") return type;
			continue;
		}
		if (signature.every((byte, i) => bytes[i] === byte)) return type;
	}
	return undefined;
}

/**
 * A store handle over one Harness home.
 *
 * All mutation goes through {@link Store#mutate}, which serialises writers on a
 * promise chain: two adds racing would otherwise read the same index and the
 * second write would drop the first theme.
 */
export class Store {
	/** @param {string} [home] - explicit Harness home; defaults to the shipped resolution. */
	constructor(home) {
		this.root = home === undefined ? dshHomePath("theme-gallery", VERSION) : join(home, "theme-gallery", VERSION);
		this.images = join(this.root, "images");
		this.indexPath = join(this.root, "index.json");
		/** Serialises writers; readers never wait. */
		this.tail = Promise.resolve();
		/** Last read library, keyed by id, for the synchronous boot path. */
		this.cache = new Map();
	}

	/**
	 * The selected theme's record, synchronously, or undefined.
	 *
	 * `webserver/index-inject` is a synchronous emit: a listener that returned a
	 * promise would have it ignored, and the row would be built from whatever
	 * the library looked like at the last refresh. So the library is mirrored
	 * into a Map after every read and write, and this reads that mirror. A miss
	 * is not an error — it means the selection names a theme that was deleted,
	 * and the caller paints the plain canvas.
	 *
	 * The record is reshaped into the same form the generated `GALLERY` entries
	 * have (`wallpaper`, `scrim`, `floor`), so the boot builder does not need to
	 * know which kind of theme it was handed.
	 *
	 * @param {string} id - the selected theme id.
	 * @returns {object|undefined} the boot entry, or undefined.
	 */
	cached(id) {
		const theme = this.cache.get(id);
		if (theme === undefined) return undefined;
		return {
			wallpaper: theme.image,
			scrim: theme.palette.scrim,
			floor: theme.palette.floor,
		};
	}

	/**
	 * Reload the cache from disk.
	 *
	 * @returns {Promise<object[]>} the library, as read.
	 */
	async refresh() {
		const { themes } = await this.read();
		this.cache = new Map(themes.map((theme) => [theme.id, theme]));
		return themes;
	}

	/**
	 * Every custom theme's boot entry, synchronously.
	 *
	 * The client half needs all of them: it applies the selected theme's token
	 * layer itself, and it draws a card per theme in Settings, so it needs each
	 * palette without a round trip per theme.
	 *
	 * @returns {Record<string, object>} id to boot entry, including tokens.
	 */
	cachedAll() {
		const out = {};
		for (const [id, theme] of this.cache) {
			out[id] = {
				title: theme.title,
				wallpaper: theme.image,
				scrim: theme.palette.scrim,
				floor: theme.palette.floor,
				tokens: theme.palette.tokens,
				analysis: theme.palette.analysis,
				custom: true,
			};
		}
		return out;
	}

	/** Create the directory tree. Idempotent. */
	async ensure() {
		await mkdir(this.images, { recursive: true });
	}

	/**
	 * Read the library.
	 *
	 * A missing file is an empty library, which is the state of every fresh
	 * install. A file that exists but cannot be parsed is also reported as
	 * empty, with the parse error attached: refusing to start would make a
	 * single bad byte in a data file cost the whole plugin, and silently
	 * pretending it is fine would hide a real corruption. The caller decides.
	 *
	 * @returns {Promise<{themes: object[], error?: string}>}
	 */
	async read() {
		if (!existsSync(this.indexPath)) return { themes: [] };
		let text;
		try {
			const stat = await readFile(this.indexPath);
			if (stat.length > MAX_INDEX_BYTES) return { themes: [], error: "index.json is implausibly large" };
			text = stat.toString("utf8");
		} catch (error) {
			return { themes: [], error: `index.json could not be read: ${error.message}` };
		}
		try {
			const parsed = JSON.parse(text);
			const themes = Array.isArray(parsed?.themes) ? parsed.themes.filter(isUsableTheme) : [];
			return { themes };
		} catch (error) {
			return { themes: [], error: `index.json is not valid JSON: ${error.message}` };
		}
	}

	/**
	 * Read one theme by id.
	 *
	 * @param {string} id - the theme id.
	 * @returns {Promise<object|undefined>} the record, or undefined.
	 */
	async get(id) {
		const { themes } = await this.read();
		return themes.find((theme) => theme.id === id);
	}

	/**
	 * Run one read-modify-write against the index, serialised.
	 *
	 * @param {(themes: object[]) => object[]|Promise<object[]>} change - returns the new library.
	 * @returns {Promise<object[]>} the library as written.
	 */
	async mutate(change) {
		const run = this.tail.then(async () => {
			const { themes } = await this.read();
			const next = await change(themes);
			await this.write(next);
			// The mirror is updated inside the serialised section, so a
			// concurrent reader can never observe the cache ahead of the disk.
			this.cache = new Map(next.map((theme) => [theme.id, theme]));
			return next;
		});
		// Keep the chain alive after a rejection, or one failed write would wedge
		// every later one.
		this.tail = run.then(
			() => undefined,
			() => undefined,
		);
		return run;
	}

	/**
	 * Write the library atomically.
	 *
	 * @param {object[]} themes - the complete library.
	 */
	async write(themes) {
		await this.ensure();
		const temporary = `${this.indexPath}.${process.pid}.tmp`;
		await writeFile(temporary, JSON.stringify({ version: 1, themes }, null, 1), "utf8");
		await rename(temporary, this.indexPath);
	}

	/**
	 * Store one image.
	 *
	 * @param {string} id - owning theme id.
	 * @param {Uint8Array} bytes - the image.
	 * @returns {Promise<string>} the file name, relative to the image directory.
	 */
	async putImage(id, bytes) {
		await this.ensure();
		const name = `${id}.jpg`;
		await writeFile(join(this.images, name), bytes);
		return name;
	}

	/**
	 * Remove one theme and its image.
	 *
	 * The index is updated first: an orphaned image wastes a few hundred
	 * kilobytes, while an index entry pointing at a deleted file shows the user
	 * a broken theme. Removing the entry first means the worst case is the one
	 * nobody sees.
	 *
	 * @param {string} id - the theme to remove.
	 * @returns {Promise<boolean>} whether the theme existed.
	 */
	async remove(id) {
		let existed = false;
		await this.mutate((themes) => {
			const next = themes.filter((theme) => theme.id !== id);
			existed = next.length !== themes.length;
			return next;
		});
		if (existed) await rm(join(this.images, `${id}.jpg`), { force: true });
		return existed;
	}

	/** The absolute path of one stored image. */
	imagePath(name) {
		return join(this.images, name);
	}
}

/**
 * Whether a stored record has everything the plugin needs to apply it.
 *
 * A theme whose palette never arrived — the second half of an add that failed
 * between the two requests — is skipped rather than offered, so the user never
 * selects a wallpaper that would apply no tokens.
 *
 * @param {unknown} theme - a candidate record.
 * @returns {boolean}
 */
function isUsableTheme(theme) {
	if (theme === null || typeof theme !== "object") return false;
	if (typeof theme.id !== "string" || !/^[a-z0-9-]{4,64}$/.test(theme.id)) return false;
	if (typeof theme.title !== "string" || theme.title.length === 0) return false;
	if (typeof theme.image !== "string" || !/^[a-z0-9-]{4,64}\.jpg$/.test(theme.image)) return false;
	const palette = theme.palette;
	if (palette === null || typeof palette !== "object") return false;
	for (const mode of ["light", "dark"]) {
		const tokens = palette.tokens?.[mode];
		if (tokens === null || typeof tokens !== "object" || Object.keys(tokens).length === 0) return false;
		if (typeof palette.scrim?.[mode] !== "string") return false;
		if (typeof palette.floor?.[mode] !== "string") return false;
	}
	return true;
}

/** A fresh theme id: URL-safe, unguessable enough to be a file name, and stable. */
export function newThemeId() {
	return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Fetch one image URL, server-side.
 *
 * This exists because the browser cannot do it: an image drawn from another
 * origin taints the canvas, and a tainted canvas refuses `getImageData`, which
 * is exactly what the solver needs. Fetching through the Host makes the bytes
 * same-origin, so the browser can decode them.
 *
 * The Host is therefore making a request to a URL the user supplied, which is
 * the shape of an SSRF. It is accepted here, deliberately and with limits,
 * because the user of this tool *is* the operator of the machine: fetching a
 * wallpaper from a LAN address or an intranet host is a legitimate thing to
 * want, and refusing private address space would break it while protecting
 * nobody — the same person can already read any file the Harness can read. The
 * limits that do matter are the ones that keep a bad URL from taking the Host
 * down: http and https only, a redirect cap, a byte ceiling enforced while
 * streaming rather than after, a media-type check, and a timeout.
 *
 * @param {string} raw - the user-supplied URL.
 * @param {typeof fetch} [fetchImpl] - injectable for tests.
 * @returns {Promise<{bytes: Uint8Array, type: string, url: string}>}
 */
export async function fetchImage(raw, fetchImpl = fetch) {
	let url;
	try {
		url = new URL(raw);
	} catch {
		throw new Error("that is not a valid URL");
	}
	if (url.protocol !== "http:" && url.protocol !== "https:") {
		throw new Error(`only http and https URLs are supported, not ${url.protocol.replace(":", "")}`);
	}

	const controller = new AbortController();
	const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
	try {
		let response;
		try {
			response = await fetchImpl(url.href, {
				signal: controller.signal,
				redirect: "follow",
				headers: {
					// Some hosts serve a placeholder to unknown clients; asking for
					// an image and identifying honestly gets the real one.
					accept: "image/*,*/*;q=0.8",
					"user-agent": "dsh-theme-gallery/1.0 (+local wallpaper fetch)",
				},
			});
		} catch (error) {
			if (error.name === "AbortError") throw new Error(`the request took longer than ${FETCH_TIMEOUT_MS / 1000}s`);
			throw new Error(`the request failed: ${error.message}`);
		}
		if (!response.ok) throw new Error(`the server answered ${response.status} ${response.statusText}`.trim());

		const declared = Number(response.headers.get("content-length") ?? "");
		if (Number.isFinite(declared) && declared > MAX_IMAGE_BYTES) {
			throw new Error(`the image is ${Math.round(declared / 1024 / 1024)} MB, over the ${MAX_IMAGE_BYTES / 1024 / 1024} MB limit`);
		}

		// Enforced while reading, not after: a server that lies about its length,
		// or streams forever, must not be able to fill memory before the check.
		const reader = response.body?.getReader();
		if (reader === undefined) {
			const buffer = new Uint8Array(await response.arrayBuffer());
			if (buffer.length > MAX_IMAGE_BYTES) throw new Error(`the image is over the ${MAX_IMAGE_BYTES / 1024 / 1024} MB limit`);
			return finish(buffer, response.headers.get("content-type"), url.href);
		}
		const chunks = [];
		let total = 0;
		for (;;) {
			const { done, value } = await reader.read();
			if (done === true) break;
			total += value.length;
			if (total > MAX_IMAGE_BYTES) {
				await reader.cancel().catch(() => undefined);
				throw new Error(`the image is over the ${MAX_IMAGE_BYTES / 1024 / 1024} MB limit`);
			}
			chunks.push(value);
		}
		const bytes = new Uint8Array(total);
		let at = 0;
		for (const chunk of chunks) {
			bytes.set(chunk, at);
			at += chunk.length;
		}
		return finish(bytes, response.headers.get("content-type"), url.href);
	} finally {
		clearTimeout(timer);
	}
}

/** Validate fetched bytes and normalise the reported type. */
function finish(bytes, declaredType, url) {
	if (bytes.length === 0) throw new Error("the URL returned an empty response");
	const sniffed = sniffImage(bytes);
	if (sniffed === undefined) {
		const hint = (declaredType ?? "").split(";")[0].trim();
		throw new Error(
			hint.startsWith("text/") || hint === "application/json"
				? `that URL returned ${hint}, not an image`
				: "those bytes are not a JPEG, PNG, GIF, WebP, BMP, or AVIF image",
		);
	}
	return { bytes, type: sniffed, url };
}
