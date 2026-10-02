# Cleanup principles (branch close)

Use these when Phase 2 decides what to delete, merge, or leave. Scope is still **this branch vs base** — principles guide judgment; they do not authorize a repo-wide rewrite.

## General

- **YAGNI** — delete speculative flags, unused extension points, and “maybe later” APIs introduced in the experiment.
- **DRY** — consolidate only duplicated *behavior or rules* that already appear twice in the branch (or that copy existing `keymap-core` logic into Svelte/API). Do not abstract one-off UI glue.
- **KISS / rule of three** — prefer a clear deletion or a small shared helper over a new framework. Wait for a third copy before inventing a generic layer unless the duplication is already harmful.
- **Single responsibility** — if a file gained a second job during the experiment, split or drop the extra job; do not “tidy” unrelated responsibilities in the same pass.
- **Boy scout, bounded** — leave touched files a bit cleaner (names, dead imports), but do not reformat or rename wide neighborhoods.

## TypeScript (`packages/keymap-core`, shared libs, API)

- Prefer **narrow public exports**: remove barrel re-exports and `export` keywords that nothing outside the package imports.
- Keep domain pure and UI-agnostic: parse/compose/legends/host-layout stay in core; do not leave parallel copies in `apps/web`.
- Prefer existing types and result shapes over `any` / loose casts added for the experiment.
- Avoid duplicate string unions / magic strings when a shared const or type already exists in core.
- Tests: drop fixtures and cases for abandoned APIs; keep regression coverage for the accepted path.

## Svelte 5 (`apps/web`)

- **Components render; core decides** — legend formatting, keymap encode/decode, host-layout lookup, and compose math must not remain only inside `.svelte` files if the branch duplicated them.
- Prefer runes and existing app patterns (`$state` / `$derived` / props) over new ad-hoc stores or event buses introduced for the experiment.
- Delete unused props, slots, and event callbacks; collapse components that no longer earn their file.
- Keep **sidecar CSS** as files; never inline global key layout CSS into `<style>` to work around Vite HMR (see `.cursor/rules/vite-css.mdc`).
- UI copy stays English (see `.cursor/rules/ui-english.mdc`); remove leftover debug labels and non-product chrome.
- Prefer accessibility-preserving cleanup: do not strip `aria-*` or labels while removing experiment UI.

## Docs and links

- Docs describe the **accepted** system, not the journey.
- One concept → one canonical doc; link instead of pasting the same procedure into README + AGENTS + ADR.
- If an ADR would change, prefer a short amendment note only when the branch actually changed a recorded decision; otherwise update the operational doc (`README`, `running-locally`, `AGENTS.md`).

## When not to “improve”

| Temptation | Instead |
|------------|---------|
| Rename for taste across the package | Only rename if the branch’s public name is wrong or colliding |
| Extract a util used once | Inline or delete |
| “Clean” unrelated lint in a file you passed through | Touch only what the inventory listed |
| Move domain to core “for purity” with no duplication | Leave placement unless the branch already blurred the boundary |
| Mass `satisfies` / type churn | Fix types broken by cleanup only |

## Quick checklist before each edit

1. Is this path in the branch inventory?
2. Does the edit delete or dedupe, rather than redesign?
3. Does it preserve `AGENTS.md` invariants?
4. Will a test or doc need a matching update in the same closeout?
