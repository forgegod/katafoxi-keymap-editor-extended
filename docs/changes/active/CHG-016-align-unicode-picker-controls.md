# CHG-016 — Align Unicode picker controls with the editor design language

**Status:** planned
**External request:** Direct operator request: After visual inspection the UI elements of the unicode-picker are not following the design rules applied. E.g. the buttons and imput elements are too large. Verify this before create a CHG with the phased-plan-design skill
**Impacts:** CAP-001
**Baseline:** `15f9e426e80ff956f3c85c96be673436986b4777` on main

## Request boundary and verified drift

Runtime inspection opened the real Demo KeyEditor and selected `&uc`. At the desktop viewport, the Unicode tab controls and text inputs rendered at 16px and about 34.8px high; alias buttons rendered about 53.6px high. At 360×640, the same controls retained those sizes and the edit-key dialog extended beyond the viewport. The existing focused browser suite passes, but it covers compatibility status colors/wrapping and staged Unicode behavior rather than compact picker-control hierarchy, focus, or modal scroll ownership.

`UnicodePicker.svelte` applies one local `input, select, button` rule with 0.4rem/0.6rem padding, 0.4rem radius and inherited 16px browser typography. That is not the compact, explicit control treatment required by `docs/ui-design-language.md`: dense panels use the Combos reference (12px chrome, 22px buttons and 24px fields), while ordinary actions use `Common/Button` and specialized picker controls require their own explicit styling contract.

## Acceptance criteria

- The character/mode tabs, numeric fields, alias search/group fields and alias choices use a compact, token-based Unicode-picker styling contract that matches their specialized role without globally resetting raw controls or copying `.combo-btn`.
- Picker controls use the shared type scale and intentional token-based field/background/border treatment. Tab pressed state, hover, keyboard focus and disabled/read-only treatment where applicable remain visible and accessible in both themes.
- The dense alias grid remains readable and selectable without oversized cards; long alias identifiers wrap rather than clipping. The fields and tabs wrap or stack at narrow widths without horizontal cropping.
- At 1280×720 and 360×640, the edit-key modal keeps one reachable main vertical scroll region. Every Unicode picker control is within the viewport or reachable through that scroll owner; no picker content escapes the dialog.
- Unicode scalar/alias/mode behavior, compatibility warnings, source preservation, valid/invalid Apply, Cancel and focus return are unchanged. This styling work neither detects nor changes OS input state, host mappings, module setup, firmware bindings or source ownership.
- The implementation slice updates CAP-001, its canonical wireframe generator/HTML/PNG, focused browser evidence and current visual claims together. Pending work remains described only by this CHG; no proposal asset enters the product manifest.

## Owned seams and evidence

- `apps/web/src/lib/components/KeyEditor/UnicodePicker.svelte` — picker markup, specialized controls and its local styling boundary.
- `apps/web/src/lib/components/KeyEditor/KeyEditor.css` and `apps/web/src/lib/components/Common/Modal.svelte` — existing edit-key scroll/containment contracts; change only if picker evidence proves the local control change cannot satisfy them.
- `apps/web/src/lib/components/Common/Button.svelte` — semantic ordinary-action reference, not a forced replacement for specialized tabs or alias choices.
- `apps/web/src/lib/components/ComboPanel.svelte` and `apps/web/src/lib/components/Combo.css` — compact panel/reference controls; do not copy feature-specific classes or legacy fallback colors.
- `e2e/unicode-picker.spec.ts` and `apps/web/src/lib/components/KeyEditor/UnicodePicker.test.ts` — Unicode workflow and component contracts; extend real-browser evidence for computed style, focus and containment rather than treating happy-dom as visual proof.
- `docs/product/capabilities/CAP-001-firmware-keymap-editing.md` and `docs/product/wireframes/generate.mjs` — current-state claims and the sole canonical screen-definition source.

## Phase plan

| # | Phase | Status | Verification gate |
| --- | --- | --- | --- |
| 1 | Restore compact Unicode picker controls and browser evidence | pending | `pnpm --filter @keymap-editor/web test && pnpm --filter @keymap-editor/web lint && pnpm exec playwright test e2e/unicode-picker.spec.ts && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` exits 0; inspect Unicode runtime states and CAP-001 render |
| 2 | Integrate the current-state record and close the change | pending | `pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` exits 0; inspect the final Unicode runtime matrix and CAP-001 render |

## Phase 1 — Restore compact Unicode picker controls and browser evidence

**Goal:** The `&uc` picker is visibly part of the editor's compact control system while preserving its staged firmware workflow.

1. Re-read the applicable DOX, UI design-language contract and Unicode boundaries. Use the shared tokens/type roles and Combos density as reference; keep tabs and aliases as specialized semantic controls with explicit local styling, and use `Common/Button` only for an ordinary action if one is introduced.
2. Replace the broad raw-control treatment with scoped, intentional field/tab/alias styles. Cover base, pressed, hover, `:focus-visible`, validation and disabled/read-only states that the picker exposes. Keep labels, visible warning semantics and code content distinct from ordinary control labels.
3. Correct narrow and desktop layout/scroll containment without hiding overflow. Demonstrate that fields, select, filtered aliases and the mode control remain reachable at 1280×720 and 360×640 in light and dark themes; preserve Tab, Escape and focus return.
4. Extend `e2e/unicode-picker.spec.ts` with real-browser computed-style, interaction-state and reachable-control assertions. Retain existing scalar, alias, mode, compatibility and source-preserving Copy workflows. Add only focused component assertions that protect markup/state semantics, not a visual substitute.
5. Update only the CAP-001 claims proved by this slice. Update `docs/product/wireframes/generate.mjs`, regenerate the matching [HTML](../../product/wireframes/html/CAP-001-firmware-keymap-editing.html), render the matching [PNG](../../product/wireframes/exports/CAP-001-firmware-keymap-editing.png), and inspect the runtime/canonical results separately.

**Verification gate:** Run the exact phase-1 table command and inspect compact picker states, keyboard focus and vertical reachability in both themes at both listed viewports. The focused browser assertions must fail against the pre-fix rendered controls and pass after the fix.

## Phase 2 — Integrate the current-state record and close the change

**Goal:** The implementation, CAP, generated visual evidence and project gates agree before this CHG is archived.

1. Recheck the completed phase against the live Unicode behavior boundaries: compatibility remains warning-only, invalid scalar input alone blocks Apply, and Cancel/no-op/source-preserving paths remain unchanged.
2. Inspect the final runtime matrix in light/dark at 1280×720 and 360×640, including tab pressed/focus styles, fields, filtered alias choice, mode select and any disabled/validation state. Inspect the regenerated CAP-001 schematic separately.
3. Reconcile CAP-001's present-tense claims, canonical artifacts and linked evidence. Complete the DOX closeout pass, run the integration gate, then archive this CHG and repair the change index only with actual evidence. Do not push or begin another phase.

**Verification gate:** Run the exact phase-2 table command and complete the explicit visual inspection. Structural record validation alone cannot certify visual conformance.

## Out of scope

- Changing Unicode parsing, scalar validation, alias data, mode bindings, source splicing or module include behavior.
- Detecting, selecting or changing the operating system's active input layout; repairing host mappings; modifying `west.yml`, `.conf` or module defaults; firmware compilation or flashing.
- A repository-wide raw-button reset or migration, a new design framework, or changing unrelated key-editor/Host controls without demonstrated shared containment evidence.
- Reopening CHG-013 or CHG-014, or claiming a general all-screen design audit.
