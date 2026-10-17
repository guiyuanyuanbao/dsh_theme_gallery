/**
 * The custom-theme HTTP API.
 *
 * One handler for a whole sub-namespace (`<route>/api/`) rather than several
 * routes, because the route table is a composition-level contract and claiming
 * five prefixes for one feature would crowd it.
 *
 * This is the trust boundary. The browser computes the palette — it has the
 * only image decoder in the process — and posts it here, so everything the
 * Host is about to write to the user's disk and serve back arrives from
 * untyped client JavaScript. Each field is therefore checked for the shape the
 * plugin will later rely on, and the two that could become an injection are
 * checked for content: token names must be `--dsw-*`, and values must be CSS
 * colours, because a token value is applied straight to the document as a
 * custom property and `red;}html{display:none` would be a stylesheet, not a
 * colour.
 *
 * It is a separate module so the verification suite can drive THIS router over
 * real HTTP instead of a reimplementation of it — a test that exercises a copy
 * proves only that the copy works.
 */
import { MAX_IMAGE_BYTES, fetchImage, newThemeId, sniffImage } from "./store.js";

/**
 * Largest accepted request body.
 *
 * The body is a base64 data URL plus a palette, so it is dominated by the
 * image: base64 costs 4/3 of the bytes, and the client re-encodes at 2560px
 * q86, which lands between 350 KB and 900 KB of JSON for the three shipped
 * images. A busy or noisy photograph of the same dimensions encodes larger than
 * any of those, so the ceiling has to clear the WORST case rather than the
 * average one: a limit a legitimate upload can cross is a bug that appears only
 * for the users with the most detailed pictures, and it appears as a confusing
 * "over the limit" on an image well under the image limit.
 *
 * So this is the image ceiling expressed in base64, plus headroom for the
 * palette. The image itself is still checked against `MAX_IMAGE_BYTES` after
 * decoding, and that is the limit that matters; this one only stops an
 * oversized request from being buffered at all.
 */
const MAX_BODY_BYTES = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 1024 * 1024;

/** Largest accepted title length. */
const MAX_TITLE = 60;

/** A CSS colour, as narrowly as the generator and the solver emit them. */
const COLOUR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i;

/** Write a JSON response. */
function sendJson(res, status, value) {
	const body = Buffer.from(JSON.stringify(value), "utf8");
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": String(body.length),
		// The library is user data behind the Harness's own origin; a cached
		// copy would survive a delete and show a theme that is gone.
		"cache-control": "no-store",
	});
	res.end(body);
}

/**
 * Read a request body with a hard ceiling.
 *
 * `content-length` is checked first as a cheap rejection, but the streaming
 * count is what enforces it: a client that omits or lies about the length must
 * not be able to make the Host allocate without bound.
 *
 * @param req - incoming request.
 * @param limit - maximum accepted bytes.
 * @returns {Promise<Uint8Array>}
 */
export async function readBody(req, limit) {
	const declared = Number(req.headers["content-length"] ?? "");
	if (Number.isFinite(declared) && declared > limit) {
		throw new Error(`the body is over the ${Math.round(limit / 1024)} KB limit`);
	}
	const chunks = [];
	let total = 0;
	for await (const chunk of req) {
		total += chunk.length;
		if (total > limit) throw new Error(`the body is over the ${Math.round(limit / 1024)} KB limit`);
		chunks.push(chunk);
	}
	const body = new Uint8Array(total);
	let at = 0;
	for (const chunk of chunks) {
		body.set(chunk, at);
		at += chunk.length;
	}
	return body;
}

/**
 * Normalise a user-supplied title.
 *
 * Control characters would corrupt the Settings row and the JSON index; the
 * length cap keeps a pasted essay from becoming a theme name. Collapsing runs
 * of whitespace also means a title typed with a stray newline round-trips to
 * something the user recognises.
 *
 * @param raw - the candidate title.
 * @param fallback - used when nothing usable remains.
 * @returns {string}
 */
export function cleanTitle(raw, fallback) {
	if (typeof raw !== "string") return fallback;
	const text = raw.replace(/[\u0000-\u001f\u007f]/g, " ").trim().replace(/\s+/g, " ");
	if (text.length === 0) return fallback;
	return text.slice(0, MAX_TITLE);
}

/**
 * Validate a palette posted by the browser.
 *
 * Only the shape and the two injection-capable fields are checked. The values
 * are colours the client derived from pixels the user supplied, and
 * re-deriving them Host-side is impossible — the Host has no image decoder —
 * so the honest guarantee is "this is a well-formed palette", not "this
 * palette is correct". Correctness is the client's problem and the contrast
 * checks' job.
 *
 * @param value - the posted palette.
 * @returns {object} the validated palette, with only known fields.
 */
export function validatePalette(value) {
	if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error("the palette is missing");
	const out = { tokens: {}, scrim: {}, floor: {} };
	// Both tables are checked for EXISTENCE first, in a pass of their own. A
	// single loop that validated each mode in turn would report the first
	// problem it met — so a palette missing its dark table entirely would be
	// reported as "the light table has too few tokens", which names the wrong
	// half of the payload and sends the reader looking in the wrong place.
	for (const mode of ["light", "dark"]) {
		const tokens = value.tokens?.[mode];
		if (tokens === null || typeof tokens !== "object" || Array.isArray(tokens)) {
			throw new Error(`the palette has no ${mode} token table`);
		}
		for (const field of ["scrim", "floor"]) {
			const colour = value[field]?.[mode];
			if (typeof colour !== "string" || !COLOUR.test(colour)) {
				throw new Error(`the ${mode} ${field} is missing or is not a CSS colour`);
			}
		}
	}
	for (const mode of ["light", "dark"]) {
		const tokens = value.tokens[mode];
		const names = Object.keys(tokens);
		// The shipped theme publishes 113 aliases. A table far short of that
		// would apply as a partially themed page — some tokens on the new
		// palette, the rest on the old one — which reads as a bug, not a theme.
		if (names.length < 50) throw new Error(`the ${mode} token table has only ${names.length} tokens`);
		const clean = {};
		for (const [name, colour] of Object.entries(tokens)) {
			if (typeof name !== "string" || !name.startsWith("--dsw-")) {
				throw new Error(`${JSON.stringify(String(name).slice(0, 40))} is not a theme token`);
			}
			if (typeof colour !== "string" || !COLOUR.test(colour)) {
				throw new Error(`${name} is not a CSS colour: ${JSON.stringify(String(colour).slice(0, 32))}`);
			}
			clean[name] = colour;
		}
		out.tokens[mode] = clean;
		for (const field of ["scrim", "floor"]) out[field][mode] = value[field][mode];
	}
	// The analysis is optional metadata the settings page displays to describe
	// an image without solving it. It is kept only when it is a plain object, so
	// a junk value cannot reach the index.
	if (value.analysis !== null && typeof value.analysis === "object" && !Array.isArray(value.analysis)) {
		out.analysis = value.analysis;
	}
	return out;
}

/**
 * Build the API handler over one store.
 *
 * @param store - the theme store.
 * @returns {function(object, object): Promise<void>} the request handler.
 */
export function api(store) {
	return async function handle(req, res) {
		const pathname = new URL(req.url ?? "/", "http://x").pathname;
		const action = pathname.slice(pathname.indexOf("/api/") + 5).replace(/\/+$/, "");

		// ---- reading --------------------------------------------------------
		if (action === "themes") {
			if (req.method !== "GET" && req.method !== "HEAD") {
				sendJson(res, 405, { error: `themes does not accept ${req.method}` });
				return;
			}
			const { themes, error } = await store.read();
			// The library is sent WITHOUT the token tables: the settings page
			// needs each theme's name and image to draw a card, and shipping
			// 20 KB of palette per theme to render a list would be waste. The
			// active theme's palette is fetched separately, by id.
			sendJson(res, 200, {
				themes: themes.map((theme) => ({
					id: theme.id,
					title: theme.title,
					image: theme.image,
					added: theme.added,
					source: theme.source,
					// Just enough of the analysis to describe the image on its card.
					hue: theme.palette?.analysis?.hue_mid ?? null,
					median: theme.palette?.analysis?.median ?? null,
					worstContrast: Math.min(
						theme.palette?.solver?.light?.worstContrast ?? 99,
						theme.palette?.solver?.dark?.worstContrast ?? 99,
					),
				})),
				...(error === undefined ? {} : { error }),
			});
			return;
		}

		if (action === "theme") {
			if (req.method !== "GET" && req.method !== "HEAD") {
				sendJson(res, 405, { error: `theme does not accept ${req.method}` });
				return;
			}
			const id = new URL(req.url ?? "/", "http://x").searchParams.get("id") ?? "";
			const theme = await store.get(id);
			if (theme === undefined) {
				sendJson(res, 404, { error: `no theme with id ${JSON.stringify(id)}` });
				return;
			}
			sendJson(res, 200, theme);
			return;
		}

		// Everything below writes, so everything below is POST — but an action
		// that does not exist is a 404 whatever its method. Answering 405 for a
		// misspelled path would claim the path exists and only the verb is
		// wrong, which sends the reader looking for a POST-only endpoint that
		// was never there.
		const WRITES = new Set(["add", "rename", "remove", "probe"]);
		if (!WRITES.has(action)) {
			sendJson(res, 404, { error: `unknown action ${JSON.stringify(action)}` });
			return;
		}
		if (req.method !== "POST") {
			sendJson(res, 405, { error: `${action} requires POST` });
			return;
		}

		let payload;
		try {
			payload = JSON.parse(Buffer.from(await readBody(req, MAX_BODY_BYTES)).toString("utf8"));
		} catch (error) {
			sendJson(res, 400, { error: `the request body could not be read: ${error.message}` });
			return;
		}
		if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
			sendJson(res, 400, { error: "the request body must be a JSON object" });
			return;
		}

		// ---- fetching a URL for the browser to analyse ----------------------
		//
		// The browser cannot do this itself. An image drawn from another origin
		// taints the canvas, and a tainted canvas refuses `getImageData` — which
		// is exactly what the solver needs. So the Host fetches the bytes, and
		// the browser decodes them from the response.
		//
		// This action deliberately does NOT store anything. The palette cannot
		// exist yet: the Host has no image decoder, so the browser must analyse
		// the bytes before a theme can be written. Persisting here would create
		// a record with no palette if the browser never came back — an entry the
		// library hides and nobody ever deletes. Returning the bytes and letting
		// the caller post a complete theme keeps the write atomic in the only
		// sense that matters: nothing reaches the index until the palette does.
		if (action === "probe") {
			if (typeof payload.url !== "string" || payload.url.length === 0) {
				sendJson(res, 400, { error: "no URL was given" });
				return;
			}
			let fetched;
			try {
				fetched = await fetchImage(payload.url);
			} catch (error) {
				sendJson(res, 400, { error: error.message });
				return;
			}
			sendJson(res, 200, {
				url: fetched.url,
				type: fetched.type,
				// Base64 rather than raw bytes because the client decodes it
				// through an object URL, and a JSON envelope keeps the response
				// parseable without a second content type to negotiate.
				data: Buffer.from(fetched.bytes).toString("base64"),
				bytes: fetched.bytes.length,
			});
			return;
		}

		// ---- adding ---------------------------------------------------------
		if (action === "add") {
			let bytes;
			let source;
			try {
				if (payload.source === "url") {
					if (typeof payload.url !== "string" || payload.url.length === 0) throw new Error("no URL was given");
					const fetched = await fetchImage(payload.url);
					bytes = fetched.bytes;
					source = fetched.url;
				} else if (payload.source === "upload") {
					if (typeof payload.data !== "string" || payload.data.length === 0) throw new Error("no image data was given");
					// The browser sends base64 rather than multipart, because the
					// client half is plain JavaScript with no form machinery, and a
					// data URL is what the canvas and `FileReader` already produce.
					const raw = payload.data.includes(",") ? payload.data.slice(payload.data.indexOf(",") + 1) : payload.data;
					if (!/^[A-Za-z0-9+/=\s]*$/.test(raw)) throw new Error("the image data is not base64");
					bytes = new Uint8Array(Buffer.from(raw, "base64"));
					source = "upload";
				} else {
					throw new Error(`unknown source ${JSON.stringify(payload.source)}`);
				}
			} catch (error) {
				sendJson(res, 400, { error: error.message });
				return;
			}

			if (bytes.length === 0) {
				sendJson(res, 400, { error: "the image is empty" });
				return;
			}
			if (bytes.length > MAX_IMAGE_BYTES) {
				sendJson(res, 400, { error: `the image is over the ${MAX_IMAGE_BYTES / 1024 / 1024} MB limit` });
				return;
			}
			// The second, independent look at the bytes that will be written: the
			// browser decoded this image to derive the palette, but these are the
			// bytes that will be served back, and the Host has no decoder.
			if (sniffImage(bytes) === undefined) {
				sendJson(res, 400, { error: "those bytes are not a JPEG, PNG, GIF, WebP, BMP, or AVIF image" });
				return;
			}

			let palette;
			try {
				palette = validatePalette(payload.palette);
			} catch (error) {
				sendJson(res, 400, { error: `the palette was rejected: ${error.message}` });
				return;
			}

			const id = newThemeId();
			const fallback = source === "upload" ? "自定义 Custom" : "来自链接 From link";
			const title = cleanTitle(payload.title, fallback);
			try {
				await store.putImage(id, bytes);
				await store.mutate((themes) => [
					...themes,
					{ id, title, image: `${id}.jpg`, added: Date.now(), source, palette },
				]);
			} catch (error) {
				// A failed index write must not leave the image behind, and a
				// failed image write must not leave an index entry pointing at a
				// file that does not exist.
				await store.remove(id).catch(() => undefined);
				sendJson(res, 500, { error: `the theme could not be saved: ${error.message}` });
				return;
			}
			sendJson(res, 200, { id, title, image: `${id}.jpg` });
			return;
		}

		// ---- renaming and removing -----------------------------------------
		if (typeof payload.id !== "string" || payload.id.length === 0) {
			sendJson(res, 400, { error: "no theme id was given" });
			return;
		}
		const existing = await store.get(payload.id);
		if (existing === undefined) {
			sendJson(res, 404, { error: `no theme with id ${JSON.stringify(payload.id)}` });
			return;
		}

		if (action === "rename") {
			const title = cleanTitle(payload.title, existing.title);
			await store.mutate((themes) => themes.map((theme) => (theme.id === payload.id ? { ...theme, title } : theme)));
			sendJson(res, 200, { id: payload.id, title });
			return;
		}

		if (action === "remove") {
			const removed = await store.remove(payload.id);
			if (!removed) {
				sendJson(res, 404, { error: `no theme with id ${JSON.stringify(payload.id)}` });
				return;
			}
			sendJson(res, 200, { id: payload.id, removed: true });
			return;
		}

		sendJson(res, 404, { error: `unknown action ${JSON.stringify(action)}` });
	};
}
