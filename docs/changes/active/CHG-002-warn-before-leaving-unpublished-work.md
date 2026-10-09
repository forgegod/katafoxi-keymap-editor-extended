# CHG-002 — Warn before leaving unpublished work

**Status:** planned
**External request:** Direct operator request: Incorporate the ../ai-software-blueprint/ into this project. Proceed with the feature gaps as proposed in change requests based on the new blueprint
**Impacts:** CAP-001, CAP-002, CAP-003
**Baseline:** `2bb062d9e613980cc8d7ef1e4c545b527ff1e9c2` on main; recheck branch and working-tree ownership before execution.
**Priority:** P1 — after catalog or independently

## Current boundary

App.svelte flushes browser drafts on visibilitychange/pagehide. There is no beforeunload warning; successful local persistence is not proof of GitHub publication or Clipboard export.

[Parity evidence](../upstream-gap-assessment.md). These are requested outcomes, not present capability claims.

## Dependencies

None; preserve the existing draft flush path.

## Acceptance criteria

- Attach a beforeunload guard only while meaningful work would remain unpublished or unexported according to the source-specific policy. Clean loads, successful publish/export and confirmed discard remove the guard.
- Explicitly test ZMK dirty state, GitHub host-snapshot dirty state, host-only browser edits, Demo drafts and Clipboard export; define which require a warning and why. Never confuse Host install status with firmware dirty state.
- Keep pagehide/visibilitychange flushing. Failed persistence, failed publish/copy and edits made during an in-flight save do not falsely become clean.
- Use the browser-native confirmation contract; no claim that mobile browsers always fire beforeunload, no custom text guarantee, no asynchronous save dependency inside the handler.

## Owned implementation and evidence seams

- `apps/web/src/App.svelte`
- `apps/web/src/lib/editor/document.svelte.ts`
- `apps/web/src/lib/editor/persist-draft.ts`
- `apps/web/src/lib/editor/publish-bridge.ts`
- `apps/web/src/lib/editor.publish.test.ts`
- `apps/web/src/App.test.ts`

Paths name existing seams, not a claim that future symbols or tests already exist. Re-read applicable DOX and current source before execution. Add focused tests first; new files belong under the owning boundary.

| # | Phase | Status | Verification gate |
| --- | --- | --- | --- |
| 1 | Specify the safe behavior boundary | pending | `pnpm records:check` passes; acceptance matrix and proposed regression cases reviewed |
| 2 | Implement and prove the domain slice | pending | `pnpm --filter @keymap-editor/web test` |
| 3 | Integrate the interaction and visual handoff | pending | `pnpm --filter @keymap-editor/web test && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` |
| 4 | Verify and close the change | pending | `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages` |

## Phase 1 — Specify the safe behavior boundary

**Goal:** Agree on the acceptance contract without claiming it is implemented.

1. Decide and document a source-by-source dirty-state matrix before implementation, including Demo and host-only edits. Recommended default: warn on unexported firmware and GitHub host changes; persisted browser-only host edits alone need no warning.
2. Build targeted event-handler tests and a Playwright scenario requiring a user gesture. Establish the exact beforeunload event contract without replacing normal draft recovery.

**Verification gate:** `pnpm records:check` passes; acceptance matrix and proposed regression cases reviewed.

## Phase 2 — Implement and prove the domain slice

**Goal:** Implement only the stated scope and pass its behavior regressions.

1. Centralize the warning predicate over existing dirty/persistence state; install and remove the listener reactively with cleanup.
2. Test failed and in-flight saves, discard, successful Clipboard copy, keyboard/source changes, and restored drafts. Do not mark state clean merely because the event fires.

**Verification gate:** `pnpm --filter @keymap-editor/web test`.

## Phase 3 — Integrate the interaction and visual handoff

**Goal:** Make the new behavior usable and its canonical surface current.

1. Exercise dismissal (stay) and acceptance (leave) of the browser confirmation in Chromium with synthetic edits.
2. Update CAP-002 recovery/warning schematic and relevant CAP-001/CAP-003 boundaries. Keep a clear distinction between browser draft, repository commit, Clipboard export and OS install.

**Verification gate:** `pnpm --filter @keymap-editor/web test && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check`.

## Phase 4 — Verify and close the change

**Goal:** Record current behavior only after every integration and visual gate passes.

1. Update impacted CAPs and implementation/test links. Inspect every changed canonical HTML/PNG; validate Primary surface declarations. Add any new current CAP only alongside real behavior and proof.
2. Run the full integration gate below on the actual revision. Record exact commands/results, supported environment and remaining limitations. Retain any review package at its stable path and repair links.
3. Only then mark all phases done with evidence, mark the CHG done and move it to archive; update the change index. Do not commit/push/deploy without separate authorization.

**Verification gate:** `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages`.

## Visual and review ownership

Use `docs/product/wireframes/generate.mjs` only for implemented CAP surfaces; render with `pnpm wireframes:render` and inspect the result. Before implementation, any optional proposal belongs in `docs/changes/reviews/CHG-002/` with a review-only README linked from this record. No proposal package exists or is required just to plan this change. Browser tests use synthetic fixtures and mocked GitHub, not real writes.

## Out of scope

- Replacing IndexedDB, automatic commits, blocking all internal navigation, guaranteed unload delivery.

## Execution state

Not started. No feature acceptance criterion or phase gate has been claimed complete. Use Node 24 LTS and the repository-pinned pnpm; install Playwright Chromium for browser/render gates. If a gate cannot run, keep the phase pending or blocked and record the actual blocker.
