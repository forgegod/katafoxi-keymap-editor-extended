# CHG-007 — Open and save keymaps through browser filesystem permissions

**Status:** planned
**External request:** Direct operator request: Incorporate the ../ai-software-blueprint/ into this project. Proceed with the feature gaps as proposed in change requests based on the new blueprint
**Impacts:** CAP-002, CAP-003
**Baseline:** `2bb062d9e613980cc8d7ef1e4c545b527ff1e9c2` on main; recheck branch and working-tree ownership before execution.
**Priority:** P4 — new source adapter

## Current boundary

Local is a gated Hono development adapter, not browser filesystem access. Clipboard is the browser-only firmware path today.

[Parity evidence](../upstream-gap-assessment.md). These are requested outcomes, not present capability claims.

## Dependencies

CHG-004 establishes per-keymap identity/sidecar ownership. CHG-002 provides the source-specific leave policy; extend it, do not invent another dirty flag.

## Acceptance criteria

- Supported secure-context browsers can explicitly select local keymap files or a folder and save through File System Access without GitHub or a Node filesystem service. Unsupported browsers retain Clipboard with clear guidance.
- Cancellation, permission denial/revocation, vanished files, external modification, write failure and lost browser handles preserve the draft and do not falsely report Saved. No automatic permission prompts on startup.
- Confirm file identity and baseline before write; preserve source via shared core serialization. Handle multiple files without implying atomic filesystem transactions.
- Use the approved per-keymap sidecar contract for optional layout/host files. Scope the initial deliverables explicitly and disclose any host files not written; never request broader access than needed.
- Browser handles stay browser-local if persisted, require permission revalidation, and never leak through GitHub commits or host snapshots.

## Owned implementation and evidence seams

- `apps/web/src/lib/components/Pickers/SourceMenu.svelte`
- `apps/web/src/lib/components/Pickers/KeyboardPicker.svelte`
- `apps/web/src/lib/editor/types.ts`
- `apps/web/src/lib/editor/select-keyboard.ts`
- `apps/web/src/lib/publish-keymap.ts`
- `packages/keymap-core/src/keymap.ts`
- `apps/web/src/lib/draft-storage.ts`

Paths name existing seams, not a claim that future symbols or tests already exist. Re-read applicable DOX and current source before execution. Add focused tests first; new files belong under the owning boundary.

| # | Phase | Status | Verification gate |
| --- | --- | --- | --- |
| 1 | Specify the safe behavior boundary | pending | `pnpm records:check` passes; acceptance matrix and proposed regression cases reviewed |
| 2 | Implement and prove the domain slice | pending | `pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test` |
| 3 | Integrate the interaction and visual handoff | pending | `pnpm --filter @keymap-editor/web test && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` |
| 4 | Verify and close the change | pending | `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages` |

## Phase 1 — Specify the safe behavior boundary

**Goal:** Agree on the acceptance contract without claiming it is implemented.

1. Define file versus directory picker flow, supported browser behavior, user-gesture requirements and permissions. Review source identities/sidecars from CHG-004.
2. Specify conflict detection and partial-write recovery for non-atomic multi-file saves; decide firmware-only first slice versus host deliverables before implementation. Add browser API doubles and failure cases.

**Verification gate:** `pnpm records:check` passes; acceptance matrix and proposed regression cases reviewed.

## Phase 2 — Implement and prove the domain slice

**Goal:** Implement only the stated scope and pass its behavior regressions.

1. Add a discriminated browser-filesystem source adapter reusing core load/save and publish bookkeeping. Do not extend API disk routes.
2. Test permissions, cancellation, stale file contents, write/close errors, identities, source switching, restored handles and firmware/host dirty semantics.

**Verification gate:** `pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/web test`.

## Phase 3 — Integrate the interaction and visual handoff

**Goal:** Make the new behavior usable and its canonical surface current.

1. Build source selection, permission/reconnect, conflict and save feedback. Provide Clipboard fallback and honest per-file completion.
2. Exercise browser workflow with deterministic permission/file-handle doubles and a manual real-picker check on supported Chromium. Update CAP-002/CAP-003 canonical visuals and privacy/file-boundary docs.

**Verification gate:** `pnpm --filter @keymap-editor/web test && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check`.

## Phase 4 — Verify and close the change

**Goal:** Record current behavior only after every integration and visual gate passes.

1. Update impacted CAPs and implementation/test links. Inspect every changed canonical HTML/PNG; validate Primary surface declarations. Add any new current CAP only alongside real behavior and proof.
2. Run the full integration gate below on the actual revision. Record exact commands/results, supported environment and remaining limitations. Retain any review package at its stable path and repair links.
3. Only then mark all phases done with evidence, mark the CHG done and move it to archive; update the change index. Do not commit/push/deploy without separate authorization.

**Verification gate:** `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages`.

## Visual and review ownership

Use `docs/product/wireframes/generate.mjs` only for implemented CAP surfaces; render with `pnpm wireframes:render` and inspect the result. Before implementation, any optional proposal belongs in `docs/changes/reviews/CHG-007/` with a review-only README linked from this record. No proposal package exists or is required just to plan this change. Browser tests use synthetic fixtures and mocked GitHub, not real writes.

## Out of scope

- General local file server, bypassing browser permissions, guaranteed Firefox/Safari writable handles, firmware flashing, claiming atomic directory writes.

## Execution state

Not started. No feature acceptance criterion or phase gate has been claimed complete. Use Node 24 LTS and the repository-pinned pnpm; install Playwright Chromium for browser/render gates. If a gate cannot run, keep the phase pending or blocked and record the actual blocker.
