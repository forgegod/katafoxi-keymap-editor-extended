# CHG-015 — Keep legend Alt columns reachable

**Status:** in-progress
**External request:** Direct operator request: I've found a clipping issues in the Alt-Menu. how can the clipping testing be improved to prevent these glitches
**Impacts:** CAP-003
**Baseline:** `dc1d992941361fadb1f8fea0efeb4f2f2a8c7657` on main

## Request boundary

The Alt-Menu in this request is the legend strip's rotated Alt column controls: AltGr (`R⎇`) and AltGr+Shift (`⇧R⎇`) in `apps/web/src/lib/components/HostLegendLanguageHead.svelte`. The same overflow also hides the adjacent Computer language / Choose control. This is not a reopening of archived CHG-012. That change covered KeyEditor chip wrap and Alt+click catalog/decode-card overlap. It did not cover the legend strip.

Observed on Demo Corne at 360×640 against the baseline: the legend strip is about 490px wide, `body` is `overflow: hidden`, AltGr+Shift ends past the right edge, and Choose language is entirely off-screen. Neither control can be scrolled into view. The same controls fit at 480, 640, and 1280 for this one-language Demo. Existing browser checks do not measure them. `e2e/definition-dialog-layout.spec.ts` and `e2e/host-symbol-picker-layout.spec.ts` assert dialog and catalog shells on a one-key Clipboard board. The wireframe renderer checks schematic pages only. A fitting dialog box does not prove the legend strip is reachable, and `scrollWidth` does not catch a rotated glyph whose border box still looks intact.

## Chosen layout

Use a legend-owned horizontal scrollport whose scrollport stays inside the viewport. `body` / `html` `overflow: hidden` must not be what hides these controls. Do not ellipsize the Alt glyphs. Do not wrap the layer table in a way that breaks column alignment with the layer rows. At 360×640 and 1280×720, AltGr, AltGr+Shift, and Choose language on Demo Corne are fully inside the viewport or can be scrolled fully into that legend scrollport and operated. Opened profile and language menus must meet the same reachability rule, including when a second host language pushes the rightmost trigger outward.

The always-visible-without-scroll alternative was not selected. It would require shrinking or restacking the strip at 360px and is out of this plan.

## Acceptance criteria

- On Demo Corne at 360×640 and 1280×720, in light and dark themes, AltGr, AltGr+Shift, and Choose language are fully operable. A control may sit in the legend scrollport only when that scrollport is inside the viewport and a user scroll brings the control's border box and text fully into view.
- Opened profile menu items and language-list options meet that same rule, including a second host language so the rightmost trigger is the one under test.
- Rotated Alt glyph ink is not cut by its control. A border box that fits while the text range sticks out is still a failure.
- The regression measures border box and text range, rejects `overflow: hidden` on `body` / `html` as a scroller, and does not replace the existing dialog or catalog shell checks.
- CAP-003 states only the bounded legend outcome this change proves. Its canonical HTML and PNG show the narrow legend remaining operable. Existing host-edit, catalog placement, and persistence behavior stay unchanged.

## Owned seams

- `apps/web/src/lib/components/HostLegendLanguageHead.svelte`
- `apps/web/src/lib/components/HostLegendPicker.svelte`
- `apps/web/src/lib/components/HostProfileMenu.svelte`
- `apps/web/src/App.svelte`
- `docs/product/capabilities/CAP-003-host-layouts-and-legends.md`
- `docs/product/wireframes/generate.mjs`

The new browser spec `e2e/legend-clipping.spec.ts` does not exist at planning time. Re-read the applicable DOX chain before each implementation edit. Do not treat this plan as shipped behavior.

| # | Phase | Status | Verification gate |
| --- | --- | --- | --- |
| 1 | Make Alt columns and Choose language reachable | done (phase-1 gate exit 0 @ 21ed9999c37eaff33c37c829ea21bdbb82f84b91) | `pnpm exec playwright test e2e/legend-clipping.spec.ts && pnpm --filter @keymap-editor/web lint && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` exits 0; inspect the Demo legend at 360×640 and 1280×720 |
| 2 | Apply the same reachability check to open legend menus | pending | `pnpm exec playwright test e2e/legend-clipping.spec.ts` exits 0 with the profile menu and language list open at 360×640 and 1280×720 |
| 3 | Integrate current-state records and close | pending | `pnpm records:check && pnpm test && pnpm test:e2e && pnpm lint && pnpm build && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` exits 0; inspect the CAP-003 render |

## Phase 1 — Make Alt columns and Choose language reachable

**Goal:** Demo Corne no longer loses AltGr+Shift or Choose language off the narrow viewport.

1. Add `e2e/legend-clipping.spec.ts` so the current 360×640 clip fails before the layout change. Measure each named control's border box and text range. Accept an outside control only when an ancestor with `overflow: auto` or `scroll` — not `hidden` — has its scrollport inside the viewport and `scrollIntoView` brings the control fully into view. Run light and dark at 360×640 and 1280×720 on Demo, not only the one-key Clipboard board.
2. Give the legend strip that scrollport. Keep Alt glyph text intact and keep layer-column alignment. Preserve profile, language, and Alt toggle behavior.
3. In the same slice, update only the CAP-003 claim this phase proves. Update `docs/product/wireframes/generate.mjs`, regenerate [CAP-003 HTML](../../product/wireframes/html/CAP-003-host-layouts-and-legends.html) and [CAP-003 PNG](../../product/wireframes/exports/CAP-003-host-layouts-and-legends.png), and inspect the narrow legend. Do not claim open-menu coverage yet.

**Verification gate:** `pnpm exec playwright test e2e/legend-clipping.spec.ts && pnpm --filter @keymap-editor/web lint && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` exits 0. Inspect the Demo legend at both viewports.

## Phase 2 — Apply the same reachability check to open legend menus

**Goal:** The clipping helper catches the same class of glitch on menus the first slice does not open.

1. Reuse the phase 1 helper for the opened profile menu and language list. Add a second host language so the rightmost trigger is exercised at 360×640 and 1280×720 in both themes.
2. Fix only menu placement or scroll reachability that this check fails. Do not restyle unrelated chrome or widen the helper into an all-screen audit.
3. Extend the CAP-003 claim only for the menu outcome this phase proves. Update the canonical generator, HTML, and PNG only if the visible menu or legend hierarchy changed.

**Verification gate:** `pnpm exec playwright test e2e/legend-clipping.spec.ts` exits 0 with those menus open at both viewports.

## Phase 3 — Integrate current-state records and close

**Goal:** Current CAP-003, the clipping spec, and the project gate agree before archive.

1. Reconcile CAP-003 with the implemented boundary. Regenerate and inspect the CAP-003 HTML and PNG. Confirm `Primary surface: human` remains honest.
2. Run the project gate, including the existing dialog and catalog layout specs, so the new helper does not hide a CHG-012 regression.
3. Archive this CHG only after that gate passes. Repair the change index. Do not move a review package; this plan does not require one.

**Verification gate:** `pnpm records:check && pnpm test && pnpm test:e2e && pnpm lint && pnpm build && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` exits 0. Inspect the CAP-003 render.

## Out of scope

- The Scheme label ellipsis in the fixed legend rail.
- KeyEditor chip wrap, definition-dialog fit, and Alt+click catalog overlap already covered by CHG-012.
- Host-edit semantics, persistence, design tokens, and an all-screen visual audit.
- Keeping the Alt columns visible at 360px with no legend scroll.
