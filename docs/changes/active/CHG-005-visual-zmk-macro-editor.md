# CHG-005 — Author ZMK macros visually

**Status:** planned
**External request:** Direct operator request: Incorporate the ../ai-software-blueprint/ into this project. Proceed with the feature gaps as proposed in change requests based on the new blueprint
**Impacts:** CAP-001
**Baseline:** `2bb062d9e613980cc8d7ef1e4c545b527ff1e9c2` on main; recheck branch and working-tree ownership before execution.
**Priority:** P3 — larger authoring feature

## Current boundary

The fork preserves existing macro source and provides a fixed rgblayer recipe. It does not model or author arbitrary ZMK macro sequences. C #define expansion is a distinct existing parser feature.

[Parity evidence](../upstream-gap-assessment.md). These are requested outcomes, not present capability claims.

## Dependencies

Coordinate layer-reference semantics with CHG-003. Establish a shared behavior-reference contract for CHG-006; this record owns macro sequences, not general behavior schemas.

## Acceptance criteria

- Create, name, edit and safely delete supported macro definitions; bind them to keys, combos and compatible sensor slots with correctly typed arguments. Warn/block deletion when referenced.
- Support ordered press/release/tap/wait controls, tap-ms and wait-ms including zero, and one-/two-parameter forwarding with appropriate binding-cells and compatible values.
- Validate repeated placeholders, missing/extra arguments and command behaviors with additional parameters. Preserve unsupported/ambiguous constructs unchanged and show why they cannot be edited.
- Generate a typing sequence from text under an explicit supported keycode/host-layout mapping; do not silently map unsupported Unicode to incorrect keys.
- No-op load/save is byte-preserving for unedited macro nodes; edits change only owned intervals. Existing fixed recipes, opaque bindings, comments and includes survive.

## Owned implementation and evidence seams

- `packages/keymap-core/src/types.ts`
- `packages/keymap-core/src/behavior-recipes.ts`
- `packages/keymap-core/src/dts-scan.ts`
- `packages/keymap-core/src/dts-splice.ts`
- `packages/keymap-core/src/custom-bindings.test.ts`
- `packages/keymap-core/src/fixture-roundtrip.test.ts`
- `apps/web/src/lib/components/KeyEditor/KeyEditor.svelte`

Paths name existing seams, not a claim that future symbols or tests already exist. Re-read applicable DOX and current source before execution. Add focused tests first; new files belong under the owning boundary.

| # | Phase | Status | Verification gate |
| --- | --- | --- | --- |
| 1 | Specify the safe behavior boundary | pending | `pnpm records:check` passes; acceptance matrix and proposed regression cases reviewed |
| 2 | Implement and prove the domain slice | pending | `pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test` |
| 3 | Integrate the interaction and visual handoff | pending | `pnpm --filter @keymap-editor/web test && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` |
| 4 | Verify and close the change | pending | `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages` |

## Phase 1 — Specify the safe behavior boundary

**Goal:** Agree on the acceptance contract without claiming it is implemented.

1. Define a bounded macro model and supported ZMK schema baseline. Reconcile named behavior references, parameter typing and layer references without requiring a wholesale DTS AST rewrite.
2. Add fixtures for existing macros, repeated forwarding, zero delays, bracket/brace typing, nested references, unsupported source and reference-safe deletion. Decide text-to-key mapping limits.

**Verification gate:** `pnpm records:check` passes; acceptance matrix and proposed regression cases reviewed.

## Phase 2 — Implement and prove the domain slice

**Goal:** Implement only the stated scope and pass its behavior regressions.

1. Implement macro parse/model/validation/splice in core, register supported references for key/combo/sensor editors, and extend shared serialization/diff/clone history.
2. Verify locality, round-trip, parameter inference and untouched unknown nodes. Preserve rgblayer behavior; do not convert every macro to a recipe.

**Verification gate:** `pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test`.

## Phase 3 — Integrate the interaction and visual handoff

**Goal:** Make the new behavior usable and its canonical surface current.

1. Implement sequence/timing/parameter controls, macro list, text-to-sequence dialog, warnings and reference-safe delete in the SPA. Provide keyboard controls and preview before applying destructive operations.
2. Exercise create/use/edit/export/reload and undo/redo. Update CAP-001 canonical surface or add a separate current CAP only when its implemented surface and tests exist; never allocate a future CAP as proof.

**Verification gate:** `pnpm --filter @keymap-editor/web test && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check`.

## Phase 4 — Verify and close the change

**Goal:** Record current behavior only after every integration and visual gate passes.

1. Update impacted CAPs and implementation/test links. Inspect every changed canonical HTML/PNG; validate Primary surface declarations. Add any new current CAP only alongside real behavior and proof.
2. Run the full integration gate below on the actual revision. Record exact commands/results, supported environment and remaining limitations. Retain any review package at its stable path and repair links.
3. Only then mark all phases done with evidence, mark the CHG done and move it to archive; update the change index. Do not commit/push/deploy without separate authorization.

**Verification gate:** `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages`.

## Visual and review ownership

Use `docs/product/wireframes/generate.mjs` only for implemented CAP surfaces; render with `pnpm wireframes:render` and inspect the result. Before implementation, any optional proposal belongs in `docs/changes/reviews/CHG-005/` with a review-only README linked from this record. No proposal package exists or is required just to plan this change. Browser tests use synthetic fixtures and mocked GitHub, not real writes.

## Out of scope

- Firmware builds, executing macros on the host, full C preprocessor evaluation, arbitrary included .dtsi editing, unrestricted DTS AST rewrite.

## Execution state

Not started. No feature acceptance criterion or phase gate has been claimed complete. Use Node 24 LTS and the repository-pinned pnpm; install Playwright Chromium for browser/render gates. If a gate cannot run, keep the phase pending or blocked and record the actual blocker.
