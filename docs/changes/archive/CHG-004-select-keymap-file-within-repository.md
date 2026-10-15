# CHG-004 — Select a keymap file within a GitHub repository

**Status:** done
**External request:** Direct operator request: Incorporate the ../ai-software-blueprint/ into this project. Proceed with the feature gaps as proposed in change requests based on the new blueprint
**Impacts:** CAP-002, CAP-003
**Baseline:** `c7f0f1089f7a5eec4f71e2fbd23293f2a24e5703` on main
**Priority:** P2 — repository workflow

## Authority

This archived implementation receipt is the sole progress authority for the completed request. Candidate worktrees, scratch patches, test runs and review claims are evidence only. All four phases are complete.

At the baseline, GitHub selected the first matching keymap and used repository-wide sidecar ownership. The implemented change carries exact selected-keymap identity through inventory, load, draft/cache ownership, transitions and publication.

## Implemented recovery contract

- Same-keymap Reload is non-destructive and is never presented as discard.
- Invalid, incompatible or unsupported remote host snapshots omit remote host writes. Local host edits remain usable but are browser-local and unpublishable.
- A protected omitted-snapshot host recovery block exposes a confirmed **Discard local host edits** action. It removes only the selected identity’s local host recovery; firmware drafts, remote files, unrelated identities and global profiles remain intact.
- Clean transitions and transitions after compatible host publication do not require host discard.
- Selected keymap identity includes repository, branch and exact path. A missing remembered file never falls back to another candidate.
- Private `user:github` layouts are exact-owner scoped. Pending deletion is retained through queued persistence, retry, Reload and owner return until its transaction commits.

## Dependencies

None; this record establishes source identity needed by CHG-007 and CHG-008.

## Acceptance criteria

- Eligible keymaps can be explicitly selected within an authorized repository/branch; selection controls load and commit.
- Selected paths are validated against the fetched inventory, with traversal, templates and unauthorized files rejected and head-SHA/branch-race protection preserved.
- Firmware drafts, host snapshots, reload, branch retargeting and publication are isolated by selected keymap identity.
- Multi-keymap sidecar ownership is conservative and source-preserving; no shared sidecar is silently attached to every file.
- Missing/renamed files, no candidates, cancellation, failed writes and dirty switches have safe outcomes.
- The recovery contract above is covered for host-only and mixed firmware/host work.

## Owned seams

- `apps/api/src/services/github/files.ts`
- `apps/api/src/services/github/files.test.ts`
- `apps/web/src/lib/components/Pickers/Github/Picker.svelte`
- `apps/web/src/lib/github/api.svelte.ts`
- `apps/web/src/lib/draft-storage.ts`
- `apps/web/src/lib/editor/types.ts`
- `contracts/github-requests.json`

| # | Phase | Status | Verification gate |
| --- | --- | --- | --- |
| 1 | Specify explicit recovery policy and ownership | done (`pnpm records:check && git diff --check` exit 0; frozen diff `61bdc7c6590e2f10cdf0d99c309d4e93b48e2bdc3963dd33f6af5e981651a462`; Grok `review-chg004-phase1-json-fix`: No findings) | Specification and proposed regressions independently approved. |
| 2 | Implement API/core identity and sidecar contracts | done (`pnpm records:check && pnpm --filter @keymap-editor/keymap-core test && pnpm --filter @keymap-editor/api test && pnpm --filter @keymap-editor/web test` exit 0; core 860 passed/1 skipped, API 270 passed, web 721 passed; Grok: No findings) | API/core identity, sidecar and omission-contract evidence independently approved. |
| 3 | Integrate UI/recovery and current visual handoff | done (`pnpm records:check && pnpm --filter @keymap-editor/web test && pnpm test:e2e && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` exit 0; complete frozen patch `860ea81c14e13e8534d4ba39fcd23483103475b39f846df68ce15a2b40315804`; Grok `review-chg004-phase3-complete-artifact`: No findings) | UI/recovery behavior, CAPs and canonical visuals independently approved. |
| 4 | Verify integrated behavior and archive | done (full command chain at `884421c` exit 0; final frozen closure patch `c9e7326f24be6113aecdcff714161c9b6413799733f208922ee784c992ff4d55`; Grok `review-chg004-phase4-final-closure`: No findings; `pnpm records:check` exit 0 after archival move) | `pnpm records:check && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages` exits 0; independent closure review approves the frozen integrated diff and complete evidence. |

## Completed phase evidence

### Phase 1

Phase 1 defined selected-file identity, conservative sidecar ownership/migration, host omission and recovery rules before implementation. It preserved source-preserving serialization and required explicit firmware-input choice only where scoped JSON creation or replacement needed it.

### Phase 2

Phase 2 implemented selected-file validation, typed GitHub request/receipt plumbing, identity-scoped drafts/caches, conservative sidecar mode handling and server-enforced host-output omission. ADR 0002/0005 retain their identities with CHG-004 amendments.

### Phase 3

Phase 3 implemented the selected-file picker, accepted-control rollback, exact firmware retention, destructive host-only reset, omission status, private-layout isolation and recovery retry behavior. CAP-002/CAP-003 and their canonical wireframes were updated with the implemented interaction.

The final Phase 3 patch includes `HostProfileBar.test.ts`, has SHA-256 `860ea81c14e13e8534d4ba39fcd23483103475b39f846df68ce15a2b40315804`, reverse-applies cleanly, and received a fresh Grok `review-chg004-phase3-complete-artifact` **No findings** verdict.

## Phase 4 — closure verification

The full Phase-4 command chain passed at integrated commit `884421c` with Node `v24.21.0` and pnpm `9.15.0`:

- `pnpm records:check && pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check && pnpm test && pnpm lint && pnpm build && pnpm test:e2e && pnpm test:e2e:prod && pnpm test:e2e:pages` — exit 0.
- `pnpm test:e2e` passed; `pnpm test:e2e:prod` passed 5 tests; `pnpm test:e2e:pages` passed 2 tests with 2 expected session-dependent skips.
- Wireframe rendering reported visible headings with no overflow or page errors. CAP-002/CAP-003 inspection found no clipping, overlap or off-canvas controls; dense explanatory copy remains a schematic readability limitation.

The initial closure review found stale lifecycle prose in the former detailed checkpoint journal. The journal was condensed into the completed phase evidence above; it records the named gates, frozen patches and review verdicts, not a claim that every receipt is retained.

The command chain verifies the integrated implementation at `884421c`. `7a845888d18fc6a371e4489905d9382520874cf8a80407ea00cbf07182f128a2` identifies the superseded docs-only patch; final frozen closure patch `c9e7326f24be6113aecdcff714161c9b6413799733f208922ee784c992ff4d55` received a fresh Grok `review-chg004-phase4-final-closure` **No findings** verdict. This record is archived as the completed implementation receipt.

## Out of scope

- Arbitrary repository filesystem editing, unauthenticated GitHub writes, automatic sidecar overwrite or App-permission changes.
- Per-file legacy JSON adoption UI, rollback of already-created remote branches, and a durable pending-delete journal across browser close.
- Commit, push, deployment, credential changes or real GitHub access without separate authorization.
