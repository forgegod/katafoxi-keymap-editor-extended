# CHG-008 — Discover keyboard layouts from ZMK metadata

**Status:** planned
**External request:** Direct operator request: Incorporate the ../ai-software-blueprint/ into this project. Proceed with the feature gaps as proposed in change requests based on the new blueprint
**Impacts:** CAP-001, CAP-002
**Baseline:** `2bb062d9e613980cc8d7ef1e4c545b527ff1e9c2` on main; recheck branch and working-tree ownership before execution.
**Priority:** P4 — layout discovery

## Current boundary

The loader prefers supplied layout JSON and otherwise infers a flat rectangle from binding count. Demo fixtures are not a general supported-keyboard discovery catalog.

[Parity evidence](../upstream-gap-assessment.md). These are requested outcomes, not present capability claims.

## Dependencies

CHG-004 defines selected keymap identity. Shared core discovery must work for existing sources; filesystem integration can follow CHG-007 without being required.

## Acceptance criteria

- Prefer explicit user layout JSON, then validated discovered metadata, then the existing rectangular fallback with a visible explanation. Inferred geometry is never represented as measured physical geometry.
- Resolve the selected board/shield and a supported matrix-transform/physical-layout subset against a versioned, attributable metadata source. Handle both known matrix-transform compatible spellings when supported.
- Validate binding count, ordering, unique positions, split/transform offsets and sensor metadata. Unknown boards, ambiguous transforms, unsupported expressions and invalid metadata preserve editability through fallback or actionable error, never dropped/reordered keys.
- No automatic overwrite of user layout files. Preview provenance and offer an explicit export/accept flow for generated metadata.
- Catalog maintenance is reproducible with source/license/version attribution; normal editor use does not require arbitrary network access or unbounded include fetching.

## Owned implementation and evidence seams

- `packages/keymap-core/src/keyboard-bundle.ts`
- `packages/keymap-core/src/layout.ts`
- `packages/keymap-core/src/keyboard-bundle.test.ts`
- `packages/keymap-core/src/layout.test.ts`
- `apps/api/src/services/github/files.ts`
- `apps/web/src/lib/clipboard/load.ts`
- `apps/web/src/lib/components/Pickers/Clipboard/Picker.svelte`

Paths name existing seams, not a claim that future symbols or tests already exist. Re-read applicable DOX and current source before execution. Add focused tests first; new files belong under the owning boundary.

| # | Phase | Status | Verification gate |
| --- | --- | --- | --- |
| 1 | Specify the safe behavior boundary | pending | `pnpm records:check` passes; acceptance matrix and proposed regression cases reviewed |
| 2 | Implement and prove the domain slice | pending | `pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/api test && pnpm --filter @keymap-editor/web test` |
| 3 | Integrate the interaction and visual handoff | pending | `pnpm --filter @keymap-editor/web test && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` |
| 4 | Verify and close the change | pending | `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages` |

## Phase 1 — Specify the safe behavior boundary

**Goal:** Agree on the acceptance contract without claiming it is implemented.

1. Decide the initial discovery subset, provenance/versioning, board-selection mechanism and update procedure. Review the existing explicit matching-JSON support before changing precedence.
2. Create synthetic fixtures for split and unibody transforms, offsets, duplicate/invalid coordinates, missing metadata and mismatched key counts. Document limits of expression/include support.

**Verification gate:** `pnpm records:check` passes; acceptance matrix and proposed regression cases reviewed.

## Phase 2 — Implement and prove the domain slice

**Goal:** Implement only the stated scope and pass its behavior regressions.

1. Implement bounded parsing/catalog resolution and normalized layout validation in core; adapters supply source identity and metadata without owning geometry logic.
2. Test mapping order, explicit-JSON precedence, valid discovery, fail-safe rectangle fallback, sensor association and deterministic catalog output.

**Verification gate:** `pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/api test && pnpm --filter @keymap-editor/web test`.

## Phase 3 — Integrate the interaction and visual handoff

**Goal:** Make the new behavior usable and its canonical surface current.

1. Add discovery provenance, ambiguity selection and fallback notices to affected source flows; permit export only by explicit action.
2. Exercise a repo without info.json, a known transform, unknown board and invalid metadata in browser. Update CAP-001/CAP-002 schematics and current layout contract.

**Verification gate:** `pnpm --filter @keymap-editor/web test && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check`.

## Phase 4 — Verify and close the change

**Goal:** Record current behavior only after every integration and visual gate passes.

1. Update impacted CAPs and implementation/test links. Inspect every changed canonical HTML/PNG; validate Primary surface declarations. Add any new current CAP only alongside real behavior and proof.
2. Run the full integration gate below on the actual revision. Record exact commands/results, supported environment and remaining limitations. Retain any review package at its stable path and repair links.
3. Only then mark all phases done with evidence, mark the CHG done and move it to archive; update the change index. Do not commit/push/deploy without separate authorization.

**Verification gate:** `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages`.

## Visual and review ownership

Use `docs/product/wireframes/generate.mjs` only for implemented CAP surfaces; render with `pnpm wireframes:render` and inspect the result. Before implementation, any optional proposal belongs in `docs/changes/reviews/CHG-008/` with a review-only README linked from this record. No proposal package exists or is required just to plan this change. Browser tests use synthetic fixtures and mocked GitHub, not real writes.

## Out of scope

- Perfect physical geometry from electrical matrices, full Zephyr/C preprocessing, arbitrary remote includes, overwriting user layouts, replacing the existing safe fallback.

## Execution state

Not started. No feature acceptance criterion or phase gate has been claimed complete. Use Node 24 LTS and the repository-pinned pnpm; install Playwright Chromium for browser/render gates. If a gate cannot run, keep the phase pending or blocked and record the actual blocker.
