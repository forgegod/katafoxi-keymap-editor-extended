# Canonical capability wireframes

## Purpose

Maintain schematic references for implemented human-facing capability surfaces.

## Ownership

`generate.mjs` is the sole editable screen-definition source. It writes manifest.json, index.html and html/. `render.mjs` uses existing Playwright Chromium to write exports/ PNGs at manifest viewports.

## Local Contracts

One matching HTML/PNG pair per human CAP; no future feature or review package enters this inventory. Use synthetic examples. Schematics illustrate current interactions and limits; they are not screenshots or behavior proof. No network assets, application credentials or external data are needed.

## Work Guidance

Read parent product and change contracts. Edit the generator, not generated HTML/PNG. Preserve the editor's compact, theme-aware ZMK/Host visual language. Show relevant error/empty/permission consequences as explicit example states. Source changes require regeneration, rendering, DOM/layout checks and visual inspection.

Follow [the editor design language](../../ui-design-language.md) for hierarchy, typography, semantic color and compact control treatment. The app supports light and dark themes; schematic visual consistency does not replace runtime computed-style and interaction evidence in both themes.

CAP-001's Macro and Behavior studies share the generator's existing control/group styles, extract their semantic color roles from `apps/web/src/app.css` during generation and follow `prefers-color-scheme` in standalone HTML. The canonical PNG uses the renderer's dark manifest viewport. Inspect these studies separately in both themes and at desktop/narrow widths; other legacy schematic sections are not an all-surface theme-conformance claim.

CAP-001's Unicode study also extracts app theme roles. Show separate initial/scrolled 360×640 character views with one main scrollport, compact tabs/fields/alias choices, and mode, invalid-scalar and compatibility states. Initialize the scrolled example in generated HTML; inspect the study in both themes and desktop/narrow widths without treating the schematic as runtime proof.

CAP-001's help study uses those theme roles and labels native-title excerpts as review annotations, not a custom help UI. Distinguish stock/module exact references, document-proven named hold-tap/preset family help and per-layer RGB macro-pattern help. Retain restore-black meaning, ordinary preset staging, separate HSB color controls and the unlinked unknown/opaque/legacy boundary. Help never implies installation, OS detection or binding execution.

Show Transparent and None as exact binding references to their full Miscellaneous Behaviors fragment URLs. Keep the native-title/staged-selection presentation; schematic references do not certify future remote availability.

CAP-003's legend detail shows separate initial and scrolled-right narrow states with the same app-derived theme roles. Its table scrolls as a unit; the scrolled example is initialized in generated HTML so the PNG exposes both Alt columns and Choose. Separate English-plus-German profile-menu states show a viewport-bounded vertical scrollport before and after scrolling to the last profile and import actions. Initialize both scroll axes in generated HTML; these schematics do not certify arbitrary profiles or import dialogs.

## Verification

From repository root: `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check`. Install Chromium with `pnpm exec playwright install chromium` if absent. Rendering checks page errors, heading visibility, horizontal overflow and manifest path bounds; it does not prove product behavior. Run CAP-linked unit/e2e tests separately.

## Child DOX Index

None.
