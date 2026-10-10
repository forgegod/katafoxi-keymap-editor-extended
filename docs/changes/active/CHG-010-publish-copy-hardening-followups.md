# CHG-010 — Publish/copy hardening follow-ups

**Status:** planned
**External request:** Direct operator request: Save the issues / improvement candidates for later runs in a CHR
**Impacts:** CAP-002
**Baseline:** working tree of CHG-002 phase 2 (uncommitted, on top of `58c1f64`); recheck branch and working-tree ownership before execution.
**Priority:** P4 — after current feature work; these are hardening items, not user-visible gaps

## Current boundary

An independent review of the CHG-002 phase 2 working tree (575/575 web tests, clean
lint, clean `records:check`, successful web build) found no blocking defects. The
items below are behavior-preserving polish and one flaky-test concern surfaced
during that review. They are recorded here so a later run can pick them up without
rederiving the analysis. Per the application-records convention, internal
hardening normally does not need a CHG; this record exists because the operator
explicitly asked for the findings to be persisted with their evidence.

### Finding 1 — Flaky fast-check model test (test infrastructure)

`apps/web/src/lib/editor.model.test.ts` › "preserves indexes, dirty flag, and
history on random commands" (`fc.assert` over `fc.commands(...)`, 20 s timeout,
`apps/web/src/lib/editor.model.test.ts:479`) failed once in three consecutive
`pnpm --filter @keymap-editor/web test` runs against the CHG-002 phase 2 tree,
then passed twice unchanged. fast-check replay was not captured, so the failing
seed is unknown. Risk: erodes trust in the suite and can block unrelated gates.
Not caused by the CHG-002 diff itself (the failing run and the passing runs
executed identical sources), but the new mid-flight publish/copy paths increase
the command space the property explores.

### Finding 2 — Leave-warning predicate ignores `editor.saving` (undocumented design choice)

`apps/web/src/lib/editor/leave-warning.ts` arms `beforeunload` from
`isDirty || isHostRepoDirty` only. An in-flight publish/copy (`saving === true`)
still warns, which is defensible — the save can still fail, and the CHG-002
acceptance matrix forbids marking state clean on an in-flight save — but the
choice is currently implicit. The module header should state it so a future
reader does not "fix" it into a regression of CHG-002 phase 2.

### Finding 3 — `ClipboardCopyEditor.source` type wider than runtime contract

`apps/web/src/lib/editor/clipboard-copy.ts` declares `readonly source: string | null`
on `ClipboardCopyEditor`, then guards at runtime with
`editor.source !== 'clipboard'`. Widening the type to the literal `'clipboard'`
(or a discriminated refinement) would move the guard to compile time and remove a
runtime check that tests currently cover indirectly.

### Finding 4 — `isPublishCurrent` signature is GitHub-shaped on the clipboard path

Every clipboard call site passes `isPublishCurrent(token, 'clipboard', null)`;
the `source`/`github` parameters exist only for the GitHub publish path. A
`satisifies`-safe split (e.g. a clipboard-specific currency check) would make the
clipboard contract honest. Not worth doing while CHG-002 phases 3–4 may still
touch the same files.

### Finding 5 — `applyClipboardCopied._saveMeta` is dead

`apps/web/src/lib/editor/publish-bridge.ts` keeps a `_saveMeta?: unknown`
parameter that the new implementation ignores (warnings stay in the export sheet
by design). The interface type in `clipboard-copy.ts` still references it.
Removing it is a signature cleanup; keep it only if a future caller legitimately
needs to surface copy-time warnings outside the sheet.

## Dependencies

None. Item 1 is independent. Items 2–5 should wait until CHG-002 phases 3–4 land
so the publish/copy files are not churned twice.

## Acceptance criteria

- The fast-check failure in `editor.model.test.ts` is either reproduced with a
  recorded seed and fixed at the root cause, or the property is bounded so the
  failure mode is impossible; the suite passes three consecutive full runs.
- `leave-warning.ts` documents why `saving` is not part of the predicate, citing
  the CHG-002 acceptance matrix row on in-flight saves.
- `ClipboardCopyEditor.source` is narrowed so a non-clipboard source is a
  compile-time error; the runtime guard is removed or asserted unreachable.
- The clipboard currency check no longer takes unused GitHub parameters, or the
  shared signature is justified in a comment.
- `_saveMeta` is removed from `applyClipboardCopied` and its interface, or a
  comment names the future caller that needs it.
- No observable behavior changes: CAP-002 text remains accurate without edits,
  and the full workspace gate passes.

## Owned implementation and evidence seams

- `apps/web/src/lib/editor.model.test.ts`
- `apps/web/src/lib/editor/leave-warning.ts`
- `apps/web/src/lib/editor/clipboard-copy.ts`
- `apps/web/src/lib/editor/publish-bridge.ts`
- `apps/web/src/lib/publish-keymap.ts`

| # | Phase | Status | Verification gate |
| --- | --- | --- | --- |
| 1 | Reproduce or bound the flaky model property | pending | three consecutive `pnpm --filter @keymap-editor/web test` runs exit 0 |
| 2 | Apply the four code/documentation tightenings | pending | `pnpm --filter @keymap-editor/web test && pnpm --filter @keymap-editor/web lint` exit 0 |
| 3 | Confirm no CAP-002 drift and close | pending | `pnpm records:check && pnpm test && pnpm lint && pnpm build` exit 0 |

## Phase 1 — Reproduce or bound the flaky model property

**Goal:** Deterministic model-based suite.

1. Re-run the property with fast-check verbose/seed logging until the failure
   recurs; record the seed and minimal counterexample.
2. Fix the root cause in the model or the editor command under test. If the
   failure is a property-shape artifact (e.g. commands that are no-ops racing a
   debounce the model does not model), bound the generator and document why.
3. Run the full web suite three times to confirm stability.

**Verification gate:** three consecutive `pnpm --filter @keymap-editor/web test` runs exit 0.

## Phase 2 — Apply the four code/documentation tightenings

**Goal:** Findings 2–5 resolved without behavior change.

1. Add the `saving`-exclusion rationale comment to `leave-warning.ts`.
2. Narrow `ClipboardCopyEditor.source`; delete the now-unreachable runtime guard.
3. Split or justify the `isPublishCurrent` clipboard signature.
4. Remove or justify `applyClipboardCopied._saveMeta`.

**Verification gate:** `pnpm --filter @keymap-editor/web test && pnpm --filter @keymap-editor/web lint` exit 0.

## Phase 3 — Confirm no CAP-002 drift and close

**Goal:** Prove the hardening changed no observable behavior and archive.

1. Diff CAP-002 before/after; it must remain accurate without edits.
2. Run the workspace gate and archive this record.

**Verification gate:** `pnpm records:check && pnpm test && pnpm lint && pnpm build` exit 0.

## Out of scope

- Any change to the CHG-002 leave-warning behavior itself (phases 3–4 own that).
- New publish/copy features, UI copy changes, or wireframe regeneration.
- Refactoring `isPublishCurrent` for the GitHub path beyond what finding 4 needs.
