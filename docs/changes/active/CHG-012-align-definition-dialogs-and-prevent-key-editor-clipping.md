# CHG-012 — Align definition dialogs and prevent KeyEditor clipping

**Status:** in-progress
**External request:** Direct operator request: Fix design divergence in the Macros and Behaviors controls and their dialogs, and fix clipping in the key mapping editor.
**Impacts:** CAP-001
**Baseline:** `93e82f4bc8d79f6ece1908749067e0697273a7ae` on main
**Priority:** P2 — editor controls must remain legible and reachable at ordinary desktop widths

## Current boundary

The firmware chrome offers Macros and Behaviors beside history controls. Both panels stage and preview source-safe definition changes, while the KeyEditor stages a key binding. This change preserves those transactions and source boundaries. It corrects the visual shell only:

- Macros and Behaviors use the same shared chrome-button treatment as neighbouring toolbar actions.
- Macro and Behavior dialogs use the editor surface, fit the viewport, and retain one internal scroll region rather than overflowing the modal shell.
- The KeyEditor exposes every stock behavior chip by wrapping parameterized choices inside the dialog instead of clipping the final choices horizontally.

## Acceptance criteria

- The Macros and Behaviors launchers are shared outline chrome buttons with their existing accessible names and dialog behavior.
- Macro and Behavior dialogs expose their named title, fit within the viewport, and scroll their own content without horizontal cropping at ordinary desktop and narrow viewport widths.
- A KeyEditor with the full stock parameterized behavior catalog wraps behavior choices onto visible rows; no parameterized choice is hidden by an overflow boundary.
- Existing Macro, Behavior, KeyEditor, Escape, and source-preview transactions retain their current behavior and accessibility names.
- CAP-001's canonical editor schematic and generated HTML/PNG depict the current compact editor/dialog hierarchy after implementation.

## Owned implementation and evidence seams

- `apps/web/src/lib/components/MacroPanel.svelte`
- `apps/web/src/lib/components/BehaviorPanel.svelte`
- `apps/web/src/lib/components/MacroPanel.css`
- `apps/web/src/lib/components/KeyEditor/KeyEditor.css`
- `apps/web/src/lib/components/MacroPanel.test.ts`
- `apps/web/src/lib/components/BehaviorPanel.test.ts`
- `apps/web/src/lib/components/KeyEditor/KeyEditor.test.ts`
- `e2e/macros.spec.ts`
- `e2e/behaviors.spec.ts`
- `e2e/definition-dialog-layout.spec.ts`
- `docs/product/capabilities/CAP-001-firmware-keymap-editing.md`
- `docs/product/wireframes/generate.mjs`

Paths name existing seams, not a claim that every planned selector or test already exists. Re-read the applicable DOX chain before each edit. Core parsing, definition transactions, source-preview confirmation, and persistence contracts are out of scope.

| # | Phase | Status | Verification gate |
| --- | --- | --- | --- |
| 1 | Specify visual contract and regression evidence | done (expected-red focused component/browser checks; green KeyEditor catalog and desktop-layout guards; `pnpm --filter @keymap-editor/web lint` exit 0 @ ad1bd9d6a13dcf70d8331b658217f98dcc9f6376) | Focused component and browser regression tests establish the contract, and CAP scope review defers current-state updates until implementation |
| 2 | Implement the contained dialog and KeyEditor layout | pending | `pnpm --filter @keymap-editor/web test && pnpm exec playwright test e2e/macros.spec.ts e2e/behaviors.spec.ts e2e/definition-dialog-layout.spec.ts` exits 0 |
| 3 | Integrate current-state records and canonical visuals | pending | `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` exits 0 |
| 4 | Verify and close the change | pending | `pnpm records:check && pnpm test && pnpm lint && pnpm build` exits 0 |

## Phase 1 — Specify visual contract and regression evidence

**Goal:** Establish the visible fit and interaction contract before changing styles.

1. Add focused component assertions for the shared toolbar launchers and the complete parameterized behavior catalog.
2. Add browser-layout regressions proving the Macro and Behavior dialog panels remain within their modal viewport and that the KeyEditor behavior row has no hidden horizontal content.
3. Review CAP-001's current boundary and defer its present-tense visual outcome update until implementation; this test-only phase does not ship an outcome.

**Verification gate:** Focused component and browser regression tests establish the contract, and CAP scope review defers current-state updates until implementation.

## Phase 2 — Implement the contained dialog and KeyEditor layout

**Goal:** Deliver the visual correction without changing staged definition/key-binding semantics.

1. Use the shared Button component for the Macros and Behaviors chrome launchers, retaining their names and handlers.
2. Replace stale dialog colors and content-box sizing with the current surface tokens and a viewport-contained internal scroll layout.
3. Let parameterized KeyEditor behavior chips wrap within the editor width rather than hiding overflow; retain compact chips and the parameterless second group.
4. Keep dialog Escape, backdrop, focus-trap, source-preview, and stale-transaction behavior unchanged.

**Verification gate:** `pnpm --filter @keymap-editor/web test && pnpm exec playwright test e2e/macros.spec.ts e2e/behaviors.spec.ts e2e/definition-dialog-layout.spec.ts` exits 0.

## Phase 3 — Integrate current-state records and canonical visuals

**Goal:** Make the visual reference and present capability record match the delivered UI.

1. Update CAP-001's visible dialog/editor outcome and implementation/evidence entries if paths change.
2. Update the CAP-001 schematic in `docs/product/wireframes/generate.mjs` to show the compact chrome launchers, viewport-contained dialog content, and wrapped behavior choices.
3. Regenerate the canonical HTML and PNG, inspect the changed render, and keep the product manifest/index consistent.

**Verification gate:** `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` exits 0.

## Phase 4 — Verify and close the change

**Goal:** Close only after code, tests, records, and visuals agree.

1. Run the full workspace gate on the integrated target revision.
2. Reinspect the changed dialog and KeyEditor screenshots at desktop and narrow viewport widths.
3. Mark each verified phase done with its exact command and implementation SHA, archive the CHG, and update the change index. Do not push or deploy.

**Verification gate:** `pnpm records:check && pnpm test && pnpm lint && pnpm build` exits 0.

## Out of scope

- Macro/behavior definition schema, source ownership, parsing, generation, or persistence changes.
- New behavior families or changes to stock behavior availability.
- Keyboard geometry, host legend, source-picker, or deployment changes.
