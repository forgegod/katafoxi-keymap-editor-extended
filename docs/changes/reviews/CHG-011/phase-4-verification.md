# CHG-011 Phase 4 verification

**Status:** review-only
**Role:** Phase 4 implementer and orchestrator verification evidence, not independent approval.
**Verified revision:** `8f415f3895756bb3e06ce3660656af60ac76e6e5` on `main` in `/home/raphael/src/katafoxi-keymap-editor-extended`.
**Owner:** [Archived CHG-011](../../archive/CHG-011-upstream-named-layout-and-holdtap-dependency.md).

## Scope and lifecycle boundary

- Phase 4 is verification and closure. It changed no product behaviour, test expectation, CAP text, wireframe generator, or ADR. The only implementation commit is the DOX truthfulness fix in `packages/keymap-core/AGENTS.md`, described below.
- The reserved worktree was `/home/raphael/src/katafoxi-keymap-editor-worktrees/chg011-phase4` on branch `phase/CHG-011-upstream-named-layout-and-holdtap-dependency/4/5e12cb885b67c7324870035bd2186390bb19329a`, based on the phase-4 reservation `5e12cb885b67c7324870035bd2186390bb19329a`. The worktree was clean before and after the phase, and was removed after the target gate passed and the completion record was committed.
- This receipt is evidence for the phase-4 close, not a second progress record. Phase status lives only in the owning CHG's phase table.

## Environment

- Linux WSL2, Node `v24.21.0` matching `.nvmrc`, pnpm `9.15.0` matching the repository pin.
- One environment prerequisite was required and is not a product defect: `@keymap-editor/keymap-core` exports `./dist/index.js`, and `dist` is gitignored, so a fresh worktree has no build of that package. `pnpm --filter @keymap-editor/keymap-core build` in the worktree is required before the API suite can resolve the package entry. It changes no tracked file, and CI builds before testing for the same reason.

## Exact integration gate

Executed on the target checkout at `8f415f3`, in this order:

```sh
pnpm records:check && pnpm test && pnpm lint && pnpm build
```

The chain exited **0** with no failed gate and no rerun.

| Command | Exit | Observed result |
| --- | --- | --- |
| `pnpm records:check` | 0 | 3 capabilities, 11 change records, wireframe manifest in sync. |
| `pnpm test` | 0 | keymap-core 69 files, 1367 passed and 1 skipped; api 13 files, 367 passed; web 83 files, 1234 passed; cloudflare 1 file, 11 passed; record-validator regressions 72 passed, 0 failed. |
| `pnpm lint` | 0 | All four workspace lint tasks passed; `svelte-check` found 0 errors and 0 warnings. |
| `pnpm build` | 0 | keymap-core TypeScript, web Vite, and api TypeScript builds passed. |

The skipped core test is the optional local host-legend comparison, which skips when the untracked `src/__golden__/host-legend.json` snapshot is absent. No golden was created and no snapshot claim is made.

## Canonical visuals

`pnpm wireframes:generate && pnpm wireframes:render` reproduced the committed artifacts byte-for-byte; `git status --short` and `git diff --stat` were empty afterwards. Render output was CAP-001 1440x6200, CAP-002 1440x4900, and CAP-003 1440x2400, each with heading visible, no horizontal or vertical overflow, and no page errors.

| Artifact | SHA-256 |
| --- | --- |
| CAP-001 PNG | `14a89cb5dc6293cfbb79b1e6ca26f5172b985235569bf6829320d1d689ea3654` |
| CAP-002 PNG | `a56470e68a3ff65158c0c15c5351876d9bc52481a68d5ddb22a5e7162564042f` |
| CAP-003 PNG | `9bf8c62e7994976d83a4153d600dd3f6ccecbed0d2b1765c4064702d960d5fb5` |

The changed canonical artifact since the CHG baseline `8fb50d6f9689a3b738f1400b737778e4dfe780dc` is the CAP-002 sources screen. Visual inspection of the rendered PNG confirms the "Layout validation — separate GitHub dialog state" card is present and legible, names the failing file `config/specimen.json`, states that a broken shared layout names `config/info.json`, and states that a named file without a `layouts` member is ignored. No text is clipped, overlapping, or outside its card. CAP-001 correctly omits that state, because the file-scoped error surface belongs to CAP-002.

## `Primary surface` audit

All three capabilities declare `**Primary surface:** human`, each matches exactly one manifest screen, and each `## Links` section links both its canonical HTML and its PNG. CAP-001 1440x6200, CAP-002 1440x4900, CAP-003 1440x2400. The declarations remain honest and no new surface was claimed.

## Acceptance-criterion evidence

| Criterion | Implementation | Covering test |
| --- | --- | --- |
| a. Named JSON without `layouts` is ignored; the load continues on binding-count inference | `packages/keymap-core/src/layout.ts:265-266` returns `null` for a named file with no own `layouts` member | `apps/api/src/services/github/selected-files.test.ts` "ignores unrelated named JSON %s and retains inference/source discovery"; `apps/api/src/services/zmk/local-source.test.ts` "ignores named non-layout %s but still requires layout metadata" |
| b. A present invalid `layouts` value fails the load and names that file | `packages/keymap-core/src/layout.ts:267-274`, `packages/keymap-core/src/errors.ts:16-25` attach the caller-supplied path | `apps/api/src/services/github/selected-files.test.ts` "attributes invalid named JSON %s on load and save", expecting `config/b.json` |
| c. A broken shared `config/info.json` still fails and names `config/info.json` | `apps/api/src/services/github/files.ts:375-382` keeps the shared path strict | `apps/api/src/services/github/selected-files.test.ts` "does not bypass broken shared JSON %s" |
| d. The browser shows the file that actually failed | `apps/api/src/routes/github.ts:443-445` and `:584-585` include `InfoValidationError.path`; `apps/web/src/lib/components/Pickers/Github/Picker.svelte:563` passes it; `apps/web/src/lib/components/Pickers/Github/ValidationErrors.svelte:27` falls back to the title only when the path is absent | `apps/web/src/lib/components/Pickers/Github/Picker.test.ts` "attributes API $name ($path) to $file" for `config/specimen.json` and `config/info.json` |
| e. The `&hm`/`&as` dependency is explicit, not catalog membership | `packages/keymap-core/src/keymap.ts:850-878` checks matching non-override `holdTaps` before catalog validation, across layers, `combos[].binding`, and `sensorBindings` | `packages/keymap-core/src/upstream-source-boundary.test.ts` "CHG-011 $code primary JSON dependency", plus "requires holdTaps even if a same-label macro is declared" and "requires holdTaps even if a same-label behaviorDefinition is declared" |
| f. Unknown, lookalike, and malformed labels stay rejected | `packages/keymap-core/src/keymap.ts:823-832` and `:880-884` retain exact-label syntax and the stock/legacy/declared allowances | `packages/keymap-core/src/upstream-source-boundary.test.ts` "CHG-011 unchanged catalog and explicit-import boundaries" and "rejects $name holdTaps without promoting a preset to stock"; `packages/keymap-core/src/keymap.test.ts` "still rejects unknown or malformed %s" |

No criterion is without covering tests. The combo and sensor fixtures carry valid layer bindings, so catalog validation alone would accept them; the missing `holdTaps` still fails, which is what makes criterion (e) a dependency check rather than a catalog-membership side effect.

## DOX pass

One file changed: `packages/keymap-core/AGENTS.md`. Its CHG-011 paragraph ended with "Phase 3 browser wiring and CAP promotion remain separate work." Phase 3 is integrated at `e04c895` and CAP-001/CAP-002 already state the promoted behaviour, so that sentence was false. The sentence was removed and the rest of the paragraph, which still describes the implemented contracts accurately, was preserved. Ownership, structure, contracts, and the child DOX index are unchanged.

## Remaining limitations and out-of-scope findings

- The optional core host-legend golden comparison stayed skipped, and the product Playwright end-to-end suites are not part of this gate. Browser error attribution is proven by the API and component tests, not by a live GitHub run.
- Three stale statements caused by an earlier change record were found and left unchanged, because they belong to CHG-004 rather than to this phase: `apps/web/AGENTS.md:49` still says CHG-004 owns the remaining phase verification and review; `docs/adr/0002-keymap-file-contract.md:83` links CHG-004 under `changes/active/` while the change index lists it as archived; and `packages/keymap-core/src/upstream-source-boundary.test.ts:21` still describes browser error presentation as phase-3 work. They need a separate focused change record.

## Closeout

- A fresh independent Grok session `review-chg011-phase4` reviewed the frozen phase-4 diff and returned **No findings**. Its receipt is [Phase 4 autonomous review](phase-4-autonomous-review.md).
- The phase-4 implementation is `8f415f3895756bb3e06ce3660656af60ac76e6e5`. The close transition marks phase 4 done against that revision, archives this record, moves its change-index entry, and repairs the parity-evidence link to the archived path. It does not reopen an earlier phase, start another phase, or push.
