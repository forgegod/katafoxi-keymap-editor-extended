---
name: branch-close
description: >-
  Prepare a thematic git branch for closure: inventory vs base, remove dead
  experiment code, apply DRY/Svelte 5/TypeScript cleanup within branch scope,
  update docs and links, run relevant tests, emit a closeout report. Use when
  the user says /bc, branch close, branch closeout, or «готовим ветку к
  закрытию», or asks to clean dead code and docs before merging/closing a
  feature branch.
disable-model-invocation: true
---

# Branch close (`/bc`)

Run when the experiment on this branch is accepted and the branch should be made merge-ready. Follow phases in order. Do not invent new product scope.

## Flags

| Input | Behavior |
|-------|----------|
| `/bc` or plain closeout request | Inventory → apply safe cleanup → verify → report |
| `/bc --dry` | Inventory + proposed edits only; no file changes |
| `/bc --commit` | Same as `/bc`, then create one cleanup commit if the user explicitly included this flag (still follow repo commit rules) |

Default: **do not commit, push, merge, rebase, or open a PR** unless the user asked in this message.

## Hard scope

- Diff against the integration base (usually `main` / `master`; detect from the branch). Prefer `git diff --name-status <base>...HEAD` plus unstaged/untracked.
- Touch only what this branch introduced or broke: dead experiment paths, unused exports, WIP comments, obsolete docs, broken links, tests that no longer match the accepted design.
- Do **not** drive-by refactor unrelated packages, rewrite ADRs without a real contract change, inline sidecar CSS, or “fix” Vite HMR by restructuring styles.
- Respect `AGENTS.md` invariants (domain in `keymap-core`, no concrete boards in product sources, English UI, GitHub-first persistence).

## Cleanup discipline

Read [cleanup-principles.md](cleanup-principles.md) before applying code edits. Prefer deleting and consolidating over clever rewrites. If a cleanup is ambiguous or large, stop after Phase 1 and ask.

## Workflow

Copy and track:

```
Branch closeout:
- [ ] Phase 1: Inventory
- [ ] Phase 2: Cleanup (skip if --dry)
- [ ] Phase 3: Docs and links (skip if --dry)
- [ ] Phase 4: Verify
- [ ] Phase 5: Closeout report
- [ ] Phase 6: Commit only if --commit
```

### Phase 1 — Inventory

1. Identify base branch and list changed/untracked files.
2. Classify candidates: dead code, duplicates (DRY), experiment leftovers, doc drift, broken links, test gaps.
3. Produce a short inventory (paths + why). For `--dry`, stop here with proposed actions. For non-trivial risk, wait for confirmation before Phase 2.

### Phase 2 — Code cleanup

Apply minimal edits inside scope:

- Remove unused helpers, flags, stubs, commented-out experiments, and orphaned tests tied to rejected approaches.
- Deduplicate only when duplication is real and in-branch (see cleanup-principles).
- Keep Svelte components thin; move repeated domain logic into `packages/keymap-core` when the branch already crossed that boundary or clearly duplicated core rules.
- Do not expand into style-only renames or architecture rewrites.

### Phase 3 — Docs and links

- Update `README.md`, `AGENTS.md`, `running-locally.md`, and `docs/**` only where the **accepted** outcome changed behavior or contracts.
- Remove or rewrite obsolete experiment notes that would mislead the next reader.
- Check links in files you touch (and in branch-touched markdown): relative paths, ADR references, script names. Fix or remove broken ones.
- Do not author new ADRs unless the branch already established a persistence/contract change that needs one.

### Phase 4 — Verify

- Run focused tests for touched packages (`pnpm test` filtered when practical; full `pnpm test` if the blast radius is unclear).
- Fix only failures caused by this branch or this cleanup.
- Do not treat `pnpm test:e2e` as required unless UI chrome or critical flows in the branch demand it.

### Phase 5 — Closeout report

End with this structure:

```markdown
## Branch closeout

**Branch:** <name> vs **base:** <base>
**Mode:** default | --dry | --commit

### Removed / cleaned
- …

### Docs / links
- …

### Left intentionally
- … (with reason)

### Verification
- tests: … (pass/fail/skipped + command)

### Ready?
- [ ] merge-ready / needs human decision: …
```

### Phase 6 — Commit (only with `--commit`)

One focused cleanup commit, English imperative subject per `AGENTS.md` (e.g. `Drop unused host-edit stubs and refresh branch docs before merge.`). No secrets; no `--no-verify`.

## Anti-goals

- Closing the git branch remotely or merging to base
- Broad repo-wide lint/format sweeps unrelated to the diff
- New features “while we are here”
- Rewriting working code solely to match a preferred style
