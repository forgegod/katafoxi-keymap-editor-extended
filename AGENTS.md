# DOX framework

- DOX is the AGENTS.md hierarchy installed in this repository.
- Follow applicable DOX instructions for every edit.

## Core Contract

- AGENTS.md files are binding work contracts for their subtrees.
- Work products, source materials, instructions, records, assets, and durable docs must stay understandable from the nearest applicable AGENTS.md plus every parent AGENTS.md above it.

## Read Before Editing

1. Read the root AGENTS.md.
2. Identify every file or folder you expect to touch.
3. Walk from the repository root to each target path.
4. Read every AGENTS.md found along each route.
5. If a parent AGENTS.md lists a child AGENTS.md whose scope contains the path, read that child and continue from there.
6. Use the nearest AGENTS.md as the local contract and parent docs for repo-wide rules.
7. If docs conflict, the closer doc controls local work details, but no child doc may weaken DOX.

Do not rely on memory. Re-read the applicable DOX chain in the current session before editing.

## Update After Editing

Every meaningful change requires a DOX pass before the task is done.

Update the closest owning AGENTS.md when a change affects:

- purpose, scope, ownership, or responsibilities;
- durable structure, contracts, workflows, or operating rules;
- required inputs, outputs, permissions, constraints, side effects, or artifacts;
- user preferences about behavior, communication, process, organization, or quality; or
- AGENTS.md creation, deletion, move, rename, or index contents.

Update parent docs when parent-level structure, ownership, workflow, or child index changes. Update child docs when parent changes alter local rules. Remove stale or contradictory text immediately. Small edits that do not change behavior or contracts may leave docs unchanged, but the DOX pass still must happen.

## Hierarchy

- Root AGENTS.md is the DOX rail: project-wide instructions, global preferences, durable workflow rules, and the top-level Child DOX Index.
- Child AGENTS.md files own domain-specific instructions and their own Child DOX Index.
- Each parent explains what its direct children cover and what stays owned by the parent.
- The closer a doc is to the work, the more specific and practical it must be.

## Child Doc Shape

- Create a child AGENTS.md when a folder becomes a durable boundary with its own purpose, rules, responsibilities, workflow, materials, or quality standards.
- Work Guidance must reflect the current standards of the project or user instructions; if there are no specific standards or instructions yet, leave it empty.
- Verification must reflect an existing check; if no verification framework exists yet, leave it empty and update it when one exists.

Default section order: Purpose, Ownership, Local Contracts, Work Guidance, Verification, Child DOX Index.

## Style

- Keep docs concise, current, and operational.
- Document stable contracts, not diary entries.
- Put broad rules in parent docs and concrete details in child docs.
- Prefer direct bullets with explicit names.
- Do not duplicate rules across many files unless each scope needs a local version.
- Delete stale notes instead of explaining history.
- Trim obvious statements, repeated rules, misplaced detail, and warnings for risks that no longer exist.

## Closeout

1. Re-check changed paths against the DOX chain.
2. Update nearest owning docs and any affected parents or children.
3. Refresh every affected Child DOX Index.
4. Remove stale or contradictory text.
5. Run existing verification when relevant.
6. Report any docs intentionally left unchanged and why.

## Project guidance

Keymap Editor lets ZMK keyboard users edit firmware bindings and understand the resulting host-language characters. Preserve this fork's Svelte/Hono architecture and its source-preserving file contracts.

## Product and change records

- Read `docs/product/README.md` and `docs/changes/README.md` before material feature work.
- CAPs describe current, test-backed behavior. Active CHGs are the only implementation-progress authority; planned work is not a shipped capability.
- Every human-facing CAP has generated canonical HTML/PNG wireframes. Pending proposals belong only in CHG-owned review packages.
- Update CAPs, behavior tests, visuals, and the owning CHG in the implementation slice. Archive only after all phase gates pass.
- `docs/architecture.md` describes the live boundaries. `docs/design-decisions.md` indexes durable decisions; existing ADRs remain authoritative for their subjects.
- Optional installed `application-records`, `capability-wireframes`, and `phased-plan-*` skills assist this workflow but never replace repository contracts. No initializer or private parallel plan is required.
- Preserve unrelated uncommitted work. Do not commit, push, deploy, or change credentials without an explicit request.

## Child DOX Index

| Child | Owns |
| --- | --- |
| `apps/web/AGENTS.md` | Browser interaction, state, and web tests. |
| `apps/api/AGENTS.md` | GitHub persistence, sessions, and optional local adapter. |
| `apps/cloudflare/AGENTS.md` | Managed deployment adapter and its tests. |
| `packages/keymap-core/AGENTS.md` | Shared firmware and host-layout domain contracts. |
| `docs/AGENTS.md` | Architecture, ADRs, current capabilities, and changes. |
| `scripts/AGENTS.md` | Development and maintenance automation. |
| `.github/AGENTS.md` | CI and release workflows. |

Root owns manifests, README, workspace configuration, and cross-boundary e2e tests.

## Layout

| Path | Role |
|------|------|
| `apps/web` | Svelte 5 + Vite SPA |
| `apps/api` | Thin Hono API (GitHub + optional dev-local I/O) |
| `packages/keymap-core` | Pure TypeScript: ZMK parse/generate (incl. combos, conditional layers, hold-taps, and encoder sensor-bindings), DTS import, host-layout registry, compose, ZMK-mode legends, host snapshot / `.klc` export |

Use **pnpm** workspaces. Dev: `pnpm dev` (API `127.0.0.1:8080`, Vite `127.0.0.1:5173`). Tests: `pnpm test` (Vitest). Browser smoke: `pnpm test:e2e` (Playwright, not part of `pnpm test`). Details: [running-locally.md](running-locally.md).

## Architecture invariants

1. **GitHub-first persistence** — the server exists mainly for GitHub OAuth/App and commits. Do not grow a product local filesystem server. On GitHub, ZMK and the host snapshot (`host_keymap/snapshot.json`) share one commit ([ADR 0005](docs/adr/0005-host-keymap-github-snapshot.md)); IndexedDB is draft/cache for that path and remains SoT for Demo. Practical SPA sources today: **Demo**, **Clipboard**, GitHub, and optional dev-local.
2. **Local `zmk-config` bridge is a dev adapter** — fine for iterating against a cloned firmware repo; not the target product path. **Clipboard** pastes a `.keymap` (optional `info.json`) and **Copy .keymap** returns spliced text to the system clipboard — same `buildKeymapCode` contract as Local/GitHub. See [docs/adr/0001-persistence-github-first.md](docs/adr/0001-persistence-github-first.md) and [ADR 0002](docs/adr/0002-keymap-file-contract.md).
3. **Domain logic in `keymap-core`** — parse/encode/compose (including ZMK **combos**, **conditional layers**, **hold-taps**, and **encoder sensor-bindings**), the host-layout registry, column views, **keycap legend rules**, and host snapshot/deliverable builders stay UI-agnostic; web and api consume core. Do not invent `L1` / `⌃` / hold-tap layout, combo splice, conditional-layer splice, hold-tap splice, sensor-binding splice, or host glyphs only inside Svelte. Composed **keycap face**: use `keycapFace()` only — four slots per on-keycap language with `ˬ` for empties, hold appended; the SPA paints, scale-to-fits, and shows `ˬ` on layer hover only (see [TARGET_SYSTEM](docs/TARGET_SYSTEM.md) “Keycap face contract”).
4. **No concrete keyboards in product sources** — `packages/keymap-core/src` and `apps/web/src` outside tests and the Demo loader must not name a board in domain logic. LARK is a fixture (`packages/keymap-core/fixtures/lark/`, plus `src/testing/lark-host.ts` for tests). First-visit **Demo** keyboards are listed in `packages/keymap-core/fixtures/demo/catalog.json`; layout files live under `fixtures/demo/` (Lark reuses `fixtures/lark/`). Load them only via `apps/web/src/lib/demo/`. Import those host/demo files in the browser; do not bake a keyboard into compose or host-layout registry. A local host-legend golden (`src/__golden__/`, not in git) may still mention LARK view ids; recreate it with `UPDATE_GOLDEN=1` if you want the optional snapshot check.
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

- Current architecture: `docs/architecture.md`; durable decision index: `docs/design-decisions.md`.
- Current behavior: `docs/product/index.md`; execution queue: `docs/changes/README.md`.
- Vision: `docs/TARGET_SYSTEM.md` (key editor, host-layout registry, composed legends)
- Differences mode intent: [docs/symbol-differences.md](docs/symbol-differences.md) (keycap pair, basic vs ornament, Linux split vs Win merge)
- ADRs: `docs/adr/` (0001 persistence, 0002 keymap file contract, 0003 GitHub auth session, 0004 host-edit + OS deliverables, 0005 host keymap GitHub snapshot)
- Local run and tests: `running-locally.md`

## Workspace verification

- Use Node 24.21.0 (pinned in `.nvmrc`) with the repository-pinned pnpm 9.15.0. Node 26 currently causes happy-dom browser-storage failures; do not change product behavior to hide that environment mismatch.
- `pnpm test` runs record-validator and all workspace unit/component tests; `pnpm lint` checks TypeScript/Svelte; `pnpm build` builds core, web, and API.
- `pnpm test:e2e`, `pnpm test:e2e:prod`, and `pnpm test:e2e:pages` exercise fixture-backed browser workflows, production hosting, and static deployment.
- `pnpm wireframes:generate && pnpm wireframes:render && pnpm records:check` regenerates canonical visuals and validates record structure/inventory. Inspect the rendered screens; the validator cannot establish visual correctness or behavior.
- `pnpm test:records` exercises generic validator regressions without secrets or sibling repositories.
