/**
 * Exercise the plugin's `apply` against a stub of the services it declares.
 *
 * The syntax check in `verify.py` proves the module loads and that the factory
 * returns a plugin object. This goes further: it runs `apply` with a recording
 * stand-in for `theme`, `slots`, `locale`, and `configForms`, and asserts what
 * the plugin actually did — which token layer it stacked, what it wrote to
 * `<html>`, how the sidebar switcher and the settings page behave when a user
 * drives them, and whether a write reaches the config form. Those are the
 * behaviours the browser would perform; a stub is enough to observe them
 * because the plugin reaches the outside world only through those four
 * services plus `document`.
 *
 * Deliberately NOT a DOM emulator: it provides exactly the surface the plugin
 * touches and fails loudly on anything else, so an unanticipated dependency
 * shows up as a test error rather than passing silently.
 */
const failures = [];
const check = (ok, message) => {
	if (!ok) failures.push(message);
};

// ---------------------------------------------------------------- the page

const attributes = new Map();
const properties = new Map();
const documentElement = {
	setAttribute: (name, value) => attributes.set(name, value),
	removeAttribute: (name) => attributes.delete(name),
	getAttribute: (name) => (attributes.has(name) ? attributes.get(name) : null),
	hasAttribute: (name) => attributes.has(name),
	style: {
		setProperty: (name, value) => properties.set(name, value),
		removeProperty: (name) => properties.delete(name),
		getPropertyValue: (name) => properties.get(name),
	},
};
const styles = [];
const head = {
	appendChild: (tag) => {
		styles.push(tag);
	},
};

/**
 * Canvases the solver can read pixels from.
 *
 * The client decodes an image with `createImageBitmap`, draws it to a canvas,
 * and reads the pixels back. Those three calls are the whole of its image
 * handling, so stubbing them exactly is enough to run a real solve — with real
 * pixels, through the real solver — as long as the pixels are synthetic. That
 * is worth doing: it is the only way to check that the browser-side flow
 * produces a palette that passes the contrast rules, without a browser.
 */
let canvasPixels = null;
function makeCanvas() {
	const canvas = {
		width: 0,
		height: 0,
		dataset: {},
		style: {},
		remove: () => {},
		getContext: () => ({
			drawImage: () => {},
			// The synthetic pixels are supplied by whichever test is running; a
			// canvas with none is a test that forgot to set them, and an empty
			// image would solve to a meaningless palette rather than fail.
			getImageData: () => ({ data: canvasPixels ?? new Uint8ClampedArray(0), width: canvas.width, height: canvas.height }),
			putImageData: () => {},
		}),
		toDataURL: () => "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
		set textContent(value) {
			this._text = value;
		},
		get textContent() {
			return this._text ?? "";
		},
	};
	return canvas;
}

const document = {
	documentElement,
	head,
	createElement: (tag) => (tag === "canvas" ? makeCanvas() : {
		dataset: {},
		style: {},
		remove: () => {},
		set textContent(value) {
			this._text = value;
		},
		get textContent() {
			return this._text ?? "";
		},
	}),
	querySelector: () => null,
};
globalThis.document = document;

/** The image the next `createImageBitmap` will hand back. */
let nextBitmap = { width: 16, height: 16, close: () => {} };
globalThis.createImageBitmap = async () => nextBitmap;
globalThis.ImageData = class ImageData {
	constructor(data, width, height) {
		this.data = data;
		this.width = width;
		this.height = height;
	}
};

/**
 * The Host, stubbed at the HTTP boundary.
 *
 * The client reaches the Host only through `fetch`, so a stub here exercises
 * the real request shapes — paths, methods, JSON bodies — rather than a
 * reimplementation of the client's calls.
 */
const requests = [];
let hostRoutes = {};
globalThis.fetch = async (url, init = {}) => {
	requests.push({ url: String(url), method: init.method ?? "GET", body: init.body });
	const path = String(url).replace(/^https?:\/\/[^/]+/, "");
	const handler = Object.entries(hostRoutes).find(([prefix]) => path.startsWith(prefix))?.[1];
	if (handler === undefined) {
		return { ok: false, status: 404, json: async () => ({ error: `no stub for ${path}` }), text: async () => "" };
	}
	const result = (await handler({ path, method: init.method ?? "GET", body: init.body })) ?? {};
	return {
		ok: result.status === undefined || result.status < 400,
		status: result.status ?? 200,
		json: async () => result,
		text: async () => JSON.stringify(result),
	};
};

globalThis.window = {
	__ModuleLoader__: { load: (r) => { globalThis.__registration = r; } },
	confirm: () => true,
};

import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

await import(pathToFileURL(resolve(process.argv[2])).href);
const registration = globalThis.__registration;
if (registration === undefined) {
	console.error("client.js did not register a module");
	process.exit(1);
}

/**
 * A React stand-in with a real `useState`/`useSyncExternalStore`.
 *
 * `createElement` INVOKES function components, as React's renderer does. That
 * matters: a stub that left them as inert nodes would let a test assert against
 * a `<Slider>` element's props instead of the `<input>` it actually renders, so
 * a handler wired to the wrong element would still pass.
 */
const React = {
	createElement: (type, props, ...children) => {
		const element = { type, props: props ?? {}, children };
		if (typeof type === "function") return type({ ...(props ?? {}), children });
		return element;
	},
	useState: (initial) => [typeof initial === "function" ? initial() : initial, () => {}],
	useEffect: () => {},
	useMemo: (factory) => factory(),
	useRef: (initial) => ({ current: initial }),
	useCallback: (fn) => fn,
	useSyncExternalStore: (subscribe, getSnapshot) => getSnapshot(),
	Fragment: Symbol("Fragment"),
};

const plugin = registration.factory((name) => {
	if (name === "react") return React;
	throw new Error("unexpected require: " + name);
});

// ------------------------------------------------------- the service stubs

/** Token layers stacked through `overrideTokens`, by source. */
const layers = new Map();
const overrideCalls = [];
const effects = [];

/** Resolved color scheme, as `snapshot.active.colorScheme` would report it. */
let scheme = "dark";

const theme = {
	getTheme: () => ({
		preference: scheme === "light" ? "light" : "dark",
		fontSize: 14,
		active: { id: scheme, colorScheme: scheme, tokens: {} },
		themes: [],
		revision: 0,
	}),
	overrideTokens(source, tokens) {
		overrideCalls.push({ source, tokens });
		// The real service validates and throws on a bare string value; mirroring
		// that here is what catches a flat table handed to the pair-shaped API.
		for (const [name, value] of Object.entries(tokens)) {
			if (typeof value === "string") throw new Error(`token ${name} must be a { light, dark } pair`);
			if (value === null || typeof value !== "object" || typeof value.light !== "string" || typeof value.dark !== "string") {
				throw new Error(`token ${name} is not a light/dark pair`);
			}
		}
		const layer = { seq: layers.size, tokens };
		layers.set(source, layer);
		return () => {
			if (layers.get(source) === layer) layers.delete(source);
		};
	},
	// `register` must never be called: it would replace the user's palette.
	register() {
		throw new Error("theme.register must not be used; the palette belongs to the Appearance row");
	},
};

const slotRegistrations = [];
const slots = {
	// `inject(key, callback)` runs the callback to collect its registrations and
	// re-runs it whenever the owning declaration collapses and returns. The stub
	// invokes it once, which is the install path.
	inject: (key, callback) => {
		const disposer = callback();
		if (typeof disposer === "function") effects.push(disposer);
		return () => {};
	},
	register: (options, component) => {
		slotRegistrations.push({ options, component });
		return () => {};
	},
};

const dictionaries = [];
const locale = {
	register: (ns, dicts) => {
		dictionaries.push({ ns, dicts });
		return () => {};
	},
	bind: () => (key) => key,
};

/** The Host-backed form stub, with a record of every write. */
const writes = [];
const formListeners = new Set();
let formValue = { wallpaper: "none", dim: 100, blur: 0 };
let formStatus = "ready";
const form = {
	getSnapshot: () => ({
		status: formStatus,
		value: { ...formValue },
		base: undefined,
		user: undefined,
		revision: 1,
		writable: true,
		mode: "host",
	}),
	subscribe: (fn) => {
		formListeners.add(fn);
		return () => formListeners.delete(fn);
	},
	set: (field, value) => {
		writes.push([field, value]);
		formValue = { ...formValue, [field]: value };
		for (const fn of [...formListeners]) fn();
		return Promise.resolve(true);
	},
	unset: () => Promise.resolve(true),
	mutate: () => Promise.resolve(true),
};
const configForms = { get: (entryId) => (entryId === "theme-gallery" ? form : undefined) };

const listeners = new Map();
let injectCallback;
const ctx = {
	theme,
	slots,
	locale,
	configForms,
	effect: (fn) => {
		const d = fn();
		if (typeof d === "function") effects.push(d);
		return () => {};
	},
	on: (name, fn) => {
		listeners.set(name, fn);
		return () => {};
	},
	// The real `ctx.inject` runs the callback once the named service is present;
	// the stub runs it immediately, which is the steady state in the Web profile.
	inject: (keys, callback) => {
		injectCallback = callback;
		callback(ctx);
		return () => {};
	},
};

// ------------------------------------------------------------------- run it

plugin.apply(ctx);

// ---- 1. nothing is stacked for `none`, and the cycle is reachable ---------
//
// `none` is the honest default: it is also the value the Host's Config
// defaults to for a fresh profile only until the user picks, and it must not
// stack a token layer — a wallpaper-less page belongs entirely to the
// Appearance row's palette.
check(overrideCalls.length === 0, `expected no overrideTokens call for 'none', got ${overrideCalls.length}`);
check(!layers.has("theme-gallery"), "an override layer is stacked with no wallpaper chosen");

// ---- 2. nothing is applied for `none` ------------------------------------

check(attributes.get("data-dsh-gallery") === undefined,
	`with no wallpaper, data-dsh-gallery is ${JSON.stringify(attributes.get("data-dsh-gallery"))}`);
check(!properties.has("--dsh-gallery-art"), "art variable exists with no wallpaper");

// ---- 3. choosing a wallpaper paints the canvas AND stacks the palette -----

await form.set("wallpaper", "portrait");
check(overrideCalls.length === 1, `expected 1 overrideTokens call after picking, got ${overrideCalls.length}`);
check(layers.has("theme-gallery"), "no override layer is stacked under the plugin's id");

const TOKEN_COUNT = 113;
if (overrideCalls.length > 0) {
	const { source, tokens } = overrideCalls[0];
	check(source === "theme-gallery", `override source is ${JSON.stringify(source)}`);
	const names = Object.keys(tokens);
	check(names.length === TOKEN_COUNT, `override carries ${names.length} tokens, expected ${TOKEN_COUNT}`);
	const malformed = names.filter((n) => typeof tokens[n]?.light !== "string" || typeof tokens[n]?.dark !== "string");
	check(malformed.length === 0, `override has non-pair values at ${malformed.slice(0, 4)}`);
	// Every alias token the shipped theme publishes must be covered, or the
	// uncovered ones silently keep the base palette and the page goes patchy.
	const union = JSON.parse(
		(await import("node:fs")).readFileSync(resolve("tokens.json"), "utf8"),
	).union;
	const missing = union.filter((n) => tokens[n] === undefined);
	check(missing.length === 0, `override misses ${missing.length} alias tokens: ${missing.slice(0, 4)}`);
}

check(attributes.get("data-dsh-gallery") === "portrait",
	`after pick, data-dsh-gallery is ${JSON.stringify(attributes.get("data-dsh-gallery"))}`);
check((properties.get("--dsh-gallery-art") ?? "").includes("/theme-gallery/portrait.jpg"),
	`after pick, art is ${JSON.stringify(properties.get("--dsh-gallery-art"))}`);
// The floor is emitted as a hex literal by the generator, not `rgb(...)`.
check(/^#[0-9a-f]{6}$/i.test(properties.get("--dsh-gallery-floor") ?? ""),
	`floor is ${JSON.stringify(properties.get("--dsh-gallery-floor"))}`);
const darkScrim = properties.get("--dsh-gallery-scrim");
check(typeof darkScrim === "string" && darkScrim.startsWith("rgba("),
	`dark scrim is ${JSON.stringify(darkScrim)}`);

// ---- 4. the scrim follows the resolved scheme ----------------------------

const onThemeChange = listeners.get("theme/change");
check(typeof onThemeChange === "function", "no theme/change listener");
if (onThemeChange) {
	scheme = "light";
	onThemeChange(theme.getTheme());
	const lightScrim = properties.get("--dsh-gallery-scrim");
	check(lightScrim !== darkScrim,
		`the scrim did not change with the scheme (still ${JSON.stringify(lightScrim)})`);
	// Portrait is the one image whose two scrims differ in strength, so this
	// pair also proves the value came from the entry rather than a constant.
	check(lightScrim === "rgba(241, 242, 246, 0.180)", `light scrim is ${JSON.stringify(lightScrim)}`);
	scheme = "dark";
	onThemeChange(theme.getTheme());
}

// ---- 5. dimming scales the scrim, and only its alpha ---------------------

const baseScrim = properties.get("--dsh-gallery-scrim");
const layersBeforeDim = overrideCalls.length;
await form.set("dim", 50);
const dimmed = properties.get("--dsh-gallery-scrim");
check(dimmed !== baseScrim, `dim=50 did not change the scrim (still ${JSON.stringify(dimmed)})`);
const alphaOf = (value) => Number(/,\s*([\d.]+)\)$/.exec(value ?? "")?.[1] ?? NaN);
check(Math.abs(alphaOf(dimmed) - alphaOf(baseScrim) / 2) < 0.002,
	`dim=50 gave alpha ${alphaOf(dimmed)}, expected half of ${alphaOf(baseScrim)}`);
check(dimmed.slice(0, dimmed.lastIndexOf(",")) === baseScrim.slice(0, baseScrim.lastIndexOf(",")),
	"dimming changed the scrim's hue as well as its alpha");
// Dimming must NOT re-stack the palette: `overrideTokens` publishes a
// recomposed snapshot, so doing it per slider step would re-render the whole
// application for a change the tokens do not even depend on.
check(overrideCalls.length === layersBeforeDim,
	`dimming re-stacked the token layer (${overrideCalls.length - layersBeforeDim} extra call(s))`);
await form.set("dim", 100);

// ---- 6. blur reaches the canvas variable ---------------------------------

const layersBeforeBlur = overrideCalls.length;
await form.set("blur", 8);
check(properties.get("--dsh-gallery-blur") === "blur(8px)",
	`blur variable is ${JSON.stringify(properties.get("--dsh-gallery-blur"))}`);
check(overrideCalls.length === layersBeforeBlur, "blur re-stacked the token layer");
// Zero must be the `none` keyword, not `blur(0px)`: the latter still creates a
// backdrop root, so the compositor keeps rasterizing the viewport behind the
// layer on every frame for no visual benefit.
await form.set("blur", 0);
check(properties.get("--dsh-gallery-blur") === "none",
	`blur=0 gave ${JSON.stringify(properties.get("--dsh-gallery-blur"))}, expected "none"`);

// ---- 7. an unknown value is refused, not painted -------------------------

await form.set("wallpaper", "not-a-wallpaper");
check(attributes.get("data-dsh-gallery") === undefined,
	`an unknown wallpaper still painted: ${JSON.stringify(attributes.get("data-dsh-gallery"))}`);

// ---- 8. nothing is registered into the sidebar --------------------------
//
// The wallpaper is chosen in the settings page and nowhere else. A
// `sidebar.footer.action` occupant here would mean a second way to change the
// wallpaper, which is exactly what was removed. The check is decisive in both
// directions: it would fail if the component stayed AND if someone re-registered
// it under a different slot name in the sidebar, so the whole sidebar slot
// family is inspected rather than that one name.
const sidebarSlots = slotRegistrations.filter((r) => String(r.options.name).startsWith("sidebar."));
check(
	sidebarSlots.length === 0,
	`the plugin still registers into the sidebar: ${sidebarSlots.map((r) => r.options.name).join(", ")}`,
);

// ---- 9. the settings page ------------------------------------------------

const section = slotRegistrations.find((r) => r.options.name === "settings.section");
check(section !== undefined, "no settings.section registration");
if (section) {
	check(section.options.id === "theme-gallery", `section id is ${section.options.id}`);
	check(typeof section.options.label === "function", "section label is not a thunk");
	check(section.options.label() === "section", `section label is ${JSON.stringify(section.options.label())}`);
	const face = typeof section.options.inject === "function" ? section.options.inject() : section.options.inject;
	const source = face?.hooks?.gallery;
	check(source !== undefined, "section exposes no gallery hook source");
	if (source) {
		const tree = section.component({ t: (k) => k, useGallery: source.getSnapshot });
		check(tree !== null && typeof tree === "object", "the settings section rendered nothing");
		// Every wallpaper must be offered, including the none option.
		const rendered = JSON.stringify(tree, (key, value) => (typeof value === "function" ? "[fn]" : value));
		for (const label of ["shatter", "portrait", "stage", "none"]) {
			check(rendered.includes(`"${label}"`), `the settings page does not offer ${label}`);
		}
		// One opacity control per adjustable page. A page that is offered a
		// slider but has no scoped rule would move nothing, and a rule with no
		// slider would be unreachable — so both halves are asserted here.
		for (const field of ["opacityPanel", "opacitySidebar", "opacityChat"]) {
			check(rendered.includes(`"dsh-gallery-${field}"`),
				`the settings page has no control for ${field}`);
		}
	}
}

check(dictionaries.length === 1, `expected 1 dictionary registration, got ${dictionaries.length}`);
if (dictionaries.length === 1) {
	const { ns, dicts } = dictionaries[0];
	check(ns === "theme-gallery", `dictionary namespace is ${ns}`);
	const zh = Object.keys(dicts.zh ?? {}).sort();
	const en = Object.keys(dicts.en ?? {}).sort();
	check(zh.length > 0 && JSON.stringify(zh) === JSON.stringify(en),
		`dictionaries are not key-balanced: zh=${zh.length} en=${en.length}`);
}

check(styles.length === 1, `expected 1 stylesheet, got ${styles.length}`);
if (styles.length === 1) {
	const css = styles[0].textContent;
	check(css.includes("html[data-dsh-gallery]"), "the stylesheet has no canvas rule");
	// The invariant is about the CANVAS rule specifically: it sets the
	// background of `<html>`, and the theme presenter writes the palette as
	// inline custom properties on `<body>`. A custom property defined on a
	// DESCENDANT is not visible to an ancestor, so the canvas rule must use only
	// the plugin's own variables — reading `--dsw-*` there would resolve to
	// nothing and the wallpaper would never paint.
	//
	// The slice is bounded by the FIRST rule only. The per-page opacity rules
	// further down the sheet select DESCENDANTS (`[role=dialog]`, the sidebar
	// column, the conversation frame) and those legitimately read the palette
	// tokens, because a descendant does inherit `<body>`'s values. Slicing to
	// the switcher instead of to the end of the first rule swept them in and
	// reported correct code as a defect.
	const canvasStart = css.indexOf("html[data-dsh-gallery] {");
	check(canvasStart >= 0, "the canvas rule is not the first html[data-dsh-gallery] rule");
	if (canvasStart >= 0) {
		const canvasEnd = css.indexOf("}", canvasStart);
		const canvasRule = css.slice(canvasStart, canvasEnd);
		check(!/var\(--dsw-/.test(canvasRule),
			"the canvas rule reads a body-scoped palette variable");
		// Each opacity rule must exist, be gated on the wallpaper attribute so
		// it disappears with the wallpaper, and set an ABSOLUTE alpha rather
		// than scaling the token's own.
		for (const surface of ["opacityPanel", "opacitySidebar", "opacityChat"]) {
			const variable = surface.replace("opacity", "--dsh-gallery-opacity-").toLowerCase();
			check(css.includes(variable), `the stylesheet has no variable ${variable}`);
			// The generated rule must actually be PRESENT in the sheet, not just
			// the variable name: an empty or deleted selector still leaves the
			// variable declared, and the page would silently stop responding to
			// its slider.
			const esc = variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
			// A selector may carry more than one attribute: the chat rule is
			// `[class*=root][data-phase]`, two attribute selectors on one element,
			// so the pattern accepts a run of them rather than exactly one.
			const rule = new RegExp(`html\\[data-dsh-gallery\\]\\s*(?:\\[[^\\]]+\\]\\s*)+\\{[^}]*var\\(${esc}`);
			check(rule.test(css), `no gated rule in the stylesheet reads ${variable}`);
		}
		const gated = css.match(/html\[data-dsh-gallery\]\s*(?:\[[^\]]+\]\s*)+\{/g) ?? [];
		check(gated.length >= 3,
			`only ${gated.length} opacity rule(s) are gated on the wallpaper attribute, expected 3`);
		check((css.match(/color-mix\(in srgb,/g) ?? []).length >= 3,
			"the opacity rules do not set alpha through color-mix");
		// The colour must be forced opaque. Mixing the token as it stands scales
		// its alpha DOWN, so 100% could never exceed what the palette solved and
		// the values a user actually needs would be unreachable.
		check((css.match(/rgb\(from /g) ?? []).length >= 3,
			"the opacity rules do not force the token opaque, so they could only reduce alpha");
		check(/\/ 1\)/.test(css), "the opacity rules do not pin alpha to 1 before mixing");
	}

// --------------------------------------------------- the drag release guard
//
// A range input keeps following the pointer after it leaves the control: it
// clamps the pointer's X onto the value axis. So the natural dismiss gesture —
// drag, move away, release elsewhere — used to overwrite the value with whatever
// sat at that X (a thumb at 50 reported 3 on the live page). `pointerleave` is
// no use as a guard because the input holds pointer capture and fires no leave
// until release, so the position has to be compared against the box.
//
// Checked structurally because it is a browser-interaction property: the
// behavioural test for it drives a real Chrome and cannot run here.
{
	// The shipped file's own text, not a variable already in scope: this check is
	// about the SOURCE of the slider, not about any state derived from it.
	const fileText = (await import("node:fs")).readFileSync(process.argv[2], "utf8");
	const slider = /function Slider\(props\) \{[\s\S]*?\n\t\t\t\}/.exec(fileText);
	check(slider !== null, "client.js has no Slider component");
	if (slider !== null) {
		const body = slider[0];
		check(/onPointerMove:/.test(body),
			"the slider does not track pointer position, so an off-track change would overwrite the value");
		check(/getBoundingClientRect\(\)/.test(body),
			"the slider does not compare the pointer against its own box, so it cannot tell an off-track change");
		check(/outside/.test(body), "the slider records no off-track state");
		check(/if \(mark\.pointer[^)]*outside\) return;/.test(body.replace(/\s+/g, " ")),
			"the slider does not ignore a change reported while the pointer is off the track — "
			+ "dragging away and releasing would overwrite the value");
		// The guard must NOT depend on pointerleave, which never fires during a
		// captured drag.
		check(!/onPointerLeave:/.test(body),
			"the slider relies on pointerleave, which does not fire while a range input holds pointer capture");
	}
}
}

// ------------------------------------------------------- degraded contexts
//
// A client entry that reaches the failed state is fatal to the whole window,
// not local to the plugin, so `apply` has to survive every composition that
// could plausibly reach it. Each case below is a context the shell could hand
// over: a missing service, a service with the wrong shape, a service whose
// methods throw. None may propagate.

const inert = () => ({
	effect: (fn) => {
		try {
			const d = fn();
			return typeof d === "function" ? d : () => {};
		} catch {
			return () => {};
		}
	},
	on: () => () => {},
	inject: () => () => {},
});
/**
 * A context that actually provides services, as the real one does.
 *
 * `inert()` is for degraded cases: its `inject` deliberately never runs the
 * callback, which models a composition where the named service never appears.
 * Using it for a case that expects the form to bind would silently exercise the
 * no-form path instead, and the assertions would pass for the wrong reason.
 *
 * `inject` hands the callback the context ITSELF, not the outer one — that is
 * what the real service does, and it is what makes `scope.configForms` resolve
 * to the overrides this call supplied rather than to whatever the main context
 * happens to hold.
 */
const live = (overrides = {}) => {
	const scope = {
		...inert(),
		on: () => () => {},
		...overrides,
	};
	scope.inject = (keys, callback) => {
		callback(scope);
		return () => {};
	};
	return scope;
};
const working = {
	getTheme: () => ({ active: { colorScheme: "dark" } }),
	overrideTokens: () => () => {},
};

const degraded = [
	["no theme", { ...inert(), slots, locale, configForms }],
	["null theme", { ...inert(), theme: null, slots, locale, configForms }],
	["theme without overrideTokens", { ...inert(), theme: { getTheme: () => ({}) }, slots, locale, configForms }],
	["overrideTokens throws", {
		...inert(), slots, locale, configForms,
		theme: { getTheme: () => ({ active: { colorScheme: "dark" } }), overrideTokens() { throw new Error("refused"); } },
	}],
	["getTheme throws", {
		...inert(), slots, locale, configForms,
		theme: { getTheme() { throw new Error("unavailable"); }, overrideTokens: () => () => {} },
	}],
	["junk snapshot", {
		...inert(), slots, locale, configForms,
		theme: { getTheme: () => "not an object", overrideTokens: () => () => {} },
	}],
	["no effect", { ...inert(), effect: undefined, theme: working, slots, locale, configForms }],
	["no on", { ...inert(), on: undefined, theme: working, slots, locale, configForms }],
	["no inject", { ...inert(), inject: undefined, theme: working, slots, locale, configForms }],
	["no slots", { ...inert(), theme: working, locale, configForms }],
	["slots.register throws", {
		...inert(), theme: working, locale, configForms,
		slots: { inject: (key, cb) => { cb(); return () => {}; }, register() { throw new Error("bad slot"); } },
	}],
	["locale.register throws", {
		...inert(), theme: working, slots, configForms,
		locale: { register() { throw new Error("duplicate ns"); }, bind: () => (k) => k },
	}],
	["no configForms", { ...inert(), theme: working, slots, locale }],
	["configForms.get throws", {
		...inert(), theme: working, slots, locale,
		configForms: { get() { throw new Error("unknown namespace"); } },
	}],
	["form returns junk", {
		...inert(), theme: working, slots, locale,
		configForms: { get: () => ({ getSnapshot: () => undefined, subscribe: () => () => {} }) },
	}],
	["form.set throws", {
		...inert(), theme: working, slots, locale,
		configForms: {
			get: () => ({
				getSnapshot: () => ({ status: "ready", value: { wallpaper: "stage" }, writable: true }),
				subscribe: () => () => {},
				set() { throw new Error("transport down"); },
			}),
		},
	}],
	["form.set rejects", {
		...inert(), theme: working, slots, locale,
		configForms: {
			get: () => ({
				getSnapshot: () => ({ status: "ready", value: { wallpaper: "stage" }, writable: true }),
				subscribe: () => () => {},
				set: () => Promise.reject(new Error("offline")),
			}),
		},
	}],
	["everything absent", {}],
];

for (const [label, context] of degraded) {
	const ctx2 = {
		...context,
		// A context with no `effect` still needs `inject` to be absent, not
		// inherited; spreading `context` last keeps the explicit overrides.
	};
	try {
		plugin.apply(ctx2);
	} catch (error) {
		failures.push(`apply() threw with ${label}: ${error && error.message}`);
	}
}

// A rejected write must not leave the UI stuck in "saving".
{
	const settle = [];
	const context = {
		...inert(),
		theme: working,
		slots: { inject: () => () => {}, register: () => () => {} },
		locale: { register: () => () => {}, bind: () => (k) => k },
		configForms: {
			get: () => ({
				getSnapshot: () => ({ status: "ready", value: { wallpaper: "stage" }, writable: true }),
				subscribe: () => () => {},
				set: () => new Promise((_, reject) => settle.push(() => reject(new Error("offline")))),
			}),
		},
	};
	plugin.apply(context);
	// Nothing observable to assert without the store; the point is that the
	// rejection handler exists and runs without throwing.
	for (const fire of settle) fire();
}

// ---- 10. the boot script's wallpaper survives a slow config mirror --------
//
// The sequence this reproduces is the real page load: the Host's head script
// paints the saved wallpaper, then the client module activates while the
// config mirror still reports `loading` with no value. Treating that empty
// snapshot as "no wallpaper" repaints a bare page over the picture, which the
// user sees as the wallpaper flashing off and back on.
{
	attributes.set("data-dsh-gallery", "stage");
	properties.set("--dsh-gallery-art", 'url("/theme-gallery/stage.jpg")');
	layers.clear();
	overrideCalls.length = 0;

	const slowForm = {
		getSnapshot: () => ({ status: "loading", value: undefined, writable: false, mode: "host" }),
		subscribe: () => () => {},
		set: () => Promise.resolve(true),
	};
	const context = live({
		// The RECORDING theme stub, not the minimal `working` one: the point of
		// this case is to observe which layer gets stacked, and `working`'s
		// overrideTokens is a deliberate no-op.
		theme,
		slots: { inject: () => () => {}, register: () => () => {} },
		locale: { register: () => () => {}, bind: () => (k) => k },
		configForms: { get: () => slowForm },
	});
	plugin.apply(context);

	check(attributes.get("data-dsh-gallery") === "stage",
		`a loading mirror wiped the boot wallpaper: data-dsh-gallery is ${JSON.stringify(attributes.get("data-dsh-gallery"))}`);
	check((properties.get("--dsh-gallery-art") ?? "").includes("stage.jpg"),
		`a loading mirror wiped the boot artwork: ${JSON.stringify(properties.get("--dsh-gallery-art"))}`);
	check(layers.has("theme-gallery"),
		"a loading mirror left the boot wallpaper without its palette layer");

	// Clean up for the checks below.
	attributes.clear();
	properties.clear();
}

// ---- 11. a page with no config form still applies the wallpaper -----------

{
	attributes.clear();
	properties.clear();
	const context = {
		...inert(),
		theme: working,
		slots: { inject: () => () => {}, register: () => () => {} },
		locale: { register: () => () => {}, bind: () => (k) => k },
		// No `configForms` service at all: the wallpaper must still work, for
		// this session, which is the documented degradation.
	};
	plugin.apply(context);
	check(properties.get("--dsh-gallery-blur") !== undefined || attributes.get("data-dsh-gallery") === undefined,
		"a session-only page did not paint anything at all");
}

// ---- 11. an unrelated snapshot does not snap a slider back ----------------
//
// The shared describe mirror republishes whenever ANY namespace changes, and
// the settings page folds every snapshot into the store. Without a drag guard,
// a write elsewhere in Settings republishes the last committed `dim` and the
// thumb jumps out from under the pointer. This drives the real component: it
// takes the `onChange` the slider was rendered with, fires it, then delivers a
// stale snapshot and checks the live value survived.
{
	attributes.clear();
	properties.clear();

	const staleListeners = new Set();
	// A form whose stored value is the OLD dim, so a republish is observable.
	let stored = { wallpaper: "shatter", dim: 100, blur: 0 };
	const staleForm = {
		getSnapshot: () => ({ status: "ready", value: { ...stored }, writable: true, mode: "host" }),
		subscribe: (fn) => {
			staleListeners.add(fn);
			return () => staleListeners.delete(fn);
		},
		set: (field, value) => {
			stored = { ...stored, [field]: value };
			return Promise.resolve(true);
		},
	};
	const context = live({
		theme: working,
		// The RECORDING slots stub: this case has to inspect the section THIS
		// apply registered, and a no-op stub would leave the shared list holding
		// whichever registration an earlier context happened to add.
		slots,
		locale: { register: () => () => {}, bind: () => (k) => k },
		configForms: { get: () => staleForm },
	});
	const mark = slotRegistrations.length;
	plugin.apply(context);

	// Render the page and find the dimming slider's onChange handler.
	const section = slotRegistrations.slice(mark).find((r) => r.options.name === "settings.section");
	check(section !== undefined, "this apply registered no settings.section");
	if (section === undefined) {
		// Nothing further to assert; the failure above is the finding.
	} else {
	const face = typeof section.options.inject === "function" ? section.options.inject() : section.options.inject;
	const source = face?.hooks?.gallery;
	const tree = section.component({ t: (k) => k, useGallery: source.getSnapshot });

	/** Depth-first search for the slider whose id names a field. */
	const findSlider = (node, id) => {
		if (node === null || typeof node !== "object") return undefined;
		if (Array.isArray(node)) {
			for (const child of node) {
				const found = findSlider(child, id);
				if (found !== undefined) return found;
			}
			return undefined;
		}
		if (node.props?.id === id) return node;
		for (const child of [node.children].flat(Infinity)) {
			const found = findSlider(child, id);
			if (found !== undefined) return found;
		}
		return undefined;
	};

	const dimSlider = findSlider(tree, "dsh-gallery-dim");
	check(dimSlider !== undefined, "the settings page rendered no dimming slider");
	if (dimSlider !== undefined) {
		// Mid-drag: the input event moves the live value without writing.
		dimSlider.props.onChange({ target: { value: "40" } });
		check(source.getSnapshot().dim === 40,
			`after the input event, dim is ${source.getSnapshot().dim}, expected 40`);

		// An unrelated snapshot arrives, still carrying the committed 100.
		for (const fn of [...staleListeners]) fn();
		check(source.getSnapshot().dim === 40,
			`a republished snapshot snapped the slider back to ${source.getSnapshot().dim}`);

		// Releasing commits, and only now does the form's value become the truth.
		check(typeof dimSlider.props.onPointerUp === "function", "the slider has no commit handler");
		dimSlider.props.onPointerUp();
		check(staleForm.getSnapshot().value.dim === 40,
			`committing wrote ${staleForm.getSnapshot().value.dim}, expected 40`);
	}
	}

	attributes.clear();
	properties.clear();
}

// ---- 12. the custom-theme library ----------------------------------------
//
// The whole add-a-wallpaper flow, run against a stubbed Host and a real solve.
// The pixels are synthetic — a four-quadrant image with a strong blue cast —
// so the palette is not the shipped one, but every step is the real one: the
// real decoder call, the real solver, the real request shapes.
{
	attributes.clear();
	properties.clear();
	requests.length = 0;

	/** A synthetic image: a blue-dominant gradient, 64x64. */
	const side = 64;
	const synthetic = new Uint8ClampedArray(side * side * 4);
	for (let y = 0; y < side; y++) {
		for (let x = 0; x < side; x++) {
			const i = (y * side + x) * 4;
			synthetic[i] = 20 + Math.round((x / side) * 40);
			synthetic[i + 1] = 30 + Math.round((y / side) * 40);
			synthetic[i + 2] = 120 + Math.round(((x + y) / (2 * side)) * 100);
			synthetic[i + 3] = 255;
		}
	}
	canvasPixels = synthetic;
	nextBitmap = { width: side, height: side, close: () => {} };

	let added = null;
	let removed = null;
	const library = [
		{ id: "cabc123456", title: "蓝色 Blue", image: "cabc123456.jpg", hue: 225, median: "#1e2a6e", worstContrast: 4.2 },
	];

	hostRoutes = {
		"/theme-gallery/api/themes": () => ({ themes: added === null ? [] : [added], error: undefined }),
		"/theme-gallery/api/theme": ({ path }) => {
			const id = new URL("http://x" + path).searchParams.get("id");
			if (id !== added?.id) return { status: 404, error: "no such theme" };
			return {
				...added,
				palette: {
					tokens: addedTokens,
					scrim: { light: "rgba(241, 242, 246, 0.18)", dark: "rgba(14, 18, 29, 0.18)" },
					floor: { light: "#f6f7f9", dark: "#0c0f18" },
				},
			};
		},
		"/theme-gallery/api/add": ({ body }) => {
			const parsed = JSON.parse(body);
			// The client must send a complete palette: both modes, both colours,
			// and the 113 tokens the solver produced.
			check(parsed.source === "upload", `the add request source is ${parsed.source}`);
			check(typeof parsed.data === "string" && parsed.data.startsWith("data:image/jpeg"), "the add request carries no JPEG data URL");
			check(parsed.palette?.tokens?.light !== undefined, "the add request carries no light token table");
			check(parsed.palette?.tokens?.dark !== undefined, "the add request carries no dark token table");
			check(Object.keys(parsed.palette.tokens.light).length >= 100,
				`the light table has ${Object.keys(parsed.palette.tokens.light).length} tokens`);
			check(typeof parsed.palette.scrim?.dark === "string", "the add request carries no dark scrim");
			check(typeof parsed.palette.floor?.light === "string", "the add request carries no light floor");
			addedTokens = parsed.palette.tokens;
			added = { id: "cnew000001", title: parsed.title || "自定义 Custom", image: "cnew000001.jpg" };
			return added;
		},
		"/theme-gallery/api/remove": ({ body }) => {
			removed = JSON.parse(body).id;
			added = null;
			return { removed: true };
		},
		"/theme-gallery/api/probe": () => ({ url: "https://example.com/a.jpg", type: "image/jpeg", data: "AAAA", bytes: 4 }),
	};
	let addedTokens = undefined;

	// A form that actually records its writes AND notifies its subscribers. A
	// stub whose `set` ignored its argument could not answer the question this
	// section exists to ask — did the client persist the new selection? — and a
	// stub that never notified could not answer the next one either: the plugin
	// only learns about a change through `subscribe`.
	let formValue = { wallpaper: "none", dim: 100, blur: 0 };
	const formListeners = new Set();
	const announce = () => {
		for (const fn of [...formListeners]) fn();
	};
	const probeForm = {
		getSnapshot: () => ({ status: "ready", value: { ...formValue }, writable: true, mode: "host" }),
		subscribe: (fn) => {
			formListeners.add(fn);
			return () => formListeners.delete(fn);
		},
		set: (field, value) => {
			formValue = { ...formValue, [field]: value };
			announce();
			return Promise.resolve(true);
		},
		unset: () => Promise.resolve(true),
		mutate: () => Promise.resolve(true),
	};
	const context = live({
		theme: working,
		slots,
		locale: { register: () => () => {}, bind: () => (k) => k },
		configForms: { get: () => probeForm },
	});
	const mark = slotRegistrations.length;
	plugin.apply(context);

	// The library is fetched at startup.
	await new Promise((resolve) => setTimeout(resolve, 0));
	check(requests.some((r) => r.url.endsWith("/api/themes")), "the client never listed the library");

	const section = slotRegistrations.slice(mark).find((r) => r.options.name === "settings.section");
	check(section !== undefined, "this apply registered no settings.section");
	if (section !== undefined) {
		const face = typeof section.options.inject === "function" ? section.options.inject() : section.options.inject;
		const source = face.hooks.gallery;

		/** Depth-first search for the control with a given prop. */
		const find = (node, predicate) => {
			if (node === null || typeof node !== "object") return undefined;
			if (Array.isArray(node)) {
				for (const child of node) {
					const found = find(child, predicate);
					if (found !== undefined) return found;
				}
				return undefined;
			}
			if (predicate(node)) return node;
			for (const child of [node.children].flat(Infinity)) {
				const found = find(child, predicate);
				if (found !== undefined) return found;
			}
			return undefined;
		};

		// Render once so the add controls exist, then drive the file input.
		section.component({ t: (k) => k, useGallery: source.getSnapshot });

		const fileInput = find(
			section.component({ t: (k) => k, useGallery: source.getSnapshot }),
			(node) => node.props?.type === "file",
		);
		check(fileInput !== undefined, "the settings page rendered no file input");
		if (fileInput !== undefined) {
			check(fileInput.props.accept === "image/*", `the file input accepts ${fileInput.props.accept}`);
			// The same file must be choosable twice: the input clears its own
			// value, or the second change event never fires.
			let cleared = false;
			const event = { target: { files: [{ size: 1024, type: "image/jpeg" }], set value(v) { cleared = v === ""; } } };
			fileInput.props.onChange(event);
			check(cleared, "the file input does not clear its value, so the same file cannot be picked twice");

			// Let the real solve run to completion.
			for (let i = 0; i < 200 && added === null; i++) await new Promise((resolve) => setTimeout(resolve, 5));
			check(added !== null, "adding a file never reached the Host");
			check(requests.some((r) => r.url.endsWith("/api/add")), "no add request was sent");
			check(source.getSnapshot().busy === false, "the page is still busy after the add finished");
			check(source.getSnapshot().error === undefined, `the add reported ${source.getSnapshot().error}`);

			// The new theme must be selected: a wallpaper the user just made and
			// then has to go find would be a worse flow.
			check(formValue.wallpaper === "cnew000001",
				`the added theme was not selected (wallpaper is ${formValue.wallpaper})`);

			// And it must be applicable: the palette arrived and was stacked.
			check(layers.has("theme-gallery"), "the added theme did not stack a token layer");
			const layer = layers.get("theme-gallery");
			check(Object.keys(layer?.tokens ?? {}).length >= 100,
				`the stacked layer has ${Object.keys(layer?.tokens ?? {}).length} tokens`);
		}

		// Deleting it must remove it and repoint the selection.
		removed = null;
		const deleteButton = find(
			section.component({ t: (k) => k, useGallery: source.getSnapshot }),
			(node) => node.props?.className === "dsh-gallery-iconBtn",
		);
		check(deleteButton !== undefined, "a custom theme rendered no delete control");
		if (deleteButton !== undefined) {
			// A delete inside a card must not also re-pick the theme, so the
			// handler has to stop the event.
			let stopped = false;
			deleteButton.props.onClick({ stopPropagation: () => { stopped = true; } });
			check(stopped, "the delete control does not stop the click reaching the card");
			for (let i = 0; i < 100 && removed === null; i++) await new Promise((resolve) => setTimeout(resolve, 5));
			check(removed === "cnew000001", `delete sent ${JSON.stringify(removed)}`);
		}
	}

	// ---- a custom theme whose palette has NOT been fetched ------------------
	//
	// The listing carries a name and an image but no palette, and a palette is
	// only fetched when a theme is first selected. So a card must be drawable
	// from the listing alone. Reading the wrong field produces a card pointing at
	// `/theme-gallery/undefined` — a broken image, not a visibly missing one —
	// and a cycle built from the registry would skip the theme entirely.
	{
		added = { id: "cfresh00001", title: "未取色 Not fetched", image: "cfresh00001.jpg" };
		const freshContext = live({
			theme: working,
			slots,
			locale: { register: () => () => {}, bind: () => (k) => k },
			configForms: { get: () => probeForm },
		});
		const freshMark = slotRegistrations.length;
		plugin.apply(freshContext);
		await new Promise((resolve) => setTimeout(resolve, 0));

		const freshSection = slotRegistrations.slice(freshMark).find((r) => r.options.name === "settings.section");
		check(freshSection !== undefined, "the fresh apply registered no settings section");
		if (freshSection !== undefined) {
			const face = typeof freshSection.options.inject === "function" ? freshSection.options.inject() : freshSection.options.inject;
			const source = face.hooks.gallery;
			/** Collect every element, so several props can be searched at once. */
			const walk = (node, out = []) => {
				if (node === null || typeof node !== "object") return out;
				if (Array.isArray(node)) {
					for (const child of node) walk(child, out);
					return out;
				}
				if (node.props !== undefined) out.push(node);
				for (const child of [node.children].flat(Infinity)) walk(child, out);
				return out;
			};
			const all = walk(freshSection.component({ t: (k) => k, useGallery: source.getSnapshot }));

			const thumb = all.find((node) => typeof node.props?.style?.backgroundImage === "string"
				&& node.props.style.backgroundImage.includes("cfresh00001.jpg"));
			check(thumb !== undefined, "a custom theme with no palette yet rendered no thumbnail");
			const broken = all.filter((node) => typeof node.props?.style?.backgroundImage === "string"
				&& node.props.style.backgroundImage.includes("undefined"));
			check(broken.length === 0, `${broken.length} card(s) point at /theme-gallery/undefined`);
			// The name reaches the DOM as the text child of the label span, and as
			// the button's `title`, so both are checked: a card with an accessible
			// name but no visible one is still a broken card.
			const named = all.some((node) => node.props?.children === "未取色 Not fetched"
				|| node.props?.title === "未取色 Not fetched");
			check(named, "the unfetched theme is not named on its card");

			// And the PICKER must be able to reach it. The card list is built
			// from the listing rather than the registry precisely so a theme
			// whose palette has not been fetched is not skipped. The test is
			// decisive: pressing that card's pick button must write its id, and
			// an id missing from the card list would leave nothing to press.
			//
			// The section reads the wallpaper from ITS OWN store, so the write
			// is read back from the form the plugin subscribes to rather than
			// from a local variable the component never reads.
			const card = all.find((node) => node.props?.className === "dsh-gallery-pick"
				&& node.props?.title === "未取色 Not fetched");
			check(card !== undefined, "the unfetched custom theme has no pick button");
			if (card !== undefined) {
				card.props.onClick();
				check(
					formValue.wallpaper === "cfresh00001",
					`pressing the unfetched theme's card wrote ${JSON.stringify(formValue.wallpaper)}, ` +
					"so the picker does not offer it",
				);
				formValue = { ...formValue, wallpaper: "none" };
			}
		}
		added = null;
	}

	canvasPixels = null;
	hostRoutes = {};
	attributes.clear();
	properties.clear();
}

if (failures.length > 0) {
	console.error(`${failures.length} FAILURE(S)`);
	for (const f of failures) console.error("  x", f);
	process.exit(1);
}
console.log(
	`apply() exercised: ${overrideCalls.length} token layer(s), ${writes.length} form write(s), ` +
	`${slotRegistrations.length} slot registration(s), ${dictionaries.length} dictionary; ` +
	`survived ${degraded.length} degraded contexts`,
);

