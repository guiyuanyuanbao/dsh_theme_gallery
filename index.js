/**
 * 画廊 Gallery — Host half.
 *
 * Four jobs:
 *
 *   1. Give the composition row a real, importable package root.
 *   2. Serve the three shipped wallpapers.
 *   3. Serve the custom-theme library, and accept additions to it.
 *   4. Own the durable preference: a `Config` whose fields are `.volatile()`,
 *      so they appear in Settings and persist through the profile's patch
 *      file, plus the pre-paint boot script that applies the saved choice
 *      before the shell renders.
 *
 * ## Why the preference lives in Config rather than in the browser
 *
 * `localStorage` was the first implementation and it is the wrong home for
 * this. It is per-origin, so the choice is lost whenever the port changes; it
 * is invisible to every other surface, including the agent's own shell
 * commands; it cannot be inspected or reset from Settings; and it disappears
 * with the browser profile. The platform already has a durable, inspectable,
 * user-editable store for exactly this: a plugin `Config` with `.volatile()`
 * fields. `settings.describe()` projects those into a form, the Settings UI
 * writes them through `configForms`, and the value lands in
 * `$DSH_PROFILE_DIR/cordis.patch.yml` — a file the user can read, edit, and
 * put under version control.
 *
 * ## Why a custom theme is a library entry AND a Config value
 *
 * A theme the user adds is two different kinds of thing, and they belong in two
 * different places:
 *
 *   - the **library** — image bytes plus a 113-token palette — is data. It
 *     lives under `$DSH_HOME/theme-gallery/v1/`, owned by `store.js`.
 *   - the **selection** — which wallpaper is active — is a preference. It is
 *     the `wallpaper` field of this plugin's `Config`, so it lands in the
 *     profile patch and survives a restart.
 *
 * The consequence is that the library is per Harness home and the selection is
 * per profile: two profiles share one library and each remembers its own
 * wallpaper. Putting the palettes in `Config` instead would mean 20 KB of
 * generated colour values per theme inside a file the user is invited to edit.
 *
 * ## Why the boot script is injected from the Host
 *
 * The wallpaper is the page background, so the gap between first paint and the
 * client plugin's activation is visible as a flash of the wrong colour.
 * `webserver/index-inject` lets this package put a head `<script>` and a
 * `<style>` into every index response, so the saved wallpaper and its floor
 * colour are on the document before any application script runs — the same
 * mechanism the shipped theme package uses for the palette preference.
 *
 * That is also why `store.js` writes its index atomically: this handler reads
 * it on every index render, and a half-written file would make the wallpaper
 * silently vanish rather than fail loudly.
 */
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { dshHomePath } from "@deepseek-ai/dsh-home-paths";
import z from "@deepseek-ai/schemastery";

import { api } from "./api.js";
import { GALLERY } from "./theme-data.js";
import { Store } from "./store.js";

/** Stable Cordis plugin name. */
export const name = "theme-gallery";

/** The webserver carrier is required; without it there is no artwork to serve. */
export const inject = ["webServer"];

/** Route prefix; the client module hardcodes the same string. */
const ROUTE = "/theme-gallery";

/** Wallpapers this bundle ships, and the content type each is served as. */
const WALLPAPERS = new Map([
	["shatter.jpg", "image/jpeg"],
	["portrait.jpg", "image/jpeg"],
	["stage.jpg", "image/jpeg"],
]);

/** Directory holding this module, resolved from its own URL so the package can live anywhere. */
const ASSETS = join(dirname(fileURLToPath(import.meta.url)), "assets");

/** Wallpaper slugs, in cycle order. */
export const SLUGS = Object.keys(GALLERY);

/**
 * The value meaning "no wallpaper".
 *
 * A word rather than a theme id, because this field names an *image* and
 * nothing else: which palette the image is tinted with follows the resolved
 * light/dark scheme of whatever theme is active, so a value that also named a
 * mode would be able to contradict the Appearance row.
 */
export const NONE = "none";

/**
 * How much the artwork is dimmed, as a percentage of the solved scrim.
 *
 * 100 is the strength `build_palettes.py` solved the palette against, so it is
 * the only value at which the token alphas are exactly the measured ones. The
 * slider exists because taste varies and the images differ; the default is
 * therefore the solved value, not a round number.
 */
export const DIM_DEFAULT = 100;

/**
 * Backdrop blur in px, applied to the artwork behind the UI.
 *
 * Off by default. It is a genuine trade — blur hides the picture's detail in
 * exchange for making the text above it calmer — and it costs GPU time on
 * every frame the compositor decides to redo. Leaving it at 0 keeps the
 * plugin's steady-state cost at zero for users who did not ask for it.
 */
export const BLUR_DEFAULT = 0;

/**
 * The pages whose opacity is adjustable on its own.
 *
 * The wallpaper is painted on `<html>`, and every page above it reads the same
 * *global* alias tokens — `--dsw-alias-bg-base`, `--dsw-specific-sidebar-fill`,
 * `--dsw-alias-bg-layer-2`, `--dsw-specific-input-major`. Those tokens are
 * solved translucent so the artwork shows through, which is the point of a
 * wallpaper; it is also why a dense reading surface such as the settings panel
 * can read poorly when a bright part of the picture sits behind the text.
 *
 * One global opacity could not fix that without also flattening the pages that
 * already look right, because a single token feeds all of them. So each surface
 * carries its own value, applied by a scoped client rule rather than through
 * the shared token, and the page that needs to be readable is made readable on
 * its own.
 *
 * The prompt box is the fourth surface and the one this list exists for twice
 * over: it holds the text being typed, so it is the surface whose legibility
 * matters most, and its card already paints from a token the solver gives its
 * own alpha, independent of the conversation behind it.
 *
 * `key` is both the Config field name and the client's variable suffix.
 * `selector` is recorded here so the Host schema and the scoped client rules
 * cannot drift apart without this list changing — `verify.py` re-reads this
 * table and compares it with the client's own tables.
 *
 * `scrim` names the element, INSIDE that surface, that the client fades from
 * `transparent` to the surface's token. Such a ramp only works while the token
 * is opaque; with a wallpaper the transparent end is a hole that lets content
 * scroll past unmasked. The client therefore restates each scrim as a flat fill
 * of the same surface at the same alpha, and the element is recorded here for
 * the same reason `selector` is.
 */
export const OPACITY_SURFACES = [
	{
		key: "opacityPanel",
		variable: "--dsh-gallery-opacity-panel",
		selector: 'html[data-dsh-gallery] [role="dialog"]',
		purpose: "the settings panel and other dialogs",
	},
	{
		key: "opacitySidebar",
		variable: "--dsh-gallery-opacity-sidebar",
		selector: "html[data-dsh-gallery] [class*=sidebarCol]",
		purpose: "the sidebar column",
	},
	{
		key: "opacityChat",
		variable: "--dsh-gallery-opacity-chat",
		selector: "html[data-dsh-gallery] [class*=frame]",
		purpose: "the conversation surface",
		/**
		 * Extra elements this surface paints, beyond `selector`.
		 *
		 * The right-hand sidebar is a portal panel rendered BESIDE the
		 * conversation rather than inside it, so `[class*=frame]` never reaches
		 * it: its ancestor chain runs `tabHost → tabCell → tabLayout → surface →
		 * panel`, with no frame at any level. It still paints `bg-base`, so it
		 * belongs to this surface; without these the panel kept the token's raw
		 * solved alpha while the conversation beside it followed the slider, and
		 * the two read as different brightnesses.
		 *
		 * `[class*=panelBody] [class*=tabHost]:not([class*=tabHostBody])` is the
		 * element that natively carries the background. The `:not()` is
		 * load-bearing, not tidiness: "tabHostBody" CONTAINS "tabHost", so the
		 * bare substring also matched the pane's inner body — an element the
		 * shipped client paints no background on — and the rule ADDED a second
		 * translucent layer there. The panel then composited four masked layers
		 * where the conversation beside it had three, and read darker.
		 */
		extraSelectors: [
			"html[data-dsh-gallery] [class*=panelBody] [class*=tabHost]:not([class*=tabHostHeader]):not([class*=tabHostBody])",
		],
		/**
		 * The composer's scrim.
		 *
		 * The seat is painted by the shipped client as
		 * `linear-gradient(180deg, transparent 0px, var(--dsw-alias-bg-base)
		 * 36px)` — the mask over the transcript sliding under the composer. With
		 * an opaque token that ramp is invisible, because it blends a colour into
		 * itself; a wallpaper makes the token translucent and the `transparent`
		 * start becomes a real hole, so the first 36px of the composer stay
		 * legible and the box reads a layer lighter than the page above it.
		 *
		 * It belongs to the CONVERSATION surface, not the input one: the ramp's
		 * job is to fade the transcript into the page, so it has to match the
		 * page's colour and alpha. The prompt box is a separate, more solid thing
		 * drawn on top of it and carries its own opacity.
		 */
		scrim: "[data-composer-seat][data-conversation-region=\"composer\"]",
	},
	{
		key: "opacityInput",
		variable: "--dsh-gallery-opacity-input",
		selector: "html[data-dsh-gallery] [data-composer-seat][data-conversation-region=\"composer\"] [class*=card]",
		purpose: "the prompt box",
		/**
		 * The CARD, not the seat. The seat is the full-width band that holds the
		 * composer and carries the fade above; the card is the rounded box the
		 * text is typed into, and the only part that reads as "the input". Its
		 * class is build-hashed, so `[class*=card]` under the seat is the stable
		 * handle — scoping it under the seat is what stops it matching a "card"
		 * anywhere else in the document.
		 */
	},
];

/**
 * Opacity is a percentage of the palette's own solved alpha.
 *
 * 100 is the solved translucency — the value every contrast check was run
 * against — and 0 removes the surface's own colour entirely so the artwork
 * shows through unmixed. Only the alpha moves: the hue stays the one the solver
 * measured for this image, so raising opacity makes a page readable without
 * turning it into a colour the rest of the theme does not use.
 */
export const OPACITY_DEFAULT = 100;

/**
 * The durable preference.
 *
 * Every field is `.volatile()`, which is what makes it a Settings row rather
 * than a composition-only value: `settings.describe()` projects only volatile
 * fields into a form, and only those accept a write from the Settings UI.
 * Ordinary (non-volatile) configuration is edited in the YAML files instead.
 *
 * `wallpaper` holds a shipped slug (`shatter`), `none`, or a custom theme id
 * (`c...`). It is one string rather than a discriminated object because the
 * three cases behave identically everywhere: they name an image, and the
 * palette follows the resolved scheme.
 */
export const Config = z.object({
	/** Active wallpaper: a shipped slug, `none`, or a custom theme id. */
	wallpaper: z.string().default(SLUGS[0]).volatile(),
	/** Artwork dimming, as a percentage of the solved scrim strength. */
	dim: z.number().step(5).min(0).max(200).default(DIM_DEFAULT).volatile(),
	/** Backdrop blur in px. */
	blur: z.number().step(1).min(0).max(24).default(BLUR_DEFAULT).volatile(),
	/**
	 * Per-theme surface opacities, as ABSOLUTE percentages.
	 *
	 * 100 is fully opaque and 0 is fully transparent, so a value means the same
	 * thing on every theme. A theme that has never been adjusted is simply
	 * ABSENT from this map, and then each surface keeps its own solved alpha.
	 *
	 * An earlier design expressed the value as a percentage OF the solved alpha,
	 * which made 100 mean "the solved translucency". That was wrong for the case
	 * the control exists for: the solved alpha is frequently too transparent to
	 * read against, so the one setting the user actually wants sat inside a
	 * scale whose top meant "no change", and the same number denoted a different
	 * appearance on every theme.
	 *
	 * Keyed by theme id — a shipped slug, or a custom theme's `c…` id — and then
	 * by surface, so one theme's entry is `{ opacityPanel, opacitySidebar,
	 * opacityChat, opacityInput }`. The record is per theme rather than per
	 * profile because a palette is solved per image: the artwork behind the
	 * settings panel differs per theme, and so does how much opacity that panel
	 * needs. An absent theme, or an absent surface within it, is how "restore
	 * the solved value" is stored, which is why the default is the empty map
	 * rather than a map pre-filled with values.
	 *
	 * The step is 1, not 5: the shipped palettes solve to alphas like 0.61 and
	 * 0.44, and a step of 5 cannot represent either, so the number a slider shows
	 * would disagree with the page beside it.
	 */
	opacity: z.dict(z.dict(z.number().step(1).min(0).max(100))).default({}).volatile(),
});

/**
 * Serve one shipped wallpaper.
 *
 * The name is looked up in a fixed table rather than joined onto the asset
 * directory, so a request can never name a path — `..`, an absolute path, or a
 * symlink — that the table does not already contain. That is the whole of the
 * traversal defence, and it is a whitelist rather than a sanitiser because a
 * whitelist cannot be wrong about an encoding.
 *
 * @param req - incoming request.
 * @param res - response to write.
 */
async function serve(req, res) {
	if (req.method !== "GET" && req.method !== "HEAD") {
		res.writeHead(405, { allow: "GET, HEAD" });
		res.end();
		return;
	}
	// The route is registered as a prefix, so the request URL carries the file
	// name after it. A query string is legal and ignored: the name is what the
	// browser caches on, and a cache-busting parameter must not 404.
	const pathname = new URL(req.url ?? "/", "http://x").pathname;
	const requested = pathname.slice(ROUTE.length).replace(/^\/+/, "");
	const type = WALLPAPERS.get(requested);
	if (type === undefined) {
		res.writeHead(404);
		res.end();
		return;
	}
	await streamFile(req, res, join(ASSETS, requested), type);
}

/**
 * Stream one file with an immutable cache header.
 *
 * @param req - incoming request.
 * @param res - response to write.
 * @param file - absolute path, already proved to be inside the intended directory.
 * @param type - the content type to declare.
 */
async function streamFile(req, res, file, type) {
	let info;
	try {
		info = await stat(file);
	} catch {
		// The file is missing — a package installed without its assets, or an
		// image whose theme was deleted between the index read and this request.
		// Report it as a missing file rather than crashing the handler.
		res.writeHead(404);
		res.end();
		return;
	}
	if (!info.isFile()) {
		res.writeHead(404);
		res.end();
		return;
	}
	res.writeHead(200, {
		"content-type": type,
		"content-length": String(info.size),
		// Immutable: the name identifies the image, and a changed image is a
		// changed id rather than a changed URL.
		"cache-control": "public, max-age=31536000, immutable",
	});
	if (req.method === "HEAD") {
		res.end();
		return;
	}
	await new Promise((resolve, reject) => {
		const stream = createReadStream(file);
		stream.on("error", reject);
		stream.on("end", resolve);
		stream.pipe(res);
	});
}

/** Clamp a number into a range, tolerating junk from an untyped caller. */
function clamp(value, min, max, fallback) {
	const n = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, n));
}

/**
 * Scale a scrim's alpha by a percentage.
 *
 * Only the alpha moves: the hue stays the one the solver measured for this
 * image, because the whole point of a per-image scrim is that the themes do not
 * read alike. Scaling alpha is also the only adjustment that keeps the
 * relationship between the scrim and the token alphas predictable — at 100 the
 * palette is exactly the one the verification checks were run against.
 *
 * @param scrim - `rgba(r, g, b, a)` as generated.
 * @param percent - 0..200.
 * @returns the scaled colour.
 */
function scaleScrim(scrim, percent) {
	const match = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(scrim);
	if (match === null) return scrim;
	const base = match[4] === undefined ? 1 : Number(match[4]);
	const alpha = Math.min(1, Math.max(0, base * percent / 100));
	return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha.toFixed(3)})`;
}

/**
 * The pre-paint style and script for one saved preference.
 *
 * The style colours the document canvas before any script executes; the script
 * turns the rules on by setting the marker attribute. Both are re-emitted on
 * every index render — `webserver/index-inject` fires per render and the
 * values are read from the live config — so a Settings write is reflected by
 * the next load with no restart and no reload hook of our own.
 *
 * Both palettes are emitted, selected by the theme package's own
 * `data-ds-theme-source` marker rather than by anything this plugin computes.
 * That is deliberate: the resolved scheme depends on the user's
 * light/dark/system preference *and* on the OS when it is `system`, and the
 * shipped theme boot script has already written that decision onto the
 * document by the time these rules are matched. Asking the same question a
 * second way here could only produce a second, disagreeing answer.
 *
 * @param config - validated live preference.
 * @param custom - the resolved custom theme record, when the selection names one.
 * @returns index injection rows in execution order.
 */
function bootInjections(config, custom) {
	// A shipped slug resolves through the generated table; a custom theme
	// resolves through the store; `none` resolves to nothing at all.
	const entry = custom ?? GALLERY[config.wallpaper];
	if (entry === undefined || entry === null) return [];

	const dim = clamp(config.dim, 0, 200, DIM_DEFAULT);
	const blur = clamp(config.blur, 0, 24, BLUR_DEFAULT);
	// Custom images are served from the same route under their own file name, so
	// the URL is built the same way for both kinds of theme.
	const url = `${ROUTE}/${entry.wallpaper}`;
	const dark = scaleScrim(entry.scrim.dark, dim);
	const light = scaleScrim(entry.scrim.light, dim);

	// The wallpaper rides on `<html>`: the root element's background *is* the
	// canvas, painted beneath every element by definition, so no stacking
	// context or `z-index` in any other package can get in front of it. The
	// scrim is the first of two background layers, which is why its
	// `background-size` is `100% 100%` and the image's is `cover`.
	const base = [
		`background-color:var(--dsh-gallery-floor);`,
		`background-image:linear-gradient(var(--dsh-gallery-scrim),var(--dsh-gallery-scrim)),var(--dsh-gallery-art);`,
		`background-size:100% 100%,cover;`,
		`background-position:center center,center center;`,
		`background-repeat:no-repeat,no-repeat;`,
		`background-attachment:fixed,fixed;`,
	].join("");

	// The blur is a FILTER value, not a length: `blur(0px)` still creates a
	// backdrop root, which makes the compositor rasterize the whole viewport
	// behind the layer on every frame for no visual benefit. `none` does not,
	// so the default costs nothing.
	const filter = blur > 0 ? `blur(${blur}px)` : "none";

	/** The scrim and floor for one scheme. */
	const scheme = (mode) =>
		`--dsh-gallery-scrim:${mode === "dark" ? dark : light};--dsh-gallery-floor:${entry.floor[mode]};`;

	/**
	 * Which scrim applies, in the order CSS will resolve it.
	 *
	 * The scheme is not known here — it depends on the user's light/dark/system
	 * preference and, for `system`, on the OS. That preference belongs to the
	 * shipped theme package, which publishes its decision as the
	 * `data-ds-theme-source` attribute on `<html>`. Four rules therefore
	 * compose, and their precedence is the point:
	 *
	 *   - the bare rule is the dark default, so the canvas is never unpainted;
	 *   - the media query overrides it for a light OS, which is the correct
	 *     answer for `system` and the only answer available before the theme
	 *     package's own script has run;
	 *   - the two attribute rules carry an extra attribute selector, so they
	 *     outrank both and an EXPLICIT light or dark preference wins even when
	 *     the OS disagrees.
	 *
	 * `system` deliberately gets no attribute rule: the media query already
	 * states it, and adding one would fix the scheme to whatever the OS said at
	 * page load, so the wallpaper would stop following a mid-session OS flip.
	 */
	const scrimRules = [
		`html[data-dsh-gallery]{${scheme("dark")}}`,
		`@media (prefers-color-scheme: light){html[data-dsh-gallery]{${scheme("light")}}}`,
		`html[data-dsh-gallery][data-ds-theme-source="light"]{${scheme("light")}}`,
		`html[data-dsh-gallery][data-ds-theme-source="dark"]{${scheme("dark")}}`,
	].join("");

	// The gate. `<html>` carries the attribute only while a wallpaper is
	// selected, which is what lets the client half remove the wallpaper by
	// removing it — and it is set by a HEAD script, not a body one, because a
	// body script runs after the head stylesheet has already been matched and
	// the first paint could land in between.
	const script = `(() => {
  document.documentElement.setAttribute('data-dsh-gallery', ${JSON.stringify(config.wallpaper)})
})()`;

	const style = [
		`html[data-dsh-gallery]{--dsh-gallery-art:url("${url}");--dsh-gallery-blur:${filter};${base}}`,
		scrimRules,
		// Blur is a separate fixed layer rather than a `filter` on `<html>`: a
		// filter on the root element would create a containing block and change
		// how every fixed-position element in the application is positioned.
		`html[data-dsh-gallery]::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;backdrop-filter:var(--dsh-gallery-blur,none)}`,
	].join("");

	return [
		{ kind: "script", placement: "head", text: script },
		{ kind: "style", text: style },
	];
}

/**
 * Serve one custom wallpaper by its stored file name.
 *
 * The name arrives from the URL, so it is matched against the store's own
 * record rather than sanitised: a name is served only when some theme in the
 * index claims it, and a stored name is already constrained by
 * `isUsableTheme`'s `^[a-z0-9-]{4,64}\.jpg$`. That is a whitelist derived from
 * the data, which cannot be wrong about an encoding.
 *
 * @param store - the theme store.
 * @param req - incoming request.
 * @param res - response to write.
 * @param name - the requested file name.
 */
async function serveCustom(store, req, res, name) {
	if (req.method !== "GET" && req.method !== "HEAD") {
		res.writeHead(405, { allow: "GET, HEAD" });
		res.end();
		return;
	}
	const { themes } = await store.read();
	if (!themes.some((theme) => theme.image === name)) {
		res.writeHead(404);
		res.end();
		return;
	}
	await streamFile(req, res, store.imagePath(name), "image/jpeg");
}

/**
 * Claim the wallpaper route, the boot injection seat, and the settings page
 * policy.
 *
 * @param ctx - Host plugin context carrying the webserver service.
 * @param config - validated live preference.
 */
export function apply(ctx, config) {
	// One store per plugin instance, over the Harness home this process resolved.
	const store = new Store(dshHomePath());
	// Created eagerly so the first Settings read is not the thing that has to
	// create it; a failure here is logged and left for the first write to retry
	// rather than failing activation, because a read-only home must not cost the
	// plugin its shipped wallpapers.
	store.ensure().catch((error) => ctx.logger?.warn?.("theme-gallery: the store directory could not be created: %s", error.message));

	const handleApi = api(store);

	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: ROUTE,
		handler: async (req, res) => {
			const pathname = new URL(req.url ?? "/", "http://x").pathname;
			const rest = pathname.slice(ROUTE.length).replace(/^\/+/, "");
			// The API namespace first: a theme may legitimately be named
			// `api`, and the prefix check is what keeps the two apart.
			if (rest === "api" || rest.startsWith("api/")) {
				await handleApi(req, res);
				return;
			}
			if (WALLPAPERS.has(rest)) {
				await serve(req, res);
				return;
			}
			await serveCustom(store, req, res, rest);
		},
	}), "theme-gallery: wallpaper route");

	// Read the live values at emit time rather than capturing a snapshot: the
	// injection fires per index render, so a Settings write is visible on the
	// next load without a restart. The store read is awaited here, which is why
	// the handler is async — a listener that pushed a row built from a stale
	// library would paint the previous wallpaper.
	ctx.on("webserver/index-inject", (table) => {
		// `index-inject` listeners are synchronous, so the custom lookup cannot
		// be awaited. The store keeps its library in memory after the first read
		// precisely so this path stays synchronous; see `Store#cached`.
		const custom = store.cached(config.wallpaper.get());
		table.push(...bootInjections({
			wallpaper: config.wallpaper.get(),
			dim: config.dim.get(),
			blur: config.blur.get(),
		}, custom));
	});

	// Keep the cache warm, so the synchronous injection above always has the
	// selected custom theme available.
	const refresh = () => {
		store.refresh().catch((error) => ctx.logger?.warn?.("theme-gallery: the library could not be read: %s", error.message));
	};
	refresh();
	ctx.on("theme-gallery/library-changed", refresh);

	// This plugin renders its own Settings page, so the automatically generated
	// one would be a second, worse surface for the same three fields. The policy
	// is per plugin *instance* and needs the `settings` service, which a
	// composition without Settings will not have — hence the optional injection
	// rather than a hard dependency.
	ctx.inject(["settings"], (child) => {
		child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
	});
}

export default { name, inject, Config, apply };
