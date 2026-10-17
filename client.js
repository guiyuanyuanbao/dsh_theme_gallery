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

		const GALLERY = {"shatter":{"title":"碎镜 Shatter","source":"shatter.png","wallpaper":"shatter.jpg","scrim":{"light":"rgba(241, 242, 246, 0.18)","dark":"rgba(14, 18, 29, 0.18)"},"floor":{"light":"#f6f7f9","dark":"#0c0f18"},"tokens":{"light":{"--dsw-alias-bg-base":"rgba(253, 254, 254, 0.42)","--dsw-alias-bg-document-preview":"rgba(253, 254, 254, 0.72)","--dsw-alias-bg-document-selection":"rgba(97, 125, 209, 0.40)","--dsw-alias-bg-layer-1":"rgba(253, 254, 254, 0.52)","--dsw-alias-bg-layer-2":"rgba(253, 254, 254, 0.59)","--dsw-alias-bg-layer-3":"rgba(253, 254, 254, 0.66)","--dsw-alias-bg-mask-1":"rgba(10, 14, 32, 0.24)","--dsw-alias-bg-mask-2":"rgba(10, 14, 32, 0.12)","--dsw-alias-bg-mask-3":"rgba(10, 14, 32, 0.48)","--dsw-alias-bg-mask-drop":"rgba(244, 246, 252, 0.72)","--dsw-alias-bg-mask-photo":"rgba(4, 6, 16, 0.88)","--dsw-alias-bg-module-platform":"rgba(253, 254, 254, 0.59)","--dsw-alias-bg-multi-select":"rgba(253, 254, 254, 0.59)","--dsw-alias-bg-overlay":"#fdfefe","--dsw-alias-bg-skeleton":"rgba(20, 28, 52, 0.07)","--dsw-alias-border-inverted":"rgba(255, 255, 255, 0.70)","--dsw-alias-border-inverted2":"rgba(255, 255, 255, 0.84)","--dsw-alias-border-l1":"rgba(42, 59, 111, 0.07)","--dsw-alias-border-l2":"rgba(42, 59, 111, 0.14)","--dsw-alias-border-l2-darkmode-thin":"rgba(42, 59, 111, 0.10)","--dsw-alias-border-l3":"rgba(42, 59, 111, 0.20)","--dsw-alias-border-l4":"rgba(42, 59, 111, 0.28)","--dsw-alias-brand-primary":"#131a2f","--dsw-alias-brand-primary-invert":"#131a2f","--dsw-alias-brand-primary-new-colorprimary-new-color":"#3b60ce","--dsw-alias-brand-text":"#131a2f","--dsw-alias-button-contrast-fill":"#3d455c","--dsw-alias-button-elevated-fill":"rgba(253, 254, 254, 0.67)","--dsw-alias-button-floating-fill":"rgba(253, 254, 254, 0.67)","--dsw-alias-button-floating-hover":"rgba(253, 254, 254, 0.71)","--dsw-alias-button-ghost-active-border":"#6a7baf","--dsw-alias-button-ghost-active-fill":"rgba(253, 254, 254, 0.69)","--dsw-alias-button-ghost-active-hover":"rgba(253, 254, 254, 0.73)","--dsw-alias-button-info-fill":"#264bba","--dsw-alias-button-info-hover":"#6683db","--dsw-alias-button-primary-dimmed":"rgba(253, 254, 254, 0.67)","--dsw-alias-button-primary-fill":"#131a2f","--dsw-alias-button-primary-hover":"#3b486d","--dsw-alias-button-tool-bar-fill":"rgba(253, 254, 254, 0.55)","--dsw-alias-button-tool-bar-fill-invisible":"rgba(248, 249, 251, 0.36)","--dsw-alias-button-tool-bar-hover":"rgba(253, 254, 254, 0.68)","--dsw-alias-code-diff-added":"rgba(29, 144, 111, 0.10)","--dsw-alias-code-diff-deleted":"rgba(196, 49, 76, 0.10)","--dsw-alias-file-diff-added-bg":"rgba(29, 144, 111, 0.12)","--dsw-alias-file-diff-added-gutter":"rgba(29, 144, 111, 0.08)","--dsw-alias-file-diff-added-marker":"#1d906f","--dsw-alias-file-diff-deleted-bg":"rgba(196, 49, 76, 0.12)","--dsw-alias-file-diff-deleted-gutter":"rgba(196, 49, 76, 0.08)","--dsw-alias-file-diff-deleted-marker":"#c4314c","--dsw-alias-interactive-bg-active":"rgba(20, 28, 52, 0.10)","--dsw-alias-interactive-bg-hover":"rgba(20, 28, 52, 0.06)","--dsw-alias-interactive-bg-hover-accent":"rgba(20, 28, 52, 0.13)","--dsw-alias-interactive-bg-hover-danger":"rgba(196, 49, 76, 0.07)","--dsw-alias-interactive-bg-hover-solid":"rgba(253, 254, 254, 0.69)","--dsw-alias-label-caption":"#8993b0","--dsw-alias-label-deep-diving":"#284cb8","--dsw-alias-label-deep-diving-shimmer":"rgba(59, 96, 206, 0.55)","--dsw-alias-label-dimmed":"#a9b0c6","--dsw-alias-label-document-preview":"#3b486d","--dsw-alias-label-primary":"#131a2f","--dsw-alias-label-primary-bluish":"#1e3c94","--dsw-alias-label-primary-dimmed":"#3b486d","--dsw-alias-label-primary-foreground":"#fcfcfd","--dsw-alias-label-primary-inverted":"#fcfcfd","--dsw-alias-label-secondary":"#3b486d","--dsw-alias-label-shimmer":"rgba(11, 12, 14, 0.30)","--dsw-alias-label-tertiary":"#586690","--dsw-alias-link":"#284cb8","--dsw-alias-markdown-citation":"rgba(253, 254, 254, 0.74)","--dsw-alias-markdown-code-block":"rgba(250, 251, 252, 0.78)","--dsw-alias-markdown-code-block-banner":"rgba(253, 254, 254, 0.80)","--dsw-alias-markdown-code-segment-selected":"rgba(253, 254, 254, 0.78)","--dsw-alias-markdown-code-segment-unselected":"rgba(253, 254, 254, 0.78)","--dsw-alias-markdown-inline-code":"rgba(253, 254, 254, 0.74)","--dsw-alias-markdown-placeholder":"rgba(253, 254, 254, 0.74)","--dsw-alias-markdown-tag":"rgba(253, 254, 254, 0.72)","--dsw-alias-menu-group-header-fill":"#fdfefe","--dsw-alias-menu-icon":"#3b486d","--dsw-alias-scrollbar-bg-l1":"rgba(253, 254, 254, 0.64)","--dsw-alias-scrollbar-bg-l2":"rgba(253, 254, 254, 0.68)","--dsw-alias-scrollbar-hover-l1":"rgba(253, 254, 254, 0.70)","--dsw-alias-scrollbar-hover-l2":"rgba(253, 254, 254, 0.74)","--dsw-alias-state-business-primary":"#284cb8","--dsw-alias-state-business-tertiary":"#e4e7f1","--dsw-alias-state-error-primary":"#c4314c","--dsw-alias-state-error-secondary":"#d2566d","--dsw-alias-state-idle-primary":"#bbc1d3","--dsw-alias-state-success-primary":"#1d906f","--dsw-alias-state-success-secondary":"#2bab87","--dsw-alias-state-success-tertiary":"#e2f4ee","--dsw-alias-state-warn-label":"#956718","--dsw-alias-state-warn-primary":"#ba801c","--dsw-alias-state-warn-secondary":"#e0991f","--dsw-alias-state-warn-tertiary":"#f9f0e1","--dsw-alias-switch-thumb":"#fcfcfd","--dsw-alias-toast-bg":"#191b22","--dsw-alias-toast-label":"#fcfcfd","--dsw-alias-tooltip-bg":"#191b22","--dsw-alias-tooltip-key-bg":"#42444a","--dsw-alias-turn-trigger-bg":"rgba(250, 251, 252, 0.78)","--dsw-alias-turn-trigger-bg-hover":"rgba(20, 28, 52, 0.06)","--dsw-menu-surface-fill":"#fdfefe","--dsw-specific-bubble":"rgba(253, 254, 254, 0.63)","--dsw-specific-bubble-highlight":"rgba(253, 254, 254, 0.69)","--dsw-specific-input-major":"rgba(253, 254, 254, 0.65)","--dsw-specific-login-input":"rgba(253, 254, 254, 0.57)","--dsw-specific-menu":"#fdfefe","--dsw-specific-selector":"rgba(253, 254, 254, 0.63)","--dsw-specific-sidebar-fill":"rgba(253, 254, 254, 0.58)","--dsw-specific-sidebar-nav-item-active":"rgba(253, 254, 254, 0.73)","--dsw-specific-sidebar-nav-item-active-accent":"rgba(253, 254, 254, 0.75)","--dsw-specific-sidebar-nav-item-hover":"rgba(20, 28, 52, 0.07)","--dsw-specific-tip":"rgba(253, 254, 254, 0.63)"},"dark":{"--dsw-alias-bg-base":"rgba(10, 12, 18, 0.44)","--dsw-alias-bg-document-preview":"rgba(13, 16, 25, 0.74)","--dsw-alias-bg-document-selection":"rgba(165, 181, 228, 0.40)","--dsw-alias-bg-layer-1":"rgba(15, 18, 29, 0.54)","--dsw-alias-bg-layer-2":"rgba(21, 26, 40, 0.61)","--dsw-alias-bg-layer-3":"rgba(29, 35, 56, 0.68)","--dsw-alias-bg-mask-1":"rgba(4, 6, 16, 0.56)","--dsw-alias-bg-mask-2":"rgba(4, 6, 16, 0.28)","--dsw-alias-bg-mask-3":"rgba(4, 6, 16, 0.60)","--dsw-alias-bg-mask-drop":"rgba(13, 17, 35, 0.72)","--dsw-alias-bg-mask-photo":"rgba(3, 4, 10, 0.90)","--dsw-alias-bg-module-platform":"rgba(21, 26, 40, 0.61)","--dsw-alias-bg-multi-select":"rgba(21, 26, 40, 0.61)","--dsw-alias-bg-overlay":"#232c46","--dsw-alias-bg-skeleton":"rgba(242, 243, 245, 0.07)","--dsw-alias-border-inverted":"rgba(255, 255, 255, 0.08)","--dsw-alias-border-inverted2":"rgba(255, 255, 255, 0.12)","--dsw-alias-border-l1":"rgba(151, 168, 216, 0.09)","--dsw-alias-border-l2":"rgba(151, 168, 216, 0.17)","--dsw-alias-border-l2-darkmode-thin":"rgba(151, 168, 216, 0.09)","--dsw-alias-border-l3":"rgba(151, 168, 216, 0.24)","--dsw-alias-border-l4":"rgba(151, 168, 216, 0.30)","--dsw-alias-brand-primary":"#f2f3f5","--dsw-alias-brand-primary-invert":"#f2f3f5","--dsw-alias-brand-primary-new-colorprimary-new-color":"#869cdf","--dsw-alias-brand-text":"#f2f3f5","--dsw-alias-button-contrast-fill":"#fcfcfd","--dsw-alias-button-elevated-fill":"rgba(22, 27, 43, 0.69)","--dsw-alias-button-floating-fill":"rgba(20, 25, 39, 0.69)","--dsw-alias-button-floating-hover":"rgba(25, 31, 49, 0.73)","--dsw-alias-button-ghost-active-border":"#495883","--dsw-alias-button-ghost-active-fill":"rgba(23, 28, 45, 0.71)","--dsw-alias-button-ghost-active-hover":"rgba(28, 35, 55, 0.75)","--dsw-alias-button-info-fill":"#6683db","--dsw-alias-button-info-hover":"#264bba","--dsw-alias-button-primary-dimmed":"rgba(16, 22, 40, 0.69)","--dsw-alias-button-primary-fill":"#f2f3f5","--dsw-alias-button-primary-hover":"#f0f2f5","--dsw-alias-button-tool-bar-fill":"rgba(13, 16, 25, 0.55)","--dsw-alias-button-tool-bar-fill-invisible":"rgba(6, 7, 12, 0.36)","--dsw-alias-button-tool-bar-hover":"rgba(18, 22, 35, 0.68)","--dsw-alias-code-diff-added":"rgba(100, 206, 176, 0.10)","--dsw-alias-code-diff-deleted":"rgba(229, 118, 138, 0.10)","--dsw-alias-file-diff-added-bg":"rgba(100, 206, 176, 0.14)","--dsw-alias-file-diff-added-gutter":"rgba(100, 206, 176, 0.09)","--dsw-alias-file-diff-added-marker":"#64ceb0","--dsw-alias-file-diff-deleted-bg":"rgba(229, 118, 138, 0.14)","--dsw-alias-file-diff-deleted-gutter":"rgba(229, 118, 138, 0.09)","--dsw-alias-file-diff-deleted-marker":"#e5768a","--dsw-alias-interactive-bg-active":"rgba(242, 243, 245, 0.13)","--dsw-alias-interactive-bg-hover":"rgba(242, 243, 245, 0.08)","--dsw-alias-interactive-bg-hover-accent":"rgba(242, 243, 245, 0.16)","--dsw-alias-interactive-bg-hover-danger":"rgba(229, 118, 138, 0.14)","--dsw-alias-interactive-bg-hover-solid":"rgba(24, 29, 46, 0.71)","--dsw-alias-label-caption":"#626e93","--dsw-alias-label-deep-diving":"#869cdf","--dsw-alias-label-deep-diving-shimmer":"rgba(190, 201, 233, 0.55)","--dsw-alias-label-dimmed":"#5a6481","--dsw-alias-label-document-preview":"#c1c5d1","--dsw-alias-label-primary":"#f2f3f5","--dsw-alias-label-primary-bluish":"#f0f2f5","--dsw-alias-label-primary-dimmed":"#c1c5d1","--dsw-alias-label-primary-foreground":"#14171f","--dsw-alias-label-primary-inverted":"#14171f","--dsw-alias-label-secondary":"#c1c5d1","--dsw-alias-label-shimmer":"rgba(255, 255, 255, 0.45)","--dsw-alias-label-tertiary":"#969db0","--dsw-alias-link":"#869cdf","--dsw-alias-markdown-citation":"rgba(16, 21, 33, 0.76)","--dsw-alias-markdown-code-block":"rgba(7, 9, 15, 0.80)","--dsw-alias-markdown-code-block-banner":"rgba(12, 15, 24, 0.82)","--dsw-alias-markdown-code-segment-selected":"rgba(26, 32, 50, 0.80)","--dsw-alias-markdown-code-segment-unselected":"rgba(11, 14, 23, 0.80)","--dsw-alias-markdown-inline-code":"rgba(14, 18, 29, 0.76)","--dsw-alias-markdown-placeholder":"rgba(11, 14, 23, 0.76)","--dsw-alias-markdown-tag":"rgba(14, 18, 29, 0.74)","--dsw-alias-menu-group-header-fill":"#283250","--dsw-alias-menu-icon":"#c1c5d1","--dsw-alias-scrollbar-bg-l1":"rgba(36, 46, 76, 0.66)","--dsw-alias-scrollbar-bg-l2":"rgba(43, 55, 90, 0.70)","--dsw-alias-scrollbar-hover-l1":"rgba(50, 63, 103, 0.72)","--dsw-alias-scrollbar-hover-l2":"rgba(56, 72, 117, 0.76)","--dsw-alias-state-business-primary":"#869cdf","--dsw-alias-state-business-tertiary":"#14192a","--dsw-alias-state-error-primary":"#e5768a","--dsw-alias-state-error-secondary":"#ef9fad","--dsw-alias-state-idle-primary":"#4b5981","--dsw-alias-state-success-primary":"#64ceb0","--dsw-alias-state-success-secondary":"#92ddc8","--dsw-alias-state-success-tertiary":"#1b372f","--dsw-alias-state-warn-label":"#e1a847","--dsw-alias-state-warn-primary":"#e1a847","--dsw-alias-state-warn-secondary":"#eec277","--dsw-alias-state-warn-tertiary":"#392d18","--dsw-alias-switch-thumb":"#aeb5cb","--dsw-alias-toast-bg":"#232731","--dsw-alias-toast-label":"#fcfcfd","--dsw-alias-tooltip-bg":"#232731","--dsw-alias-tooltip-key-bg":"#4b4e56","--dsw-alias-turn-trigger-bg":"rgba(7, 9, 15, 0.80)","--dsw-alias-turn-trigger-bg-hover":"rgba(242, 243, 245, 0.08)","--dsw-menu-surface-fill":"#26304c","--dsw-specific-bubble":"rgba(19, 24, 37, 0.65)","--dsw-specific-bubble-highlight":"rgba(24, 30, 47, 0.71)","--dsw-specific-input-major":"rgba(22, 27, 42, 0.67)","--dsw-specific-login-input":"rgba(15, 18, 29, 0.59)","--dsw-specific-menu":"#26304c","--dsw-specific-selector":"rgba(20, 25, 39, 0.65)","--dsw-specific-sidebar-fill":"rgba(12, 15, 25, 0.60)","--dsw-specific-sidebar-nav-item-active":"rgba(26, 35, 61, 0.75)","--dsw-specific-sidebar-nav-item-active-accent":"rgba(31, 41, 72, 0.77)","--dsw-specific-sidebar-nav-item-hover":"rgba(242, 243, 245, 0.08)","--dsw-specific-tip":"rgba(20, 25, 39, 0.65)"}}},"portrait":{"title":"逆光 Portrait","source":"portrait.png","wallpaper":"portrait.jpg","scrim":{"light":"rgba(241, 242, 246, 0.18)","dark":"rgba(14, 18, 29, 0.30)"},"floor":{"light":"#f6f7f9","dark":"#0c0f18"},"tokens":{"light":{"--dsw-alias-bg-base":"rgba(253, 254, 254, 0.40)","--dsw-alias-bg-document-preview":"rgba(253, 254, 254, 0.70)","--dsw-alias-bg-document-selection":"rgba(97, 125, 209, 0.40)","--dsw-alias-bg-layer-1":"rgba(253, 254, 254, 0.50)","--dsw-alias-bg-layer-2":"rgba(253, 254, 254, 0.57)","--dsw-alias-bg-layer-3":"rgba(253, 254, 254, 0.64)","--dsw-alias-bg-mask-1":"rgba(10, 14, 32, 0.24)","--dsw-alias-bg-mask-2":"rgba(10, 14, 32, 0.12)","--dsw-alias-bg-mask-3":"rgba(10, 14, 32, 0.48)","--dsw-alias-bg-mask-drop":"rgba(244, 246, 252, 0.72)","--dsw-alias-bg-mask-photo":"rgba(4, 6, 16, 0.88)","--dsw-alias-bg-module-platform":"rgba(253, 254, 254, 0.57)","--dsw-alias-bg-multi-select":"rgba(253, 254, 254, 0.57)","--dsw-alias-bg-overlay":"#fdfefe","--dsw-alias-bg-skeleton":"rgba(20, 28, 52, 0.07)","--dsw-alias-border-inverted":"rgba(255, 255, 255, 0.70)","--dsw-alias-border-inverted2":"rgba(255, 255, 255, 0.84)","--dsw-alias-border-l1":"rgba(42, 59, 111, 0.07)","--dsw-alias-border-l2":"rgba(42, 59, 111, 0.14)","--dsw-alias-border-l2-darkmode-thin":"rgba(42, 59, 111, 0.10)","--dsw-alias-border-l3":"rgba(42, 59, 111, 0.20)","--dsw-alias-border-l4":"rgba(42, 59, 111, 0.28)","--dsw-alias-brand-primary":"#131a2f","--dsw-alias-brand-primary-invert":"#131a2f","--dsw-alias-brand-primary-new-colorprimary-new-color":"#3b60ce","--dsw-alias-brand-text":"#131a2f","--dsw-alias-button-contrast-fill":"#3d455c","--dsw-alias-button-elevated-fill":"rgba(253, 254, 254, 0.65)","--dsw-alias-button-floating-fill":"rgba(253, 254, 254, 0.65)","--dsw-alias-button-floating-hover":"rgba(253, 254, 254, 0.69)","--dsw-alias-button-ghost-active-border":"#6a7baf","--dsw-alias-button-ghost-active-fill":"rgba(253, 254, 254, 0.67)","--dsw-alias-button-ghost-active-hover":"rgba(253, 254, 254, 0.71)","--dsw-alias-button-info-fill":"#264bba","--dsw-alias-button-info-hover":"#6683db","--dsw-alias-button-primary-dimmed":"rgba(253, 254, 254, 0.65)","--dsw-alias-button-primary-fill":"#131a2f","--dsw-alias-button-primary-hover":"#3b486d","--dsw-alias-button-tool-bar-fill":"rgba(253, 254, 254, 0.55)","--dsw-alias-button-tool-bar-fill-invisible":"rgba(248, 249, 251, 0.36)","--dsw-alias-button-tool-bar-hover":"rgba(253, 254, 254, 0.68)","--dsw-alias-code-diff-added":"rgba(29, 144, 111, 0.10)","--dsw-alias-code-diff-deleted":"rgba(196, 49, 76, 0.10)","--dsw-alias-file-diff-added-bg":"rgba(29, 144, 111, 0.12)","--dsw-alias-file-diff-added-gutter":"rgba(29, 144, 111, 0.08)","--dsw-alias-file-diff-added-marker":"#1d906f","--dsw-alias-file-diff-deleted-bg":"rgba(196, 49, 76, 0.12)","--dsw-alias-file-diff-deleted-gutter":"rgba(196, 49, 76, 0.08)","--dsw-alias-file-diff-deleted-marker":"#c4314c","--dsw-alias-interactive-bg-active":"rgba(20, 28, 52, 0.10)","--dsw-alias-interactive-bg-hover":"rgba(20, 28, 52, 0.06)","--dsw-alias-interactive-bg-hover-accent":"rgba(20, 28, 52, 0.13)","--dsw-alias-interactive-bg-hover-danger":"rgba(196, 49, 76, 0.07)","--dsw-alias-interactive-bg-hover-solid":"rgba(253, 254, 254, 0.67)","--dsw-alias-label-caption":"#8993b0","--dsw-alias-label-deep-diving":"#284cb8","--dsw-alias-label-deep-diving-shimmer":"rgba(59, 96, 206, 0.55)","--dsw-alias-label-dimmed":"#a9b0c6","--dsw-alias-label-document-preview":"#3b486d","--dsw-alias-label-primary":"#131a2f","--dsw-alias-label-primary-bluish":"#1e3c94","--dsw-alias-label-primary-dimmed":"#3b486d","--dsw-alias-label-primary-foreground":"#fcfcfd","--dsw-alias-label-primary-inverted":"#fcfcfd","--dsw-alias-label-secondary":"#3b486d","--dsw-alias-label-shimmer":"rgba(11, 12, 14, 0.30)","--dsw-alias-label-tertiary":"#586690","--dsw-alias-link":"#284cb8","--dsw-alias-markdown-citation":"rgba(253, 254, 254, 0.72)","--dsw-alias-markdown-code-block":"rgba(250, 251, 252, 0.76)","--dsw-alias-markdown-code-block-banner":"rgba(253, 254, 254, 0.78)","--dsw-alias-markdown-code-segment-selected":"rgba(253, 254, 254, 0.76)","--dsw-alias-markdown-code-segment-unselected":"rgba(253, 254, 254, 0.76)","--dsw-alias-markdown-inline-code":"rgba(253, 254, 254, 0.72)","--dsw-alias-markdown-placeholder":"rgba(253, 254, 254, 0.72)","--dsw-alias-markdown-tag":"rgba(253, 254, 254, 0.70)","--dsw-alias-menu-group-header-fill":"#fdfefe","--dsw-alias-menu-icon":"#3b486d","--dsw-alias-scrollbar-bg-l1":"rgba(253, 254, 254, 0.62)","--dsw-alias-scrollbar-bg-l2":"rgba(253, 254, 254, 0.66)","--dsw-alias-scrollbar-hover-l1":"rgba(253, 254, 254, 0.68)","--dsw-alias-scrollbar-hover-l2":"rgba(253, 254, 254, 0.72)","--dsw-alias-state-business-primary":"#284cb8","--dsw-alias-state-business-tertiary":"#e4e7f1","--dsw-alias-state-error-primary":"#c4314c","--dsw-alias-state-error-secondary":"#d2566d","--dsw-alias-state-idle-primary":"#bbc1d3","--dsw-alias-state-success-primary":"#1d906f","--dsw-alias-state-success-secondary":"#2bab87","--dsw-alias-state-success-tertiary":"#e2f4ee","--dsw-alias-state-warn-label":"#956718","--dsw-alias-state-warn-primary":"#ba801c","--dsw-alias-state-warn-secondary":"#e0991f","--dsw-alias-state-warn-tertiary":"#f9f0e1","--dsw-alias-switch-thumb":"#fcfcfd","--dsw-alias-toast-bg":"#191b22","--dsw-alias-toast-label":"#fcfcfd","--dsw-alias-tooltip-bg":"#191b22","--dsw-alias-tooltip-key-bg":"#42444a","--dsw-alias-turn-trigger-bg":"rgba(250, 251, 252, 0.76)","--dsw-alias-turn-trigger-bg-hover":"rgba(20, 28, 52, 0.06)","--dsw-menu-surface-fill":"#fdfefe","--dsw-specific-bubble":"rgba(253, 254, 254, 0.61)","--dsw-specific-bubble-highlight":"rgba(253, 254, 254, 0.67)","--dsw-specific-input-major":"rgba(253, 254, 254, 0.63)","--dsw-specific-login-input":"rgba(253, 254, 254, 0.55)","--dsw-specific-menu":"#fdfefe","--dsw-specific-selector":"rgba(253, 254, 254, 0.61)","--dsw-specific-sidebar-fill":"rgba(253, 254, 254, 0.56)","--dsw-specific-sidebar-nav-item-active":"rgba(253, 254, 254, 0.71)","--dsw-specific-sidebar-nav-item-active-accent":"rgba(253, 254, 254, 0.73)","--dsw-specific-sidebar-nav-item-hover":"rgba(20, 28, 52, 0.07)","--dsw-specific-tip":"rgba(253, 254, 254, 0.61)"},"dark":{"--dsw-alias-bg-base":"rgba(10, 12, 18, 0.42)","--dsw-alias-bg-document-preview":"rgba(13, 16, 25, 0.72)","--dsw-alias-bg-document-selection":"rgba(165, 181, 228, 0.40)","--dsw-alias-bg-layer-1":"rgba(15, 18, 29, 0.52)","--dsw-alias-bg-layer-2":"rgba(21, 26, 40, 0.59)","--dsw-alias-bg-layer-3":"rgba(29, 35, 56, 0.66)","--dsw-alias-bg-mask-1":"rgba(4, 6, 16, 0.56)","--dsw-alias-bg-mask-2":"rgba(4, 6, 16, 0.28)","--dsw-alias-bg-mask-3":"rgba(4, 6, 16, 0.60)","--dsw-alias-bg-mask-drop":"rgba(13, 17, 35, 0.72)","--dsw-alias-bg-mask-photo":"rgba(3, 4, 10, 0.90)","--dsw-alias-bg-module-platform":"rgba(21, 26, 40, 0.59)","--dsw-alias-bg-multi-select":"rgba(21, 26, 40, 0.59)","--dsw-alias-bg-overlay":"#232c46","--dsw-alias-bg-skeleton":"rgba(242, 243, 245, 0.07)","--dsw-alias-border-inverted":"rgba(255, 255, 255, 0.08)","--dsw-alias-border-inverted2":"rgba(255, 255, 255, 0.12)","--dsw-alias-border-l1":"rgba(151, 168, 216, 0.09)","--dsw-alias-border-l2":"rgba(151, 168, 216, 0.17)","--dsw-alias-border-l2-darkmode-thin":"rgba(151, 168, 216, 0.09)","--dsw-alias-border-l3":"rgba(151, 168, 216, 0.24)","--dsw-alias-border-l4":"rgba(151, 168, 216, 0.30)","--dsw-alias-brand-primary":"#f2f3f5","--dsw-alias-brand-primary-invert":"#f2f3f5","--dsw-alias-brand-primary-new-colorprimary-new-color":"#869cdf","--dsw-alias-brand-text":"#f2f3f5","--dsw-alias-button-contrast-fill":"#fcfcfd","--dsw-alias-button-elevated-fill":"rgba(22, 27, 43, 0.67)","--dsw-alias-button-floating-fill":"rgba(20, 25, 39, 0.67)","--dsw-alias-button-floating-hover":"rgba(25, 31, 49, 0.71)","--dsw-alias-button-ghost-active-border":"#495883","--dsw-alias-button-ghost-active-fill":"rgba(23, 28, 45, 0.69)","--dsw-alias-button-ghost-active-hover":"rgba(28, 35, 55, 0.73)","--dsw-alias-button-info-fill":"#6683db","--dsw-alias-button-info-hover":"#264bba","--dsw-alias-button-primary-dimmed":"rgba(16, 22, 40, 0.67)","--dsw-alias-button-primary-fill":"#f2f3f5","--dsw-alias-button-primary-hover":"#f0f2f5","--dsw-alias-button-tool-bar-fill":"rgba(13, 16, 25, 0.55)","--dsw-alias-button-tool-bar-fill-invisible":"rgba(6, 7, 12, 0.36)","--dsw-alias-button-tool-bar-hover":"rgba(18, 22, 35, 0.68)","--dsw-alias-code-diff-added":"rgba(100, 206, 176, 0.10)","--dsw-alias-code-diff-deleted":"rgba(229, 118, 138, 0.10)","--dsw-alias-file-diff-added-bg":"rgba(100, 206, 176, 0.14)","--dsw-alias-file-diff-added-gutter":"rgba(100, 206, 176, 0.09)","--dsw-alias-file-diff-added-marker":"#64ceb0","--dsw-alias-file-diff-deleted-bg":"rgba(229, 118, 138, 0.14)","--dsw-alias-file-diff-deleted-gutter":"rgba(229, 118, 138, 0.09)","--dsw-alias-file-diff-deleted-marker":"#e5768a","--dsw-alias-interactive-bg-active":"rgba(242, 243, 245, 0.13)","--dsw-alias-interactive-bg-hover":"rgba(242, 243, 245, 0.08)","--dsw-alias-interactive-bg-hover-accent":"rgba(242, 243, 245, 0.16)","--dsw-alias-interactive-bg-hover-danger":"rgba(229, 118, 138, 0.14)","--dsw-alias-interactive-bg-hover-solid":"rgba(24, 29, 46, 0.69)","--dsw-alias-label-caption":"#626e93","--dsw-alias-label-deep-diving":"#869cdf","--dsw-alias-label-deep-diving-shimmer":"rgba(190, 201, 233, 0.55)","--dsw-alias-label-dimmed":"#5a6481","--dsw-alias-label-document-preview":"#c1c5d1","--dsw-alias-label-primary":"#f2f3f5","--dsw-alias-label-primary-bluish":"#f0f2f5","--dsw-alias-label-primary-dimmed":"#c1c5d1","--dsw-alias-label-primary-foreground":"#14171f","--dsw-alias-label-primary-inverted":"#14171f","--dsw-alias-label-secondary":"#c1c5d1","--dsw-alias-label-shimmer":"rgba(255, 255, 255, 0.45)","--dsw-alias-label-tertiary":"#969db0","--dsw-alias-link":"#869cdf","--dsw-alias-markdown-citation":"rgba(16, 21, 33, 0.74)","--dsw-alias-markdown-code-block":"rgba(7, 9, 15, 0.78)","--dsw-alias-markdown-code-block-banner":"rgba(12, 15, 24, 0.80)","--dsw-alias-markdown-code-segment-selected":"rgba(26, 32, 50, 0.78)","--dsw-alias-markdown-code-segment-unselected":"rgba(11, 14, 23, 0.78)","--dsw-alias-markdown-inline-code":"rgba(14, 18, 29, 0.74)","--dsw-alias-markdown-placeholder":"rgba(11, 14, 23, 0.74)","--dsw-alias-markdown-tag":"rgba(14, 18, 29, 0.72)","--dsw-alias-menu-group-header-fill":"#283250","--dsw-alias-menu-icon":"#c1c5d1","--dsw-alias-scrollbar-bg-l1":"rgba(36, 46, 76, 0.64)","--dsw-alias-scrollbar-bg-l2":"rgba(43, 55, 90, 0.68)","--dsw-alias-scrollbar-hover-l1":"rgba(50, 63, 103, 0.70)","--dsw-alias-scrollbar-hover-l2":"rgba(56, 72, 117, 0.74)","--dsw-alias-state-business-primary":"#869cdf","--dsw-alias-state-business-tertiary":"#14192a","--dsw-alias-state-error-primary":"#e5768a","--dsw-alias-state-error-secondary":"#ef9fad","--dsw-alias-state-idle-primary":"#4b5981","--dsw-alias-state-success-primary":"#64ceb0","--dsw-alias-state-success-secondary":"#92ddc8","--dsw-alias-state-success-tertiary":"#1b372f","--dsw-alias-state-warn-label":"#e1a847","--dsw-alias-state-warn-primary":"#e1a847","--dsw-alias-state-warn-secondary":"#eec277","--dsw-alias-state-warn-tertiary":"#392d18","--dsw-alias-switch-thumb":"#aeb5cb","--dsw-alias-toast-bg":"#232731","--dsw-alias-toast-label":"#fcfcfd","--dsw-alias-tooltip-bg":"#232731","--dsw-alias-tooltip-key-bg":"#4b4e56","--dsw-alias-turn-trigger-bg":"rgba(7, 9, 15, 0.78)","--dsw-alias-turn-trigger-bg-hover":"rgba(242, 243, 245, 0.08)","--dsw-menu-surface-fill":"#26304c","--dsw-specific-bubble":"rgba(19, 24, 37, 0.63)","--dsw-specific-bubble-highlight":"rgba(24, 30, 47, 0.69)","--dsw-specific-input-major":"rgba(22, 27, 42, 0.65)","--dsw-specific-login-input":"rgba(15, 18, 29, 0.57)","--dsw-specific-menu":"#26304c","--dsw-specific-selector":"rgba(20, 25, 39, 0.63)","--dsw-specific-sidebar-fill":"rgba(12, 15, 25, 0.58)","--dsw-specific-sidebar-nav-item-active":"rgba(26, 35, 61, 0.73)","--dsw-specific-sidebar-nav-item-active-accent":"rgba(31, 41, 72, 0.75)","--dsw-specific-sidebar-nav-item-hover":"rgba(242, 243, 245, 0.08)","--dsw-specific-tip":"rgba(20, 25, 39, 0.63)"}}},"stage":{"title":"舞台 Stage","source":"stage.png","wallpaper":"stage.jpg","scrim":{"light":"rgba(241, 241, 246, 0.10)","dark":"rgba(14, 16, 29, 0.10)"},"floor":{"light":"#f7f7fa","dark":"#0d0e19"},"tokens":{"light":{"--dsw-alias-bg-base":"rgba(253, 253, 254, 0.46)","--dsw-alias-bg-document-preview":"rgba(253, 253, 254, 0.76)","--dsw-alias-bg-document-selection":"rgba(97, 106, 209, 0.40)","--dsw-alias-bg-layer-1":"rgba(253, 253, 254, 0.56)","--dsw-alias-bg-layer-2":"rgba(253, 253, 254, 0.63)","--dsw-alias-bg-layer-3":"rgba(253, 253, 254, 0.70)","--dsw-alias-bg-mask-1":"rgba(10, 14, 32, 0.24)","--dsw-alias-bg-mask-2":"rgba(10, 14, 32, 0.12)","--dsw-alias-bg-mask-3":"rgba(10, 14, 32, 0.48)","--dsw-alias-bg-mask-drop":"rgba(244, 246, 252, 0.72)","--dsw-alias-bg-mask-photo":"rgba(4, 6, 16, 0.88)","--dsw-alias-bg-module-platform":"rgba(253, 253, 254, 0.63)","--dsw-alias-bg-multi-select":"rgba(253, 253, 254, 0.63)","--dsw-alias-bg-overlay":"#fdfdfe","--dsw-alias-bg-skeleton":"rgba(20, 22, 52, 0.07)","--dsw-alias-border-inverted":"rgba(255, 255, 255, 0.70)","--dsw-alias-border-inverted2":"rgba(255, 255, 255, 0.84)","--dsw-alias-border-l1":"rgba(42, 48, 111, 0.07)","--dsw-alias-border-l2":"rgba(42, 48, 111, 0.14)","--dsw-alias-border-l2-darkmode-thin":"rgba(42, 48, 111, 0.10)","--dsw-alias-border-l3":"rgba(42, 48, 111, 0.20)","--dsw-alias-border-l4":"rgba(42, 48, 111, 0.28)","--dsw-alias-brand-primary":"#13162f","--dsw-alias-brand-primary-invert":"#13162f","--dsw-alias-brand-primary-new-colorprimary-new-color":"#3b47ce","--dsw-alias-brand-text":"#13162f","--dsw-alias-button-contrast-fill":"#3d405c","--dsw-alias-button-elevated-fill":"rgba(253, 253, 254, 0.71)","--dsw-alias-button-floating-fill":"rgba(253, 253, 254, 0.71)","--dsw-alias-button-floating-hover":"rgba(253, 253, 254, 0.75)","--dsw-alias-button-ghost-active-border":"#6a70af","--dsw-alias-button-ghost-active-fill":"rgba(253, 253, 254, 0.73)","--dsw-alias-button-ghost-active-hover":"rgba(253, 253, 254, 0.77)","--dsw-alias-button-info-fill":"#2632ba","--dsw-alias-button-info-hover":"#6670db","--dsw-alias-button-primary-dimmed":"rgba(253, 253, 254, 0.71)","--dsw-alias-button-primary-fill":"#13162f","--dsw-alias-button-primary-hover":"#3b3f6d","--dsw-alias-button-tool-bar-fill":"rgba(253, 253, 254, 0.55)","--dsw-alias-button-tool-bar-fill-invisible":"rgba(248, 248, 251, 0.36)","--dsw-alias-button-tool-bar-hover":"rgba(253, 253, 254, 0.68)","--dsw-alias-code-diff-added":"rgba(29, 144, 111, 0.10)","--dsw-alias-code-diff-deleted":"rgba(196, 49, 76, 0.10)","--dsw-alias-file-diff-added-bg":"rgba(29, 144, 111, 0.12)","--dsw-alias-file-diff-added-gutter":"rgba(29, 144, 111, 0.08)","--dsw-alias-file-diff-added-marker":"#1d906f","--dsw-alias-file-diff-deleted-bg":"rgba(196, 49, 76, 0.12)","--dsw-alias-file-diff-deleted-gutter":"rgba(196, 49, 76, 0.08)","--dsw-alias-file-diff-deleted-marker":"#c4314c","--dsw-alias-interactive-bg-active":"rgba(20, 22, 52, 0.10)","--dsw-alias-interactive-bg-hover":"rgba(20, 22, 52, 0.06)","--dsw-alias-interactive-bg-hover-accent":"rgba(20, 22, 52, 0.13)","--dsw-alias-interactive-bg-hover-danger":"rgba(196, 49, 76, 0.07)","--dsw-alias-interactive-bg-hover-solid":"rgba(253, 253, 254, 0.73)","--dsw-alias-label-caption":"#898cb0","--dsw-alias-label-deep-diving":"#2834b8","--dsw-alias-label-deep-diving-shimmer":"rgba(59, 71, 206, 0.55)","--dsw-alias-label-dimmed":"#a9acc6","--dsw-alias-label-document-preview":"#3b3f6d","--dsw-alias-label-primary":"#13162f","--dsw-alias-label-primary-bluish":"#1e2894","--dsw-alias-label-primary-dimmed":"#3b3f6d","--dsw-alias-label-primary-foreground":"#fcfcfd","--dsw-alias-label-primary-inverted":"#fcfcfd","--dsw-alias-label-secondary":"#3b3f6d","--dsw-alias-label-shimmer":"rgba(11, 12, 14, 0.30)","--dsw-alias-label-tertiary":"#585d90","--dsw-alias-link":"#2834b8","--dsw-alias-markdown-citation":"rgba(253, 253, 254, 0.78)","--dsw-alias-markdown-code-block":"rgba(250, 251, 252, 0.82)","--dsw-alias-markdown-code-block-banner":"rgba(253, 253, 254, 0.84)","--dsw-alias-markdown-code-segment-selected":"rgba(253, 253, 254, 0.82)","--dsw-alias-markdown-code-segment-unselected":"rgba(253, 253, 254, 0.82)","--dsw-alias-markdown-inline-code":"rgba(253, 253, 254, 0.78)","--dsw-alias-markdown-placeholder":"rgba(253, 253, 254, 0.78)","--dsw-alias-markdown-tag":"rgba(253, 253, 254, 0.76)","--dsw-alias-menu-group-header-fill":"#fdfdfe","--dsw-alias-menu-icon":"#3b3f6d","--dsw-alias-scrollbar-bg-l1":"rgba(253, 253, 254, 0.68)","--dsw-alias-scrollbar-bg-l2":"rgba(253, 253, 254, 0.72)","--dsw-alias-scrollbar-hover-l1":"rgba(253, 253, 254, 0.74)","--dsw-alias-scrollbar-hover-l2":"rgba(253, 253, 254, 0.78)","--dsw-alias-state-business-primary":"#2834b8","--dsw-alias-state-business-tertiary":"#e4e5f1","--dsw-alias-state-error-primary":"#c4314c","--dsw-alias-state-error-secondary":"#d2566d","--dsw-alias-state-idle-primary":"#bbbdd3","--dsw-alias-state-success-primary":"#1d906f","--dsw-alias-state-success-secondary":"#2bab87","--dsw-alias-state-success-tertiary":"#e2f4ee","--dsw-alias-state-warn-label":"#956718","--dsw-alias-state-warn-primary":"#ba801c","--dsw-alias-state-warn-secondary":"#e0991f","--dsw-alias-state-warn-tertiary":"#f9f0e1","--dsw-alias-switch-thumb":"#fcfcfd","--dsw-alias-toast-bg":"#191922","--dsw-alias-toast-label":"#fcfcfd","--dsw-alias-tooltip-bg":"#191922","--dsw-alias-tooltip-key-bg":"#42424a","--dsw-alias-turn-trigger-bg":"rgba(250, 251, 252, 0.82)","--dsw-alias-turn-trigger-bg-hover":"rgba(20, 22, 52, 0.06)","--dsw-menu-surface-fill":"#fdfdfe","--dsw-specific-bubble":"rgba(253, 253, 254, 0.67)","--dsw-specific-bubble-highlight":"rgba(253, 253, 254, 0.73)","--dsw-specific-input-major":"rgba(253, 253, 254, 0.69)","--dsw-specific-login-input":"rgba(253, 253, 254, 0.61)","--dsw-specific-menu":"#fdfdfe","--dsw-specific-selector":"rgba(253, 253, 254, 0.67)","--dsw-specific-sidebar-fill":"rgba(253, 253, 254, 0.62)","--dsw-specific-sidebar-nav-item-active":"rgba(253, 253, 254, 0.77)","--dsw-specific-sidebar-nav-item-active-accent":"rgba(253, 253, 254, 0.79)","--dsw-specific-sidebar-nav-item-hover":"rgba(20, 22, 52, 0.07)","--dsw-specific-tip":"rgba(253, 253, 254, 0.67)"},"dark":{"--dsw-alias-bg-base":"rgba(10, 11, 18, 0.36)","--dsw-alias-bg-document-preview":"rgba(13, 14, 25, 0.66)","--dsw-alias-bg-document-selection":"rgba(165, 170, 228, 0.40)","--dsw-alias-bg-layer-1":"rgba(15, 16, 29, 0.46)","--dsw-alias-bg-layer-2":"rgba(21, 22, 40, 0.53)","--dsw-alias-bg-layer-3":"rgba(29, 31, 56, 0.60)","--dsw-alias-bg-mask-1":"rgba(4, 6, 16, 0.56)","--dsw-alias-bg-mask-2":"rgba(4, 6, 16, 0.28)","--dsw-alias-bg-mask-3":"rgba(4, 6, 16, 0.60)","--dsw-alias-bg-mask-drop":"rgba(13, 17, 35, 0.72)","--dsw-alias-bg-mask-photo":"rgba(3, 4, 10, 0.90)","--dsw-alias-bg-module-platform":"rgba(21, 22, 40, 0.53)","--dsw-alias-bg-multi-select":"rgba(21, 22, 40, 0.53)","--dsw-alias-bg-overlay":"#232646","--dsw-alias-bg-skeleton":"rgba(242, 242, 245, 0.07)","--dsw-alias-border-inverted":"rgba(255, 255, 255, 0.08)","--dsw-alias-border-inverted2":"rgba(255, 255, 255, 0.12)","--dsw-alias-border-l1":"rgba(151, 157, 216, 0.09)","--dsw-alias-border-l2":"rgba(151, 157, 216, 0.17)","--dsw-alias-border-l2-darkmode-thin":"rgba(151, 157, 216, 0.09)","--dsw-alias-border-l3":"rgba(151, 157, 216, 0.24)","--dsw-alias-border-l4":"rgba(151, 157, 216, 0.30)","--dsw-alias-brand-primary":"#f2f2f5","--dsw-alias-brand-primary-invert":"#f2f2f5","--dsw-alias-brand-primary-new-colorprimary-new-color":"#868edf","--dsw-alias-brand-text":"#f2f2f5","--dsw-alias-button-contrast-fill":"#fcfcfd","--dsw-alias-button-elevated-fill":"rgba(22, 24, 43, 0.61)","--dsw-alias-button-floating-fill":"rgba(20, 22, 39, 0.61)","--dsw-alias-button-floating-hover":"rgba(25, 27, 49, 0.65)","--dsw-alias-button-ghost-active-border":"#494e83","--dsw-alias-button-ghost-active-fill":"rgba(23, 25, 45, 0.63)","--dsw-alias-button-ghost-active-hover":"rgba(28, 30, 55, 0.67)","--dsw-alias-button-info-fill":"#6670db","--dsw-alias-button-info-hover":"#2632ba","--dsw-alias-button-primary-dimmed":"rgba(16, 18, 40, 0.61)","--dsw-alias-button-primary-fill":"#f2f2f5","--dsw-alias-button-primary-hover":"#f0f0f5","--dsw-alias-button-tool-bar-fill":"rgba(13, 14, 25, 0.55)","--dsw-alias-button-tool-bar-fill-invisible":"rgba(6, 7, 12, 0.36)","--dsw-alias-button-tool-bar-hover":"rgba(18, 20, 35, 0.68)","--dsw-alias-code-diff-added":"rgba(100, 206, 176, 0.10)","--dsw-alias-code-diff-deleted":"rgba(229, 118, 138, 0.10)","--dsw-alias-file-diff-added-bg":"rgba(100, 206, 176, 0.14)","--dsw-alias-file-diff-added-gutter":"rgba(100, 206, 176, 0.09)","--dsw-alias-file-diff-added-marker":"#64ceb0","--dsw-alias-file-diff-deleted-bg":"rgba(229, 118, 138, 0.14)","--dsw-alias-file-diff-deleted-gutter":"rgba(229, 118, 138, 0.09)","--dsw-alias-file-diff-deleted-marker":"#e5768a","--dsw-alias-interactive-bg-active":"rgba(242, 242, 245, 0.13)","--dsw-alias-interactive-bg-hover":"rgba(242, 242, 245, 0.08)","--dsw-alias-interactive-bg-hover-accent":"rgba(242, 242, 245, 0.16)","--dsw-alias-interactive-bg-hover-danger":"rgba(229, 118, 138, 0.14)","--dsw-alias-interactive-bg-hover-solid":"rgba(24, 26, 46, 0.63)","--dsw-alias-label-caption":"#626693","--dsw-alias-label-deep-diving":"#868edf","--dsw-alias-label-deep-diving-shimmer":"rgba(190, 194, 233, 0.55)","--dsw-alias-label-dimmed":"#5a5d81","--dsw-alias-label-document-preview":"#c1c3d1","--dsw-alias-label-primary":"#f2f2f5","--dsw-alias-label-primary-bluish":"#f0f0f5","--dsw-alias-label-primary-dimmed":"#c1c3d1","--dsw-alias-label-primary-foreground":"#14151f","--dsw-alias-label-primary-inverted":"#14151f","--dsw-alias-label-secondary":"#c1c3d1","--dsw-alias-label-shimmer":"rgba(255, 255, 255, 0.45)","--dsw-alias-label-tertiary":"#9698b0","--dsw-alias-link":"#868edf","--dsw-alias-markdown-citation":"rgba(16, 18, 33, 0.68)","--dsw-alias-markdown-code-block":"rgba(7, 8, 15, 0.72)","--dsw-alias-markdown-code-block-banner":"rgba(12, 13, 24, 0.74)","--dsw-alias-markdown-code-segment-selected":"rgba(26, 28, 50, 0.72)","--dsw-alias-markdown-code-segment-unselected":"rgba(11, 12, 23, 0.72)","--dsw-alias-markdown-inline-code":"rgba(14, 15, 29, 0.68)","--dsw-alias-markdown-placeholder":"rgba(11, 12, 23, 0.68)","--dsw-alias-markdown-tag":"rgba(14, 16, 29, 0.66)","--dsw-alias-menu-group-header-fill":"#282b50","--dsw-alias-menu-icon":"#c1c3d1","--dsw-alias-scrollbar-bg-l1":"rgba(36, 40, 76, 0.58)","--dsw-alias-scrollbar-bg-l2":"rgba(43, 47, 90, 0.62)","--dsw-alias-scrollbar-hover-l1":"rgba(50, 54, 103, 0.64)","--dsw-alias-scrollbar-hover-l2":"rgba(56, 61, 117, 0.68)","--dsw-alias-state-business-primary":"#868edf","--dsw-alias-state-business-tertiary":"#14152a","--dsw-alias-state-error-primary":"#e5768a","--dsw-alias-state-error-secondary":"#ef9fad","--dsw-alias-state-idle-primary":"#4b5081","--dsw-alias-state-success-primary":"#64ceb0","--dsw-alias-state-success-secondary":"#92ddc8","--dsw-alias-state-success-tertiary":"#1b372f","--dsw-alias-state-warn-label":"#e1a847","--dsw-alias-state-warn-primary":"#e1a847","--dsw-alias-state-warn-secondary":"#eec277","--dsw-alias-state-warn-tertiary":"#392d18","--dsw-alias-switch-thumb":"#aeb1cb","--dsw-alias-toast-bg":"#232431","--dsw-alias-toast-label":"#fcfcfd","--dsw-alias-tooltip-bg":"#232431","--dsw-alias-tooltip-key-bg":"#4b4b56","--dsw-alias-turn-trigger-bg":"rgba(7, 8, 15, 0.72)","--dsw-alias-turn-trigger-bg-hover":"rgba(242, 242, 245, 0.08)","--dsw-menu-surface-fill":"#262a4c","--dsw-specific-bubble":"rgba(19, 21, 37, 0.57)","--dsw-specific-bubble-highlight":"rgba(24, 26, 47, 0.63)","--dsw-specific-input-major":"rgba(22, 23, 42, 0.59)","--dsw-specific-login-input":"rgba(15, 16, 29, 0.51)","--dsw-specific-menu":"#262a4c","--dsw-specific-selector":"rgba(20, 22, 39, 0.57)","--dsw-specific-sidebar-fill":"rgba(12, 13, 25, 0.52)","--dsw-specific-sidebar-nav-item-active":"rgba(26, 29, 61, 0.67)","--dsw-specific-sidebar-nav-item-active-accent":"rgba(31, 35, 72, 0.69)","--dsw-specific-sidebar-nav-item-hover":"rgba(242, 242, 245, 0.08)","--dsw-specific-tip":"rgba(20, 22, 39, 0.57)"}}}};

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
			// A scrim also has to DROP the client's own gradient: the fade is what
			// makes the hole, and `background-color` alone would leave it in place,
			// because the client paints the ramp through the `background` shorthand
			// and that resets the colour to transparent.
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
					`  ${opacityFill(key)}`,
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

