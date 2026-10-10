# CHG-001 — Complete Bluetooth and RGB command choices

**Status:** done
**External request:** Direct operator request: Incorporate the ../ai-software-blueprint/ into this project. Proceed with the feature gaps as proposed in change requests based on the new blueprint
**Impacts:** CAP-001
**Baseline:** `2bb062d9e613980cc8d7ef1e4c545b527ff1e9c2` on main; recheck branch and working-tree ownership before execution.
**Priority:** P1 — first implementation

## Baseline boundary

At the baseline, the behavior catalog lacked BT_DISC, BT_CLR_ALL, RGB_ON and RGB_OFF. This was a picker gap, not a source-token round-trip failure. CAP-001 describes the implemented choices.

[Baseline parity evidence](../upstream-gap-assessment.md).

## Dependencies

None; independent small compatibility slice.

## Acceptance criteria

- All four commands appear under their owning behavior, with accurate English descriptions. BT_DISC requests a profile index; the other three add no extra parameter.
- Selecting a command, changing the active parameter, Apply, reopen and export retain the exact binding. Existing imported tokens survive a no-op Apply.
- Profile-index validation follows a documented ZMK contract rather than an invented hardware limit. Do not clear pairing information or execute firmware commands in the browser.

## Owned implementation and evidence seams

- `packages/keymap-core/data/zmk-behaviors.json`
- `packages/keymap-core/src/behaviors.test.ts`
- `packages/keymap-core/src/catalog-choices.test.ts`
- `apps/web/src/lib/components/KeyEditor/KeyEditor.test.ts`
- `apps/web/src/lib/components/Keyboard/Keys/Key.test.ts`
- `apps/web/src/lib/key-edit-session.test.ts`
- `e2e/clipboard.spec.ts`

These seams contain the implementation and executable evidence for this completed slice.

| # | Phase | Status | Verification gate |
| --- | --- | --- | --- |
| 1 | Specify the safe behavior boundary | done (`pnpm records:check`; ZMK Bluetooth/underglow documentation reviewed; focused regressions observed RED) | `pnpm records:check` passes; acceptance matrix and proposed regression cases reviewed |
| 2 | Implement and prove the domain slice | done (`pnpm --filter @keymap-editor/keymap-core test`: 750 passed, 1 skipped; `pnpm --filter @keymap-editor/web test`: 549 passed) | `pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test` |
| 3 | Integrate the interaction and visual handoff | done (web suite via `pnpm test`: 553 passed; `pnpm test:e2e`: 26 passed, including all four command workflows; generated/rendered CAP-001 inspected; `pnpm records:check` passed) | `pnpm --filter @keymap-editor/web test && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` |
| 4 | Verify and close the change | done (`pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages` passed; pages: 2 passed, 2 expected skipped) | `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages` |

## Phase 1 — Specify the safe behavior boundary

**Goal:** Agree on the acceptance contract without claiming it is implemented.

**Supported ZMK baseline:** [Bluetooth behavior](https://zmk.dev/docs/keymaps/behaviors/bluetooth) defines `BT_DISC` as a second `&bt` binding cell with a 0-indexed profile and `BT_CLR_ALL` without an extra cell. ZMK supports five profiles by default, so the picker follows the existing `BT_SEL` default range `0`–`4`; it does not infer a keyboard-specific profile count. [RGB underglow behavior](https://zmk.dev/docs/keymaps/behaviors/underglow) defines `RGB_ON` and `RGB_OFF` as single-cell `&rgb_ug` actions from `dt-bindings/zmk/rgb.h`.

| Binding | Picker contract | Safety boundary | Regression evidence |
| --- | --- | --- | --- |
| `&bt BT_DISC <index>` | Shows `DISC`; requires an integer index from the documented default range `0`–`4`. | The editor writes only the source binding. It neither disconnects hardware nor clears pairing state. | `behaviors.test.ts`, `key-edit-session.test.ts`, `Key.test.ts` |
| `&bt BT_CLR_ALL` | Shows `CLR ALL`; has no additional parameter. | The editor writes only the source binding; activating it in firmware is outside browser control. | `behaviors.test.ts`, `key-edit-session.test.ts` |
| `&rgb_ug RGB_ON` | Shows `RGB_ON`; has no additional parameter. | The editor writes only the source binding and does not configure underglow hardware. | `behaviors.test.ts`, `key-edit-session.test.ts` |
| `&rgb_ug RGB_OFF` | Shows `RGB_OFF`; has no additional parameter. | The editor writes only the source binding and does not configure underglow hardware. | `behaviors.test.ts`, `key-edit-session.test.ts` |
| Existing imported bindings | A no-op Apply must retain the original parsed binding exactly, including all raw/opaque parameters. | No source normalization beyond existing parse/splice behavior. | `key-edit-session.test.ts`, `binding-roundtrip.test.ts` |

The browser regressions in `e2e/clipboard.spec.ts` exercise all four commands through selection, Apply, reopen, cancel, imported no-op Apply, and exact clipboard export while preserving the source preamble. The `BT_DISC` case checks the `0`–`4` choices, blocks incomplete Apply, and changes the profile from `0` to `2` before applying. Core/session regressions cover command tokens, required argument counts, and encode/parse round-trips.

1. Verify the command signatures against current ZMK documentation/headers and record the supported baseline.
2. Specify empty/invalid profile handling and compare it with existing BT_SEL behavior. Add focused catalog/KeyEditor regression cases before implementation.

**Verification gate:** `pnpm records:check` passes; acceptance matrix and proposed regression cases reviewed.

## Phase 2 — Implement and prove the domain slice

**Goal:** Implement only the stated scope and pass its behavior regressions.

1. Extend the shared catalog and parameter choices, not a UI-only command list.
2. Exercise parse/encode/splice and no-op editing of all four commands; preserve additional parameters where required.

**Verification gate:** `pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test`.

## Phase 3 — Integrate the interaction and visual handoff

**Goal:** Make the new behavior usable and its canonical surface current.

1. Expose choices in the existing KeyEditor and exercise keyboard selection, Apply and cancel.
2. Update the CAP-001 canonical KeyEditor schematic only for the implemented command choices; do not imply these commands immediately affect hardware.

**Verification gate:** `pnpm --filter @keymap-editor/web test && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check`.

## Phase 4 — Verify and close the change

**Goal:** Record current behavior only after every integration and visual gate passes.

1. Update impacted CAPs and implementation/test links. Inspect every changed canonical HTML/PNG; validate Primary surface declarations. Add any new current CAP only alongside real behavior and proof.
2. Run the full integration gate below on the actual revision. Record exact commands/results, supported environment and remaining limitations. Retain any review package at its stable path and repair links.
3. Only then mark all phases done with evidence, mark the CHG done and move it to archive; update the change index. Do not commit/push/deploy without separate authorization.

**Verification gate:** `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages`.

## Visual and review ownership

Use `docs/product/wireframes/generate.mjs` only for implemented CAP surfaces; render with `pnpm wireframes:render` and inspect the result. Before implementation, any optional proposal belongs in `docs/changes/reviews/CHG-001/` with a review-only README linked from this record. No proposal package exists or is required just to plan this change. Browser tests use synthetic fixtures and mocked GitHub, not real writes.

## Closure verification

- Verified on Node `v24.21.0`, pnpm `9.15.0`, with Playwright Chromium installed.
- `pnpm test` passed: keymap-core 750 passed / 1 skipped, API 226 passed, web 553 passed, Cloudflare 11 passed, record tests 71 passed.
- `pnpm lint` passed with no diagnostics; `pnpm build` passed. Vite reports the existing 1.55 MB minified entry-chunk size warning.
- Browser gates passed: `pnpm test:e2e` 26 passed, `pnpm test:e2e:prod` 5 passed, and `pnpm test:e2e:pages` 2 passed / 2 skipped because the static Pages deployment intentionally has no GitHub session.
- `pnpm records:check` passed against the final record tree: 3 capabilities, 9 change records, and the wireframe manifest in sync. No editor swap file remains in the archive.
- Canonical wireframes were regenerated and rendered. CAP-001 was visually inspected: the `&bt BT_DISC 2` staged example, command choices, profile indexes, Apply/Cancel controls, and source-only hardware boundary are visible without clipping.
- The profile picker covers ZMK's documented default indexes 0–4. It does not discover or configure a specific keyboard's Bluetooth profile count, and the browser still never performs firmware actions.

## Out of scope

- General behavior-schema refresh, firmware execution, new Bluetooth settings UI.

## Execution state

Implementation is complete and archived. Closure evidence is recorded above; follow-up stock-catalog work is owned separately by CHG-009. This receipt does not imply a commit, push, or deployment.
