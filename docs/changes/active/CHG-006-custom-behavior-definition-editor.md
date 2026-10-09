# CHG-006 — Create and configure custom behavior definitions

**Status:** planned
**External request:** Direct operator request: Incorporate the ../ai-software-blueprint/ into this project. Proceed with the feature gaps as proposed in change requests based on the new blueprint
**Impacts:** CAP-001
**Baseline:** `2bb062d9e613980cc8d7ef1e4c545b527ff1e9c2` on main; recheck branch and working-tree ownership before execution.
**Priority:** P3 — larger authoring feature

## Current boundary

The fork has editable hold-tap timing and fixed presets, plus opaque external binding preservation. There is no general definition editor for tap-dance, mod-morph, sticky-key or sensor-rotate behaviors.

[Parity evidence](../upstream-gap-assessment.md). These are requested outcomes, not present capability claims.

## Dependencies

CHG-005 establishes shared macro/reference validation; reuse that contract rather than creating a competing graph. If implemented earlier, explicitly resequence at a verified boundary.

## Acceptance criteria

- Create/configure supported hold-tap, sticky-key/layer, tap-dance, mod-morph and sensor-rotate definitions from a documented schema set; explicitly list unsupported properties/types rather than claiming all ZMK behaviors.
- Preserve labels, node names, binding-cell counts, reference typing and existing property values; name collisions, invalid bindings, recursion and reference-breaking deletion have actionable validation.
- Behavior configuration is global to references while key binding arguments stay per key/combo/sensor. Surface that distinction before Apply.
- Stock overrides and existing hold-tap controls/recipes remain compatible. Unsupported external behaviors remain opaque and byte-preserved instead of being normalized into the closest schema.
- Newly edited definitions round-trip with unrelated source intact, are undoable, and work through each shared save path.

## Owned implementation and evidence seams

- `packages/keymap-core/src/dts-behaviors.ts`
- `packages/keymap-core/src/behaviors.ts`
- `packages/keymap-core/src/types.ts`
- `packages/keymap-core/src/dts-behaviors.test.ts`
- `apps/web/src/lib/components/KeyEditor/HoldTapFields.svelte`
- `apps/web/src/lib/key-edit-session.svelte.ts`

Paths name existing seams, not a claim that future symbols or tests already exist. Re-read applicable DOX and current source before execution. Add focused tests first; new files belong under the owning boundary.

| # | Phase | Status | Verification gate |
| --- | --- | --- | --- |
| 1 | Specify the safe behavior boundary | pending | `pnpm records:check` passes; acceptance matrix and proposed regression cases reviewed |
| 2 | Implement and prove the domain slice | pending | `pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test` |
| 3 | Integrate the interaction and visual handoff | pending | `pnpm --filter @keymap-editor/web test && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` |
| 4 | Verify and close the change | pending | `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages` |

## Phase 1 — Specify the safe behavior boundary

**Goal:** Agree on the acceptance contract without claiming it is implemented.

1. Choose and pin the supported schema set and ownership model. Review upstream/ZMK schemas as requirements, not copied compiled app code.
2. Define reference validation, rename/delete semantics, stock override handling and which properties require raw/read-only fallback. Add fixtures covering each supported family and unsupported properties.

**Verification gate:** `pnpm records:check` passes; acceptance matrix and proposed regression cases reviewed.

## Phase 2 — Implement and prove the domain slice

**Goal:** Implement only the stated scope and pass its behavior regressions.

1. Extend shared behavior definition modeling/parse/splice and schema-driven validation. Reuse macro/reference traversal and integrate diff/clone/undo.
2. Test default/optional values, repeated references, arity, layer parameters, duplicate labels, unknown source and save-path equivalence.

**Verification gate:** `pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test`.

## Phase 3 — Integrate the interaction and visual handoff

**Goal:** Make the new behavior usable and its canonical surface current.

1. Build behavior list/create/configure UI with scope notices, parameter-specific fields and reference-safe destructive actions.
2. Exercise create/bind/edit/cancel/export/reload, including combos and encoders. Update CAP-001 schematic or introduce a new current CAP with its own generated screen only at implementation.

**Verification gate:** `pnpm --filter @keymap-editor/web test && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check`.

## Phase 4 — Verify and close the change

**Goal:** Record current behavior only after every integration and visual gate passes.

1. Update impacted CAPs and implementation/test links. Inspect every changed canonical HTML/PNG; validate Primary surface declarations. Add any new current CAP only alongside real behavior and proof.
2. Run the full integration gate below on the actual revision. Record exact commands/results, supported environment and remaining limitations. Retain any review package at its stable path and repair links.
3. Only then mark all phases done with evidence, mark the CHG done and move it to archive; update the change index. Do not commit/push/deploy without separate authorization.

**Verification gate:** `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages`.

## Visual and review ownership

Use `docs/product/wireframes/generate.mjs` only for implemented CAP surfaces; render with `pnpm wireframes:render` and inspect the result. Before implementation, any optional proposal belongs in `docs/changes/reviews/CHG-006/` with a review-only README linked from this record. No proposal package exists or is required just to plan this change. Browser tests use synthetic fixtures and mocked GitHub, not real writes.

## Out of scope

- Automatic installation of external modules, arbitrary include-tree editing, all experimental ZMK schemas, firmware execution.

## Execution state

Not started. No feature acceptance criterion or phase gate has been claimed complete. Use Node 24 LTS and the repository-pinned pnpm; install Playwright Chromium for browser/render gates. If a gate cannot run, keep the phase pending or blocked and record the actual blocker.
