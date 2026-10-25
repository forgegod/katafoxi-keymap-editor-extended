# CHG-017 — Complete behavior documentation help

**Status:** in-progress
**External request:** Direct operator request: Some of the `key-editor-chips" data-behaviour-group="params" role="group" aria-label="Behaviours that take a value"` buttons do not have a tooltip with online help reference e.g. "&uc" to https://github.com/urob/zmk-unicode/blob/main/README.md Research for missing buttons where the documentation could be. If this not distinct make proposals to the operator and discuss the options, witch are the best alternative. The result should be applied to a new CHR by the phased-plan-design skill afterwards
**Impacts:** CAP-001
**Baseline:** `da39a091d3de7fae6108bd0d7990afeba0c3cc78` on main

## Outcome and approved scope

Complete documentation discovery for the KeyEditor's value-taking behavior chips, the adjacent missing Studio Unlock link, type-proven named hold-taps, and the separate Layer + RGB recipe chips. Preserve the current native tooltip and Ctrl/Meta-click help interaction, ordinary selection, and staged Apply/Cancel boundary. This is a planning-only record: no phase is reserved or started, and no implementation, regression tests, current-state CAP claims or canonical visuals are changed by its creation.

The operator selected Encoder Rotation for `&inc_dec_kp`, expanded scope to the Layer + RGB controls as well as known catalog/type-proven hold-tap coverage, and selected the upstream Layer + underglow color example as recipe background with an explicit editor-specific restore-black explanation. Record creation/validation/commit is authorized separately from implementation; no push is authorized.

## Baseline evidence and researched references

At the baseline, `packages/keymap-core/data/zmk-behaviors.json` contains 28 built-in choices: 19 value-taking and nine parameterless. Comparing every choice with `packages/keymap-core/src/zmk-docs.ts` finds two missing value-taking mappings (`&uc`, `&inc_dec_kp`) and one missing parameterless mapping (`&studio_unlock`). The other 25 built-in choices already have mappings; this inventory is not a live link-health certification for all existing destinations.

`apps/web/src/lib/components/KeyEditor/BehaviourRow.svelte` already gives every chip a descriptive `title`, adds `Ctrl+click: docs` only when a URL is known, and opens known help using Ctrl or Meta-click with `_blank` and `noopener,noreferrer` without calling selection. Thus these choices lack a help reference/hint, not their entire descriptive tooltip. `packages/keymap-core/src/zmk-docs.ts` currently describes its resolver as official ZMK documentation only; module and editor-recipe coverage must make that description truthful without renaming the exported API unnecessarily.

`mergeHoldTapCatalog` in `packages/keymap-core/src/behaviors.ts` adds named hold-taps from the document and marks their catalog entries with `holdTap: true`. The current documentation lookup receives only the code, so arbitrary named hold-taps lack family help. `KeyEditor.svelte` filters `&hm`, `&as` and `&rgblayer` out of the ordinary behavior row. The first two have documentation gestures in Presets already; per-layer `&rgblayer_<layer>` chips currently have only a description and ordinary selection. Color pickers are separate controls, not documentation launchers.

The following upstream pages were retrieved during planning. They are navigation destinations, not firmware-version or hardware certification; execution rechecks the selected pages and anchor IDs before changing the mapping.

| Choice or proven family | Selected help destination | Evidence and limits |
| --- | --- | --- |
| `&uc` | [urob/zmk-unicode README](https://github.com/urob/zmk-unicode/blob/main/README.md) | Direct module documentation for `&uc CP1 CP2`, aliases, mode switches, firmware installation and host preparation. Keep the operator's exact URL. This is third-party module documentation, not a stock ZMK behavior. |
| `&inc_dec_kp` | [Encoder Rotation](https://zmk.dev/docs/features/encoders#rotation) | Explicitly names `&inc_dec_kp`, `sensor-bindings`, clockwise and counter-clockwise keycodes. The [Variable Sensor Rotation alternative](https://zmk.dev/docs/keymaps/behaviors/sensor-rotate#variable-sensor-rotation) explains the family but uses `&rot_kp`; the operator chose the exact binding reference. |
| `&studio_unlock` | [ZMK Studio Unlock Behavior](https://zmk.dev/docs/keymaps/behaviors/studio-unlock) | Exact reference and no-parameter binding. Opening help never unlocks a device. |
| Document-proven named hold-taps | [Hold-Tap Behavior](https://zmk.dev/docs/keymaps/behaviors/hold-tap) | Family documentation, not a page claiming to define the arbitrary user label or its exact timings/children. Resolve only from proven hold-tap metadata, never from a name, parameter count or blanket unknown-code fallback. Existing `&hm` / `&as` preset help remains valid as family help. |
| Every Layer + RGB recipe chip | [Layer + underglow color macro pattern](https://zmk.dev/docs/keymaps/behaviors/macros#layer--underglow-color) | Closely related upstream pattern, not an exact definition of the editor-owned `&rgblayer` recipe. `RGB_LAYER_RECIPE.description` and its generated body specify release restores black; the upstream example instead uses another release color. The operator chose this pattern over general parameterized-macro help or requiring a new project-specific online guide. |

## Acceptance criteria

- Every built-in behavior chip has a documentation URL and the existing discoverability hint, including `&uc`, `&inc_dec_kp` and `&studio_unlock`; retain all existing destinations unless a separately evidenced correction is required.
- Ctrl/Meta-click on a mapped chip opens exactly the selected destination using the existing safe new-window arguments. It does not select a behavior, mutate a staged binding/definition/color, consume redo, create a recipe or apply firmware edits. Ordinary click and keyboard activation still select/stage normally.
- Named hold-taps gain the hold-tap family destination only through document-proven type metadata. Unknown, opaque or unproven bindings stay unlinked and do not advertise a help gesture; legacy `&reset` remains outside stock promotion. Do not infer a type from a familiar-looking name or two parameters.
- Every rendered per-layer Layer + RGB selection chip has the help gesture. Its tooltip retains the current hold-layer/restore-black meaning and identifies the destination as a ZMK macro pattern rather than exact editor-recipe documentation. `&hm` / `&as` retain their existing help and staging behavior. HSB color controls remain color controls: do not add a misleading docs hint or intercept color-edit gestures.
- Help resolution and family/destination policy live in keymap-core; Svelte supplies proven context and renders/opens the result. Use the existing resolver compatibly or a narrowly justified shared extension; do not scatter URLs or family guesses across UI components.
- Tooltip text stays English. Preserve chip wrapping, focus, main-scroll ownership, disabled behavior, and light/dark desktop/narrow layout. Retain descriptive tooltips and the current native-title interaction; a new custom tooltip, help popover or touch-help workflow is not required.
- Update CAP-001 and its canonical generated HTML/PNG in each implemented interaction slice with behavior-test evidence. No firmware setup, OS installation, source rewriting or network dependency is introduced by help lookup. Tests assert destinations locally; they do not depend on live websites.

## Owned boundaries

- `packages/keymap-core/src/zmk-docs.ts` and `packages/keymap-core/src/zmk-docs.test.ts` — shared destination resolution and full built-in coverage, known-family and unknown-input regressions.
- `packages/keymap-core/src/behaviors.ts` and `packages/keymap-core/src/behaviors.test.ts` — existing document-derived hold-tap metadata and catalog contracts; change only if needed to carry proven documentation context.
- `packages/keymap-core/src/behavior-recipes.ts` and its existing tests — fixed recipe identity, description and black release behavior; documentation must not change its firmware semantics.
- `apps/web/src/lib/components/KeyEditor/BehaviourRow.svelte`, `KeyEditor.svelte` and `KeyEditor.test.ts` — chip hints, Ctrl/Meta help, preset/recipe gestures and unchanged staging. Read `Common/SelectChip.svelte` and `HsbPicker.svelte` before adapting their callers; no generic primitive redesign is planned.
- `apps/web/src/lib/components/Keyboard/Keys/Key.test.ts` — real-session proof that help leaves the current binding and staged document unchanged.
- `e2e/clipboard.spec.ts`, `e2e/unicode-picker.spec.ts` and `e2e/definition-dialog-layout.spec.ts` — extend the existing browser seams for documentation gestures, preserved editing/copy and bounded layout.
- [CAP-001](../../product/capabilities/CAP-001-firmware-keymap-editing.md) and `docs/product/wireframes/generate.mjs` — current-state documentation and canonical firmware-editor schematic, updated only with implemented/tested interactions.

These are existing ownership seams, not a requirement to edit every named file. Read the complete applicable DOX chain and trace current metadata/callers before implementation. There are no active CHG dependencies at the baseline. Unknown custom behavior families, broad behavior-definition help and separate documentation publishing are not added to this scope.

| # | Phase | Status | Verification gate |
| --- | --- | --- | --- |
| 1 | Complete built-in behavior help with interaction evidence | done (`pnpm --filter @keymap-editor/keymap-core build && pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test && pnpm exec playwright test e2e/clipboard.spec.ts e2e/unicode-picker.spec.ts && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` exit 0 @ dcda849e2e648d1ede1c268d8f6c0aff6af3f2d2) | `pnpm --filter @keymap-editor/keymap-core build && pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test && pnpm exec playwright test e2e/clipboard.spec.ts e2e/unicode-picker.spec.ts && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` |
| 2 | Add proven hold-tap and Layer + RGB recipe help | done (`pnpm --filter @keymap-editor/keymap-core build && pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test && pnpm exec playwright test e2e/clipboard.spec.ts e2e/definition-dialog-layout.spec.ts && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` exit 0 @ d4ec8369725825917ea9bd606d8981f7c8bb13eb) | `pnpm --filter @keymap-editor/keymap-core build && pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test && pnpm exec playwright test e2e/clipboard.spec.ts e2e/definition-dialog-layout.spec.ts && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` |
| 3 | Verify integrated help coverage and close the change | pending | `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e` |

## Phase 1 — Complete built-in behavior help with interaction evidence

**Goal:** Every built-in behavior chip, including Unicode, Incremental Key Press and Studio Unlock, exposes truthful documentation help without editing the document.

1. Recheck the baseline inventory and selected pages/anchors. Add focused failing regressions before implementation for all catalog mappings, the exact three missing destinations, existing mapping retention and unknown/undefined/legacy reset behavior.
2. Add the three shared mappings and correct the resolver's documentation-only scope description. Preserve its existing callers and stock/third-party distinctions; do not change catalog membership or parameter schemas.
3. Exercise tooltip hints and both Ctrl/Meta-click paths in component and real-session tests. Assert safe `window.open` arguments, zero selection/confirm callbacks and unchanged binding, staged state and document/history. Keep ordinary pointer/keyboard selection, Apply/Cancel and source-preserving Unicode behavior as controls.
4. Extend the existing browser workflows to assert representative stock and module help destinations without navigating to or requiring the remote site. Exercise actual modified-click event routing separately from pure resolver tests; capture application evidence at 1280×720 and 360×640 in both themes and verify chip reachability.
5. Update CAP-001's bounded help claim and canonical generator in this same slice. Show stock and third-party help examples without claiming OS/module detection or installation. Regenerate/render and inspect the affected HTML/PNG and runtime states.

**Verification gate:** Run the phase-1 table command with exit 0, inspect CAP-001's changed schematic and runtime evidence, and complete the repository-required independent review. Record observed evidence only; do not turn an offline URL assertion into live-site or firmware certification.

## Phase 2 — Add proven hold-tap and Layer + RGB recipe help

**Goal:** Supported document-derived hold-taps and every per-layer Layer + RGB recipe chip expose correctly classified background help, without guessing unknown behavior types or staging on help clicks.

1. Trace named hold-tap provenance from parsed/model `holdTaps` through `mergeHoldTapCatalog` and each KeyEditor caller. Add focused failing tests for arbitrary proven labels and negative controls: unknown two-parameter bindings, lookalike names, opaque/unproven definitions and legacy reset. Resolve family help only from a trusted existing metadata path; do not create a general unknown-code fallback.
2. Reuse/extend shared core help resolution so the UI can distinguish a family or recipe-pattern reference from exact stock/module binding help while preserving existing code-only callers. Keep URLs and semantic classification in core, and retain descriptive/English tooltips.
3. Add Ctrl/Meta-click handling to every rendered per-layer `&rgblayer` selection chip before any staging/color/recipe mutation. Retain the editor's restore-black explanation and mark the reference as a ZMK macro pattern. Do not intercept HSB picker gestures. Preserve `&hm` / `&as` help and ordinary preset selection.
4. Add component/real-session/browser evidence for changed and unchanged staged bindings, existing redo, preset/recipe flags, colors, safe open arguments and ordinary selection/Apply/Cancel. Cover more than one recipe-layer chip and a document-proven arbitrary hold-tap label; unknown controls must neither advertise nor open invented help.
5. Update CAP-001 and the canonical generator in the slice. Illustrate named-family help, recipe-pattern help, unchanged preset behavior and the unlinked unknown boundary. Render/inspect both themes at desktop/narrow widths and retain wrapping/focus/scroll behavior evidence alongside the interaction tests.

**Verification gate:** Run the phase-2 table command with exit 0, inspect changed canonical/runtime evidence and complete the required independent review. Verify that no recipe body, include policy, firmware timing, HSB semantics or source-ownership rule changed merely to add help.

## Phase 3 — Verify integrated help coverage and close the change

**Goal:** The integrated editor, current-state records, canonical visuals and tests agree about the bounded documentation-help contract.

1. Re-audit all built-in mappings, document-proven hold-tap fallback, existing `&hm` / `&as`, and every per-layer recipe chip. Check unknown/legacy controls remain honest and the selected recipe reference does not masquerade as an exact `&rgblayer` specification.
2. Run the complete integration gate on the integrated target using Node 24.21.0 and pnpm 9.15.0. Reconcile any failures without weakening tests or silently expanding scope; distinguish pre-existing failures and skipped coverage from proven outcomes.
3. Confirm CAP-001 retains `Primary surface: human` and links the current [canonical HTML](../../product/wireframes/html/CAP-001-firmware-keymap-editing.html) and [canonical PNG](../../product/wireframes/exports/CAP-001-firmware-keymap-editing.png). Inspect the regenerated help states and representative runtime captures in both themes at 1280×720 and 360×640. Structural record validation alone is not visual approval.
4. Perform the DOX pass, required independent implementation/evidence review and factual record review. Only after the gate and reviews pass, reconcile the current-state narrative, record actual evidence and archive this CHG with the required index repair. No earlier phase archives it.

**Verification gate:** Run the phase-3 table command with exit 0 and complete the visual, review and DOX checks above. No current behavior or completed work is claimed by the pending rows in this plan.

## Out of scope

- Building/flashing firmware, executing a binding, unlocking hardware, changing `west.yml`, `.conf`, host settings or credentials.
- Adding/removing behavior choices, repairing includes, normalizing opaque source, changing Unicode or RGB recipe semantics, or widening definition-authoring permissions.
- Guessing documentation for arbitrary custom labels/macros, inventing stock status for editor presets, or linking every unknown binding to a generic page.
- A new custom tooltip component, help panel, mobile/touch-help flow, online guide deployment, analytics, runtime link checker or network-dependent test gate.
- Phase reservation/execution, deployment or push under the planning-only authorization.
