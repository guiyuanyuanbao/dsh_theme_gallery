/**
 * 画廊 Gallery — wallpaper themes for the DSH Web client.
 *
 * Three wallpapers. Each carries a palette measured from that image alone
 * (113 alias tokens, both light and dark), and the image itself, painted as
 * the background of `<html>`.
 *
 * ## The wallpaper is the canvas background
 *
 * The obvious way to put an image behind a UI is to add a fixed-position layer
 * and push the shell above it. The earlier paste-in snippets under
 * `theme-work/` did exactly that, and it is where they broke — twice, in ways
 * that needed a diagnostic script to explain. Both failures came from the same
 * root: `z-index` arithmetic against another package's CSS-module class names.
 *
 * This plugin never adds a layer and never touches another package's DOM. It
 * sets the background of `<html>`: the root element's background *is* the
 * canvas, painted beneath every element by definition, so no stacking context,
 * `z-index`, or `isolation` on any other element can get in front of it or
 * behind it. The scrim rides in the same `background-image` list as a flat
 * gradient, for the same reason.
 *
 * ## The palette composes with the Appearance row rather than replacing it
 *
 * The first version registered six themes through `theme.register()`, one per
 * image per palette. That works, but it makes the wallpaper and the palette
 * the same choice: picking Light in Settings → Appearance silently turned the
 * wallpaper off, because a third-party theme id had replaced the built-in one.
 * The plugin then had to decide whose choice was authoritative, and any answer
 * either fought the user or lost their wallpaper.
 *
 * `theme.overrideTokens()` removes the conflict. It stacks a token layer over
 * whatever theme is active, taking a `{ light, dark }` pair per token and
 * picking the half that matches the resolved scheme. So the Appearance row
 * keeps owning light/dark/system — including `system`, which follows the OS —
 * and this plugin only ever contributes the per-image tint on top. The user's
 * palette choice and the wallpaper are now independent, and neither can turn
 * the other off.
 *
 * ## Why the preference is a Host Config, not `localStorage`
 *
 * `localStorage` was the first implementation. It is per-origin, so the choice
 * is lost whenever the port changes; it is invisible to every other surface,
 * including the agent's own shell commands; it cannot be inspected or reset
 * from Settings; and it disappears with the browser profile. The platform
 * already has a durable, inspectable, user-editable store for exactly this: a
 * plugin `Config` with `.volatile()` fields, which the Settings UI writes
 * through `configForms` and which lands in the profile's `cordis.patch.yml`.
 * The Host half owns that schema; this module reads and writes it.
 */
window.__ModuleLoader__.load({
	id: "dsh-theme-gallery",
	factory: (require) => {
		const React = require("react");
		const h = React.createElement;

		/* @PALETTES@ */

		/* @SOLVER@ */

		/** Wallpaper slugs shipped with the bundle, listed in this order. */
		const SLUGS = ["shatter", "portrait", "stage"];
		/** The wallpaper value meaning "no wallpaper". */
		const NONE = "none";
		/**
		 * Profile entry id.
		 *
		 * This is the `configForms` key and the settings namespace in one: the
		 * Host keys a namespace by the profile entry's id, which is why the
		 * bundle's `cordis.patch.yml` inserts the row as `theme-gallery`.
		 */
		const ENTRY_ID = "theme-gallery";
		/** Wallpaper route prefix served by this bundle's Host half. */
		const ASSET_BASE = "/theme-gallery/";
		/** `<html>` attribute switching the wallpaper rules on. */
		const ART_ATTRIBUTE = "data-dsh-gallery";
		/** Inline variables holding the wallpaper URL, the active scrim, and the floor. */
		const ART_VARIABLE = "--dsh-gallery-art";
		const SCRIM_VARIABLE = "--dsh-gallery-scrim";
		const FLOOR_VARIABLE = "--dsh-gallery-floor";
		const BLUR_VARIABLE = "--dsh-gallery-blur";
		/**
		 * Per-page opacity variables.
		 *
		 * One variable per adjustable surface, written on `<html>` beside the
		 * wallpaper variables, and read by a scoped rule for that surface alone.
		 * They exist because the alias tokens the pages actually paint with are
		 * GLOBAL: `--dsw-alias-bg-base` feeds the conversation, the settings
		 * panel reads `--dsw-alias-bg-layer-2`, the sidebar reads
		 * `--dsw-specific-sidebar-fill`. Overriding any of those to make one
		 * page readable would change every other page with it, so the opacity is
		 * applied per surface instead of through the shared tokens.
		 */
		const OPACITY_VARIABLES = {
			opacityPanel: "--dsh-gallery-opacity-panel",
			opacitySidebar: "--dsh-gallery-opacity-sidebar",
			opacityChat: "--dsh-gallery-opacity-chat",
			opacityInput: "--dsh-gallery-opacity-input",
		};
		/**
		 * The elements each opacity variable drives.
		 *
		 * Deliberately attribute- and substring-based rather than a CSS-module
		 * class: the shipped client names its own classes with build-hashed
		 * prefixes, and those change between releases, while `role="dialog"` is
		 * semantic and the two column names have been stable. Each selector is
		 * anchored to `html[data-dsh-gallery]` so none of them applies at all
		 * while no wallpaper is selected.
		 */
		const OPACITY_SELECTORS = {
			opacityPanel: `html[${ART_ATTRIBUTE}] [role="dialog"]`,
			opacitySidebar: `html[${ART_ATTRIBUTE}] [class*=sidebarCol]`,
			opacityChat: `html[${ART_ATTRIBUTE}] [class*=frame]`,
			/**
			 * The prompt box: the CARD, not the seat.
			 *
			 * The seat is the full-width band that carries the client's fade and
			 * holds the card; the card is the rounded box the text is typed into
			 * and the only part the user reads as "the input". Painting the seat
			 * would tint a band much wider than the box.
			 *
			 * The card is found by `[class*=card]` under the seat. Its class is
			 * build-hashed (`RlGAzG_card` today), so the substring is the only
			 * stable handle; scoping it under the seat is what keeps it from
			 * matching a "card" anywhere else in the document.
			 *
			 * `[data-composer-seat][data-conversation-region="composer"]` is ONE
			 * element carrying both attributes — the shipped client sets them on
			 * the same node — so they are written as two attribute selectors side
			 * by side, never as an ancestor/descendant pair. Writing them apart
			 * would match nothing at all, silently.
			 */
			opacityInput: `html[${ART_ATTRIBUTE}] [data-composer-seat][data-conversation-region="composer"] [class*=card]`,
		};
		/**
		 * Additional selectors for a surface that paints in more than one place.
		 *
		 * The right-hand sidebar is the case: it is a portal panel rendered
		 * beside the conversation, NOT inside it, so `[class*=frame]` never
		 * reaches it — its ancestor chain runs `tabHost → tabCell → tabLayout →
		 * surface → panel`, with no frame at any level. It still paints
		 * `bg-base`, so it belongs to the CONVERSATION surface; without an entry
		 * here it kept the token's raw solved alpha while the conversation
		 * around it followed the slider, and the two read as different
		 * brightnesses side by side.
		 *
		 * Keyed by surface, so these extra selectors get that surface's fill and
		 * its variable — a second selector can never disagree with the first
		 * about colour or alpha.
		 */
		const OPACITY_EXTRA_SELECTORS = {
			opacityChat: [
				/**
				 * The right sidebar's pane.
				 *
				 * `[class*=tabHost]` is the element that natively carries
				 * `background: var(--dsw-alias-bg-base)`, so it is the one that
				 * has to follow the slider.
				 *
				 * The two `:not()` guards are load-bearing, not tidiness. The
				 * panel's markup is
				 *
				 *     _tabHost_…        the pane itself, paints bg-base
				 *     _tabHostHeader_…  its 38px title bar, ALSO paints bg-base
				 *     _tabHostBody_…    its body, paints nothing
				 *
				 * and "tabHostHeader" and "tabHostBody" both CONTAIN "tabHost".
				 * A bare substring therefore hit all three, which did two things:
				 * it ADDED a layer to the body — an element the client leaves
				 * transparent — and it overwrote the header's own value, so the
				 * panel composited four masked layers where the conversation
				 * beside it had three and its title bar stopped matching the pane
				 * below it. Measured with a solid magenta canvas, the panel read
				 * rgb(33, 11, 41) against the conversation's rgb(52, 9, 60).
				 *
				 * Excluding both leaves exactly one element: the pane.
				 */
				`html[${ART_ATTRIBUTE}] [class*=panelBody] [class*=tabHost]:not([class*=tabHostHeader]):not([class*=tabHostBody])`,
			],
		};
		/**
		 * The token each surface paints with, and therefore the colour whose
		 * alpha the opacity control scales.
		 *
		 * These are the surfaces' REAL sources, read off the running client:
		 * the dialog paints from `bg-layer-2`, the sidebar column from the
		 * sidebar-specific fill, and the conversation frame from `bg-base`.
		 * Naming them here rather than writing them into the stylesheet keeps
		 * the selector, the token, and the variable in one table, so a surface
		 * cannot end up with a selector that targets a token it does not use.
		 */
		const OPACITY_TOKENS = {
			opacityPanel: "--dsw-alias-bg-layer-2",
			opacitySidebar: "--dsw-specific-sidebar-fill",
			opacityChat: "--dsw-alias-bg-base",
			/**
			 * The composer card's own fill. Read off the shipped client:
			 * `.RlGAzG_card` paints `background: var(--dsw-specific-input-major)`,
			 * and the solver gives that token its OWN alpha (0.59–0.69 across
			 * the three shipped images) rather than reusing the conversation
			 * frame's `bg-base` (0.44). So the two are already independent
			 * colours, and the input box can be tuned without touching the page
			 * behind it — which is exactly the control a reader needs, since the
			 * box holds the text being typed.
			 */
			opacityInput: "--dsw-specific-input-major",
		};
		/**
		 * The scrims that fade to a surface token and therefore assume it is
		 * OPAQUE.
		 *
		 * The client paints some scrims as `transparent -> token`, and the
		 * composer is the one that matters: its seat carries
		 * `linear-gradient(180deg, transparent 0px, var(--dsw-alias-bg-base)
		 * 36px)`, a ramp whose whole job is to hide the transcript sliding under
		 * the composer. With an opaque token that ramp is invisible, because the
		 * layer behind the fade is the same colour: it blends a colour into
		 * itself. A wallpaper makes the token translucent and the `transparent`
		 * start becomes a real hole — for the first 36px of the composer the
		 * transcript scrolls past fully legible, and the composer reads lighter
		 * than the conversation surface directly above it, while the composer's
		 * own card (which carries its own opaque-ish background) still looks
		 * right. That asymmetry is the bug, and it is why the defect looks like
		 * "the outer box lost its mask but its children kept theirs".
		 *
		 * So each scrim is restated as a FLAT fill of its surface's own colour at
		 * that surface's own chosen alpha — the identical declaration the surface
		 * itself receives. The mask then matches the surface above it instead of
		 * being one layer short, and it follows the same slider, so at 100 it is
		 * once again a true opaque mask.
		 *
		 * The selector is the surface's own selector PLUS the scrim element.
		 * For the composer the two coincide — the surface selector already ends
		 * in `[data-composer-seat]` — so the scrim rule exists solely to drop
		 * the client's `transparent -> token` gradient, which `background-color`
		 * alone cannot do.
		 */
		const OPACITY_SCRIMS = {
			opacityChat: "[data-composer-seat][data-conversation-region=\"composer\"]",
		};
		/**
		 * The scoped rules that apply each surface's opacity.		 *
		 * Generated from the two tables above so the three of them cannot drift
		 * apart. Each rule re-states the surface's OWN background colour, so the
		 * hue is always the one the solver measured for this image — the control
		 * changes how much of the wallpaper comes through, never what colour the
		 * page is.
		 *
		 * The percentage is an ABSOLUTE alpha: 0 is fully transparent, 100 fully
		 * opaque, on every theme and every surface.
		 *
		 * ## Why the colour is forced opaque first
		 *
		 * `color-mix` against `transparent` SCALES a colour's alpha — it produces
		 * `alpha * P/100` — so it can only ever make a surface MORE transparent
		 * than its token. That is precisely the wrong direction here: the reason
		 * this control exists is that a solved alpha is often too transparent to
		 * read against, so the values a user needs are ABOVE it. Mixing toward
		 * transparent cannot express them at all: asking for 95% on a panel that
		 * solved at 0.61 saturates at 100% and still paints 0.61.
		 *
		 * `rgb(from C r g b / 1)` takes the token's channels and discards its
		 * alpha, so mixing THAT against transparent yields `1 * P/100` — the
		 * requested alpha exactly, whatever the token solved at. The token still
		 * supplies the colour; it no longer supplies the alpha.
		 *
		 * This is also why the client does not need to know any solved alpha to
		 * paint: the value goes straight into the variable.
		 *
		 * Anchoring every selector to `html[${ART_ATTRIBUTE}]` means the rules do
		 * not exist at all while no wallpaper is selected — with no wallpaper the
		 * tokens keep their solved values and the app looks exactly as it does
		 * without this plugin.
		 *
		 * Where relative colour syntax or `color-mix` is unsupported the whole
		 * declaration is dropped and the token's solved value stands, which is the
		 * appearance from before the control existed.
		 */
		/**
		 * One surface's fill: its token's colour at the surface's chosen alpha.
		 *
		 * Factored out because the surface rule and its scrim rule must emit the
		 * EXACT same declaration. A scrim only matches the surface above it if it
		 * paints the same colour at the same alpha; two copies of this expression
		 * could drift into two different alphas, which is the defect being fixed.
		 */
		function opacityFill(key) {
			return `background-color: color-mix(in srgb, rgb(from var(${OPACITY_TOKENS[key]}) r g b / 1) var(${OPACITY_VARIABLES[key]}, 100%), transparent);`;
		}
		function opacityRules() {
			// A scrim normally sits INSIDE its surface, so it gets its own rule in
			// addition to the surface's. Only a scrim that IS the surface — same
			// selector, so both rules would target one element — is folded into a
			// single rule carrying both declarations.
			const foldedKeys = new Set(
				Object.entries(OPACITY_SCRIMS)
					.filter(([key, scrim]) => OPACITY_SELECTORS[key] === scrim)
					.map(([key]) => key),
			);
			const rules = Object.keys(OPACITY_VARIABLES)
				.filter((key) => !foldedKeys.has(key))
				.map((key) => [
					`${OPACITY_SELECTORS[key]} {`,
					`  ${opacityFill(key)}`,
					"}",
				].join("\n"));
			// A surface that paints in more than one place needs the same fill on
			// each of them. They are separate rules rather than a selector list so
			// a reader can see which element each one targets, and so one dead
			// selector cannot take the others down with it.
			for (const [key, selectors] of Object.entries(OPACITY_EXTRA_SELECTORS)) {
				for (const selector of selectors) {
					rules.push([
						`${selector} {`,
						`  ${opacityFill(key)}`,
						"}",
					].join("\n"));
				}
			}
			// A scrim is the client's own `transparent -> token` RAMP. The shipped
			// client ends it at the OPAQUE token, so while the token is opaque the
			// ramp blends that colour into the identical colour behind it and the
			// element is invisible — only its first 36px do any work, fading the
			// transcript in. Once the token goes translucent the `transparent`
			// START becomes a real hole and those 36px stop masking, which is the
			// defect this rule exists for.
			//
			// The ramp is therefore DROPPED, not repainted. Two repaintings were
			// tried and both were wrong:
			//
			//   * a flat fill of the surface's colour: turns the whole element into
			//     a second copy of the page — a 238px block over the composer.
			//   * the same ramp ending at the surface's own alpha: keeps the mask
			//     but adds a layer the surface behind it already provides.
			//
			// Both leave the composer band darker than the rest of the surface.
			// Measured on a flat canvas, the band read rgb(33, 10, 41) against
			// rgb(52, 9, 60) elsewhere; with the ramp removed it matches.
			//
			// Dropping it is correct because the surface rule already paints this
			// element's background: the seat is a child of the frame, which the
			// plugin fills at the conversation's alpha. The transcript therefore
			// still fades behind an opaque-enough layer — the surface's own — and
			// no second one is stacked on top.
			for (const [key, scrim] of Object.entries(OPACITY_SCRIMS)) {
				const surface = OPACITY_SELECTORS[key];
				// When the scrim is the surface itself the selector is emitted
				// once. Otherwise the scrim is a descendant, and concatenating the
				// two selectors is ALSO what gives the rule enough specificity to
				// beat the client's own `.Root[data-phase] .Seat` rule.
				const selector = surface === scrim ? surface : `${surface} ${scrim}`;
				rules.push([
					`${selector} {`,
					"  background-image: none;",
					"  background-color: transparent;",
					"}",
				].join("\n"));
			}
			return rules.join("\n");
		}

		/** Bounds shared with the Host schema; mirrored so the UI cannot offer an invalid value. */
		const DIM_RANGE = { min: 0, max: 200, step: 5, fallback: 100 };
		const BLUR_RANGE = { min: 0, max: 24, step: 1, fallback: 0 };
		/**
		 * Absolute surface opacity: 0 is fully transparent, 100 fully opaque.
		 *
		 * The two ends mean exactly what they say on every theme and every
		 * surface. There is deliberately NO fallback that renders as a slider
		 * position for "the solved alpha" — the solved alpha is not a point on
		 * this scale, it is a per-theme, per-surface property (0.36 to 0.66
		 * across the shipped six), and pretending otherwise is what made the
		 * previous control confusing: its top setting meant "unchanged", so the
		 * adjustment a user actually wanted was not reachable at either end.
		 *
		 * "Use the solved value" is instead an ACTION — dropping the theme's
		 * entry from the map — offered as its own button beside the sliders.
		 *
		 * The step is 1 rather than 5 so the slider can NAME the solved alpha it
		 * starts from. The shipped palettes solve to values like 0.61 and 0.44,
		 * and a step of 5 cannot represent either: 61 would snap to 60 and 44 to
		 * 45, so the number on screen would disagree with the page beside it.
		 */
		const OPACITY_RANGE = { min: 0, max: 100, step: 1, fallback: 100 };

		/**
		 * The width an image is resampled to before its palette is solved.
		 *
		 * The same 2560 the generator uses, for the same reason: it bounds the
		 * work at 3.7M pixels, which is what the solver's search was measured
		 * against, and it makes a user's wallpaper comparable to the shipped
		 * three. It is also the size the re-encoded image is stored at, so the
		 * pixels the palette came from are the pixels that get painted.
		 */
		const SOLVE_WIDTH = 2560;

		/** Largest image the browser will analyse, matching the Host's ceiling. */
		const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

		/** Locale namespace for every string this plugin renders. */
		const NS = "theme-gallery";
		const zh = {
			"section": "壁纸",
			"shatter": "碎镜",
			"portrait": "逆光",
			"stage": "舞台",
			"none": "无壁纸",
			"choose": "选择壁纸",
			"dim": "压暗程度",
			"dimHint": "100% 是经过对比度求解的强度；调低会露出更多画面，但文字与背景的对比度会下降。",
			"blur": "背景模糊",
			"blurHint": "模糊壁纸细节，让上方文字更平静。0 表示关闭。",
			"opacity": "页面不透明度",
			"opacityHint": "0% 完全透明，100% 完全不透明。默认显示这张壁纸配色求解时的实测不透明度，可直接在此基础上调整。",
			"opacityPanel": "设置面板",
			"opacitySidebar": "侧边栏",
			"opacityChat": "聊天页面",
			"opacityInput": "输入框",
			"opacityInputHint": "输入框承载你正在输入的文字。调高会更不透明、文字看得更清；调低则透出更多壁纸。",
			"restoreSolved": "恢复求解值",
			"opacityNeedsWallpaper": "选择一张壁纸后才能调整页面不透明度。",
			"reset": "恢复默认",
			"saved": "已保存到配置",
			"saving": "保存中…",
			"unsaved": "仅本次会话生效",
			"unavailable": "当前页面不写入配置，设置仅在本次会话生效。",
			"loading": "正在读取…",
			"mine": "我的壁纸",
			"add": "添加壁纸",
			"addHint": "上传一张图片，或粘贴图片链接。配色会从图片本身自动计算。",
			"upload": "选择图片",
			"urlLabel": "图片链接",
			"urlPlaceholder": "https://example.com/wallpaper.jpg",
			"addFromUrl": "从链接添加",
			"analyzing": "正在分析图片并计算配色…",
			"analyzingHint": "分析 113 个配色令牌并求解对比度，通常需要一两秒。",
			"added": "已添加",
			"delete": "删除",
			"deleteConfirm": "确定删除这张壁纸？",
			"rename": "重命名",
			"empty": "还没有自定义壁纸。",
			"failed": "添加失败",
			"unsupported": "这个文件不是浏览器能解码的图片。",
			"tooBig": "图片太大了。",
			"contrast": "最低对比度",
			"custom": "自定义",
		};
		const en = {
			"section": "Wallpaper",
			"shatter": "Shatter",
			"portrait": "Portrait",
			"stage": "Stage",
			"none": "None",
			"choose": "Choose a wallpaper",
			"dim": "Dimming",
			"dimHint": "100% is the contrast-solved strength; lowering it reveals more of the picture and reduces text contrast.",
			"blur": "Backdrop blur",
			"blurHint": "Blurs the artwork's detail so text above it reads more calmly. 0 turns it off.",
			"opacity": "Page opacity",
			"opacityHint": "0% is fully transparent and 100% fully opaque. The default shows this wallpaper's own solved opacity, so you adjust from what the palette actually measured.",
			"opacityPanel": "Settings panel",
			"opacitySidebar": "Sidebar",
			"opacityChat": "Conversation",
			"opacityInput": "Input box",
			"opacityInputHint": "The input box holds the text you are typing. Raise it to hide more of the wallpaper behind your words; lower it to let more through.",
			"restoreSolved": "Restore solved",
			"opacityNeedsWallpaper": "Choose a wallpaper to adjust page opacity.",
			"reset": "Reset to defaults",
			"saved": "Saved to configuration",
			"saving": "Saving…",
			"unsaved": "This session only",
			"unavailable": "This page does not write configuration; the setting lasts for this session only.",
			"loading": "Loading…",
			"mine": "My wallpapers",
			"add": "Add a wallpaper",
			"addHint": "Upload an image, or paste an image link. The palette is computed from the picture itself.",
			"upload": "Choose an image",
			"urlLabel": "Image link",
			"urlPlaceholder": "https://example.com/wallpaper.jpg",
			"addFromUrl": "Add from link",
			"analyzing": "Analysing the image and solving the palette…",
			"analyzingHint": "113 colour tokens, solved for contrast. This usually takes a second or two.",
			"added": "Added",
			"delete": "Delete",
			"deleteConfirm": "Delete this wallpaper?",
			"rename": "Rename",
			"empty": "No custom wallpapers yet.",
			"failed": "Could not add it",
			"unsupported": "That file is not an image this browser can decode.",
			"tooBig": "That image is too large.",
			"contrast": "Lowest contrast",
			"custom": "Custom",
		};

		/**
		 * The stylesheet.
		 *
		 * Two background layers on `<html>`: the scrim gradient first, the
		 * artwork second. Both are the root element's own background, so they
		 * are painted as the canvas — beneath every element in the document and
		 * above nothing. The two `background-size` values follow the same order
		 * (`100% 100%` stretches the flat gradient; `cover` fits the image).
		 *
		 * `background-color` is a variable rather than a literal because the
		 * value differs per wallpaper and per scheme, and the same declarations
		 * are re-emitted by the Host's boot script before this stylesheet
		 * exists. Both halves therefore read the same variable names, and this
		 * sheet only has to restate the rules, not the numbers.
		 */
		function stylesheet() {
			return `
html[${ART_ATTRIBUTE}] {
  background-color: var(${FLOOR_VARIABLE});
  background-image: linear-gradient(var(${SCRIM_VARIABLE}), var(${SCRIM_VARIABLE})), var(${ART_VARIABLE});
  background-size: 100% 100%, cover;
  background-position: center center, center center;
  background-repeat: no-repeat, no-repeat;
  background-attachment: fixed, fixed;
}
/* Blur is a separate fixed layer rather than a filter on <html>: a filter on
   the root element would create a containing block and change how every
   fixed-position element in the application is positioned. The value is a
   FILTER, not a length: blur(0px) still creates a backdrop root and makes
   the compositor rasterize the viewport behind it every frame, while none
   does not, so leaving blur off costs nothing. */
html[${ART_ATTRIBUTE}]::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  backdrop-filter: var(${BLUR_VARIABLE}, none);
}

/* Per-page opacity. Each rule is generated from the surface tables above, so
   the selector, the token, and the variable cannot drift apart; see the
   opacityRules function. */
${opacityRules()}

/* The picker cards and the add flow. There is no sidebar action any more: the
   wallpaper is chosen in the settings page only, so nothing here styles a
   foot button. */
.dsh-gallery-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---- the settings section ---- */
.dsh-gallery-section {
  display: flex;
  flex-direction: column;
  gap: 16px;
  width: 100%;
  color: var(--dsw-alias-label-primary);
}
.dsh-gallery-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}
.dsh-gallery-group:last-child { border-bottom: none; }
.dsh-gallery-title {
  font-size: 14px;
  font-weight: 400;
  line-height: 22px;
}
.dsh-gallery-help {
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
.dsh-gallery-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(148px, 1fr));
  gap: 8px;
}
.dsh-gallery-card {
  position: relative;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  padding: 0;
  overflow: hidden;
  color: var(--dsw-alias-label-primary);
  background: transparent;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-lg);
}
.dsh-gallery-card:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-gallery-card:has(.dsh-gallery-pick[aria-pressed="true"]) {
  border-color: var(--dsw-alias-state-business-primary);
  box-shadow: inset 0 0 0 1px var(--dsw-alias-state-business-primary);
}
/* The pick control fills the card, so the whole tile is the click target while
   the delete control stays a sibling rather than a nested button. */
.dsh-gallery-pick {
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
  padding: 0;
  font: inherit;
  color: inherit;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
}
.dsh-gallery-thumb {
  display: block;
  width: 100%;
  height: 84px;
  background-color: var(--dsw-alias-bg-layer-2);
  background-size: cover;
  background-position: center;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}
.dsh-gallery-thumb[data-none="1"] {
  display: grid;
  place-items: center;
  color: var(--dsw-alias-label-tertiary);
  font-size: 20px;
}
.dsh-gallery-cardLabel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  padding: 8px 10px;
  font-size: 13px;
  line-height: 18px;
}
.dsh-gallery-check { color: var(--dsw-alias-state-business-primary); flex: none; }
/* A group title with an action beside it — currently the opacity heading and
   its "restore solved" button. The title keeps its own line height so the row
   does not jump when the button is disabled and its colour changes. */
.dsh-gallery-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.dsh-gallery-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.dsh-gallery-slider {
  flex: 1;
  min-width: 0;
  accent-color: var(--dsw-alias-state-business-primary);
}
.dsh-gallery-value {
  flex: none;
  min-width: 56px;
  color: var(--dsw-alias-label-secondary);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}
.dsh-gallery-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 22px;
  color: var(--dsw-alias-label-tertiary);
  font-size: 12px;
  line-height: 18px;
}
.dsh-gallery-reset {
  flex: none;
  padding: 4px 10px;
  font: inherit;
  font-size: 12px;
  color: var(--dsw-alias-label-secondary);
  background: transparent;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
}
.dsh-gallery-reset:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dsh-gallery-reset:disabled { opacity: 0.5; cursor: default; }
.dsh-gallery-pick:focus-visible,
.dsh-gallery-slider:focus-visible,
.dsh-gallery-reset:focus-visible,
.dsh-gallery-btn:focus-visible,
.dsh-gallery-input:focus-visible,
.dsh-gallery-drop:focus-visible,
.dsh-gallery-iconBtn:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 2px;
}

/* ---- adding a wallpaper ---- */
.dsh-gallery-add {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dsh-gallery-drop {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  padding: 20px 16px;
  font: inherit;
  font-size: 13px;
  line-height: 18px;
  color: var(--dsw-alias-label-secondary);
  background: transparent;
  border: 1px dashed var(--dsw-alias-border-l4);
  border-radius: var(--dsw-radius-lg);
  cursor: pointer;
}
.dsh-gallery-drop:hover { background: var(--dsw-alias-interactive-bg-hover); color: var(--dsw-alias-label-primary); }
.dsh-gallery-drop[data-busy="1"] { cursor: progress; opacity: 0.7; }
.dsh-gallery-urlRow {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dsh-gallery-input {
  flex: 1;
  min-width: 0;
  box-sizing: border-box;
  height: 30px;
  padding: 0 10px;
  font: inherit;
  font-size: 13px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-2);
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-sm);
}
.dsh-gallery-input::placeholder { color: var(--dsw-alias-label-dimmed); }
.dsh-gallery-btn {
  flex: none;
  height: 30px;
  padding: 0 12px;
  font: inherit;
  font-size: 13px;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-layer-2);
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
}
.dsh-gallery-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-gallery-btn:disabled { opacity: 0.5; cursor: default; }
.dsh-gallery-btn[data-primary="1"] {
  color: var(--dsw-alias-label-primary-inverted);
  background: var(--dsw-alias-label-primary);
  border-color: transparent;
}
.dsh-gallery-btn[data-primary="1"]:hover:not(:disabled) { background: var(--dsw-alias-label-primary-dimmed); }
.dsh-gallery-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--dsw-alias-label-secondary);
  font-size: 12px;
  line-height: 18px;
}
.dsh-gallery-bar {
  position: relative;
  flex: 1;
  height: 3px;
  overflow: hidden;
  background: var(--dsw-alias-bg-layer-3);
  border-radius: 999px;
}
.dsh-gallery-bar::after {
  content: "";
  position: absolute;
  inset: 0;
  width: 40%;
  background: var(--dsw-alias-state-business-primary);
  border-radius: 999px;
  animation: dsh-gallery-slide 1.1s ease-in-out infinite;
}
@keyframes dsh-gallery-slide {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(250%); }
}
@media (prefers-reduced-motion: reduce) {
  .dsh-gallery-bar::after { animation: none; width: 100%; opacity: 0.5; }
}
.dsh-gallery-error {
  color: var(--dsw-alias-state-error-primary);
  font-size: 12px;
  line-height: 18px;
  overflow-wrap: anywhere;
}
.dsh-gallery-meta {
  color: var(--dsw-alias-label-tertiary);
  font-size: 11px;
  line-height: 16px;
}
.dsh-gallery-cardActions {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  gap: 4px;
  opacity: 0;
}
.dsh-gallery-card:hover .dsh-gallery-cardActions,
.dsh-gallery-card:focus-within .dsh-gallery-cardActions { opacity: 1; }
.dsh-gallery-iconBtn {
  display: grid;
  place-items: center;
  width: 22px;
  height: 22px;
  padding: 0;
  font: inherit;
  font-size: 12px;
  line-height: 1;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-overlay);
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-sm);
  cursor: pointer;
}
.dsh-gallery-iconBtn:hover { background: var(--dsw-alias-interactive-bg-hover-solid); }
`;
		}

		/** Clamp a number into a range, tolerating junk. */
		function clamp(value, range) {
			const n = typeof value === "number" ? value : Number(value);
			if (!Number.isFinite(n)) return range.fallback;
			return Math.min(range.max, Math.max(range.min, n));
		}

		/** Scale a scrim's alpha by a percentage, keeping its hue. */
		function scaleScrim(scrim, percent) {
			const match = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/.exec(scrim);
			if (match === null) return scrim;
			const base = match[4] === undefined ? 1 : Number(match[4]);
			const alpha = Math.min(1, Math.max(0, base * percent / 100));
			return `rgba(${match[1]}, ${match[2]}, ${match[3]}, ${alpha.toFixed(3)})`;
		}

		/**
		 * The registry of everything selectable: shipped and custom together.
		 *
		 * Both kinds of theme are the same shape to every consumer — an image
		 * file name, a scrim and a floor per scheme, and a token table per mode
		 * — so they are held in one map and nothing downstream asks which kind
		 * it got. The `custom` flag exists only so the settings page knows which
		 * cards may be renamed and deleted.
		 */
		const registry = new Map(Object.entries(GALLERY));
		/**
		 * The library listing: name, image, and a little provenance per theme.
		 *
		 * Declared here, beside `registry`, rather than next to the code that
		 * fills it, because the helpers above read it — `cardEntry` falls back to
		 * the listing for a theme whose palette has not been fetched. A `let`
		 * further down the file would put those readers in the temporal dead zone
		 * for any call that happened earlier, which is the kind of ordering bug
		 * that only appears on one code path.
		 *
		 * Held apart from `registry` because the listing has NO palettes: drawing
		 * a card needs a name and an image, and shipping 20 KB of colour values
		 * per theme to render a list nobody has scrolled would be waste. Each
		 * theme's palette is fetched when it is first selected, and lands in
		 * `registry` at that point.
		 */
		let libraryList = [];

		/**
		 * The entry for any id, shipped or custom, once its palette is known.
		 *
		 * Only themes in here can be APPLIED: `applyTokens` needs the token table,
		 * and a theme whose palette has not been fetched yet has none.
		 */
		function resolveEntry(value) {
			if (typeof value !== "string") return undefined;
			const entry = registry.get(value);
			if (entry !== undefined) return entry;
			return undefined;
		}

		/**
		 * The entry to DRAW for an id, including one whose palette has not arrived.
		 *
		 * The listing carries a name and an image for every custom theme, which is
		 * all a card needs, so a card can be drawn before the palette is fetched.
		 * The two sources use different field names — the listing says `image`, a
		 * registry entry says `wallpaper` — and reading the wrong one produces a
		 * card pointing at `/theme-gallery/undefined`, which is a broken image
		 * rather than a visibly missing one.
		 */
		function cardEntry(value) {
			const resolved = resolveEntry(value);
			if (resolved !== undefined) return resolved;
			const listed = libraryList.find((theme) => theme?.id === value);
			if (listed === undefined) return undefined;
			return { title: listed.title, wallpaper: listed.image, custom: true };
		}

		/** The display name for any id, given a translate function. */
		function nameOf(value, t) {
			if (value === NONE) return t("none");
			// A shipped theme has a dictionary key; a custom one carries the name
			// the user gave it, which is data and must not be looked up. The
			// listing is consulted too, so a custom theme is named correctly
			// before its palette has been fetched.
			if (SLUGS.includes(value)) return t(value);
			return cardEntry(value)?.title ?? value;
		}

		/** The image's own URL, for a preview thumbnail or the canvas. */
		function artUrl(entry) {
			return `${ASSET_BASE}${entry.wallpaper}`;
		}

		/**
		 * Build the per-mode token pairs `overrideTokens` wants.
		 *
		 * The generated tables are flat — one value per token per mode, which is
		 * what `theme.register` takes. `overrideTokens` instead wants
		 * `{ light, dark }` per token, so the pair is assembled here rather than
		 * stored twice. Doing it at runtime keeps the inlined data at one copy
		 * per mode and makes the two APIs' shapes impossible to confuse: the
		 * tables are flat on disk and paired only at this boundary.
		 *
		 * @param entry - one wallpaper's generated data.
		 * @returns token name to `{ light, dark }`.
		 */
		function pairedTokens(entry) {
			const paired = {};
			for (const [name, darkValue] of Object.entries(entry.tokens.dark)) {
				const lightValue = entry.tokens.light[name];
				// A token present in only one mode would be applied in both, which
				// is worse than leaving it to the base palette. The generator emits
				// both, so this only guards a hand-edited file.
				if (lightValue === undefined) continue;
				paired[name] = { light: lightValue, dark: darkValue };
			}
			return paired;
		}

		/**
		 * The plugin body.
		 *
		 * This function must not throw. The shell treats a plugin whose fiber
		 * reaches the failed state as a startup failure for the whole window, so
		 * every optional capability is feature-detected and every call that can
		 * reject is contained. A wallpaper is not worth a blank page.
		 *
		 * @param ctx - client plugin context.
		 */
		function apply(ctx) {
			const theme = ctx.theme;
			if (theme === null || typeof theme !== "object") return;
			if (typeof theme.getTheme !== "function" || typeof theme.overrideTokens !== "function") return;

			/**
			 * Register an effect when the context offers one.
			 *
			 * Every other optional capability here is feature-detected, so the
			 * effect seat is too. The cost of the guard is one `typeof`; the cost
			 * of its absence is that a context without it throws out of `apply`,
			 * which the shell treats as a failed fiber — a blank window rather
			 * than a missing wallpaper.
			 */
			const effect = (fn, label) => {
				if (typeof ctx.effect !== "function") return;
				try {
					ctx.effect(fn, label);
				} catch {
					/* an effect that cannot be registered costs only its cleanup */
				}
			};

			// ---- 1. the observable state -------------------------------------
			// One store feeds the settings section and the paint path, so there
			// is exactly one place that decides what is applied.
			const listeners = new Set();

			/**
			 * The wallpaper the Host's boot script already painted, if any.
			 *
			 * Read from the DOM rather than assumed, because the boot script is
			 * the only thing that knows the saved preference before the config
			 * mirror resolves — and the mirror reports `loading` with no value
			 * for as long as that takes. Seeding from the attribute is what keeps
			 * this plugin from repainting a wallpaper-less page over the one the
			 * user actually chose, which is the visible version of the bug: the
			 * picture appears, disappears, and comes back.
			 */
			const bootWallpaper = document.documentElement.getAttribute(ART_ATTRIBUTE);

			let state = {
				wallpaper: typeof bootWallpaper === "string" ? bootWallpaper : NONE,
				dim: DIM_RANGE.fallback,
				blur: BLUR_RANGE.fallback,
				/**
				 * Per-theme surface opacity, as an absolute percentage.
				 *
				 * Keyed by theme id, and holding only the pages that theme has
				 * been adjusted for: an absent theme, or an absent page within
				 * it, means "use the solved alpha", which is the state a fresh
				 * profile is in and what the restore button returns to.
				 *
				 * Kept as one map rather than three flat fields because opacity
				 * belongs to a THEME, not to the profile. The artwork behind the
				 * settings panel differs per image, so how much opacity that
				 * panel needs differs too, and a value tuned for 碎镜 should not
				 * follow the user onto 舞台. Switching themes therefore switches
				 * to that theme's entry, and falls back to the solved alpha when
				 * there is none.
				 */
				opacity: {},
				scheme: "dark",
				status: "loading",
				writable: false,
				saving: false,
				/** How many custom themes the Host listed, for the settings page. */
				libraryCount: 0,
				/** Set when the library could not be read, so the page can say so. */
				libraryError: undefined,
				/** Set while an image is being analysed, so the page can show progress. */
				busy: false,
				/** The last add failure, shown until the next attempt. */
				error: undefined,
			};

			/**
			 * Whether two state values are the same for the purposes of notifying.
			 *
			 * Primitive identity is not enough for the opacity map. `readOpacity`
			 * builds a NEW object out of every snapshot, so a reference check
			 * always reports "changed" and republishes — which means every
			 * unrelated settings write, and every recovery read, would push a
			 * stale map through the store and repaint the sliders. Comparing the
			 * maps by value is what lets an identical snapshot be a genuine no-op.
			 *
			 * Only the two shapes the state actually holds are covered: the depth
			 * is fixed (theme -> surface -> number), so a general deep-equal would
			 * be more machinery than the problem needs.
			 */
			function same(left, right) {
				if (left === right) return true;
				if (left === null || right === null) return false;
				if (typeof left !== "object" || typeof right !== "object") return false;
				const a = Object.keys(left);
				const b = Object.keys(right);
				if (a.length !== b.length) return false;
				for (const key of a) {
					const l = left[key];
					const r = right[key];
					if (l === r) continue;
					if (l === null || r === null || typeof l !== "object" || typeof r !== "object") return false;
					const innerA = Object.keys(l);
					const innerB = Object.keys(r);
					if (innerA.length !== innerB.length) return false;
					for (const inner of innerA) if (l[inner] !== r[inner]) return false;
				}
				return true;
			}

			/** Merge a patch into the state, notifying only on a real change. */
			const publish = (patch) => {
				let changed = false;
				for (const key of Object.keys(patch)) {
					if (!same(state[key], patch[key])) {
						changed = true;
						break;
					}
				}
				if (!changed) return;
				state = { ...state, ...patch };
				for (const fn of [...listeners]) {
					try {
						fn();
					} catch {
						/* one broken subscriber must not stop the others */
					}
				}
			};

			/**
			 * The resolved color scheme.
			 *
			 * `snapshot.active.colorScheme` is already resolved: the theme
			 * service collapses a `system` preference against the OS media query
			 * before it builds the snapshot. Reading the resolved value here
			 * rather than re-deriving it from the preference is what keeps the
			 * scrim and the tokens from ever disagreeing about which mode is on
			 * screen.
			 */
			const schemeOf = (snapshot) => {
				try {
					const current = snapshot ?? theme.getTheme();
					const active = current === null || typeof current !== "object" ? undefined : current.active;
					return active !== null && typeof active === "object" && active.colorScheme === "light" ? "light" : "dark";
				} catch {
					return "dark";
				}
			};

			// ---- 2. the wallpaper layer --------------------------------------
			const root = document.documentElement;

			/**
			 * Apply the wallpaper to the canvas.
			 *
			 * The scrim is scaled by `dim` here rather than in the Host's boot
			 * script, because the boot script cannot know a value the user is
			 * dragging right now; it paints the unscaled default and this
			 * function refines it. Both agree at `dim: 100`.
			 */
			const paint = () => {
				const entry = resolveEntry(state.wallpaper);
				if (entry === undefined) {
					root.removeAttribute(ART_ATTRIBUTE);
					root.style.removeProperty(ART_VARIABLE);
					root.style.removeProperty(SCRIM_VARIABLE);
					root.style.removeProperty(FLOOR_VARIABLE);
					root.style.removeProperty(BLUR_VARIABLE);
					// The opacity variables go too. Leaving them behind would let a
					// page keep a reduced alpha the next time a wallpaper is picked,
					// which is the kind of stale state that only shows up after a
					// switch to `none` and back.
					for (const variable of Object.values(OPACITY_VARIABLES)) {
						root.style.removeProperty(variable);
					}
					return;
				}
				const scheme = state.scheme;
				root.style.setProperty(ART_VARIABLE, `url("${artUrl(entry)}")`);
				// The scrim keeps a real tint of the image's own hue: a neutral
				// black would make all three read alike, which is the point of
				// having three. Its strength is the one the solver measured,
				// scaled by the user's dimming.
				root.style.setProperty(SCRIM_VARIABLE, scaleScrim(entry.scrim[scheme], state.dim));
				root.style.setProperty(FLOOR_VARIABLE, entry.floor[scheme]);
				// A filter value, not a length: `none` disables the layer, where
				// `blur(0px)` would keep the compositor rasterizing the backdrop.
				root.style.setProperty(BLUR_VARIABLE, state.blur > 0 ? `blur(${state.blur}px)` : "none");
				// Per-theme surface opacity. The stored value is already the
				// absolute alpha the rule applies, so it goes straight into the
				// variable — no conversion.
				//
				// A theme with no stance gets its SOLVED alpha written, not an
				// absent variable. The rule's fallback cannot stand in for "solved"
				// any more: it used to, because the colour kept its own alpha and
				// `100%` meant "scale by one". Now the colour is forced opaque
				// first, so the fallback would mean fully opaque and every
				// unadjusted theme would go solid. Writing the solved percentage
				// keeps one rule for both cases, and the solved alpha IS an
				// absolute opacity, so it lands on the same scale the slider uses.
				for (const [key, variable] of Object.entries(OPACITY_VARIABLES)) {
					const value = opacityFor(state.wallpaper, key) ?? surfacePercent(entry, key);
					if (value === undefined) {
						// The palette has no such token, so there is nothing honest
						// to write; the surface keeps whatever the app painted.
						root.style.removeProperty(variable);
						continue;
					}
					root.style.setProperty(variable, `${value}%`);
				}
				root.setAttribute(ART_ATTRIBUTE, state.wallpaper);
			};

			/**
			 * The absolute opacity stored for one theme and surface, if any.
			 *
			 * `undefined` is a real answer — "this theme has no stance, use the
			 * solved alpha" — and is distinct from 0, which means fully
			 * transparent. Collapsing the two is how a restore would end up
			 * painting nothing.
			 */
			function opacityFor(theme, key) {
				const entry = state.opacity?.[theme];
				if (entry === null || typeof entry !== "object") return undefined;
				const value = entry[key];
				return typeof value === "number" && Number.isFinite(value) ? clamp(value, OPACITY_RANGE) : undefined;
			}

			/**
			 * One surface's solved alpha, as an absolute percentage.
			 *
			 * Read from the ACTIVE palette rather than hardcoded, because the
			 * solver picks a different alpha per image and per mode — that is the
			 * whole reason a per-theme opacity is worth storing. Read fresh on
			 * every paint, so an unadjusted theme follows a light/dark switch to
			 * the other palette's alpha instead of freezing the one it started in.
			 *
			 * @returns a whole percentage, or undefined when the palette has no
			 * token for this surface.
			 */
			function surfacePercent(entry, key) {
				const table = entry?.tokens?.[state.scheme];
				const token = table === null || typeof table !== "object" ? undefined : table[OPACITY_TOKENS[key]];
				if (typeof token !== "string") return undefined;
				const alpha = parseAlpha(token);
				return Math.round((alpha === undefined ? 1 : alpha) * 100);
			}

			/**
			 * Re-register the palette layer for the current wallpaper.
			 *
			 * `overrideTokens` replaces a source's whole layer when called again,
			 * and the disposer it returns is a no-op once a newer layer exists —
			 * so calling it on every change is the documented way to update it,
			 * and the effect registration is only there so that unloading the
			 * plugin restores the base palette.
			 *
			 * It is called only when the WALLPAPER changes, never for `dim` or
			 * `blur`. Those two affect the canvas alone, and `overrideTokens`
			 * publishes a recomposed theme snapshot: every token in the
			 * application is re-resolved and every subscriber re-renders. Paying
			 * that for a slider drag would be a visible cost for no visual
			 * change, since the layer's values do not depend on either field.
			 */
			let disposeLayer;
			let layeredFor;
			const applyTokens = () => {
				const entry = resolveEntry(state.wallpaper);
				const wanted = entry === undefined ? undefined : state.wallpaper;
				if (wanted === layeredFor) return;
				layeredFor = wanted;
				if (disposeLayer !== undefined) {
					try {
						disposeLayer();
					} catch {
						/* a superseded layer is already inert */
					}
					disposeLayer = undefined;
				}
				if (entry === undefined) return;
				try {
					disposeLayer = theme.overrideTokens(ENTRY_ID, pairedTokens(entry));
				} catch {
					/* a refused layer leaves the base palette in place */
				}
			};
			effect(() => () => {
				if (disposeLayer === undefined) return;
				try {
					disposeLayer();
				} catch {
					/* already released */
				}
				disposeLayer = undefined;
			}, "theme-gallery: token layer");

			/** Apply everything that follows from the current state. */
			const render = () => {
				paint();
				applyTokens();
			};

			// ---- 3. the durable preference -----------------------------------
			/**
			 * The Host-backed form, once Settings provides one.
			 *
			 * `configForms` is a Settings-owned service, and this plugin's whole
			 * point is the wallpaper — so it is not declared in `inject`.
			 * Declaring it would make the wallpaper inactive in any composition
			 * without Settings, when the honest degradation is a wallpaper that
			 * works for the session and cannot be saved. `ctx.inject` gives that:
			 * the callback runs when the service appears and is disposed if it
			 * goes away, so the binding follows the service's lifetime.
			 */
			let form;
			/**
			 * Fields with an uncommitted local edit, i.e. a slider mid-drag.
			 *
			 * The shared describe mirror republishes whenever ANY namespace
			 * changes, not only this one, and `adopt` folds every snapshot into
			 * the store. Without this set, an unrelated write elsewhere in
			 * Settings — or the form's own recovery read — would republish the
			 * last committed value and snap the thumb out from under the
			 * pointer. A field stays here from the first input event until the
			 * write that commits it is queued.
			 */
			const dragging = new Set();

			/**
			 * Whether any surface of any theme is mid-drag.
			 *
			 * Checked across every theme rather than only the active one: a drag
			 * that began on one wallpaper and continued after the user switched
			 * themes would otherwise leave its guard unreleased, and the map would
			 * then ignore every snapshot for the rest of the session.
			 */
			const anyOpacityDragging = () => {
				for (const key of dragging) if (key.startsWith("opacity:")) return true;
				return false;
			};

			/** Fold one form snapshot into the store. */
			const adopt = (snapshot) => {
				if (snapshot === null || typeof snapshot !== "object") return;
				const status = typeof snapshot.status === "string" ? snapshot.status : "loading";
				const value = snapshot.value !== null && typeof snapshot.value === "object" ? snapshot.value : undefined;
				// A snapshot with no accepted value yet says nothing about the
				// wallpaper, and treating its absence as `none` would repaint over
				// the picture the boot script already put up. Only the status and
				// the writability are adopted until a value arrives.
				const fields = value === undefined ? {} : {
					wallpaper: typeof value.wallpaper === "string" ? value.wallpaper : NONE,
					dim: clamp(value.dim, DIM_RANGE),
					blur: clamp(value.blur, BLUR_RANGE),
					// The per-theme opacity map is taken as a whole rather than
					// field by field: it is keyed by theme, so a value for a theme
					// the user is not looking at still has to arrive here — that is
					// what makes switching back restore what they set.
					//
					// A profile written before this map existed has no `opacity`
					// field at all, and `readOpacity` then yields `{}` — every
					// theme on the solved alpha, which is the appearance those
					// profiles already had.
					opacity: readOpacity(value.opacity),
				};
				// The drag guard, generalised for the one field that is keyed by
				// something other than its own name.
				//
				// `dim` and `blur` are guarded by deleting the field itself. The
				// opacity map cannot be: its drag keys name a THEME and a
				// SURFACE (`opacity:shatter:opacityPanel`), because two themes can
				// each have a slider mid-drag and one must not release the other's.
				// So the whole `opacity` field is withheld while ANY opacity drag
				// is in flight, and the local value the drag produced stands until
				// the write that commits it lands.
				//
				// Without this the map — a fresh object from `readOpacity` on every
				// snapshot — would always compare unequal, be republished, and snap
				// the thumb out from under the pointer on any unrelated settings
				// write.
				for (const field of dragging) delete fields[field];
				if (Object.keys(fields).includes("opacity") && anyOpacityDragging()) delete fields.opacity;
				publish({
					...fields,
					status,
					writable: snapshot.writable === true,
				});
				render();
			};

			/**
			 * Normalise the persisted per-theme opacity map.
			 *
			 * The Host schema already constrains this, but the map is written to
			 * a YAML file a user is invited to edit and arrives here as untyped
			 * data, so every level is checked rather than trusted: an out-of-range
			 * number from a hand edit is clamped rather than discarded, and a
			 * non-object entry is dropped rather than thrown over.
			 *
			 * Keys are theme ids. Unknown ids are KEPT, not pruned: a theme whose
			 * palette has not been fetched yet is not an unknown theme, and
			 * dropping its entry would lose the user's setting the moment they
			 * looked at a different wallpaper.
			 */
			function readOpacity(raw) {
				if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
				const out = {};
				for (const [theme, entry] of Object.entries(raw)) {
					if (theme.length === 0 || entry === null || typeof entry !== "object" || Array.isArray(entry)) continue;
					const surfaces = {};
					for (const key of Object.keys(OPACITY_VARIABLES)) {
						const value = entry[key];
						if (typeof value !== "number" || !Number.isFinite(value)) continue;
						surfaces[key] = clamp(value, OPACITY_RANGE);
					}
					if (Object.keys(surfaces).length > 0) out[theme] = surfaces;
				}
				return out;
			}

			/**
			 * Bind the config form when Settings provides one.
			 *
			 * `ctx.inject` runs the callback once the service appears and disposes
			 * its registrations if it goes away, so the binding follows the
			 * service's lifetime rather than assuming it exists at `apply` time.
			 */
			const bindForm = (scope) => {
				let owned;
				try {
					owned = scope.configForms.get(ENTRY_ID);
				} catch {
					return;
				}
				if (owned === null || typeof owned !== "object") return;
				if (typeof owned.getSnapshot !== "function" || typeof owned.subscribe !== "function") return;
				form = owned;
				// The scope carries its own `effect`; the plugin's guarded helper
				// belongs to the outer context, so this seat is guarded here.
				const scoped = (fn, label) => {
					if (typeof scope.effect !== "function") {
						try {
							fn();
						} catch {
							/* the subscription is simply not retained */
						}
						return;
					}
					try {
						scope.effect(fn, label);
					} catch {
						/* the subscription is simply not retained */
					}
				};
				scoped(() => owned.subscribe(() => adopt(owned.getSnapshot())), "theme-gallery: config form");
				scoped(() => () => {
					if (form === owned) form = undefined;
				}, "theme-gallery: config form release");
				try {
					adopt(owned.getSnapshot());
				} catch {
					/* the session-only path below still applies */
				}
			};
			if (typeof ctx.inject === "function") {
				try {
					ctx.inject(["configForms"], bindForm);
				} catch {
					/* the session-only path below still applies */
				}
			}

			// With no form, this page cannot save: the settings UI then edits the
			// live session only, and says so. The wallpaper itself still applies,
			// seeded from whatever the boot script painted.
			if (form === undefined) publish({ status: "unavailable" });

			// Paint once at startup in every case. The values are already the
			// boot script's — or the config's, when the mirror resolved
			// synchronously — so this is what makes the session-only path work
			// and what re-applies `dim` and `blur`, which the boot script cannot
			// know. It is idempotent: `applyTokens` skips an unchanged wallpaper.
			publish({ scheme: schemeOf() });
			render();

			/**
			 * Write one field, optimistically.
			 *
			 * The local state moves first so a slider stays under the user's
			 * finger, and the form's own snapshot is the authority: `adopt` runs
			 * again on acceptance and reverts the value if the Host refused it.
			 * A rejected write is therefore self-correcting rather than silent.
			 *
			 * @param field - `wallpaper`, `dim`, or `blur`.
			 * @param value - the value to persist.
			 */
			const write = (field, value) => {
				publish({ [field]: value, saving: form !== undefined });
				render();
				const target = form;
				if (target === undefined) {
					publish({ saving: false });
					return;
				}
				let result;
				try {
					result = target.set(field, value);
				} catch {
					publish({ saving: false });
					return;
				}
				if (result === null || typeof result !== "object" || typeof result.then !== "function") {
					publish({ saving: false });
					return;
				}
				result.then((accepted) => {
					if (form !== target) return;
					publish({ saving: false });
					// A refusal is followed by the form's recovery read, which
					// re-publishes the authoritative value through `adopt`.
					if (accepted !== true) adopt(target.getSnapshot());
				}, () => {
					if (form === target) publish({ saving: false });
				});
			};

			/**
			 * Move the live value without persisting it.
			 *
			 * A range input fires continuously while it is dragged, and one HTTP
			 * write per pixel would be absurd; this paints the drag and
			 * {@link commit} persists the value the user let go on. The field is
			 * marked as dragging so an unrelated snapshot cannot pull it back.
			 */
			const preview = (field, value) => {
				dragging.add(field);
				publish({ [field]: value });
				render();
			};
			/** Persist the live value of one numeric field. */
			const commit = (field) => {
				dragging.delete(field);
				write(field, state[field]);
			};

			/**
			 * The drag key for one theme's surface.
			 *
			 * Opacity is the only setting keyed by something other than its own
			 * name, so its drag guard has to be keyed the same way: two themes
			 * can both have a "panel" slider mid-drag, and one must not release
			 * the other's guard.
			 */
			const opacityKey = (theme, surface) => `opacity:${theme}:${surface}`;

			/**
			 * Persist one theme's opacity map.
			 *
			 * The WHOLE map is written, not a path into it. `configForms.set`
			 * replaces a top-level field, and this plugin's field is the map
			 * itself — so a per-surface write is expressed as "here is the new
			 * map", which also means a single write cannot half-apply a change
			 * across the three surfaces.
			 *
			 * @param next - the complete map to persist.
			 * @param done - called once the write is no longer in flight, on EVERY
			 * path: this is where the drag guard is released, so a path that
			 * forgot it would freeze that slider against later snapshots.
			 */
			const writeOpacity = (next, done) => {
				const finish = () => {
					publish({ saving: false });
					if (done !== undefined) done();
				};
				publish({ opacity: next, saving: form !== undefined });
				render();
				const target = form;
				if (target === undefined) {
					finish();
					return;
				}
				let result;
				try {
					result = target.set("opacity", next);
				} catch {
					finish();
					return;
				}
				if (result === null || typeof result !== "object" || typeof result.then !== "function") {
					finish();
					return;
				}
				result.then((accepted) => {
					if (form !== target) {
						// A newer form took over; this write is no longer actionable,
						// but the guard still has to be released or that slider stays
						// frozen for the rest of the session.
						finish();
						return;
					}
					// A refusal is followed by the form's recovery read, which
					// re-publishes the authoritative value through `adopt`.
					if (accepted !== true) adopt(target.getSnapshot());
					finish();
				}, () => {
					finish();
				});
			};

			/**
			 * Set one theme's one surface, without persisting.
			 *
			 * Mirrors {@link preview}: a range input fires continuously while
			 * dragged, so the drag paints and the release persists.
			 */
			const previewOpacity = (surface, value) => {
				const theme = state.wallpaper;
				if (theme === NONE) return;
				dragging.add(opacityKey(theme, surface));
				const surfaces = { ...(state.opacity[theme] ?? {}), [surface]: clamp(value, OPACITY_RANGE) };
				publish({ opacity: { ...state.opacity, [theme]: surfaces } });
				render();
			};

			/** Persist the value one drag settled on. */
			const commitOpacity = (surface) => {
				const theme = state.wallpaper;
				if (theme === NONE) return;
				// The guard is released only AFTER the write settles, not before it
				// starts.
				//
				// Releasing first — which this used to do — opens a window the
				// length of a round trip in which a settings snapshot can arrive.
				// `adopt` then runs unguarded, republishes the PREVIOUS map, and
				// the slider snaps back to the value it had before the drag: the
				// change survives the drag and dies on release.
				//
				// Holding it until the promise resolves means the local value the
				// drag produced is the one on screen for the whole round trip,
				// which is also what makes the optimistic update honest.
				const key = opacityKey(theme, surface);
				writeOpacity(state.opacity, () => dragging.delete(key));
			};

			/**
			 * Drop one theme's stance, so every surface returns to its solved alpha.
			 *
			 * Expressed as REMOVING the theme's key rather than storing the solved
			 * alpha as a number: the solved alpha is per surface and per mode, and
			 * a stored number would freeze whichever one happened to be active
			 * when the button was pressed. Absence also keeps the YAML honest —
			 * a theme nobody has adjusted has no entry to read.
			 *
			 * A theme with no entry at all is left alone rather than written as an
			 * empty object, so the map does not accumulate `{}` entries.
			 */
			const resetOpacity = () => {
				const theme = state.wallpaper;
				if (theme === NONE || state.opacity[theme] === undefined) return;
				const next = { ...state.opacity };
				delete next[theme];
				writeOpacity(next);
			};

			// ---- 3b. the custom library --------------------------------------
			//
			// The library lives on the Host, and the client fetches it once at
			// startup. It is not in the Config because a palette is 20 KB per
			// theme, and the Config is a file the user is invited to read and
			// edit; it is not in `localStorage` because that is per-origin and
			// invisible to every other surface. See the Host half's header.
			//
			// The fetch is best-effort: a Host that is still starting, or a
			// session without one, leaves the shipped three wallpapers working.
			const api = (action, init) => fetch(`${ASSET_BASE}api/${action}`, init);

			/**
			 * Load the library.
			 *
			 * Best-effort by design: a Host that is still starting, or a session
			 * composed without one, leaves the shipped three wallpapers working
			 * and simply shows an empty custom list. A failed load is reported in
			 * the state so the settings page can say so rather than showing a
			 * silently empty section.
			 */
			const loadLibrary = async () => {
				let listed;
				try {
					const response = await api("themes");
					if (!response.ok) throw new Error(`the library returned ${response.status}`);
					listed = await response.json();
				} catch (error) {
					publish({ libraryError: String(error?.message ?? error) });
					return;
				}
				// The picker draws its cards straight from this listing rather
				// than from the registry: a theme whose palette has not been
				// fetched yet is still a wallpaper the user can pick, and it
				// would otherwise be missing from the cards entirely.
				libraryList = Array.isArray(listed.themes) ? listed.themes : [];
				publish({ libraryCount: libraryList.length, libraryError: listed.error ?? undefined });
			};

			/**
			 * Fetch one custom theme's palette and put it in the registry.
			 *
			 * @param id - the theme id.
			 * @returns {Promise<object|undefined>} the entry, once resolved.
			 */
			const loadTheme = async (id) => {
				const existing = registry.get(id);
				if (existing !== undefined) return existing;
				let record;
				try {
					const response = await api(`theme?id=${encodeURIComponent(id)}`);
					if (!response.ok) return undefined;
					record = await response.json();
				} catch {
					return undefined;
				}
				if (record?.palette === undefined) return undefined;
				const entry = {
					title: record.title ?? id,
					wallpaper: record.image,
					scrim: record.palette.scrim,
					floor: record.palette.floor,
					tokens: record.palette.tokens,
					analysis: record.palette.analysis,
					custom: true,
				};
				registry.set(id, entry);
				// The palette arriving is exactly the event that makes a selected
				// custom theme applicable, so the render happens here rather than
				// at each call site. `applyTokens` is guarded by `layeredFor`, so a
				// fetch that resolves for a theme the user has since moved away
				// from costs nothing.
				render();
				return entry;
			};

			/**
			 * Decode an image and read its pixels.
			 *
			 * The browser is the only decoder in the process — the Host has none —
			 * which is why the palette is computed here rather than there.
			 *
			 * The canvas is downscaled to the same 2560px width the generator
			 * uses, so a user's wallpaper is measured at the same scale as the
			 * three shipped ones and the solver's thresholds mean the same thing.
			 * It also bounds the work: a 50-megapixel phone photo becomes 3.7M
			 * pixels, which is the size the solver was written for.
			 *
			 * @param {Blob} blob - the image bytes.
			 * @returns {Promise<{rgba: Uint8ClampedArray, width: number, height: number, dataUrl: string}>}
			 */
			const decode = async (blob) => {
				const bitmap = await createImageBitmap(blob);
				try {
					const scale = Math.min(1, SOLVE_WIDTH / bitmap.width);
					const width = Math.max(1, Math.round(bitmap.width * scale));
					const height = Math.max(1, Math.round(bitmap.height * scale));
					const canvas = document.createElement("canvas");
					canvas.width = width;
					canvas.height = height;
					const context = canvas.getContext("2d", { willReadFrequently: true });
					if (context === null) throw new Error(t("unsupported"));
					context.drawImage(bitmap, 0, 0, width, height);
					// `getImageData` throws on a tainted canvas. Nothing here draws
					// a cross-origin image — a URL is fetched through the Host and
					// arrives same-origin — so a throw means something unexpected
					// reached the canvas, and it must surface rather than be
					// swallowed into a wrong palette.
					const { data } = context.getImageData(0, 0, width, height);
					return { rgba: data, width, height };
				} finally {
					bitmap.close?.();
				}
			};

			/**
			 * Solve a palette for one image and store it.
			 *
			 * @param {Blob} blob - the image bytes.
			 * @param {string} title - the name to store it under.
			 * @returns {Promise<{ok: true, id: string}|{ok: false, error: string}>}
			 */
			const addTheme = async (blob, title) => {
				if (blob.size > MAX_UPLOAD_BYTES) return { ok: false, error: t("tooBig") };
				let pixels;
				try {
					pixels = await decode(blob);
				} catch {
					return { ok: false, error: t("unsupported") };
				}
				// Yielding between the decode and the solve keeps the progress
				// indicator painting: the solve is a tight loop over ~1.5M contrast
				// computations and blocks the main thread for its whole duration.
				await new Promise((resolve) => setTimeout(resolve, 0));
				let palette;
				try {
					palette = solvePixels(pixels.rgba, pixels.width, pixels.height);
				} catch (error) {
					return { ok: false, error: String(error?.message ?? error) };
				}
				// The image is re-encoded rather than sent as the original bytes:
				// the solver measured the DOWNSCALED pixels, and serving the
				// original would paint a different image than the one the palette
				// was derived from. It also bounds what the Host has to store.
				const jpeg = await encode(pixels);
				const body = {
					source: "upload",
					title,
					data: jpeg,
					palette: {
						tokens: palette.tokens,
						scrim: palette.scrim,
						floor: palette.floor,
						analysis: palette.analysis,
						solver: palette.solver,
					},
				};
				let created;
				try {
					const response = await api("add", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(body),
					});
					created = await response.json();
					if (!response.ok) return { ok: false, error: created?.error ?? `the Host returned ${response.status}` };
				} catch (error) {
					return { ok: false, error: String(error?.message ?? error) };
				}
				await loadLibrary();
				await loadTheme(created.id);
				// Selecting it is the whole point of adding it: a theme the user
				// just made and then has to go find would be a worse flow.
				write("wallpaper", created.id);
				return { ok: true, id: created.id };
			};

			/** Re-encode the solved pixels as a JPEG data URL. */
			const encode = async (pixels) => {
				const canvas = document.createElement("canvas");
				canvas.width = pixels.width;
				canvas.height = pixels.height;
				const context = canvas.getContext("2d");
				if (context === null) throw new Error(t("unsupported"));
				context.putImageData(new ImageData(pixels.rgba, pixels.width, pixels.height), 0, 0);
				return canvas.toDataURL("image/jpeg", 0.86);
			};

			/**
			 * Fetch an image URL through the Host, then solve it.
			 *
			 * The Host does the fetching because the browser cannot: an image drawn
			 * from another origin taints the canvas, and a tainted canvas refuses
			 * `getImageData`. So the bytes come back same-origin, and everything
			 * after that is the same path as an upload.
			 *
			 * @param {string} url - the user-supplied URL.
			 * @param {string} title - the name to store it under.
			 */
			const addFromUrl = async (url, title) => {
				let probed;
				try {
					const response = await api("probe", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ url }),
					});
					probed = await response.json();
					if (!response.ok) return { ok: false, error: probed?.error ?? `the Host returned ${response.status}` };
				} catch (error) {
					return { ok: false, error: String(error?.message ?? error) };
				}
				// Decoding base64 by hand rather than through `atob` + a loop: the
				// fetch of a data URL is asynchronous and lets the browser do the
				// decoding off the main thread.
				let blob;
				try {
					blob = await (await fetch(`data:${probed.type};base64,${probed.data}`)).blob();
				} catch (error) {
					return { ok: false, error: String(error?.message ?? error) };
				}
				return addTheme(blob, title);
			};

			/** Delete one custom theme. */
			const removeTheme = async (id) => {
				try {
					await api("remove", {
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ id }),
					});
				} catch {
					/* the reload below reports whatever actually happened */
				}
				registry.delete(id);
				// The selection moves BEFORE the reload: a theme that no longer
				// exists must not stay selected, or the canvas would keep pointing
				// at an image the Host has already deleted.
				if (state.wallpaper === id) write("wallpaper", NONE);
				// `loadLibrary` refills `libraryList` from the listing, so the
				// picker drops the deleted theme without a second bookkeeping step.
				await loadLibrary();
				render();
			};

			// Load the library once the plugin is mounted. It is not awaited: the
			// shipped wallpapers work without it, and a slow Host must not delay
			// the first paint.
			loadLibrary().catch(() => undefined);

			// ---- 4. follow the palette ---------------------------------------
			// The scrim has to match the resolved scheme, which changes when the
			// user picks Light/Dark/System in the Appearance row or when the OS
			// flips while the preference is `system`.
			if (typeof ctx.on === "function") {
				try {
					ctx.on("theme/change", (snapshot) => {
						const scheme = schemeOf(snapshot);
						if (scheme === state.scheme) return;
						publish({ scheme });
						paint();
					});
				} catch {
					/* the scheme then follows only the value read at load */
				}
			}

			// ---- 5. the stylesheet and copy ----------------------------------
			effect(() => {
				const tag = document.createElement("style");
				tag.dataset.dshGallery = "1";
				tag.textContent = stylesheet();
				document.head.appendChild(tag);
				return () => tag.remove();
			}, "theme-gallery: stylesheet");

			effect(() => {
				if (typeof ctx.locale !== "object" || ctx.locale === null) return;
				if (typeof ctx.locale.register !== "function") return;
				try {
					return ctx.locale.register(NS, { zh, en });
				} catch {
					// A duplicate namespace means another registration already owns
					// the copy; the UI then renders its dictionary keys.
					return undefined;
				}
			}, "theme-gallery: dictionaries");

			const store = {
				getSnapshot: () => state,
				subscribe: (fn) => {
					listeners.add(fn);
					return () => listeners.delete(fn);
				},
			};
			const face = () => ({ hooks: { gallery: store } });

			// ---- 6. where the wallpaper is chosen ----------------------------
			//
			// ONLY the settings page (section 7 below). A sidebar-foot button
			// that cycled every wallpaper used to live here. It was one click
			// faster, but it was a second, less careful way to change the
			// wallpaper: no preview of what it was about to switch to, no way to
			// jump straight to a particular one, and no way to reach the
			// dim/blur/opacity controls that swapping a wallpaper usually makes
			// necessary. So it is gone, and `sidebar.footer.action` is left for
			// other packages. Nothing else changed: the picker still writes the
			// same `wallpaper` field, and the saved choice still paints.

			// ---- 7. the settings section -------------------------------------
			/**
			 * One wallpaper card, drawn as the artwork itself.
			 *
			 * The outer element is a `div`, not a `button`, because a custom
			 * theme's card carries a delete control: a `<button>` inside a
			 * `<button>` is invalid HTML and browsers recover from it by
			 * splitting the outer one, which breaks the click target. So the
			 * card is a container holding two sibling controls, and the pick
			 * button fills it.
			 */
			function Card({ value, entry, label, selected, custom, deleteLabel, onPick, onDelete }) {
				return h("div", {
					className: "dsh-gallery-card",
					"data-custom": custom ? "1" : undefined,
				}, [
					h("button", {
						key: "pick",
						type: "button",
						className: "dsh-gallery-pick",
						"aria-pressed": selected,
						title: label,
						onClick: () => onPick(value),
					}, [
						h("span", {
							key: "thumb",
							className: "dsh-gallery-thumb",
							"data-none": entry === undefined ? "1" : undefined,
							"aria-hidden": "true",
							style: entry === undefined || entry.wallpaper === undefined
								? undefined
								: { backgroundImage: `url("${artUrl(entry)}")` },
						}, entry === undefined ? "∅" : null),
						h("span", { key: "label", className: "dsh-gallery-cardLabel" }, [
							h("span", { key: "text", className: "dsh-gallery-name" }, label),
							selected ? h("span", { key: "check", className: "dsh-gallery-check", "aria-hidden": "true" }, "✓") : null,
						]),
					]),
					onDelete === undefined ? null : h("div", { key: "actions", className: "dsh-gallery-cardActions" }, [
						h("button", {
							key: "delete",
							type: "button",
							className: "dsh-gallery-iconBtn",
							title: deleteLabel,
							"aria-label": `${deleteLabel}: ${label}`,
							onClick: (event) => {
								event.stopPropagation();
								onDelete();
							},
						}, "✕"),
					]),
				]);
			}

			/**
			 * One labelled slider.
			 *
			 * `onInput` paints continuously; `onCommit` persists once the drag
			 * ends. Pointer, key, and blur all end a drag, and each is wired
			 * because a keyboard user never fires a pointer event.
			 */
			function Slider(props) {
				const { id, label, hint, value, range, unit, disabled, onInput, onCommit } = props;
				/**
				 * The pointer's last known position during the current gesture.
				 *
				 * A range input keeps following the pointer AFTER it leaves the
				 * control: it clamps the pointer's X onto the value axis, so
				 * sliding off the track and releasing elsewhere silently drags the
				 * value to whatever sits at that X. Measured on the live page, a
				 * thumb at 50 dragged down and away reported `3` — the pointer at
				 * x=554 against a track starting at x=534.
				 *
				 * That is browser behaviour, not a plugin bug, but it is wrong for
				 * a settings slider: the gesture a user makes to dismiss the drag —
				 * move away, release, click something else — would overwrite the
				 * value they just chose, which is the "it jumps back when I let go"
				 * symptom.
				 *
				 * `pointerleave` is NOT the signal for this. A range input takes
				 * pointer capture on pointerdown, so every move is re-targeted at
				 * the input and no leave event fires until the pointer is released —
				 * confirmed by logging it: `pointerup` and `pointerleave` both
				 * arrived after the value had already gone to 3. The position has to
				 * be compared against the element's own box instead.
				 *
				 * Held on the props object, not a local: this component re-renders
				 * on every drag step, so a local would reset exactly when needed,
				 * and a module variable would be shared by all five sliders.
				 */
				const mark = props;
				if (mark.pointer === undefined) mark.pointer = null;

				/** Whether `clientX/clientY` is inside this input's box. */
				const inside = (event) => {
					const box = event.currentTarget.getBoundingClientRect();
					// A little slack on the vertical axis: the thumb's hit area is
					// taller than the 16px track, so a pointer slightly above or
					// below the box is still a deliberate drag, not a dismissal.
					const pad = 12;
					return event.clientX >= box.left
						&& event.clientX <= box.right
						&& event.clientY >= box.top - pad
						&& event.clientY <= box.bottom + pad;
				};

				return h("div", { className: "dsh-gallery-group" }, [
					h("label", { key: "label", className: "dsh-gallery-title", htmlFor: id }, label),
					h("div", { key: "row", className: "dsh-gallery-row" }, [
						h("input", {
							key: "input",
							id,
							className: "dsh-gallery-slider",
							type: "range",
							min: range.min,
							max: range.max,
							step: range.step,
							value,
							disabled,
							onPointerDown: (event) => {
								mark.pointer = { x: event.clientX, y: event.clientY, outside: false };
							},
							onPointerMove: (event) => {
								// Tracked rather than decided here, because the value
								// change and the move arrive in that order: the move
								// records where the pointer is, and `change` decides
								// whether to honour it.
								mark.pointer = { x: event.clientX, y: event.clientY, outside: !inside(event) };
							},
							onChange: (event) => {
								// A change reported while the pointer is off the track
								// is the browser clamping a distant X onto the range,
								// not a value the user chose. Ignoring it is what stops
								// the dismiss gesture from rewriting the value.
								if (mark.pointer !== null && mark.pointer.outside) return;
								onInput(clamp(event.target.value, range));
							},
							onPointerUp: (event) => {
								mark.pointer = null;
								onCommit(event);
							},
							onKeyUp: onCommit,
							onBlur: onCommit,
						}),
						h("span", { key: "value", className: "dsh-gallery-value" }, `${value}${unit}`),
					]),
					h("span", { key: "hint", className: "dsh-gallery-help" }, hint === undefined ? null : hint),
				]);
			}

			/**
			 * The add-a-wallpaper controls.
			 *
			 * Two entry points into one flow: a file picker, and a URL the Host
			 * fetches. Both end at the same `addTheme`, because after the bytes
			 * exist the origin stops mattering — the browser decodes them, solves
			 * the palette, and posts the result.
			 *
			 * The file input is a real `<input type="file">` hidden behind a
			 * button rather than a drop zone alone: a drop zone is unusable from
			 * the keyboard, and the picker is what a user reaches for first.
			 */
			function Add({ t, snapshot, onPick, onUrl, onFile }) {
				const [url, setUrl] = React.useState("");
				const [title, setTitle] = React.useState("");
				const inputId = "dsh-gallery-file";
				const busy = snapshot.busy === true;
				const submit = () => {
					const trimmed = url.trim();
					if (trimmed.length === 0 || busy) return;
					onUrl(trimmed, title.trim());
				};
				return h("div", { className: "dsh-gallery-add" }, [
					h("div", { key: "row", className: "dsh-gallery-urlRow" }, [
						h("input", {
							key: "url",
							className: "dsh-gallery-input",
							type: "url",
							inputMode: "url",
							placeholder: t("urlPlaceholder"),
							value: url,
							disabled: busy,
							"aria-label": t("urlLabel"),
							onChange: (event) => setUrl(event.target.value),
							onKeyDown: (event) => {
								if (event.key === "Enter") submit();
							},
						}),
						h("button", {
							key: "go",
							type: "button",
							className: "dsh-gallery-btn",
							disabled: busy || url.trim().length === 0,
							onClick: submit,
						}, t("addFromUrl")),
					]),
					h("input", {
						key: "title",
						className: "dsh-gallery-input",
						type: "text",
						placeholder: t("custom"),
						value: title,
						disabled: busy,
						"aria-label": t("rename"),
						onChange: (event) => setTitle(event.target.value),
					}),
					h("input", {
						key: "file",
						id: inputId,
						type: "file",
						accept: "image/*",
						disabled: busy,
						style: { display: "none" },
						onChange: (event) => {
							const file = event.target.files?.[0];
							// Clearing the value lets the same file be chosen twice in
							// a row: without it the second change event never fires,
							// because the input's value did not change.
							event.target.value = "";
							if (file !== undefined) onFile(file, title.trim());
						},
					}),
					h("label", {
						key: "drop",
						className: "dsh-gallery-drop",
						htmlFor: inputId,
						"data-busy": busy ? "1" : undefined,
						onDragOver: (event) => {
							if (busy) return;
							event.preventDefault();
						},
						onDrop: (event) => {
							if (busy) return;
							event.preventDefault();
							const file = event.dataTransfer?.files?.[0];
							if (file !== undefined) onFile(file, title.trim());
						},
					}, t("upload")),
					busy
						? h("div", { key: "busy", className: "dsh-gallery-progress" }, [
							h("span", { key: "bar", className: "dsh-gallery-bar", "aria-hidden": "true" }),
							h("span", { key: "text" }, t("analyzing")),
						])
						: h("span", { key: "hint", className: "dsh-gallery-help" }, t("addHint")),
					snapshot.error === undefined
						? null
						: h("span", { key: "error", className: "dsh-gallery-error", role: "alert" }, snapshot.error),
				]);
			}

			/**
			 * The Wallpaper settings page.
			 *
			 * Registered into `settings.section` rather than
			 * `settings.general.item`: a picker with previews, two sliders, an
			 * upload flow, and a reset is a page, not a row, and the General
			 * section is a list of single-line preferences.
			 */
			function Section({ t, useGallery }) {
				const snapshot = useGallery((s) => s);
				const busy = snapshot.status === "loading";
				const status = snapshot.saving
					? t("saving")
					: snapshot.status === "unavailable"
						? t("unavailable")
						: snapshot.writable
							? t("saved")
							: t("unsaved");

				/** Run one add flow with the busy flag and the error kept in the store. */
				const run = async (operation) => {
					publish({ busy: true, error: undefined });
					let result;
					try {
						result = await operation();
					} catch (error) {
						result = { ok: false, error: String(error?.message ?? error) };
					}
					publish({ busy: false, error: result.ok === true ? undefined : result.error });
				};

				const options = [
					...SLUGS.map((slug) => ({ value: slug, entry: GALLERY[slug], label: t(slug) })),
					...libraryList.map((theme) => ({ value: theme.id, entry: cardEntry(theme.id), label: theme.title })),
					{ value: NONE, entry: undefined, label: t("none") },
				];

				/**
				 * The value a surface's slider should show.
				 *
				 * The absolute model is what makes this answerable. A surface's
				 * solved alpha IS an absolute opacity, so it maps onto the scale
				 * without distortion — a panel solved at 0.61 is 61% and the
				 * slider says so. Under the previous "percentage of the solved
				 * alpha" model this same reading would have had to render as 100%
				 * while the page was visibly translucent, which is exactly the
				 * confusion being fixed.
				 *
				 * An unadjusted theme therefore shows its true solved opacity,
				 * and the restore button is how the user gets back to it.
				 */
				const shownOpacity = (surface) => {
					const stored = snapshot.opacity?.[snapshot.wallpaper]?.[surface];
					if (typeof stored === "number") return stored;
					// No stance: report the theme's own solved alpha. It IS an
					// absolute opacity, so it is a real position on this scale —
					// which is the whole reason the absolute model is honest where
					// the relative one was not.
					const entry = resolveEntry(snapshot.wallpaper);
					if (entry === undefined) return OPACITY_RANGE.fallback;
					return surfacePercent(entry, surface) ?? OPACITY_RANGE.fallback;
				};
				/** Whether the active theme carries any explicit opacity at all. */
				const hasStoredOpacity = snapshot.opacity?.[snapshot.wallpaper] !== undefined;

				return h("div", { className: "dsh-gallery-section" }, [
					h("div", { key: "choose", className: "dsh-gallery-group" }, [
						h("span", { key: "title", className: "dsh-gallery-title" }, t("choose")),
						h("div", { key: "grid", className: "dsh-gallery-grid" },
							options.map((option) => h(Card, {
								key: option.value,
								value: option.value,
								entry: option.entry,
								label: option.label,
								selected: snapshot.wallpaper === option.value,
								custom: option.entry?.custom === true,
								deleteLabel: t("delete"),
								onPick: (value) => {
									// A custom theme's palette may not have arrived yet;
									// selecting it starts that fetch, and `loadTheme`
									// renders when it lands. Until then `paint` finds no
									// entry and the canvas keeps the scrim it had, which
									// is why the selection is written regardless.
									if (value !== NONE && !SLUGS.includes(value)) loadTheme(value).catch(() => undefined);
									write("wallpaper", value);
								},
								onDelete: option.entry?.custom === true
									? () => {
										if (window.confirm(`${t("deleteConfirm")}\n\n${option.label}`)) {
											removeTheme(option.value).catch(() => undefined);
										}
									}
									: undefined,
							}))),
						snapshot.libraryError === undefined
							? null
							: h("span", { key: "libError", className: "dsh-gallery-error", role: "alert" }, snapshot.libraryError),
					]),
					h("div", { key: "add", className: "dsh-gallery-group" }, [
						h("span", { key: "title", className: "dsh-gallery-title" }, t("add")),
						h(Add, {
							key: "add",
							t,
							snapshot,
							onUrl: (url, title) => run(() => addFromUrl(url, title)),
							onFile: (file, title) => run(() => addTheme(file, title)),
						}),
					]),
					h(Slider, {
						key: "dim",
						id: "dsh-gallery-dim",
						label: t("dim"),
						hint: t("dimHint"),
						value: snapshot.dim,
						range: DIM_RANGE,
						unit: "%",
						disabled: busy,
						onInput: (value) => preview("dim", value),
						onCommit: () => commit("dim"),
					}),
					h(Slider, {
						key: "blur",
						id: "dsh-gallery-blur",
						label: t("blur"),
						hint: t("blurHint"),
						value: snapshot.blur,
						range: BLUR_RANGE,
						unit: "px",
						disabled: busy,
						onInput: (value) => preview("blur", value),
						onCommit: () => commit("blur"),
					}),
					// One slider per page. They are separate controls rather than
					// one shared value because the pages do different work: a
					// reading surface such as the settings panel benefits from
					// being more solid, while the conversation and the sidebar are
					// what the wallpaper is actually for.
					//
					// The values belong to the ACTIVE THEME. Switching wallpaper
					// swaps this group to that theme's stance, and a theme that has
					// never been adjusted shows its own solved opacities — so a
					// panel that solved at 61% reads 61%, not 100%.
					h("div", { key: "opacity", className: "dsh-gallery-group" }, [
						h("div", { key: "head", className: "dsh-gallery-head" }, [
							h("span", { key: "title", className: "dsh-gallery-title" }, t("opacity")),
							// The restore action lives beside the title rather than
							// in the footer with the page-wide reset, because it
							// undoes only the opacity of THIS theme and leaving
							// that ambiguous next to "reset everything" would be
							// the kind of control people press once and regret.
							h("button", {
								key: "restore",
								type: "button",
								className: "dsh-gallery-reset",
								disabled: busy || !snapshot.writable || !hasStoredOpacity,
								onClick: resetOpacity,
							}, t("restoreSolved")),
						]),
						...["opacityPanel", "opacitySidebar", "opacityChat", "opacityInput"].map((surface) => h(Slider, {
							key: surface,
							id: `dsh-gallery-${surface}`,
							label: t(surface),
							hint: surface === "opacityPanel"
								? t("opacityHint")
								: surface === "opacityInput" ? t("opacityInputHint") : undefined,
							value: shownOpacity(surface),
							range: OPACITY_RANGE,
							unit: "%",
							disabled: busy || snapshot.wallpaper === NONE,
							onInput: (value) => previewOpacity(surface, value),
							onCommit: () => commitOpacity(surface),
						})),
						snapshot.wallpaper === NONE
							? h("span", { key: "none", className: "dsh-gallery-help" }, t("opacityNeedsWallpaper"))
							: null,
					]),
					h("div", { key: "status", className: "dsh-gallery-status" }, [
						h("span", { key: "text" }, busy ? t("loading") : status),
						h("button", {
							key: "reset",
							type: "button",
							className: "dsh-gallery-reset",
							disabled: busy || !snapshot.writable,
							onClick: () => {
								write("wallpaper", SLUGS[0]);
								write("dim", DIM_RANGE.fallback);
								write("blur", BLUR_RANGE.fallback);
								// Every theme's opacity is cleared, not only the
								// active one: this is the page-wide reset, and
								// leaving other themes' entries behind would mean
								// "reset" restored some wallpapers and not others.
								writeOpacity({});
							},
						}, t("reset")),
					]),
				]);
			}

			try {
				const t = ctx.locale.bind(NS);
				ctx.slots.inject("settings.section", () => ctx.slots.register({
					name: "settings.section",
					id: ENTRY_ID,
					order: 30,
					label: () => t("section"),
					locale: NS,
					inject: face,
				}, Section));
			} catch {
				/* a composition without a settings slot paints but cannot be configured */
			}
		}

		return {
			// `theme`, `slots` and `locale` are SERVICE keys, not package names:
			// declaring them is what makes `ctx.theme` and `ctx.slots` legal, and
			// a context missing one keeps this plugin inactive rather than
			// failing the boot. `configForms` is deliberately NOT here — it is
			// taken through `ctx.inject` inside `apply`, so a composition without
			// Settings still gets a working wallpaper.
			inject: ["theme", "slots", "locale"],
			apply,
		};
	},
});

