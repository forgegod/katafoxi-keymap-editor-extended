# CHG-002 — Warn before leaving unpublished work

**Status:** in-progress
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
| 1 | Specify the safe behavior boundary | done (`pnpm records:check`; `node --test scripts/records-tests/changes.test.mjs`) | acceptance matrix and proposed regression cases reviewed |
| 2 | Implement and prove the domain slice | pending | `pnpm --filter @keymap-editor/web test` |
| 3 | Integrate the interaction and visual handoff | pending | `pnpm --filter @keymap-editor/web test && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` |
| 4 | Verify and close the change | pending | `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages` |

## Phase 1 — Specify the safe behavior boundary

**Goal:** Agree on the acceptance contract without claiming it is implemented.

1. Decide and document a source-by-source dirty-state matrix before implementation, including Demo and host-only edits. Recommended default: warn on unexported firmware and GitHub host changes; persisted browser-only host edits alone need no warning.
2. Build targeted event-handler tests and a Playwright scenario requiring a user gesture. Establish the exact beforeunload event contract without replacing normal draft recovery.
3. Align the record validator with the phase contract: an active in-progress
   CHG may be between verified phases with no phase in progress, but it may
   never have more than one. Cover that checkpoint with a validator regression.

**Verification gate:** `pnpm records:check` passes; acceptance matrix and proposed regression cases reviewed.

### Acceptance matrix

The future guard answers only whether a user-initiated navigation would leave
source work without its source-specific publication or export step. IndexedDB
draft recovery is not that step and does not clear the guard. The guard must
read the live state when the `beforeunload` event fires; it must not await a
save or try to publish from that handler.

| Source or state | Guard condition | Guard clears only after | Reason |
| --- | --- | --- | --- |
| Any clean loaded keymap | no guard | — | There is no changed firmware or repository snapshot. |
| Demo firmware draft | `isDirty` | confirmed **Discard draft** | Demo has no firmware publish/export action; an IndexedDB copy remains only recovery. |
| Local firmware draft | `isDirty` | a successful Write files followed by its successful reload, or confirmed discard | The local source is the configured config tree; a debounced or flushed browser draft is not a disk write. |
| Clipboard firmware draft | `isDirty` | a successful **Copy .keymap** baseline update, or confirmed discard | Copying is the explicit handoff to the firmware repository; merely opening or closing the export sheet is not. |
| GitHub firmware draft | `isDirty` | a successful Commit followed by its successful reload, or confirmed discard | A GitHub request alone is not enough when the re-read fails or the branch changes. |
| GitHub host-snapshot change without a firmware edit | `isHostRepoDirty` | a successful Commit that accepts the committed host snapshot baseline | `host_keymap/snapshot.json` shares the GitHub commit boundary with the keymap. |
| Browser-only host edit or Host install/deliverable status | never by itself | — | `isHostDirty` describes host deliverables, not an unpublished firmware or GitHub snapshot; installing/downloading host files is outside this guard. |
| Failed save/copy/reload, or edits during an in-flight save | the corresponding dirty condition remains true | the later successful source-specific completion or confirmed discard | Failure and stale/in-flight results must not convert an unsent edit into a clean baseline. |
| Restored dirty browser draft | the restored `isDirty` value | the same source-specific completion or confirmed discard | Restoring makes the existing unpublished firmware change live again. |

The predicate is therefore `isDirty || isHostRepoDirty`. `isHostRepoDirty` is
already false outside GitHub. The implementation must attach the listener only
while that predicate is true, call `event.preventDefault()`, and assign
`event.returnValue = ''`; browser wording and mobile delivery remain
browser-controlled. Existing `visibilitychange` and `pagehide` draft flushing
remain independent and unconditional on this predicate.

### Proposed regression cases

- Add an App-level event test that mounts a clean editor, dispatches a
  cancelable `beforeunload`, and proves it remains unhandled; after a ZMK edit,
  prove the event is prevented and receives the native confirmation value.
- Prove cleanup after confirmed discard and after each successful baseline
  transition: Local Write files plus reload, Clipboard Copy .keymap, and GitHub
  Commit plus reload. A failed write/copy/reload and a key edit made while a
  publish promise is pending must continue to prevent the event.
- Create a GitHub fixture with no ZMK change and a dirty host repository
  snapshot; it must prevent unload. A host-deliverable-only edit (`isHostDirty`
  without `isHostRepoDirty`) must not prevent unload.
- Restore a persisted Demo draft and prove it prevents unload; confirm that a
  persisted browser-only host edit does not. Continue testing that
  `visibilitychange` and `pagehide` flush a pending firmware draft regardless
  of whether the guard is installed.
- Add a Chromium Playwright case that makes the firmware edit through the key
  editor (a real user gesture), triggers `page.close({ runBeforeUnload: true })`,
  observes the native `beforeunload` dialog, dismisses it to stay, then accepts
  it on a second close. The test asserts dialog type and stay/leave behavior,
  not custom dialog text.

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
