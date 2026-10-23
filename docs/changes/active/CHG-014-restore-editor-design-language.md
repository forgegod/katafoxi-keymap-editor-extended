# CHG-014 — Restore the editor design language in definition dialogs

**Status:** in-progress
**External request:** Direct operator request: With the intruduction of the latest features (CHR) the design does not follow the overall design language. `<button>` is without any styling. Extract the design language from e.g. `<aside class="combo-panel svelte-1k8qld4" aria-label="Combos">` and define them as rules for future ai agents. Creaet CHR with the phased-plan-design skill to fix this design drifts in the implementation
**Impacts:** CAP-001
**Baseline:** `bb64d04119f8817b0cc0250178514af5b68ffd95` on main

## Request boundary and observed drift

Use the repository's CHG identity convention for the requested change record. This is a new follow-up, not a reopening or reinterpretation of completed CHG-012 evidence. CHG-013 remains independent; its future Unicode UI must follow the same contributor design rules without expanding this implementation scope.

Source inspection at the baseline establishes:

- `ComboPanel.svelte` and `Combo.css` provide compact token-based panels, inset property groups, dense buttons and styled fields. `app.css` defines light/dark roles, typography and chrome dimensions; `Common/Button.svelte` provides reusable ordinary actions with semantic variants and explicit interaction states.
- `MacroPanel.svelte` and `BehaviorPanel.svelte` use the shared Button for their launchers but raw buttons throughout their list, form, invocation and preview states. `MacroPanel.css` only adds margins to buttons, and does not provide an input/textarea visual contract. These are the concrete drift targets, not proof that every raw button in the repository is unstyled.
- CHG-012's browser checks in `e2e/definition-dialog-layout.spec.ts` establish dialog bounds/scroll ownership and wrapped KeyEditor choices. They do not establish dialog-content typography, themed field/button styling or semantic action colors. Existing launcher assertions do not cover internal controls.
- Layout discovery already uses the shared Button and themed fields. Filesystem has a separate local button treatment and an explicit CAP-002 red Grant write access contract. Neither is an automatic migration target merely because it differs in density or meaning.

The extracted [editor design language](../../ui-design-language.md) is a contributor contract, wired into the web and canonical-wireframe DOX. It records observed primitives and future-change requirements, not a claim that the implementation below has shipped. Generated Svelte hash classes are never selectors or stable design identifiers.

## Acceptance criteria

- Macro and Behavior dialog contents use the existing editor visual language in light and dark themes: inherited UI typography, shared type scale, semantic surfaces/borders, compact groups, consistent field treatment and wrapping action rows. Ordinary controls no longer rely on user-agent styling or margin-only button rules.
- Ordinary dialog actions use `Common/Button.svelte`. If a dense size is needed, implement an explicit shared compact size without changing the default 30px chrome treatment or copying feature-specific Combo classes. Keep specialized controls only where they have a deliberate, tested styling contract.
- Distinguish ordinary actions, staged confirmation and destruction. Staged Confirm/Apply is not green firmware publication. Delete/Remove remain clear in text and appearance; disabled actions remain genuinely disabled and visibly distinct. Preserve explanatory diagnostics and source-preview disclosures.
- Test resting, hover, keyboard-focus and disabled states, and selected/pressed states where present. Check actual computed styles against shared tokens/equivalent reference roles; classes or screenshots alone do not establish conformance.
- Cover empty/populated lists, macro form and Text to sequence, behavior family forms, invocation, source preview and validation/read-only states. Use representative synthetic content and long bindings/diagnostics to prove wrapping and reachability. Do not label bounded cases an exhaustive all-family behavior certification.
- At 1280×720 and 360×640, main dialog content owns vertical scrolling; fields, labels and action rows fit without horizontal cropping. Source previews may have their own bounded scroller. Keyboard activation, Tab focus, Escape and focus return work without bypassing source-preview confirmation.
- Preserve Demo/verified-Clipboard authoring, unsupported-source refusal, stale-document guards, Apply/Cancel/no-op behavior, undo/redo and actual source-preserving Clipboard export. Styling must not add new authoring permissions or change persistence/domain semantics.
- Each implemented vertical slice updates CAP-001's bounded visual contract, focused tests and canonical HTML/PNG together. Rendered application evidence is inspected in both themes; canonical schematics stay separately generated and are not runtime styling proof.

## Owned seams and evidence

Existing implementation/reference seams:

- `apps/web/src/app.css` — token authority; do not redesign the palette.
- `apps/web/src/lib/components/Common/Button.svelte` — reuse/optional explicit compact size; default variants retain their meaning.
- `apps/web/src/lib/components/ComboPanel.svelte` and `Combo.css` in that directory — reference, not a forced migration target or an instruction to copy every legacy detail.
- `apps/web/src/lib/components/MacroPanel.svelte`, `BehaviorPanel.svelte` and `MacroPanel.css` — definition dialog contents and shared local form/panel presentation.
- `apps/web/src/lib/components/Common/Modal.svelte` — existing focus/Escape contract; change only if a demonstrated same-scope defect requires it.
- `apps/web/src/lib/components/MacroPanel.test.ts`, `BehaviorPanel.test.ts` and `Common/Modal.test.ts` — existing component/transaction evidence.
- `e2e/macros.spec.ts`, `e2e/behaviors.spec.ts` and `e2e/definition-dialog-layout.spec.ts` — existing real-browser workflows/layout evidence.
- `docs/product/capabilities/CAP-001-firmware-keymap-editing.md` and `docs/product/wireframes/generate.mjs` — current-state record and sole canonical screen source.

Proposed new evidence seam: `e2e/editor-design-language.spec.ts` (does not exist at planning time). Use real browser computed-style/state assertions plus screenshots at the specified themes/viewports. Prefer a shared helper within the test boundary over brittle generated selectors or exact theme hex constants. An implementation may extend existing browser files instead if it supplies the same gate and updates this path/command before recording completion.

## Phase plan

| # | Phase | Status | Verification gate |
| --- | --- | --- | --- |
| 1 | Restore Macros dialog controls and reusable styling | done (`pnpm --filter @keymap-editor/web test && pnpm --filter @keymap-editor/web lint && pnpm exec playwright test e2e/macros.spec.ts e2e/definition-dialog-layout.spec.ts e2e/editor-design-language.spec.ts && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` exit 0 @ 0bd09ac9660558aa6178f6fc4d7b8f71e0d50e38) | `pnpm --filter @keymap-editor/web test && pnpm --filter @keymap-editor/web lint && pnpm exec playwright test e2e/macros.spec.ts e2e/definition-dialog-layout.spec.ts e2e/editor-design-language.spec.ts && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` exits 0; inspect Macro runtime states and CAP-001 render |
| 2 | Align all Behaviors dialog states with the same primitives | done (`pnpm --filter @keymap-editor/web test && pnpm --filter @keymap-editor/web lint && pnpm exec playwright test e2e/macros.spec.ts e2e/behaviors.spec.ts e2e/definition-dialog-layout.spec.ts e2e/editor-design-language.spec.ts && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` exit 0 @ e213f8d15944f77ea4175752c36f8565faf206b2) | `pnpm --filter @keymap-editor/web test && pnpm --filter @keymap-editor/web lint && pnpm exec playwright test e2e/macros.spec.ts e2e/behaviors.spec.ts e2e/definition-dialog-layout.spec.ts e2e/editor-design-language.spec.ts && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` exits 0; inspect both dialogs and CAP-001 render |
| 3 | Verify integrated design conformance and close the change | in-progress | `pnpm records:check && pnpm test && pnpm test:e2e && pnpm lint && pnpm build && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` exits 0; inspect final application matrix and CAP-001 render |

## Phase 1 — Restore Macros dialog controls and reusable styling

**Goal:** Macro list, form, Text to sequence, invocation and confirmation are visibly part of the existing editor, with regression evidence beyond shell containment.

1. Re-read the applicable DOX and design-language contract. Add focused browser regressions that demonstrate the current styling gap before correcting it; check real control typography, background/border roles, action intent and keyboard-focus/disabled states in both themes. Use Combos for density/grouping and Common/Button for ordinary action semantics, not exact sidebar geometry or legacy fallback colors.
2. Reuse the shared Button; add an explicit compact size only if required by dense rows, preserving default sizing and semantic variants. Establish reusable definition-dialog field, group and action-row styling without a global raw-button reset or new component library. Keep the CSS sidecar split. Shared shell changes may affect Behaviors, but must preserve its existing workflows until phase 2 completes its internal-control migration.
3. Migrate Macro internal actions and fields across every branch, including per-step Up/Down/Remove, validation and disabled states. Preserve accessible names, handlers and staged source-preview transactions. Verify narrow/desktop wrapping, scrolling, keyboard activation and focus return with synthetic long content.
4. In the same slice, update only CAP-001 claims proved by this phase; update its canonical screen in `docs/product/wireframes/generate.mjs`, generate [HTML](../../product/wireframes/html/CAP-001-firmware-keymap-editing.html), render [PNG](../../product/wireframes/exports/CAP-001-firmware-keymap-editing.png), and inspect the result. Do not claim Behavior content conformance early. Capture/inspect separate runtime screenshots in light/dark at both viewports; keep test artifacts outside the canonical inventory.

**Verification gate:** Run the exact phase-1 table command and inspect the named application/canonical states. Focused browser assertions must fail for the pre-fix content and pass with the fix; record actual evidence, not a presumed red result.

## Phase 2 — Align all Behaviors dialog states with the same primitives

**Goal:** Behaviors follows the same compact hierarchy and control treatment as Macros without a second styling system.

1. Extend the focused real-browser style/state matrix to Behavior empty/list, editable family forms, ordered child controls, typed invocation, source preview, validation and read-only/disabled branches. Include a variable-length child list and long diagnostic/binding content; state exactly which families/states are exercised.
2. Reuse phase-1 primitives for all ordinary internal actions and fields. Preserve global-definition versus per-invocation explanation, destructive intent, required/optional property semantics and source-read-only diagnostics. Do not infer source ownership from the styling change.
3. Preserve native disabled behavior, accessible labels, Tab/Escape/focus return and source-preview Apply. Run both Macro and Behavior workflows to catch shared-style regressions, including unsupported source and actual Clipboard export.
4. Update CAP-001, its canonical generator/HTML/PNG and focused behavior evidence in this same slice. Inspect both dialogs' runtime screenshots in light/dark at both viewports and the generated CAP-001 schematic. Do not promote test screenshots into canonical visuals.

**Verification gate:** Run the exact phase-2 table command and inspect the named application/canonical states. Class/component assertions alone are insufficient evidence of styled controls.

## Phase 3 — Verify integrated design conformance and close the change

**Goal:** The implementation, regression coverage, design rules and current-state references agree before closure.

1. Run the full table gate on the integrated target using the pinned Node/pnpm versions. Confirm the browser suite includes the new conformance checks and the existing transaction/layout regressions.
2. Inspect the final Macro/Behavior runtime matrix at 1280×720 and 360×640 in both themes, including focus/disabled and long-content states; inspect the canonical CAP-001 render. Check shared Button changes have not altered surrounding toolbar/publication/Host controls or the Combos reference unintentionally. Describe remaining evidence limits honestly.
3. Reconcile CAP-001's present-tense claims, canonical links/inventory and the agent rules. Apply the DOX closeout pass. Mark phases done only with actual command/revision evidence; archive this CHG and repair the change index only after every gate and required review passes. Leave CHG-013 and unrelated work untouched; do not push or deploy.

**Verification gate:** Run the exact phase-3 table command and complete the explicit visual inspection. Structural record validation alone cannot certify design conformance.

## Out of scope

- Starting phase 3 as part of phase-2 closeout; phase 2 is complete and phase 3 remains pending.
- Rewriting the application stack, installing a design framework or redesigning the palette/keycaps/Host paper surfaces.
- A repository-wide raw-button ban, universal CSS reset, bulk migration of source pickers or an unsupported claim that every screen has been audited.
- Changing Filesystem Grant write access semantics, recovery behavior, GitHub publication, domain serialization, source ownership or staged definition transactions.
- Reopening CHG-012, executing/coupling CHG-013, Unicode compatibility work, or allocating a new CAP solely for styling.
