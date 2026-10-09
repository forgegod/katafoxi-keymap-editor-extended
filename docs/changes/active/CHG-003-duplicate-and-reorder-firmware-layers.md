# CHG-003 — Duplicate and reorder firmware layers safely

**Status:** planned
**External request:** Direct operator request: Incorporate the ../ai-software-blueprint/ into this project. Proceed with the feature gaps as proposed in change requests based on the new blueprint
**Impacts:** CAP-001, CAP-003
**Baseline:** `2bb062d9e613980cc8d7ef1e4c545b527ff1e9c2` on main; recheck branch and working-tree ownership before execution.
**Priority:** P2 — layer workflow

## Current boundary

The document editor supports blank-layer add, rename and delete. No duplicate/reorder operation exists; ZMK layer indices also occur in combos, conditional rules, bindings and recipes.

[Parity evidence](../upstream-gap-assessment.md). These are requested outcomes, not present capability claims.

## Dependencies

No hard dependency on CHG-001/002. Complete before macro/behavior editors unless their layer-reference traversal contract is coordinated.

## Acceptance criteria

- Duplicate copies bindings and encoder turns without aliasing mutable state, uses a unique name/node identity, and is a single undoable operation. Define insertion position and whether self-references remain pointed at the original layer.
- Reorder preserves the meaning of known layer references in bindings, combo filters, conditional rules, sensor bindings and fixed recipes, and synchronizes active/visible layer state and legends.
- Treat layer zero/default-layer semantics explicitly: prevent moving it until a verified policy supports doing so. No silent semantic changes to opaque macros, external parameters or unsupported aliases; block unsafe reorder with an actionable warning.
- Offer keyboard-accessible move controls as well as drag/drop. Cancel/no-op moves are not edits; duplicate/reorder survive save, reload, undo and redo.

## Owned implementation and evidence seams

- `apps/web/src/lib/editor/document.svelte.ts`
- `apps/web/src/lib/components/HostLegendLayerRow.svelte`
- `apps/web/src/lib/editor.layers.test.ts`
- `apps/web/src/lib/editor.model.test.ts`
- `packages/keymap-core/src/compose-binding.ts`
- `packages/keymap-core/src/dts-splice.ts`

Paths name existing seams, not a claim that future symbols or tests already exist. Re-read applicable DOX and current source before execution. Add focused tests first; new files belong under the owning boundary.

| # | Phase | Status | Verification gate |
| --- | --- | --- | --- |
| 1 | Specify the safe behavior boundary | pending | `pnpm records:check` passes; acceptance matrix and proposed regression cases reviewed |
| 2 | Implement and prove the domain slice | pending | `pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test` |
| 3 | Integrate the interaction and visual handoff | pending | `pnpm --filter @keymap-editor/web test && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` |
| 4 | Verify and close the change | pending | `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages` |

## Phase 1 — Specify the safe behavior boundary

**Goal:** Agree on the acceptance contract without claiming it is implemented.

1. Define the reference graph, safe reorder preconditions and layer-zero policy. Inventory source-only references the current model cannot rewrite.
2. Add fixture/property regressions for permutations, repeated references, sensors, conditional rules, combo filters and unsafe opaque sources. Specify duplication semantics separately from reorder.

**Verification gate:** `pnpm records:check` passes; acceptance matrix and proposed regression cases reviewed.

## Phase 2 — Implement and prove the domain slice

**Goal:** Implement only the stated scope and pass its behavior regressions.

1. Implement immutable domain transforms in keymap-core, shared by editor actions. Preserve source node identity or explicitly migrate it safely during splice.
2. Update document state, undo/redo, selection, layer view and draft persistence in one atomic action; never change a macro parameter whose type is unknown.

**Verification gate:** `pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test`.

## Phase 3 — Integrate the interaction and visual handoff

**Goal:** Make the new behavior usable and its canonical surface current.

1. Add duplicate and move controls to the layer row with focus management, meaningful labels and drag/drop parity.
2. Exercise moves in browser plus export/reparse locality. Update CAP-001 and CAP-003 current schematics and boundaries.

**Verification gate:** `pnpm --filter @keymap-editor/web test && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check`.

## Phase 4 — Verify and close the change

**Goal:** Record current behavior only after every integration and visual gate passes.

1. Update impacted CAPs and implementation/test links. Inspect every changed canonical HTML/PNG; validate Primary surface declarations. Add any new current CAP only alongside real behavior and proof.
2. Run the full integration gate below on the actual revision. Record exact commands/results, supported environment and remaining limitations. Retain any review package at its stable path and repair links.
3. Only then mark all phases done with evidence, mark the CHG done and move it to archive; update the change index. Do not commit/push/deploy without separate authorization.

**Verification gate:** `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages`.

## Visual and review ownership

Use `docs/product/wireframes/generate.mjs` only for implemented CAP surfaces; render with `pnpm wireframes:render` and inspect the result. Before implementation, any optional proposal belongs in `docs/changes/reviews/CHG-003/` with a review-only README linked from this record. No proposal package exists or is required just to plan this change. Browser tests use synthetic fixtures and mocked GitHub, not real writes.

## Out of scope

- General macro editor, arbitrary text refactoring, silently remapping unknown external arguments.

## Execution state

Not started. No feature acceptance criterion or phase gate has been claimed complete. Use Node 24 LTS and the repository-pinned pnpm; install Playwright Chromium for browser/render gates. If a gate cannot run, keep the phase pending or blocked and record the actual blocker.
