# CHG-004 — Select a keymap file within a GitHub repository

**Status:** planned
**External request:** Direct operator request: Incorporate the ../ai-software-blueprint/ into this project. Proceed with the feature gaps as proposed in change requests based on the new blueprint
**Impacts:** CAP-002, CAP-003
**Baseline:** `2bb062d9e613980cc8d7ef1e4c545b527ff1e9c2` on main; recheck branch and working-tree ownership before execution.
**Priority:** P2 — repository workflow

## Current boundary

findCodeKeymap selects the first matching config keymap. The picker and API carry repository/branch but no selected keymap path; host snapshot and keymap.json ownership are currently repository-wide conventions.

[Parity evidence](../upstream-gap-assessment.md). These are requested outcomes, not present capability claims.

## Dependencies

None; establishes source identity needed by CHG-007 and CHG-008.

## Acceptance criteria

- List eligible keymaps and let users select one within an authorized repository/branch. Explicit selection controls both load and commit; no fallback to the first file after selection disappears.
- Validate selected paths against the fetched tree/config inventory; reject traversal, templates and unauthorized files. Preserve head-SHA conflict protection and branch-race guards.
- Include keymap identity in drafts, host legend/snapshot ownership, reload, branch retargeting and publish. Reopening keymap B must not restore or commit keymap A data.
- Define backward-compatible ownership/migration for config/keymap.json, templates, physical-layout JSON, and host_keymap/snapshot.json before writing multiple keymaps. Do not silently attach one shared sidecar to every file.
- Single-keymap repositories retain a simple default. Missing/renamed files, no candidates, cancellation, failed writes and switching with dirty work have explicit safe outcomes.

## Owned implementation and evidence seams

- `apps/api/src/services/github/files.ts`
- `apps/api/src/services/github/files.test.ts`
- `apps/web/src/lib/components/Pickers/Github/Picker.svelte`
- `apps/web/src/lib/github/api.svelte.ts`
- `apps/web/src/lib/draft-storage.ts`
- `apps/web/src/lib/editor/types.ts`
- `contracts/github-requests.json`

Paths name existing seams, not a claim that future symbols or tests already exist. Re-read applicable DOX and current source before execution. Add focused tests first; new files belong under the owning boundary.

| # | Phase | Status | Verification gate |
| --- | --- | --- | --- |
| 1 | Specify the safe behavior boundary | pending | `pnpm records:check` passes; acceptance matrix and proposed regression cases reviewed |
| 2 | Implement and prove the domain slice | pending | `pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/api test && pnpm --filter @keymap-editor/web test` |
| 3 | Integrate the interaction and visual handoff | pending | `pnpm --filter @keymap-editor/web test && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` |
| 4 | Verify and close the change | pending | `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages` |

## Phase 1 — Specify the safe behavior boundary

**Goal:** Agree on the acceptance contract without claiming it is implemented.

1. Inspect route/request contracts and inventory every identity and sidecar path. Agree on a backward-compatible multi-keymap file contract and record a new ADR if persistence paths change.
2. Add mock API fixtures with two keymaps, different layouts, JSON/template/host sidecars and stale heads; define a dirty-switch policy.

**Verification gate:** `pnpm records:check` passes; acceptance matrix and proposed regression cases reviewed.

## Phase 2 — Implement and prove the domain slice

**Goal:** Implement only the stated scope and pass its behavior regressions.

1. Add a typed allowlisted keymap selection to API and web requests and pass it through reads, commits, reload and branch changes.
2. Migrate draft/cache keys conservatively; update host snapshot ownership according to the approved contract. Test exact written paths and unchanged unrelated blobs.

**Verification gate:** `pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/api test && pnpm --filter @keymap-editor/web test`.

## Phase 3 — Integrate the interaction and visual handoff

**Goal:** Make the new behavior usable and its canonical surface current.

1. Add the file picker after repository/branch selection, with loading, empty, missing-file and unsaved-switch states.
2. Exercise two-file load/edit/commit with mocked GitHub in Playwright. Update CAP-002/CAP-003 schematics and file contracts.

**Verification gate:** `pnpm --filter @keymap-editor/web test && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check`.

## Phase 4 — Verify and close the change

**Goal:** Record current behavior only after every integration and visual gate passes.

1. Update impacted CAPs and implementation/test links. Inspect every changed canonical HTML/PNG; validate Primary surface declarations. Add any new current CAP only alongside real behavior and proof.
2. Run the full integration gate below on the actual revision. Record exact commands/results, supported environment and remaining limitations. Retain any review package at its stable path and repair links.
3. Only then mark all phases done with evidence, mark the CHG done and move it to archive; update the change index. Do not commit/push/deploy without separate authorization.

**Verification gate:** `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages`.

## Visual and review ownership

Use `docs/product/wireframes/generate.mjs` only for implemented CAP surfaces; render with `pnpm wireframes:render` and inspect the result. Before implementation, any optional proposal belongs in `docs/changes/reviews/CHG-004/` with a review-only README linked from this record. No proposal package exists or is required just to plan this change. Browser tests use synthetic fixtures and mocked GitHub, not real writes.

## Out of scope

- Arbitrary repository filesystem editor, unauthenticated GitHub writes, automatic sidecar overwrite, changing App permissions.

## Execution state

Not started. No feature acceptance criterion or phase gate has been claimed complete. Use Node 24 LTS and the repository-pinned pnpm; install Playwright Chromium for browser/render gates. If a gate cannot run, keep the phase pending or blocked and record the actual blocker.
