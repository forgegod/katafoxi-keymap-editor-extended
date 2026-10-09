# CHG-001 — Complete Bluetooth and RGB command choices

**Status:** planned
**External request:** Direct operator request: Incorporate the ../ai-software-blueprint/ into this project. Proceed with the feature gaps as proposed in change requests based on the new blueprint
**Impacts:** CAP-001
**Baseline:** `2bb062d9e613980cc8d7ef1e4c545b527ff1e9c2` on main; recheck branch and working-tree ownership before execution.
**Priority:** P1 — first implementation

## Current boundary

The behavior catalog lacks BT_DISC, BT_CLR_ALL, RGB_ON and RGB_OFF. This is a picker gap; do not assume existing source tokens fail to round-trip.

[Parity evidence](../upstream-gap-assessment.md). These are requested outcomes, not present capability claims.

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

Paths name existing seams, not a claim that future symbols or tests already exist. Re-read applicable DOX and current source before execution. Add focused tests first; new files belong under the owning boundary.

| # | Phase | Status | Verification gate |
| --- | --- | --- | --- |
| 1 | Specify the safe behavior boundary | pending | `pnpm records:check` passes; acceptance matrix and proposed regression cases reviewed |
| 2 | Implement and prove the domain slice | pending | `pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test` |
| 3 | Integrate the interaction and visual handoff | pending | `pnpm --filter @keymap-editor/web test && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` |
| 4 | Verify and close the change | pending | `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages` |

## Phase 1 — Specify the safe behavior boundary

**Goal:** Agree on the acceptance contract without claiming it is implemented.

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

## Out of scope

- General behavior-schema refresh, firmware execution, new Bluetooth settings UI.

## Execution state

Not started. No feature acceptance criterion or phase gate has been claimed complete. Use Node 24 LTS and the repository-pinned pnpm; install Playwright Chromium for browser/render gates. If a gate cannot run, keep the phase pending or blocked and record the actual blocker.
