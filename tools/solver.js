/**
 * The palette solver — derive all 113 alias tokens from one image.
 *
 * This is a JavaScript port of the generator's Python solver
 * (`build_palettes.py`), and it exists because the browser has to be able to
 * analyse an image the user just supplied. The alternative — solving on the
 * Host — would need an image decoder there, and Node has none; the browser
 * already has one in the canvas, and it is the decoder that will actually paint
 * the wallpaper, so solving in the browser guarantees the palette is derived
 * from exactly the pixels the user will see.
 *
 * ## Why this file is shared rather than duplicated
 *
 * Two consumers need it and they need it in different shapes:
 *
 *   - `client.js` is served verbatim from a route, so it cannot resolve an
 *     import. The build inlines this file's body into the client factory,
 *     stripping the `export` statements (the only transform applied).
 *   - `verify-solver.mjs` runs under Node and imports it normally, so the port
 *     can be checked against the Python original.
 *
 * One source, one transform, and a parity test that fails if the two drift.
 *
 * ## What is deliberately NOT here
 *
 * Image decoding. `analysePixels` takes a decoded RGBA buffer and its
 * dimensions; getting the pixels is the caller's job (canvas in the browser,
 * PIL in the generator). That keeps this file free of platform APIs and makes
 * it testable in both.
 */

// --------------------------------------------------------------------------
// colour helpers
// --------------------------------------------------------------------------

const ONE_SIXTH = 1 / 6;
const ONE_HALF = 1 / 2;
const TWO_THIRD = 2 / 3;
const ONE_THIRD = 1 / 3;

/**
 * Round half to even, as Python's `round()` does.
 *
 * `Math.round` rounds half AWAY FROM ZERO, so the two disagree on every exact
 * `.5` — and these values are byte conversions of `x/255`, where that happens.
 * The difference is one unit in the low byte, which is invisible in the result
 * but not in a byte-for-byte comparison against the Python original, and that
 * comparison is the whole point of the parity test.
 *
 * @param {number} x - a non-negative number.
 * @returns {number} the nearest integer, ties to even.
 */
function pyRound(x) {
	const floor = Math.floor(x);
	const rest = x - floor;
	if (rest > 0.5) return floor + 1;
	if (rest < 0.5) return floor;
	return floor % 2 === 0 ? floor : floor + 1;
}

/** Python's `colorsys._v`, the per-channel interpolator. */
function hlsChannel(m1, m2, hue) {
	let h = hue % 1;
	if (h < 0) h += 1;
	if (h < ONE_SIXTH) return m1 + (m2 - m1) * h * 6;
	if (h < ONE_HALF) return m2;
	if (h < TWO_THIRD) return m1 + (m2 - m1) * (TWO_THIRD - h) * 6;
	return m1;
}

/**
 * HSL to RGB, matching Python's `colorsys.hls_to_rgb` exactly.
 *
 * Note the argument order: Python's function is `hls_to_rgb(h, l, s)`, so this
 * takes lightness SECOND. The wrapper below is the one callers use.
 */
function hlsToRgb(h, l, s) {
	if (s === 0) return [l, l, l];
	const m2 = l <= 0.5 ? l * (1 + s) : l + s - l * s;
	const m1 = 2 * l - m2;
	return [
		hlsChannel(m1, m2, h + ONE_THIRD),
		hlsChannel(m1, m2, h),
		hlsChannel(m1, m2, h - ONE_THIRD),
	];
}

/**
 * HSL to a byte triple, clamped and rounded the way the generator does.
 *
 * @param {number} h - hue in degrees.
 * @param {number} s - saturation, 0..1.
 * @param {number} l - lightness, 0..1.
 * @returns {number[]} three 0..255 integers.
 */
function hsl(h, s, l) {
	const [r, g, b] = hlsToRgb(
		(((h % 360) + 360) % 360) / 360,
		Math.min(0.995, Math.max(0.005, l)),
		Math.min(1, Math.max(0, s)),
	);
	return [pyRound(r * 255), pyRound(g * 255), pyRound(b * 255)];
}

/** A byte triple and an optional alpha as a CSS colour. */
function css(rgb, a) {
	const [r, g, b] = rgb;
	if (a === undefined || a === null || a >= 0.999) {
		return `#${[r, g, b].map((c) => Math.trunc(c).toString(16).padStart(2, "0")).join("")}`;
	}
	const clamped = Math.min(1, Math.max(0, a));
	return `rgba(${Math.trunc(r)}, ${Math.trunc(g)}, ${Math.trunc(b)}, ${clamped.toFixed(2)})`;
}

/** Linear interpolation between two byte triples. */
function mix(a, b, t) {
	return a.map((x, i) => pyRound(x + (b[i] - x) * t));
}

/** WCAG relative luminance of a byte triple. */
function luminance(rgb) {
	const lin = (c) => {
		const v = c / 255;
		return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

/** WCAG contrast ratio between two colours. */
function contrast(fg, bg) {
	const a = luminance(fg);
	const b = luminance(bg);
	const hi = Math.max(a, b);
	const lo = Math.min(a, b);
	return (hi + 0.05) / (lo + 0.05);
}

/** Composite one translucent layer over an opaque backdrop. */
function over(fg, a, bg) {
	return [a * fg[0] + (1 - a) * bg[0], a * fg[1] + (1 - a) * bg[1], a * fg[2] + (1 - a) * bg[2]];
}

/** Composite a stack of translucent layers, top-first, over a backdrop. */
function chain(layers, backdrop) {
	let out = [backdrop[0], backdrop[1], backdrop[2]];
	for (let i = layers.length - 1; i >= 0; i--) out = over(layers[i][0], layers[i][1], out);
	return out;
}

/** Clamp and round a float triple to bytes. */
function asInt(rgb) {
	return rgb.slice(0, 3).map((c) => pyRound(Math.min(255, Math.max(0, c))));
}

/** The alpha of a CSS colour, or undefined when it is opaque. */
function parseAlpha(value) {
	if (!value.startsWith("rgba(")) return undefined;
	return Number(value.slice(value.lastIndexOf(",") + 1, -1));
}

/** The RGB bytes of a CSS colour. */
function parseRgb(value) {
	if (value.startsWith("#")) {
		return [
			parseInt(value.slice(1, 3), 16),
			parseInt(value.slice(3, 5), 16),
			parseInt(value.slice(5, 7), 16),
		];
	}
	const parts = value.slice(value.indexOf("(") + 1, value.lastIndexOf(")")).split(",");
	return [Number(parts[0]), Number(parts[1]), Number(parts[2])];
}

/** A CSS colour as `[rgb, alpha]`, alpha 1 when opaque. */
function parseCss(value) {
	return [parseRgb(value), parseAlpha(value) ?? 1];
}

// --------------------------------------------------------------------------
// the token table
// --------------------------------------------------------------------------

/**
 * Every alias token, in the shipped order.
 *
 * `verify.py` asserts this list equals `tokens.json`'s union, and `buildMode`
 * throws when a table is missing or has an extra name — so drift is caught at
 * build time and again at run time rather than silently leaving a token on the
 * base palette.
 */
const ALL_TOKENS = [
	"--dsw-alias-bg-base",
	"--dsw-alias-bg-layer-1",
	"--dsw-alias-bg-layer-2",
	"--dsw-alias-bg-layer-3",
	"--dsw-alias-bg-overlay",
	"--dsw-alias-bg-module-platform",
	"--dsw-alias-bg-multi-select",
	"--dsw-alias-bg-document-preview",
	"--dsw-alias-bg-document-selection",
	"--dsw-alias-bg-mask-1",
	"--dsw-alias-bg-mask-2",
	"--dsw-alias-bg-mask-3",
	"--dsw-alias-bg-mask-photo",
	"--dsw-alias-bg-mask-drop",
	"--dsw-alias-bg-skeleton",
	"--dsw-alias-border-l1",
	"--dsw-alias-border-l2",
	"--dsw-alias-border-l2-darkmode-thin",
	"--dsw-alias-border-l3",
	"--dsw-alias-border-l4",
	"--dsw-alias-border-inverted",
	"--dsw-alias-border-inverted2",
	"--dsw-alias-label-primary",
	"--dsw-alias-label-primary-dimmed",
	"--dsw-alias-label-primary-foreground",
	"--dsw-alias-label-primary-inverted",
	"--dsw-alias-label-primary-bluish",
	"--dsw-alias-label-secondary",
	"--dsw-alias-label-tertiary",
	"--dsw-alias-label-caption",
	"--dsw-alias-label-dimmed",
	"--dsw-alias-label-document-preview",
	"--dsw-alias-label-deep-diving",
	"--dsw-alias-label-deep-diving-shimmer",
	"--dsw-alias-label-shimmer",
	"--dsw-alias-menu-icon",
	"--dsw-menu-surface-fill",
	"--dsw-alias-menu-group-header-fill",
	"--dsw-alias-link",
	"--dsw-alias-brand-primary",
	"--dsw-alias-brand-primary-invert",
	"--dsw-alias-brand-primary-new-colorprimary-new-color",
	"--dsw-alias-brand-text",
	"--dsw-alias-button-primary-fill",
	"--dsw-alias-button-primary-hover",
	"--dsw-alias-button-primary-dimmed",
	"--dsw-alias-button-contrast-fill",
	"--dsw-alias-button-elevated-fill",
	"--dsw-alias-button-floating-fill",
	"--dsw-alias-button-floating-hover",
	"--dsw-alias-button-ghost-active-fill",
	"--dsw-alias-button-ghost-active-hover",
	"--dsw-alias-button-ghost-active-border",
	"--dsw-alias-button-tool-bar-fill",
	"--dsw-alias-button-tool-bar-hover",
	"--dsw-alias-button-tool-bar-fill-invisible",
	"--dsw-alias-button-info-fill",
	"--dsw-alias-button-info-hover",
	"--dsw-alias-interactive-bg-hover",
	"--dsw-alias-interactive-bg-hover-accent",
	"--dsw-alias-interactive-bg-active",
	"--dsw-alias-interactive-bg-hover-danger",
	"--dsw-alias-interactive-bg-hover-solid",
	"--dsw-alias-state-business-primary",
	"--dsw-alias-state-business-tertiary",
	"--dsw-alias-state-idle-primary",
	"--dsw-alias-state-success-primary",
	"--dsw-alias-state-success-secondary",
	"--dsw-alias-state-success-tertiary",
	"--dsw-alias-state-warn-primary",
	"--dsw-alias-state-warn-secondary",
	"--dsw-alias-state-warn-tertiary",
	"--dsw-alias-state-warn-label",
	"--dsw-alias-state-error-primary",
	"--dsw-alias-state-error-secondary",
	"--dsw-alias-markdown-code-block",
	"--dsw-alias-markdown-code-block-banner",
	"--dsw-alias-markdown-inline-code",
	"--dsw-alias-markdown-code-segment-selected",
	"--dsw-alias-markdown-code-segment-unselected",
	"--dsw-alias-markdown-citation",
	"--dsw-alias-markdown-tag",
	"--dsw-alias-markdown-placeholder",
	"--dsw-alias-code-diff-added",
	"--dsw-alias-code-diff-deleted",
	"--dsw-alias-file-diff-added-bg",
	"--dsw-alias-file-diff-added-gutter",
	"--dsw-alias-file-diff-added-marker",
	"--dsw-alias-file-diff-deleted-bg",
	"--dsw-alias-file-diff-deleted-gutter",
	"--dsw-alias-file-diff-deleted-marker",
	"--dsw-alias-toast-bg",
	"--dsw-alias-toast-label",
	"--dsw-alias-tooltip-bg",
	"--dsw-alias-tooltip-key-bg",
	"--dsw-alias-turn-trigger-bg",
	"--dsw-alias-turn-trigger-bg-hover",
	"--dsw-alias-switch-thumb",
	"--dsw-alias-scrollbar-bg-l1",
	"--dsw-alias-scrollbar-bg-l2",
	"--dsw-alias-scrollbar-hover-l1",
	"--dsw-alias-scrollbar-hover-l2",
	"--dsw-specific-sidebar-fill",
	"--dsw-specific-sidebar-nav-item-active",
	"--dsw-specific-sidebar-nav-item-active-accent",
	"--dsw-specific-sidebar-nav-item-hover",
	"--dsw-specific-bubble",
	"--dsw-specific-bubble-highlight",
	"--dsw-specific-input-major",
	"--dsw-specific-login-input",
	"--dsw-specific-selector",
	"--dsw-specific-tip",
	"--dsw-specific-menu",
];

/**
 * Surface ladder: token to (lightness offset, alpha offset, saturation offset).
 *
 * Alpha offsets are relative to the solved base alpha; `undefined` means the
 * token is opaque and its alpha is not part of the solve.
 */
const LADDER = [
	["--dsw-alias-bg-base", 0.0, 0.0, 0.0],
	["--dsw-alias-bg-layer-1", 0.03, 0.1, 0.02],
	["--dsw-alias-bg-layer-2", 0.065, 0.17, 0.02],
	["--dsw-alias-bg-layer-3", 0.11, 0.24, 0.02],
	["--dsw-alias-bg-overlay", 0.15, 0.97, 0.03],
	["--dsw-alias-bg-module-platform", 0.065, 0.17, 0.02],
	["--dsw-alias-bg-multi-select", 0.065, 0.17, 0.02],
	["--dsw-alias-bg-document-preview", 0.02, 0.3, 0.01],
	["--dsw-specific-sidebar-fill", 0.018, 0.16, 0.06],
	["--dsw-specific-bubble", 0.055, 0.21, 0.02],
	["--dsw-specific-bubble-highlight", 0.085, 0.27, 0.02],
	["--dsw-specific-input-major", 0.07, 0.23, 0.02],
	["--dsw-specific-login-input", 0.03, 0.15, 0.02],
	["--dsw-specific-selector", 0.06, 0.21, 0.02],
	["--dsw-specific-tip", 0.06, 0.21, 0.02],
	["--dsw-specific-menu", 0.17, 0.97, 0.03],
	["--dsw-menu-surface-fill", 0.17, 0.97, 0.03],
	["--dsw-alias-menu-group-header-fill", 0.18, 0.98, 0.03],
	["--dsw-alias-markdown-code-block", -0.012, 0.36, 0.05],
	["--dsw-alias-markdown-code-block-banner", 0.016, 0.38, 0.05],
	["--dsw-alias-markdown-inline-code", 0.03, 0.32, 0.05],
	["--dsw-alias-markdown-code-segment-selected", 0.095, 0.36, 0.02],
	["--dsw-alias-markdown-code-segment-unselected", 0.012, 0.36, 0.05],
	["--dsw-alias-markdown-citation", 0.042, 0.32, 0.04],
	["--dsw-alias-markdown-tag", 0.03, 0.3, 0.04],
	["--dsw-alias-markdown-placeholder", 0.012, 0.32, 0.04],
	["--dsw-alias-button-elevated-fill", 0.072, 0.25, 0.02],
	["--dsw-alias-button-floating-fill", 0.062, 0.25, 0.02],
	["--dsw-alias-button-floating-hover", 0.092, 0.29, 0.02],
	["--dsw-alias-button-ghost-active-fill", 0.078, 0.27, 0.02],
	["--dsw-alias-button-ghost-active-hover", 0.108, 0.31, 0.02],
	["--dsw-alias-button-primary-dimmed", 0.055, 0.25, 0.12],
	["--dsw-alias-interactive-bg-hover-solid", 0.082, 0.27, 0.02],
	["--dsw-specific-sidebar-nav-item-active", 0.115, 0.31, 0.1],
	["--dsw-specific-sidebar-nav-item-active-accent", 0.148, 0.33, 0.1],
	["--dsw-alias-toast-bg", 0.105, 0.96, 0.04],
	["--dsw-alias-tooltip-bg", 0.125, 0.96, 0.04],
	["--dsw-alias-scrollbar-bg-l1", 0.165, 0.22, 0.05],
	["--dsw-alias-scrollbar-bg-l2", 0.205, 0.26, 0.05],
	["--dsw-alias-scrollbar-hover-l1", 0.245, 0.28, 0.05],
	["--dsw-alias-scrollbar-hover-l2", 0.285, 0.32, 0.05],
];

/** Per-mode constants: base lightness/saturation and the four ink steps. */
const MODE_CONST = {
	dark: { L: 0.075, S: 0.3, ink: [0.955, 0.17], ink2: [0.79, 0.15], ink3: [0.64, 0.14], ink4: [0.43, 0.18] },
	light: { L: 0.968, S: 0.22, ink: [0.13, 0.42], ink2: [0.33, 0.3], ink3: [0.455, 0.24], ink4: [0.72, 0.2] },
};

/**
 * One complete token table for one palette mode.
 *
 * @param {object} an - the analysis record (only `hue_mid`, `warm_hue`,
 *   `warm_share` and `highlight_hue` are read).
 * @param {"light"|"dark"} mode - the palette to build.
 * @param {number} baseAlpha - the solved base surface alpha.
 * @param {number} lightnessDelta - the solved base lightness nudge.
 * @returns {Record<string,string>} token name to CSS colour.
 */
function buildMode(an, mode, baseAlpha, lightnessDelta) {
	const hue = an.hue_mid;
	const warmHue = an.warm_hue !== null && an.warm_hue !== undefined && an.warm_share > 0.02 ? an.warm_hue : 38;
	const C = MODE_CONST[mode];
	const L0 = C.L + lightnessDelta;
	const S0 = C.S;
	const A0 = baseAlpha;
	const dark = mode === "dark";

	const surf = (dl, da, ds) => [
		hsl(hue, S0 + ds, L0 + dl),
		da === undefined || da === null ? 0 : Math.min(0.98, A0 + da),
	];

	const inkHi = hsl(hue, C.ink[1], C.ink[0]);
	const inkMid = hsl(hue, C.ink2[1], C.ink2[0]);
	const inkLo = hsl(hue, C.ink3[1], C.ink3[0]);
	const inkDim = hsl(hue, C.ink4[1], C.ink4[0]);
	// `caption` is the QUIETEST label — one step weaker than `tertiary` in both
	// palettes, and "weaker" flips sign between them, so it is derived
	// independently rather than as another step along tertiary's direction.
	const inkCaption = dark ? hsl(hue, 0.2, 0.48) : hsl(hue, 0.2, 0.615);
	// The ink used for translucent washes: light ink on a dark UI, dark on light.
	const wash = dark ? inkHi : hsl(hue, 0.45, 0.14);

	const ice = hsl(an.highlight_hue, 0.2, dark ? 0.95 : 0.99);

	const ramp = dark
		? [hsl(hue, 0.58, 0.7), hsl(hue, 0.54, 0.77), hsl(hue, 0.5, 0.83), hsl(hue, 0.46, 0.89), hsl(hue, 0.42, 0.94)]
		: [hsl(hue, 0.5, 0.68), hsl(hue, 0.55, 0.6), hsl(hue, 0.6, 0.52), hsl(hue, 0.64, 0.44), hsl(hue, 0.66, 0.35)];
	const [a1, a2, a3, a4, a5] = ramp;

	let succ;
	let warn;
	let err;
	let succLbl;
	let warnLbl;
	if (dark) {
		succ = [hsl(163, 0.52, 0.6), hsl(163, 0.52, 0.72), hsl(163, 0.34, 0.16)];
		warn = [hsl(warmHue, 0.72, 0.58), hsl(warmHue, 0.78, 0.7), hsl(warmHue, 0.4, 0.16)];
		err = [hsl(349, 0.68, 0.68), hsl(349, 0.72, 0.78)];
		succLbl = succ[0];
		warnLbl = warn[0];
	} else {
		succ = [hsl(163, 0.66, 0.34), hsl(163, 0.6, 0.42), hsl(163, 0.44, 0.92)];
		warn = [hsl(warmHue, 0.74, 0.42), hsl(warmHue, 0.76, 0.5), hsl(warmHue, 0.68, 0.93)];
		err = [hsl(349, 0.6, 0.48), hsl(349, 0.58, 0.58)];
		succLbl = succ[0];
		warnLbl = hsl(warmHue, 0.72, 0.34);
	}

	const T = {};

	// ---- surfaces from the ladder -----------------------------------------
	for (const [name, dl, da, ds] of LADDER) {
		const [rgb, a] = surf(dl, da, ds);
		T[name] = da === undefined || da === null || da >= 0.97 ? css(rgb) : css(rgb, a);
	}

	// ---- the stand-off family ---------------------------------------------
	//
	// Not every token is a rung on the surface ladder. A toast, a tooltip, a
	// primary button, the badge chip: these stand OFF the page rather than
	// sitting on it, and the shipped theme expresses that by making them dark
	// in BOTH palettes, carrying their own near-white ink. Modelling them as
	// ladder rungs produced a near-white toast with near-white text on it —
	// 1.02:1 — and a badge chip at 1.17:1, neither of which throws or shows up
	// in a check that only measures text on the page.
	const offSurface = hsl(hue, 0.16, dark ? 0.165 : 0.115);
	const offInk = hsl(an.highlight_hue, 0.14, 0.99);

	// The ink that goes ON `label-primary` when it is used as a fill: always the
	// opposite of `label-primary`, which flips between palettes.
	const inkOnPrimary = dark ? hsl(hue, 0.2, 0.1) : hsl(hue, 0.16, 0.99);

	T["--dsw-alias-toast-bg"] = css(offSurface);
	T["--dsw-alias-toast-label"] = css(offInk);
	T["--dsw-alias-tooltip-bg"] = css(offSurface);
	T["--dsw-alias-tooltip-key-bg"] = css(mix(offSurface, [255, 255, 255], 0.18));

	// ---- washes and one-off surfaces --------------------------------------
	T["--dsw-alias-bg-skeleton"] = css(wash, 0.07);
	T["--dsw-alias-bg-document-selection"] = css(a2, 0.4);
	T["--dsw-alias-button-tool-bar-fill"] = css(surf(0.02, null, 0.02)[0], 0.55);
	T["--dsw-alias-button-tool-bar-hover"] = css(surf(0.05, null, 0.02)[0], 0.68);
	T["--dsw-alias-button-tool-bar-fill-invisible"] = css(surf(-0.02, null, 0.02)[0], 0.36);
	T["--dsw-alias-interactive-bg-hover"] = css(wash, dark ? 0.08 : 0.06);
	T["--dsw-alias-interactive-bg-hover-accent"] = css(wash, dark ? 0.16 : 0.13);
	T["--dsw-alias-interactive-bg-active"] = css(wash, dark ? 0.13 : 0.1);
	T["--dsw-alias-interactive-bg-hover-danger"] = css(err[0], dark ? 0.14 : 0.07);
	T["--dsw-specific-sidebar-nav-item-hover"] = css(wash, dark ? 0.08 : 0.07);
	T["--dsw-alias-turn-trigger-bg"] = T["--dsw-alias-markdown-code-block"];
	T["--dsw-alias-turn-trigger-bg-hover"] = T["--dsw-alias-interactive-bg-hover"];
	T["--dsw-alias-switch-thumb"] = css(dark ? hsl(hue, 0.22, 0.74) : ice);
	T["--dsw-alias-file-diff-added-bg"] = css(succ[0], dark ? 0.14 : 0.12);
	T["--dsw-alias-file-diff-added-gutter"] = css(succ[0], dark ? 0.09 : 0.08);
	T["--dsw-alias-file-diff-added-marker"] = css(succ[0]);
	T["--dsw-alias-file-diff-deleted-bg"] = css(err[0], dark ? 0.14 : 0.12);
	T["--dsw-alias-file-diff-deleted-gutter"] = css(err[0], dark ? 0.09 : 0.08);
	T["--dsw-alias-file-diff-deleted-marker"] = css(err[0]);
	T["--dsw-alias-code-diff-added"] = css(succ[0], 0.1);
	T["--dsw-alias-code-diff-deleted"] = css(err[0], 0.1);

	// ---- masks (never tinted by the wallpaper: they sit on top of it) ------
	T["--dsw-alias-bg-mask-1"] = dark ? "rgba(4, 6, 16, 0.56)" : "rgba(10, 14, 32, 0.24)";
	T["--dsw-alias-bg-mask-2"] = dark ? "rgba(4, 6, 16, 0.28)" : "rgba(10, 14, 32, 0.12)";
	T["--dsw-alias-bg-mask-3"] = dark ? "rgba(4, 6, 16, 0.60)" : "rgba(10, 14, 32, 0.48)";
	T["--dsw-alias-bg-mask-photo"] = dark ? "rgba(3, 4, 10, 0.90)" : "rgba(4, 6, 16, 0.88)";
	T["--dsw-alias-bg-mask-drop"] = dark ? "rgba(13, 17, 35, 0.72)" : "rgba(244, 246, 252, 0.72)";

	// ---- borders ----------------------------------------------------------
	const brgb = dark ? hsl(hue, 0.45, 0.72) : hsl(hue, 0.45, 0.3);
	for (const [name, a] of [
		["--dsw-alias-border-l1", dark ? 0.09 : 0.07],
		["--dsw-alias-border-l2", dark ? 0.17 : 0.14],
		["--dsw-alias-border-l2-darkmode-thin", dark ? 0.09 : 0.1],
		["--dsw-alias-border-l3", dark ? 0.24 : 0.2],
		["--dsw-alias-border-l4", dark ? 0.3 : 0.28],
	]) {
		T[name] = css(brgb, a);
	}
	T["--dsw-alias-border-inverted"] = dark ? "rgba(255, 255, 255, 0.08)" : "rgba(255, 255, 255, 0.70)";
	T["--dsw-alias-border-inverted2"] = dark ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.84)";

	// ---- labels -----------------------------------------------------------
	T["--dsw-alias-label-primary"] = css(inkHi);
	T["--dsw-alias-label-primary-dimmed"] = css(inkMid);
	T["--dsw-alias-label-secondary"] = css(inkMid);
	T["--dsw-alias-label-tertiary"] = css(inkLo);
	T["--dsw-alias-label-caption"] = css(inkCaption);
	T["--dsw-alias-label-dimmed"] = css(inkDim);
	T["--dsw-alias-label-primary-foreground"] = css(inkOnPrimary);
	T["--dsw-alias-label-primary-inverted"] = css(inkOnPrimary);
	T["--dsw-alias-label-primary-bluish"] = css(dark ? ice : a5);
	T["--dsw-alias-label-document-preview"] = css(inkMid);
	T["--dsw-alias-label-deep-diving"] = css(dark ? a1 : a4);
	T["--dsw-alias-label-deep-diving-shimmer"] = css(a3, 0.55);
	T["--dsw-alias-label-shimmer"] = css(dark ? [255, 255, 255] : hsl(hue, 0.1, 0.05), dark ? 0.45 : 0.3);
	T["--dsw-alias-menu-icon"] = css(inkMid);
	T["--dsw-alias-link"] = css(dark ? a1 : a4);

	// ---- brand and buttons ------------------------------------------------
	T["--dsw-alias-brand-primary"] = css(inkHi);
	T["--dsw-alias-brand-primary-invert"] = css(inkHi);
	T["--dsw-alias-brand-primary-new-colorprimary-new-color"] = css(dark ? a1 : a3);
	T["--dsw-alias-brand-text"] = css(inkHi);
	T["--dsw-alias-button-primary-fill"] = css(inkHi);
	T["--dsw-alias-button-primary-hover"] = css(dark ? ice : inkMid);
	T["--dsw-alias-button-contrast-fill"] = css(dark ? offInk : hsl(hue, 0.2, 0.3));
	T["--dsw-alias-button-ghost-active-border"] = css(dark ? hsl(hue, 0.28, 0.4) : hsl(hue, 0.3, 0.55));
	// `info-fill` / `info-hover` back the primary send button, which ships as
	// `background: var(--dsw-alias-button-info-fill); color: #fff` — a HARD-CODED
	// white label. The binding constraint is therefore "white must read on it",
	// not "which way does luminance move", so these get their own steps indexed
	// against white rather than a rung on the page-indexed ramp.
	const infoFill = dark ? hsl(hue, 0.62, 0.63) : hsl(hue, 0.66, 0.44);
	const infoHover = dark ? hsl(hue, 0.66, 0.44) : hsl(hue, 0.62, 0.63);
	T["--dsw-alias-button-info-fill"] = css(infoFill);
	T["--dsw-alias-button-info-hover"] = css(infoHover);

	// ---- states -----------------------------------------------------------
	T["--dsw-alias-state-business-primary"] = css(dark ? a1 : a4);
	T["--dsw-alias-state-business-tertiary"] = css(dark ? surf(0.065, null, 0.06)[0] : hsl(hue, 0.32, 0.92));
	T["--dsw-alias-state-idle-primary"] = css(dark ? hsl(hue, 0.26, 0.4) : hsl(hue, 0.22, 0.78));
	T["--dsw-alias-state-success-primary"] = css(succLbl);
	T["--dsw-alias-state-success-secondary"] = css(succ[1]);
	T["--dsw-alias-state-success-tertiary"] = css(succ[2]);
	T["--dsw-alias-state-warn-primary"] = css(warn[0]);
	T["--dsw-alias-state-warn-secondary"] = css(warn[1]);
	T["--dsw-alias-state-warn-tertiary"] = css(warn[2]);
	T["--dsw-alias-state-warn-label"] = css(warnLbl);
	T["--dsw-alias-state-error-primary"] = css(err[0]);
	T["--dsw-alias-state-error-secondary"] = css(err[1]);

	const missing = ALL_TOKENS.filter((t) => T[t] === undefined);
	const extra = Object.keys(T).filter((t) => !ALL_TOKENS.includes(t));
	if (missing.length > 0 || extra.length > 0) {
		throw new Error(`token table mismatch in ${mode}: missing=${missing.join(",")} extra=${extra.join(",")}`);
	}
	const ordered = {};
	for (const t of ALL_TOKENS) ordered[t] = T[t];
	return ordered;
}

/**
 * The flat colour the page shows when the wallpaper is not painted.
 *
 * `<html>` cannot resolve `--dsw-alias-bg-base`: the presenter writes the
 * palette on `<body>`, and a custom property defined on a descendant is not
 * visible to an ancestor. So the wallpaper rules need a literal, and the right
 * literal is the theme's own base surface composited over its own scrim — the
 * colour the page settles at once the image has painted.
 *
 * @param {Record<string,string>} tokens - one mode's token table.
 * @param {string} scrim - that mode's scrim colour.
 * @returns {string} an opaque hex colour.
 */
function opaqueFloor(tokens, scrim) {
	const [baseRgb, baseA] = parseCss(tokens["--dsw-alias-bg-base"]);
	const [veilRgb] = parseCss(scrim);
	// The base surface composited over the scrim: `over` takes the FOREGROUND
	// first, and the base is what sits on top of the veil.
	return css(asInt(over(baseRgb, baseA, veilRgb)));
}

// --------------------------------------------------------------------------
// the alpha solver
// --------------------------------------------------------------------------

/** The surface stacks a reader actually looks at, outermost surface first. */
const STACKS = {
	frame: ["--dsw-alias-bg-base"],
	sidebar: ["--dsw-alias-bg-base", "--dsw-specific-sidebar-fill"],
	card: ["--dsw-alias-bg-base", "--dsw-alias-bg-layer-2"],
	menu: ["--dsw-alias-bg-base", "--dsw-specific-menu"],
	code: ["--dsw-alias-bg-base", "--dsw-alias-markdown-code-block"],
	bubble: ["--dsw-alias-bg-base", "--dsw-specific-bubble"],
};

/**
 * Which ink is read on which surface, and the floor it has to clear.
 *
 * The floors carry a small margin over the WCAG figure they stand for: the
 * percentile slices are measured on a 2560px render, and a browser displaying
 * the image at another size resamples slightly differently, so a solution
 * landing exactly on 4.50 here can land on 4.49 there. The margin is what makes
 * "passes here" mean "passes there".
 */
const MARGIN = 0.12;
const RULES = [
	["--dsw-alias-label-primary", 4.5 + MARGIN, ["frame", "sidebar", "card", "menu", "bubble", "code"]],
	["--dsw-alias-label-primary-dimmed", 4.5 + MARGIN, ["card", "menu"]],
	["--dsw-alias-label-secondary", 3.5 + MARGIN, ["card", "sidebar", "menu", "bubble"]],
	["--dsw-alias-label-tertiary", 3.0 + MARGIN, ["card", "sidebar"]],
];

/** The three slices of the image's own luminance distribution a reader scrolls through. */
const SLICES = ["p05", "p50", "p95"];

/**
 * Composite the veil, then the real surface stacks, over the real pixels.
 *
 * @param {object} an - the analysis record, read for `percentiles`.
 * @param {Record<string,string>} tokens - the candidate token table.
 * @param {number[]} veilRgb - the scrim's RGB bytes.
 * @param {number} veilA - the scrim's alpha.
 * @returns {{ok: boolean, worst: number, failures: string[]}}
 */
function checkTokens(an, tokens, veilRgb, veilA) {
	let worst = Infinity;
	const failures = [];

	const comp = (tokenChain, pct) => {
		const backdrop = over(veilRgb, veilA, an.percentiles[pct]);
		const layers = [];
		for (const name of tokenChain) {
			const value = tokens[name];
			const a = parseAlpha(value);
			layers.push([parseRgb(value), a === undefined ? 1 : a]);
		}
		return asInt(chain(layers, backdrop));
	};

	for (const [inkToken, floor, names] of RULES) {
		const ink = parseRgb(tokens[inkToken]);
		for (const name of names) {
			for (const pct of SLICES) {
				const c = contrast(ink, comp(STACKS[name], pct));
				worst = Math.min(worst, c);
				if (c < floor) failures.push(`${inkToken} on ${name}@${pct} = ${c.toFixed(2)} < ${floor}`);
			}
		}
	}
	return { ok: failures.length === 0, worst, failures };
}

/**
 * Search the veil strength, the base surface alpha and the surface lightness
 * for the combination that leaves the most artwork visible while every
 * contrast floor holds.
 *
 * Two knobs pull the same way — a stronger veil and a more opaque surface both
 * buy legibility by hiding the image — so the score is legibility first, then
 * the *least total covering*, `1 - (1-veil)(1-alpha)`, which is the fraction of
 * the image the two jointly hide rather than the sum of their alphas.
 *
 * `buildMode` does not depend on the veil, so its result is cached per
 * (alpha, delta): that turns 3150 table builds into 175 and leaves the search
 * dominated by the contrast checks, which are pure arithmetic.
 *
 * @param {object} an - the analysis record.
 * @param {"light"|"dark"} mode - the palette to solve.
 * @returns {object} the winning parameters, tokens, and measured worst contrast.
 */
function solve(an, mode) {
	const dark = mode === "dark";
	const hue = an.hue_mid;
	const veilRgb = hsl(hue, dark ? 0.34 : 0.24, dark ? 0.085 : 0.955);
	const veilAlphas = Array.from({ length: 18 }, (_, i) => Number((0.1 + 0.04 * i).toFixed(2)));
	const alphas = Array.from({ length: 35 }, (_, i) => Number((0.3 + 0.02 * (i + 1)).toFixed(2)));
	const deltas = dark ? [0, -0.01, 0.01, -0.02, 0.02] : [0, -0.015, 0.015, -0.03, 0.03];

	const cache = new Map();
	const tokensFor = (a, d) => {
		const key = `${a}|${d}`;
		let tokens = cache.get(key);
		if (tokens === undefined) {
			tokens = buildMode(an, mode, a, d);
			cache.set(key, tokens);
		}
		return tokens;
	};

	let best = null;
	for (const a of alphas) {
		for (const d of deltas) {
			const tokens = tokensFor(a, d);
			for (const va of veilAlphas) {
				const { ok, worst } = checkTokens(an, tokens, veilRgb, va);
				const cover = 1 - (1 - va) * (1 - a);
				// Passing solutions rank by covering, then by how far the
				// lightness had to be nudged. Failing ones rank by how close they
				// came, so the fallback is the most legible of a field that could
				// not be made legible rather than an arbitrary one.
				const score = ok ? [0, Number(cover.toFixed(4)), Math.abs(d)] : [1, -worst];
				if (best === null || compareScore(score, best.score) < 0) {
					best = { score, passes: ok, worst, cover, baseAlpha: a, lightnessDelta: d, veilAlpha: va, tokens };
				}
			}
		}
	}
	return best;
}

/** Lexicographic comparison of two score arrays. */
function compareScore(left, right) {
	for (let i = 0; i < left.length; i++) {
		if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
	}
	return 0;
}

// --------------------------------------------------------------------------
// image analysis
// --------------------------------------------------------------------------

/**
 * Python's `colorsys.rgb_to_hsv`, hue only, in float64.
 *
 * This is the precision the accent histogram is built at. The generator passes
 * `colorsys` the rows of a float32 numpy array, so the INPUTS are float32 — but
 * `colorsys` converts them to Python floats and does all its arithmetic in
 * float64. Emulating that exactly matters here for the same reason it does
 * everywhere else in this file: a hue that lands on the other side of a
 * histogram bin edge moves the accent band, and with it the hue of every token
 * in the palette.
 *
 * Note this is NOT {@link hueOf}, which rounds every intermediate to float32.
 * That emulation is correct for the OTHER readers of a hue, which consume it
 * straight out of a float32 numpy expression; it is wrong for this one, and
 * using it here cost 0.0012 of `accent_share` on two of the three shipped
 * images — enough to fail the parity check while every token still matched.
 */
function hueOf64(r, g, b) {
	const R = r;
	const G = g;
	const B = b;
	const max = Math.max(R, G, B);
	const min = Math.min(R, G, B);
	if (min === max) return 0;
	const d = max - min;
	const rc = (max - R) / d;
	const gc = (max - G) / d;
	const bc = (max - B) / d;
	let h;
	if (R === max) h = bc - gc;
	else if (G === max) h = 2 + rc - bc;
	else h = 4 + gc - rc;
	h = (h / 6) % 1;
	return h < 0 ? h + 1 : h;
}

/** Python's `colorsys.rgb_to_hsv`, hue only, in float32. */
function hueOf(r, g, b) {
	// Every intermediate is rounded to float32 because the generator computes
	// this on a numpy float32 array. The hue of a pixel is a ratio of two
	// float32 differences, and `hsl()` multiplies the result by 360: a float64
	// intermediate can land a pixel on the other side of a histogram bin edge,
	// which moves the whole accent band and every token derived from its hue.
	// Emulating the precision is what makes the two implementations agree
	// exactly rather than approximately.
	const R = fround(r);
	const G = fround(g);
	const B = fround(b);
	const max = fround(Math.max(R, G, B));
	const min = fround(Math.min(R, G, B));
	if (min === max) return 0;
	const d = fround(max - min);
	const rc = fround(fround(max - R) / d);
	const gc = fround(fround(max - G) / d);
	const bc = fround(fround(max - B) / d);
	let h;
	if (R === max) h = fround(bc - gc);
	else if (G === max) h = fround(fround(2 + rc) - bc);
	else h = fround(fround(4 + gc) - rc);
	h = fround(fround(h / 6) % 1);
	return h < 0 ? fround(h + 1) : h;
}

/** `Math.fround`, named for readability at the call sites below. */
const fround = Math.fround;

/**
 * Which histogram bin a hue falls in, matching `numpy.histogram`.
 *
 * `np.histogram(h, bins=36, range=(0,360))` puts a hue exactly on an interior
 * edge into the UPPER bin, and a hue of exactly 360 into the last bin. A plain
 * `floor(h/10)` disagrees on both: it sends 240 to bin 24 where numpy sends it
 * to 23, and it would send 360 to bin 36. Those are not hypothetical — one
 * image has 17 pixels at exactly 240°, and moving them changes which bins clear
 * the peak's 20% threshold, which changes the accent band, which changes the
 * hue of every token in the palette.
 *
 * @param {number} hue - hue in degrees, 0..360.
 * @returns {number} the bin index, 0..35.
 */
function hueBin(hue) {
	if (hue >= 360) return 35;
	if (hue <= 0) return 0;
	const exact = hue / 10;
	// An interior edge belongs to the upper bin; anything else floors.
	return Number.isInteger(exact) ? exact : Math.floor(exact);
}

/**
 * Indices of `keys` sorted ascending, by radix sort over the float bit pattern.
 *
 * A comparator sort of 3.7M elements costs seconds; four counting passes cost
 * milliseconds, and it is exact. The monotonicity trick is safe here because
 * every key is a non-negative finite float, so the IEEE bit pattern orders the
 * same way the values do.
 *
 * @param {Float32Array} keys - the sort keys.
 * @returns {Uint32Array} indices in ascending key order.
 */
function radixOrder(keys) {
	const n = keys.length;
	const bits = new Uint32Array(keys.buffer, keys.byteOffset, n);
	let from = new Uint32Array(n);
	let to = new Uint32Array(n);
	for (let i = 0; i < n; i++) from[i] = i;
	const count = new Uint32Array(256);
	for (let shift = 0; shift < 32; shift += 8) {
		count.fill(0);
		for (let i = 0; i < n; i++) count[(bits[from[i]] >>> shift) & 0xff]++;
		let sum = 0;
		for (let b = 0; b < 256; b++) {
			const c = count[b];
			count[b] = sum;
			sum += c;
		}
		for (let i = 0; i < n; i++) {
			const idx = from[i];
			to[count[(bits[idx] >>> shift) & 0xff]++] = idx;
		}
		const swap = from;
		from = to;
		to = swap;
	}
	return from;
}

/** The median of a Float32Array, matching `np.median` (mean of the two middles when even). */
function medianOf(values) {
	const order = radixOrder(values);
	const n = order.length;
	if (n === 0) return 0;
	const mid = Math.floor(n / 2);
	if (n % 2 === 1) return values[order[mid]];
	return (values[order[mid - 1]] + values[order[mid]]) / 2;
}

/** Mean of one channel over a set of pixel indices, as 0..255 in float32. */
function channelMean(rgba, indices, from, to, channel) {
	// Accumulated in float32 because numpy sums a float32 array: the generator
	// computes `window.mean(axis=0)` over `flat`, which is float32, and a
	// float64 accumulator drifts by a hundredth of a unit over 4000 samples.
	// That is invisible in the colour and decisive in the percentile slice the
	// contrast solver reads.
	let sum = 0;
	let count = 0;
	for (let i = from; i < to; i++) {
		sum = fround(sum + fround((rgba[indices[i] * 4 + channel] / 255) * 255));
		count++;
	}
	return count === 0 ? 0 : fround(sum / count);
}

/**
 * Measure one image's colour statistics.
 *
 * Every field here is read by the solver except the display ones
 * (`median`, `dark_share`, `mean_luma`, `highlight`, `accent_share`), which
 * exist so the settings UI can describe an image without solving it.
 *
 * @param {Uint8ClampedArray|Uint8Array} rgba - decoded RGBA bytes, 4 per pixel.
 * @param {number} width - image width in pixels.
 * @param {number} height - image height in pixels.
 * @returns {object} the analysis record, with `percentiles` keyed p05..p95.
 */
function analysePixels(rgba, width, height) {
	const n = width * height;
	const mx = new Float32Array(n);
	const luma = new Float32Array(n);
	const accent = [];
	const warm = [];
	let darkCount = 0;

	for (let i = 0; i < n; i++) {
		const p = i * 4;
		// Float32 throughout, matching the generator's numpy float32 array: the
		// saturation test below is a threshold comparison, and a float64
		// intermediate can put a pixel on the wrong side of it.
		const r = fround(rgba[p] / 255);
		const g = fround(rgba[p + 1] / 255);
		const b = fround(rgba[p + 2] / 255);
		const hi = fround(Math.max(r, g, b));
		const lo = fround(Math.min(r, g, b));
		mx[i] = hi;
		if (hi < 0.25) darkCount++;
		luma[i] = fround(fround(0.2126 * r) + fround(0.7152 * g) + fround(0.0722 * b));
		const sat = hi > 0 ? fround(fround(hi - lo) / fround(Math.max(hi, 1e-6))) : 0;
		if (sat > 0.35 && hi > 0.45) accent.push(i);
		if (sat > 0.3 && hi > 0.4) warm.push(i);
	}

	// --- dominant accent hue band, from a bounded sample -------------------
	let hueBand = null;
	let accentShare = 0;
	if (accent.length > 0) {
		// Mirrors the Python generator's stride exactly, including its known
		// sensitivity to the mask count; see the note there. Keeping the two in
		// step matters more than making either one reproducible on its own,
		// because this statistic is compared between them.
		const step = Math.max(1, Math.floor(accent.length / 6000));
		const hist = new Float64Array(36);
		let samples = 0;
		for (let i = 0; i < accent.length; i += step) {
			const p = accent[i] * 4;
			// The generator builds this hue from a float32 numpy row, so each
			// channel entering `colorsys` is a float32 division of a byte by
			// 255 — numpy does that division in float32, not by dividing in
			// float64 and then narrowing. Inside `colorsys` every operation is
			// float64, including `hsv[:, 0] * 360` and the bin-edge comparison.
			const h = hueOf64(
				fround(rgba[p] / 255),
				fround(rgba[p + 1] / 255),
				fround(rgba[p + 2] / 255),
			) * 360;
			hist[hueBin(h)]++;
			samples++;
		}
		let peak = 0;
		for (let b = 1; b < 36; b++) if (hist[b] > hist[peak]) peak = b;
		const thr = hist[peak] * 0.2;
		let i = peak;
		let j = peak;
		while (i - 1 >= 0 && hist[i - 1] >= thr) i--;
		while (j + 1 < 36 && hist[j + 1] >= thr) j++;
		// The band is reported in hue degrees, so the last bin's upper edge is
		// 360 rather than 360-plus-one-bin.
		hueBand = [i * 10, (j + 1) * 10];
		let sum = 0;
		for (let b = i; b <= j; b++) sum += hist[b];
		accentShare = sum / Math.max(1, samples);
	}

	// --- the sparse warm accent, which drives the warn states --------------
	let warmShare = 0;
	let warmHue = null;
	if (warm.length > 0) {
		const step = Math.max(1, Math.floor(warm.length / 4000));
		const hues = [];
		for (let i = 0; i < warm.length; i += step) {
			const p = warm[i] * 4;
			hues.push(fround(hueOf(rgba[p] / 255, rgba[p + 1] / 255, rgba[p + 2] / 255) * 360));
		}
		const selected = hues.filter((h) => h >= 15 && h <= 75).sort((a, b) => a - b);
		if (selected.length >= 20) {
			const mid = Math.floor(selected.length / 2);
			warmHue = selected.length % 2 === 1 ? selected[mid] : (selected[mid - 1] + selected[mid]) / 2;
			// The denominator is the FULL sample, not the selected subset: this is
			// a share of the warm-capable pixels, which is what the 2% threshold
			// in `buildMode` is calibrated against.
			warmShare = selected.length / hues.length;
		}
	}

	// --- highlight tint: the brightest pixels ------------------------------
	//
	// `np.argsort(mx)[-top:]` on a float32 array with heavy ties does NOT mean
	// "the top N values": quicksort's ordering among equal keys is unspecified,
	// so WHICH of the tied pixels land in the slice varies with numpy's internal
	// pivoting. That made the statistic depend on the sort algorithm rather than
	// on the image.
	//
	// Instead: find the highest byte threshold whose pixel count reaches the
	// quota, then average EVERY pixel at or above it. Deterministic,
	// order-independent, and spatially unbiased — a fixed-size slice of a tied
	// tier would be none of those, because it would describe whichever corner of
	// the image happened to come first. It also uses more of the data than the
	// 0.5% slice did, which makes the tint steadier.
	//
	// The mean is taken over INTEGER channel sums. Summing floats accumulates
	// rounding error whose size depends on the summation order, and no two
	// implementations agree on that order; on these images it moves the result
	// by one byte, which is enough to change a hue and every token derived from
	// it. A byte sum is an exact integer, so both languages compute the same
	// rational number and round it the same way.
	const topCount = Math.max(1, Math.floor(n / 200));
	const mb = new Uint8Array(n);
	const buckets = new Uint32Array(256);
	for (let i = 0; i < n; i++) {
		const byte = Math.round(mx[i] * 255);
		mb[i] = byte;
		buckets[byte]++;
	}
	let threshold = 255;
	let seen = buckets[255];
	while (seen < topCount && threshold > 0) {
		threshold--;
		seen += buckets[threshold];
	}
	let sr = 0;
	let sg = 0;
	let sb = 0;
	let taken = 0;
	for (let i = 0; i < n; i++) {
		if (mb[i] < threshold) continue;
		const p = i * 4;
		sr += rgba[p];
		sg += rgba[p + 1];
		sb += rgba[p + 2];
		taken++;
	}
	const hl = taken === 0 ? [0, 0, 0] : [sr / (taken * 255), sg / (taken * 255), sb / (taken * 255)];
	const hlRgb = hl.map((c) => pyRound(c * 255));
	const highlightHue = fround(hueOf(hl[0], hl[1], hl[2]) * 360);

	// --- the distribution text has to survive ------------------------------
	const order = radixOrder(luma);
	const percentiles = {};
	for (const [name, q] of [["p05", 0.05], ["p25", 0.25], ["p50", 0.5], ["p75", 0.75], ["p95", 0.95]]) {
		const centre = Math.trunc(n * q);
		const from = Math.max(0, centre - 2000);
		const to = Math.min(n, centre + 2000);
		percentiles[name] = [
			channelMean(rgba, order, from, to, 0),
			channelMean(rgba, order, from, to, 1),
			channelMean(rgba, order, from, to, 2),
		];
	}

	let lumaSum = 0;
	for (let i = 0; i < n; i++) lumaSum += luma[i];
	const medianRgb = [0, 1, 2].map((channel) => {
		const values = new Float32Array(n);
		for (let i = 0; i < n; i++) values[i] = rgba[i * 4 + channel] / 255;
		return pyRound(medianOf(values) * 255);
	});

	return {
		hue_band: hueBand,
		hue_mid: hueBand === null ? 228.0 : Number((((hueBand[0] + hueBand[1]) / 2).toFixed(1))),
		accent_share: Number(accentShare.toFixed(4)),
		warm_hue: warmHue === null ? null : warmHue,
		warm_share: Number(warmShare.toFixed(4)),
		highlight: `#${hlRgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`,
		highlight_rgb: hlRgb,
		highlight_hue: Number(highlightHue.toFixed(1)),
		dark_share: Number((darkCount / n).toFixed(4)),
		mean_luma: Number((lumaSum / n).toFixed(4)),
		median: `#${medianRgb.map((c) => c.toString(16).padStart(2, "0")).join("")}`,
		median_rgb: medianRgb,
		percentiles,
	};
}

/**
 * Solve both palettes for one image and package them the way the plugin stores
 * and applies them.
 *
 * @param {Uint8ClampedArray|Uint8Array} rgba - decoded RGBA bytes.
 * @param {number} width - image width.
 * @param {number} height - image height.
 * @returns {{analysis: object, tokens: object, scrim: object, floor: object, solver: object}}
 */
function solvePixels(rgba, width, height) {
	const analysis = analysePixels(rgba, width, height);
	const tokens = {};
	const scrim = {};
	const floor = {};
	const solver = {};
	for (const mode of ["light", "dark"]) {
		const s = solve(analysis, mode);
		const veil = [...hsl(analysis.hue_mid, mode === "dark" ? 0.34 : 0.24, mode === "dark" ? 0.085 : 0.955), s.veilAlpha];
		tokens[mode] = s.tokens;
		scrim[mode] = css(veil.slice(0, 3), veil[3]);
		floor[mode] = opaqueFloor(s.tokens, scrim[mode]);
		solver[mode] = {
			baseAlpha: s.baseAlpha,
			lightnessDelta: s.lightnessDelta,
			veilAlpha: s.veilAlpha,
			veilRgb: veil.slice(0, 3),
			scrim: scrim[mode],
			worstContrast: Number(s.worst.toFixed(2)),
			passes: s.passes,
		};
	}
	return { analysis, tokens, scrim, floor, solver };
}

export {
	ALL_TOKENS,
	LADDER,
	MODE_CONST,
	RULES,
	SLICES,
	STACKS,
	analysePixels,
	asInt,
	buildMode,
	chain,
	checkTokens,
	compareScore,
	contrast,
	css,
	hsl,
	hueOf,
	luminance,
	medianOf,
	mix,
	opaqueFloor,
	over,
	parseAlpha,
	parseCss,
	parseRgb,
	pyRound,
	radixOrder,
	solve,
	solvePixels,
};
