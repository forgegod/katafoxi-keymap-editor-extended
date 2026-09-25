# Agent guide

Short context for coding agents working in this repository.

## Layout

| Path | Role |
|------|------|
| `apps/web` | Svelte 5 + Vite SPA |
| `apps/api` | Thin Hono API (GitHub + optional dev-local I/O) |
| `packages/keymap-core` | Pure TypeScript: ZMK parse/generate, DTS import, host-layout registry, compose, ZMK-mode legends |

Use **pnpm** workspaces. Dev: `pnpm dev` (API `127.0.0.1:8080`, Vite `127.0.0.1:5173`). Tests: `pnpm test` (Vitest). Browser smoke: `pnpm test:e2e` (Playwright, not part of `pnpm test`). Details: [running-locally.md](running-locally.md).

## Architecture invariants

1. **GitHub-first persistence** — the server exists mainly for GitHub OAuth/App and commits. Do not grow a product local filesystem server. User host layouts and the legend view live in the browser (IndexedDB), not on the API.
2. **Local `zmk-config` bridge is a dev adapter** — fine for iterating against a cloned firmware repo; not the target product path. See [docs/adr/0001-persistence-github-first.md](docs/adr/0001-persistence-github-first.md).
3. **Domain logic in `keymap-core`** — parse/encode/compose, the host-layout registry, column views, and **keycap legend rules** stay UI-agnostic; web and api consume core. Do not invent `L1` / `⌃` / hold-tap layout or host glyphs only inside Svelte.
4. **No concrete keyboards in product sources** — `packages/keymap-core/src` and `apps/web/src` outside tests must not name a board. LARK is a fixture (`packages/keymap-core/fixtures/lark/`, plus `src/testing/lark-host.ts` for tests). Import those host files in the browser; do not bake a keyboard into core or the SPA. A local host-legend golden (`src/__golden__/`, not in git) may still mention LARK view ids; recreate it with `UPDATE_GOLDEN=1` if you want the optional snapshot check.
5. **Prefer shared file contracts** — anything about `.keymap` / `keymap.json` / host layout formats should land in core once, then be used by GitHub and any local/dev adapters. Save/load rules: [docs/adr/0002-keymap-file-contract.md](docs/adr/0002-keymap-file-contract.md). Loading host layouts from a keyboard repo (`host_keymap/`) is future work and needs an ADR.
6. **GitHub auth is server-session** — OAuth tokens stay on the API; browser gets HttpOnly `sid` only. See [docs/adr/0003-github-auth-server-session.md](docs/adr/0003-github-auth-server-session.md).
7. Read product vision in [docs/TARGET_SYSTEM.md](docs/TARGET_SYSTEM.md) before large feature work.

## Commit messages

One English imperative sentence: what changed and why. No Conventional Commits (`feat:`, `fix:`), no package scopes.

```
<Verb> <object> [so / and <why or constraint>].
```

Prefer `Add`, `Fix`, `Parse` / `Map` / `Fill`, `Test`, `Document`. Use `Refactor`, `Split`, `Extract`, `Drop` only when structure changes. One intent per commit. Keep the subject around 72 characters. A body is optional — add it only when the subject needs a constraint or a “we did not” note.

Examples from this repo:

- `Save named host-legend profiles in the browser and keep the standard preset immutable.`
- `Parse same-file xkb includes so winkeys can reuse ru(common).`
- `Fit the keyboard into the leftover viewport and keep AltGr levels readable.`

Before committing, the subject should complete “This commit will ___”, say what a revert would undo, and cover a single step.

## Do not

- Rewrite the stack (SvelteKit, Nest, etc.) without an explicit request.
- Put ZMK encode/decode, compose math, host-layout lookup, or keycap-legend formatting only inside Svelte components.
- Teach core or the web app a concrete keyboard. LARK host maps stay fixtures.
- Assume `POST /keymap` sibling-folder save is how end users will work long-term.
- Silently overwrite a user’s `.keymap` preamble (`#define`, includes, behavior stubs) with the default generated template when a safer path exists (see ADR 0002).
- Work around empty Vite CSS HMR (`__vite__css = ""`) by inlining a sidecar `.css` into the Svelte component. Restart/clear the Vite cache and keep the file split. See [`.cursor/rules/vite-css.mdc`](.cursor/rules/vite-css.mdc).

## Docs map

- Vision: `docs/TARGET_SYSTEM.md` (key editor, host-layout registry, composed legends)
- ADRs: `docs/adr/` (0001 persistence, 0002 keymap file contract, 0003 GitHub auth session)
- Local run and tests: `running-locally.md`
