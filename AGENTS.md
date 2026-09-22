# Agent guide

Short context for coding agents working in this repository.

## Layout

| Path | Role |
|------|------|
| `apps/web` | Svelte 5 + Vite SPA |
| `apps/api` | Thin Hono API (GitHub + optional dev-local I/O) |
| `packages/keymap-core` | Pure TypeScript: ZMK parse/generate, DTS import, compose stubs |

Use **pnpm** workspaces. Dev: `pnpm dev` (API `127.0.0.1:8080`, Vite `127.0.0.1:5173`). Details: [running-locally.md](running-locally.md).

## Architecture invariants

1. **GitHub-first persistence** — the server exists mainly for GitHub OAuth/App and commits. Do not grow a product local filesystem server.
2. **Local `zmk-config` bridge is a dev adapter** — fine for LARK iteration; not the target product path. See [docs/adr/0001-persistence-github-first.md](docs/adr/0001-persistence-github-first.md).
3. **Domain logic in `keymap-core`** — parse/encode/compose stay UI-agnostic; web and api consume core.
4. **Prefer shared file contracts** — anything about `.keymap` / `keymap.json` / host layout formats should land in core once, then be used by GitHub and any local/dev adapters. Save/load rules: [docs/adr/0002-keymap-file-contract.md](docs/adr/0002-keymap-file-contract.md).
5. Read product vision in [docs/TARGET_SYSTEM.md](docs/TARGET_SYSTEM.md) before large feature work.

## Do not

- Rewrite the stack (SvelteKit, Nest, etc.) without an explicit request.
- Put ZMK encode/decode or compose math only inside Svelte components.
- Assume `POST /keymap` sibling-folder save is how end users will work long-term.
- Silently overwrite a user’s `.keymap` preamble (`#define`, includes, behavior stubs) with the default generated template when a safer path exists (see ADR 0002).

## Docs map

- Vision: `docs/TARGET_SYSTEM.md`
- ADRs: `docs/adr/` (0001 persistence, 0002 keymap file contract)
- Local run: `running-locally.md`
