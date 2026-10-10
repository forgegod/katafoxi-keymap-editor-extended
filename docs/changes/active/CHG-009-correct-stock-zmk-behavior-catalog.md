# CHG-009 — Correct stock ZMK behavior catalog

**Status:** planned
**External request:** Direct operator request: Continue as proposed creating a new CHG
**Impacts:** CAP-001
**Baseline:** `8081db012b53792a77ea555101957870fff2ecf3` on main; recheck branch, working-tree ownership, and the ZMK source revision before execution.
**Priority:** P1 — catalog correctness before further picker work

## Current boundary

CHG-001 adds `BT_DISC`, `BT_CLR_ALL`, `RGB_ON`, and `RGB_OFF`. A subsequent comparison with local ZMK main at `5b51501f` found catalog defects outside that closed scope:

- `&out` omits `OUT_NONE`, and its `OUT_USB` / `OUT_BLE` descriptions are reversed from ZMK.
- Stock bindings `&kt`, `&gresc`, and `&soft_off` are absent from the picker.
- `&reset` is advertised as a stock binding even though this ZMK revision defines `&sys_reset` and `&bootloader` instead.

The catalog remains a picker aid, not a claim that every arbitrary source behavior is schema-editable. Existing unknown bindings and parameters must remain source-preserving.

Local ZMK source evidence is `../zmkfirmware-zmk/docs/docs/keymaps/behaviors/index.mdx`, `../zmkfirmware-zmk/docs/docs/keymaps/behaviors/outputs.md`, and the matching DTS/header files. These are planned outcomes, not present capability claims.

## Dependencies

None. Coordinate with CHG-006 only if this limited stock catalog work would grow into editable custom behavior definitions.

## Acceptance criteria

- The `&out` picker accurately describes `OUT_USB` and `OUT_BLE` and offers `OUT_NONE`; applying each writes its exact source token without executing firmware actions in the browser.
- The picker offers ZMK stock `&kt` with one keycode parameter, plus parameterless `&gresc` and `&soft_off`. `&soft_off` clearly states the required `CONFIG_ZMK_PM_SOFT_OFF=y` firmware setting.
- The stock picker no longer advertises invalid `&reset`; `&sys_reset` and `&bootloader` remain available. Matching behavior-documentation links exist for every newly catalogued stock binding.
- Selecting every new choice, Apply, reopen, and export retain the exact binding. Imported unknown/custom bindings and opaque arguments remain unchanged on a no-op Apply.
- The work does not add an arbitrary custom-behavior editor, change a keyboard `.conf`, execute firmware actions, or make `&inc_dec_cp` a new picker choice. The deprecated source alias remains source-preserved.

## Owned implementation and evidence seams

- `packages/keymap-core/data/zmk-behaviors.json`
- `packages/keymap-core/src/behaviors.ts`
- `packages/keymap-core/src/zmk-docs.ts`
- `packages/keymap-core/src/behaviors.test.ts`
- `apps/web/src/lib/key-edit-session.svelte.ts`
- `apps/web/src/lib/key-edit-session.test.ts`
- `apps/web/src/lib/components/KeyEditor/KeyEditor.test.ts`
- `apps/web/src/lib/components/Keyboard/Keys/Key.test.ts`

Paths name existing seams, not a claim that every listed file must change. Re-read applicable DOX and current source before execution. Add focused regressions before implementation.

| # | Phase | Status | Verification gate |
| --- | --- | --- | --- |
| 1 | Specify catalog correctness and evidence | pending | `pnpm records:check` passes; ZMK source matrix and focused regressions reviewed |
| 2 | Implement and prove the catalog slice | pending | `pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test` |
| 3 | Integrate the picker and current-state visual | pending | `pnpm --filter @keymap-editor/web test && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` |
| 4 | Verify and close the change | pending | `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages` |

## Phase 1 — Specify catalog correctness and evidence

**Goal:** Pin the supported stock binding and command matrix without claiming implementation.

1. Recheck `../zmkfirmware-zmk` revision, DTS labels, binding-cell arity, public headers, and ZMK behavior documentation. Record the exact source evidence for `&kt`, `&gresc`, `&soft_off`, `OUT_NONE`, and reset labels.
2. Specify descriptions, inclusion requirements, documentation links, `&soft_off` firmware prerequisite copy, and no-op source-preservation cases. Add regressions that fail before the catalog change.
3. Confirm that `RGB_COLOR_HSB(h,s,b)` remains excluded: it needs a parameterized color-control interaction, not a static command row.

**Verification gate:** `pnpm records:check` passes; ZMK source matrix and focused regressions reviewed.

## Phase 2 — Implement and prove the catalog slice

**Goal:** Correct only the stock catalog entries and prove generated bindings retain their intended shape.

1. Extend the shared catalog and behavior helpers for the documented stock bindings/commands, their keycode and parameterless arities, firmware note, and docs URLs. Drop stock promotion of `&reset`.
2. Add core and session regressions for command descriptions, `OUT_NONE`, stock binding availability, exact parse/encode round trips, and imported custom/opaque no-op behavior.
3. Keep source text preservation and unknown-binding fallbacks intact; do not add parser-specific handling for arbitrary behavior definitions.

**Verification gate:** `pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test`.

## Phase 3 — Integrate the picker and current-state visual

**Goal:** Make the corrected choices usable in the existing KeyEditor and update CAP-001 only once behavior exists.

1. Exercise keyboard selection, Apply, cancel, reopen, and source export for each new choice. Confirm `&kt` opens the keycode picker and parameterless bindings apply directly.
2. Update CAP-001 and its canonical KeyEditor generator only for implemented catalog choices. Regenerate HTML and PNG, inspect the rendered screen, and retain the browser-only firmware boundary.

**Verification gate:** `pnpm --filter @keymap-editor/web test && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check`.

## Phase 4 — Verify and close the change

**Goal:** Record current behavior only after every integration and visual gate passes.

1. Update CAP-001 implementation and test links, inspect the regenerated canonical wireframe, and confirm it states only implemented behavior.
2. Run the full integration gate on the actual revision. Record exact results and real blockers; retain any review package at its stable path.
3. Only then mark phase rows done with evidence, archive this record, and update the change index. Do not commit, push, deploy, or change credentials without separate authorization.

**Verification gate:** `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages`.

## Visual and review ownership

CAP-001 already owns the human KeyEditor surface. Implementation updates its canonical `docs/product/wireframes/generate.mjs` definition, generated HTML, rendered PNG, CAP links, and behavior tests in the same slice. Before implementation, any proposal belongs only in `docs/changes/reviews/CHG-009/` with a review-only README linked from this record. No review package exists or is needed merely to plan this change.

## Out of scope

- A color picker for `&rgb_ug RGB_COLOR_HSB(h,s,b)`; create a separate CHG because it needs a parameterized interaction and source-preservation proof.
- General custom behavior, macro, mod-morph, tap-dance, or sensor-rotate definition authoring; CHG-006 owns that broader work.
- Firmware configuration, flashing, hardware control, or keyboard-specific behavior discovery.
- Promoting the deprecated `&inc_dec_cp` alias to a picker choice.

## Execution state

Not started. No implementation, CAP update, wireframe, or phase gate is claimed complete. Use Node 24 LTS and the repository-pinned pnpm. If a gate cannot run, keep the phase pending or blocked and record the actual blocker.
