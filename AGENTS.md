# Agent guide

Short context for coding agents working in this repository.

## Layout

| Path | Role |
|------|------|
| `apps/web` | Svelte 5 + Vite SPA |
| `apps/api` | Thin Hono API (GitHub + optional dev-local I/O) |
| `packages/keymap-core` | Pure TypeScript: ZMK parse/generate (incl. combos), DTS import, host-layout registry, compose, ZMK-mode legends, host snapshot / `.klc` export |

Use **pnpm** workspaces. Dev: `pnpm dev` (API `127.0.0.1:8080`, Vite `127.0.0.1:5173`). Tests: `pnpm test` (Vitest). Browser smoke: `pnpm test:e2e` (Playwright, not part of `pnpm test`). Details: [running-locally.md](running-locally.md).

## Architecture invariants

1. **GitHub-first persistence** — the server exists mainly for GitHub OAuth/App and commits. Do not grow a product local filesystem server. On GitHub, ZMK and the host snapshot (`host_keymap/snapshot.json`) share one commit ([ADR 0005](docs/adr/0005-host-keymap-github-snapshot.md)); IndexedDB is draft/cache for that path and remains SoT for Demo. Practical SPA sources today: **Demo**, **Clipboard**, GitHub, and optional dev-local.
2. **Local `zmk-config` bridge is a dev adapter** — fine for iterating against a cloned firmware repo; not the target product path. **Clipboard** pastes a `.keymap` (optional `info.json`) and **Copy .keymap** returns spliced text to the system clipboard — same `buildKeymapCode` contract as Local/GitHub. See [docs/adr/0001-persistence-github-first.md](docs/adr/0001-persistence-github-first.md) and [ADR 0002](docs/adr/0002-keymap-file-contract.md).
3. **Domain logic in `keymap-core`** — parse/encode/compose (including ZMK **combos**), the host-layout registry, column views, **keycap legend rules**, and host snapshot/deliverable builders stay UI-agnostic; web and api consume core. Do not invent `L1` / `⌃` / hold-tap layout, combo splice, or host glyphs only inside Svelte. Composed **keycap face**: use `keycapFace()` only — four slots per on-keycap language with `ˬ` for empties, hold appended; the SPA paints, scale-to-fits, and shows `ˬ` on layer hover only (see [TARGET_SYSTEM](docs/TARGET_SYSTEM.md) “Keycap face contract”).
4. **No concrete keyboards in product sources** — `packages/keymap-core/src` and `apps/web/src` outside tests and the Demo loader must not name a board in domain logic. LARK is a fixture (`packages/keymap-core/fixtures/lark/`, plus `src/testing/lark-host.ts` for tests). First-visit **Demo** keyboards are listed in `packages/keymap-core/fixtures/demo/catalog.json`; layout files for Corne/Lily58/Sweep live under `fixtures/demo/`, while Lark reuses `fixtures/lark/`. Load them only via `apps/web/src/lib/demo/`. Import those host/demo files in the browser; do not bake a keyboard into compose or host-layout registry. A local host-legend golden (`src/__golden__/`, not in git) may still mention LARK view ids; recreate it with `UPDATE_GOLDEN=1` if you want the optional snapshot check.
5. **Prefer shared file contracts** — anything about `.keymap` / `keymap.json` / host layout formats should land in core once, then be used by GitHub and any local/dev adapters. Save/load rules: [docs/adr/0002-keymap-file-contract.md](docs/adr/0002-keymap-file-contract.md). Host snapshot beside ZMK: [ADR 0005](docs/adr/0005-host-keymap-github-snapshot.md).
6. **GitHub auth is server-session** — OAuth tokens stay on the API; browser gets HttpOnly `sid` only. See [docs/adr/0003-github-auth-server-session.md](docs/adr/0003-github-auth-server-session.md).
7. Read product vision in [docs/TARGET_SYSTEM.md](docs/TARGET_SYSTEM.md) before large feature work.
8. **UI language is English only** for now — labels, buttons, hints, aria-labels, and user-facing notices in `apps/web` (and core strings that surface in the SPA). Do not add new non-English UI copy; when editing a screen, rename leftover tails to English when practical. See [`.cursor/rules/ui-english.mdc`](.cursor/rules/ui-english.mdc).
9. **Host edit vs ZMK** — hover decode is peek-only; **Alt+click** starts the host-edit session. Host OS install is the chrome **Host** lane (Linux/Windows dialogs), not buried Export alone. `.klc` export lives in core (`hostLayoutToKlc`); a new host language needs a `WINDOWS_LOCALES` entry, not a new writer. See [docs/adr/0004-host-edit-and-os-deliverables.md](docs/adr/0004-host-edit-and-os-deliverables.md).

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
- Reintroduce `keycapColumns`, AltGr-pair board helpers, non-empty packing, shared-letter collapse, or `/` on the keycap face — `keycapFace()` is the only board API (four slots per language, `ˬ` for empty/toggle-off); KeyCap only paints, scale-to-fits, and hover-reveals placeholders.
- Teach core or the web app a concrete keyboard. LARK host maps stay fixtures.
- Assume `POST /keymap` sibling-folder save is how end users will work long-term.
- Silently overwrite a user’s `.keymap` preamble (`#define`, includes, behavior stubs) with the default generated template when a safer path exists (see ADR 0002).
- Work around empty Vite CSS HMR (`__vite__css = ""`) by inlining a sidecar `.css` into the Svelte component. Restart/clear the Vite cache and keep the file split. See [`.cursor/rules/vite-css.mdc`](.cursor/rules/vite-css.mdc).
- Add non-English UI strings; the SPA chrome is English-only for now (see invariant 8).
- Reintroduce hover-to-edit / pin-without-Alt on the decode card, or treat Export xkb as the only host install path (see ADR 0004).
- Put **Show empty row** or blank-top-row auto-hide back; default view hides only `absent` slots, and **Scheme** is the board disclosure for the full matrix.
- Put **Stack** or **Differences** back in the Host lane. They sit on the assembly line, left of the remembered chips.

## Docs map

- Vision: `docs/TARGET_SYSTEM.md` (key editor, host-layout registry, composed legends)
- Differences mode intent: [docs/symbol-differences.md](docs/symbol-differences.md) (keycap pair, basic vs ornament, Linux split vs Win merge)
- ADRs: `docs/adr/` (0001 persistence, 0002 keymap file contract, 0003 GitHub auth session, 0004 host-edit + OS deliverables, 0005 host keymap GitHub snapshot)
- Local run and tests: `running-locally.md`
