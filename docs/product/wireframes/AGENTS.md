# Canonical capability wireframes

## Purpose

Maintain schematic references for implemented human-facing capability surfaces.

## Ownership

`generate.mjs` is the sole editable screen-definition source. It writes manifest.json, index.html and html/. `render.mjs` uses existing Playwright Chromium to write exports/ PNGs at manifest viewports.

## Local Contracts

One matching HTML/PNG pair per human CAP; no future feature or review package enters this inventory. Use synthetic examples. Schematics illustrate current interactions and limits; they are not screenshots or behavior proof. No network assets, application credentials or external data are needed.

## Work Guidance

Read parent product and change contracts. Edit the generator, not generated HTML/PNG. Preserve the editor's dark, compact ZMK/Host visual language. Show relevant error/empty/permission consequences as explicit example states. Source changes require regeneration, rendering, DOM/layout checks and visual inspection.

## Verification

From repository root: `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check`. Install Chromium with `pnpm exec playwright install chromium` if absent. Rendering checks page errors, heading visibility, horizontal overflow and manifest path bounds; it does not prove product behavior. Run CAP-linked unit/e2e tests separately.

## Child DOX Index

None.
