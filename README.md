# <img alt="Keymap Editor Icon" height="24px" src="./apps/web/public/editor-icon.png" /> Keymap Editor

Browser editor for [ZMK](https://zmk.dev/) keyboard users: edit firmware bindings and see what each key **actually types** under the selected host-language layouts.

**Try this fork:** [forgegod.github.io/katafoxi-keymap-editor-extended](https://forgegod.github.io/katafoxi-keymap-editor-extended/)

Public testing build: **Demo + Clipboard**, including the Unicode picker and ZMK behavior compatibility fixes. No installation or GitHub login required. [Testing releases](https://github.com/forgegod/katafoxi-keymap-editor-extended/releases) include a downloadable static build.

**Hosted Hono API + editor:** [zmkee.forgegod.workers.dev](https://zmkee.forgegod.workers.dev/). Runs on Cloudflare independently of a local computer. Demo, Clipboard, and the GitHub source are enabled. Repository access requires GitHub login and installation of the [zmkee GitHub App](https://github.com/apps/zmkee) on the repositories you want to edit.

This testing fork ([forgegod/katafoxi-keymap-editor-extended](https://github.com/forgegod/katafoxi-keymap-editor-extended)) builds on [katafoxi/keymap-editor-extended](https://github.com/katafoxi/keymap-editor-extended), which extends [nickcoutsos/keymap-editor](https://github.com/nickcoutsos/keymap-editor). The original extended app is [zmk-keymap-editor.com](https://zmk-keymap-editor.com/); it is a separate deployment and may not include this fork's changes. Upstream discussion: [Talk to me!](https://github.com/nickcoutsos/keymap-editor/discussions).

## What this fork adds

You combine:

1. **Firmware** — ZMK layers, hold-taps, behaviours (`&kp`, `&mt`, `&lt`, …), combos, conditional layers, encoders
2. **Host layouts** — OS language tables (EN, RU, UK, DE, …) with AltGr levels

so each keycap can show composed legends (e.g. `qQ` + `йЙ`) while you still edit the ZMK binding. Host glyphs are editable with **Alt+click** on a composed row; plain click opens the ZMK key editor.

Monorepo: Svelte 5 + Vite (`apps/web`), thin Hono API (`apps/api`), shared domain in `packages/keymap-core`.

## Screenshots

### Demo — real board layout

First visit opens **Demo · Corne**. The [Demo catalog](packages/keymap-core/fixtures/demo/catalog.json) also includes Glove80, Kyria, Sofle, Lily58, Sweep, Planck, nice!60, Kabarga, Lark, PNCATEHO, and more. A short spotlight tour covers click / Alt+click, layers, and bringing your own keymap. If the browser prefers Russian, Ukrainian, or German, that language is added as a second host column. Edits stay in the browser until you use **Clipboard**, **GitHub**, or **Local**. Replay the tour anytime with **Tour** in the top-right corner.

![Demo board with composed legends (Lark example with EN + RU)](docs/screenshots/demo-lark.png)

### Clipboard — `.keymap` only

Paste a ZMK `.keymap` without `info.json` (Clipboard), or open a GitHub `zmk-config` that lacks a layout file: the app draws a **flat rectangular** board from the binding count so you can still edit. GitHub and Local also accept `config/<keymap-name>.json` when `config/info.json` is absent. Clipboard **Copy .keymap** / GitHub **Commit** update the keymap; add a layout file when you want the real geometry.

![Clipboard mode with inferred rectangular layout](docs/screenshots/clipboard-inferred.png)

### Scheme — matrix row/col

**Scheme** overlays matrix coordinates and row/column guides on the physical layout (useful when wiring or checking `info.json`).

![Scheme mode on Lily58](docs/screenshots/scheme-lily58.png)

### Host edit — Alt+click

Hover peeks at host levels; **Alt+click** locks an edit session (Accept / Cancel). System layouts fork to a user copy on first change; Linux (xkb) and Windows (`.klc`) install live in the Host lane.

![Host symbol catalog and decode edit for EN + RU](docs/screenshots/host-edit.png)

### Several national layouts

Legend strip: show/hide languages and pick system or user profiles. **Stack** and **Differences** sit on the assembly line (left of remembered chips), not in the Host lane. Up to two languages on the keycap; more columns in the table.

![Legend strip with multiple languages and layers](docs/screenshots/host-legend-languages.png)

## Keymap sources

| Source | Role |
|--------|------|
| **Demo** | Bundled fixtures for first visit (default Corne). No firmware write. Short coach tour; optional second host language from the browser locale. |
| **Clipboard** | Paste `.keymap` (`info.json` optional). **Copy .keymap** → system clipboard + preview dialog. |
| **GitHub** | Load/commit `zmk-config` via GitHub App + OAuth. `config/info.json` is optional; a matching `config/<keymap-name>.json` is also accepted (flat rectangular board otherwise). Host layouts share the commit as `host_keymap/snapshot.json` (+ Linux/Windows install files). **Latest** firmware artifact chip when available. |
| **Local** | Dev adapter to a sibling `zmk-config` (junction). Not the long-term product path. |

Product persistence is **GitHub-first**; Local is for iterating against a cloned firmware tree; Clipboard is browser-only paste/export. Save/load rules: [ADR 0001](docs/adr/0001-persistence-github-first.md), [ADR 0002](docs/adr/0002-keymap-file-contract.md), host snapshot [ADR 0005](docs/adr/0005-host-keymap-github-snapshot.md).

## Editor highlights

- One **KeyEditor**: behaviour chips, then the value grid (keys, layers, mods, mouse/BT commands). Enter applies; Esc cancels. Hold-tap timing for `&mt` and `&lt`, plus Homerow (`&hm`) and Autoshift (`&as`); Apply adds a missing preset and Save rewrites those nodes ([ADR 0002](docs/adr/0002-keymap-file-contract.md)).
- **Recipes**: built-in `&rgblayer` (layer + RGB color) from Presets — board shows `Ln` plus a color swatch; Save splices a fixed macro node when needed.
- **Unicode input**: `&uc` picker for Normal/Shift characters, curated `UC_*` aliases, and input-mode switches. Existing aliases and opaque external bindings survive Apply and export. Firmware still needs the `urob/zmk-unicode` module and the matching host setup; the editor does not install either ([setup and limitations](docs/unicode-picker.md)).
- **ZMK compatibility**: recognizes `&sys_reset` and `&studio_unlock`, and preserves unknown external behavior parameters when importing and editing existing source.
- Compact ZMK legends (`L1`, `⌃`, hold-tap pills) in `keymap-core`.
- Visual **Combos**: list + board key-positions, binding via KeyEditor, timeout / layers / slow-release / prior-idle props; gap beads for adjacent pairs, anchor beads for non-adjacent/multi-key chords. Dense chord boards get a typewriter **combo dictionary** under the board (hover peeks, click selects).
- **Encoders**: per-layer `sensor-bindings` (clockwise / counter-clockwise) shown above the board, following the legend-row hover. A new layer copies the previous list. The knob press stays a normal key.
- **Conditional layers** on the layer strip: the shown layer keeps an accent rail, and hovering it highlights the keys that hold those layers.
- Undo / redo, **Draft** / Ready status, Discard draft.
- Host lane: Ready / Changed / Saved, Linux and Windows install dialogs, assemblies (remembered legend sets). On GitHub, Commit/Load round-trip the host snapshot with ZMK.
- Light / dark theme (default dark).
- Lane labels: **ZMK** = what the firmware sends; **Host** = what the OS types.

## Not in this tree (yet)

Upstream or planned: browser **File System Access**, visual **macro** / custom **behavior** editors (beyond fixed recipes such as `&rgblayer`), auto-generated layouts from ZMK DTS. See [upstream README](https://github.com/nickcoutsos/keymap-editor/blob/master/README.md) for the classic feature list.

Vision and contracts: [docs/TARGET_SYSTEM.md](docs/TARGET_SYSTEM.md). The [prioritized change requests](docs/changes/README.md#current-records) cover these gaps plus command choices, leave-page protection, layer duplication/reordering, and keymap-file selection. They are planned work, not shipped features.

## Run locally

Use Node 24 LTS and the pinned pnpm 9.15.0. The current web-test stack has browser-storage failures under Node 26; do not treat that runtime as a verified test environment.

```bash
pnpm install
pnpm dev
```

UI: `http://127.0.0.1:5173` · API: `http://127.0.0.1:8080`.

Full setup (env, Local junction, GitHub App): [running-locally.md](running-locally.md).

## Hosted app

### This fork's public testing build

Open **[forgegod.github.io/katafoxi-keymap-editor-extended](https://forgegod.github.io/katafoxi-keymap-editor-extended/)**.

1. Explore the bundled keyboards in **Demo**.
2. Choose **Clipboard** from the source menu, paste your `.keymap`, and optionally paste `info.json` for the physical layout.
3. Click a key to edit its binding. Choose **Unicode input** (`&uc`) to test characters, aliases, or input-mode switches.
4. Use **Copy .keymap** to copy the result back to your firmware repository. Review the diff before building or flashing firmware.

This is a static GitHub Pages site: **GitHub login/commits and Local filesystem access are disabled**. Demo drafts and host layouts stay in this browser; Clipboard export is manual. The site does not build or flash firmware. HTTPS enables clipboard access (your browser may ask for permission).

The [Pages workflow](.github/workflows/pages.yml) validates the subpath build on pull requests and publishes it when `main` changes. The URL follows `main`, not a pinned release. Versioned downloads are on the [releases page](https://github.com/forgegod/katafoxi-keymap-editor-extended/releases).

### Full SPA + API deployment

The original extended app is **[zmk-keymap-editor.com](https://zmk-keymap-editor.com/)**, maintained separately from this testing fork. To host this fork with GitHub login and commits, run the Hono API and SPA on the same origin and configure your own GitHub App.

Deploy: [docs/deploy-vps.md](docs/deploy-vps.md) (Docker + Caddy on a VPS).

For managed hosting without an always-on local computer, the optional `apps/cloudflare` adapter runs the same Hono API and SPA using Cloudflare Containers. See [docs/deploy-cloudflare.md](docs/deploy-cloudflare.md) for Workers Paid prerequisites, deployment commands, cost controls, and GitHub App setup. The hosted runtime uses the zmkee App; credentials stay in Cloudflare runtime secrets, not in the browser or Docker image.

## Docs

| Doc | Content |
|-----|---------|
| [running-locally.md](running-locally.md) | Install, Demo, Clipboard, Local, GitHub, tests |
| [docs/deploy-vps.md](docs/deploy-vps.md) | Production deploy on a VPS + domain |
| [docs/deploy-cloudflare.md](docs/deploy-cloudflare.md) | Managed Hono + SPA containers, billing/account checks, GitHub App setup |
| [docs/TARGET_SYSTEM.md](docs/TARGET_SYSTEM.md) | Product vision |
| [docs/architecture.md](docs/architecture.md) | Current runtime and maintenance boundaries |
| [docs/design-decisions.md](docs/design-decisions.md) | Durable decisions and existing ADR index |
| [docs/product/index.md](docs/product/index.md) | Current capabilities with executable evidence |
| [docs/product/wireframes/index.html](docs/product/wireframes/index.html) | Generated schematics of current capability surfaces |
| [docs/changes/README.md](docs/changes/README.md) | Prioritized feature-gap requests and execution lifecycle |
| [docs/adr/](docs/adr/README.md) | Architecture decisions |
| [AGENTS.md](AGENTS.md) | Root DOX contract and child ownership index |

## Tests

```bash
pnpm test          # Record-validator tests + Vitest: core, API, web, Cloudflare
pnpm lint          # TypeScript and Svelte checks
pnpm build         # Shared core, SPA, and Hono API
pnpm test:e2e      # Playwright smoke (separate)
pnpm test:e2e:prod # Production SPA/API smoke
pnpm test:e2e:pages # Static subpath build: Demo + Clipboard, no API
```

## Maintaining capabilities and changes

This project adopts the DOX/CAP/CHG maintenance structure from AI Software Blueprint without replacing the application or its existing ADRs. No sibling checkout or agent skill installation is needed for normal verification.

- [CAPs](docs/product/index.md) describe current behavior and link implementation/tests.
- [Active CHGs](docs/changes/README.md#current-records) own progress for material requests. Start with CHG-001 unless another scope is selected; all gap requests are initially planned.
- Read root and applicable child `AGENTS.md` contracts before editing. Keep future proposals out of current capability records and canonical visuals.
- Generate canonical visuals from their source; do not hand-edit HTML or PNG exports. Inspect rendered output before claiming a visual handoff.

```bash
pnpm exec playwright install chromium # Once for browser tests/rendering
pnpm wireframes:generate
pnpm wireframes:render
pnpm records:check
pnpm test:records
```

## License

MIT. The ZMK keycode list is taken from the ZMK documentation, also MIT.
