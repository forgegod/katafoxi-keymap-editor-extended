# Target system

Vision for this fork of the keymap editor. Living document — update when product intent changes. Decisions belong in [ADR](adr/).

## Product intent

A browser editor that shows what a key **actually produces**, not only what a ZMK `.keymap` line says.

Users combine:

1. **Firmware keymap** (ZMK layers, behaviors, hold-taps, etc.)
2. **Host input layouts** (e.g. Windows/Linux layouts for EN + RU and AltGr levels)

so each physical key can show a compact **composed legend** (LARK-style: several host-resolved glyphs + optional hold annotation), not a single-layer dump of the text file.

Editing should stay honest to ZMK: composed view is a **preview**; firmware bindings remain editable in ZMK-code mode.

## Persistence (product)

Primary user workflows (aligned with upstream intent):

| Source | Role |
|--------|------|
| **GitHub** | Load/save `zmk-config` (and later `host_keymap/` or equivalent) via GitHub App + OAuth |
| **Clipboard** | Paste/copy keymap text (planned / restore) |
| **File System Access API** | Chromium: read/write local files without a Node file server (planned / restore) |

The Node API exists mainly for **GitHub secrets and commits**. It is not the long-term home for “open my firmware folder on disk.”

### Dev-only local bridge

Sibling/`zmk-config` junction + `GET/POST /layout|/keymap` is a **development adapter** so we can iterate on real boards (e.g. LARK) quickly. Do not grow product features that *require* this path. Prefer the same file contracts as GitHub (parse/generate/splice in `keymap-core`).

See [ADR 0001](adr/0001-persistence-github-first.md).

## Runtime shape

```
apps/web          Svelte 5 + Vite SPA — UI, pickers, legend modes
apps/api          Thin Hono API — GitHub OAuth/App + optional dev-local I/O
packages/keymap-core   Pure TS — parse/generate/splice .keymap, layout validate, compose stubs
```

- **Domain logic** lives in `keymap-core` and runs in the browser (and on the API only when needed for GitHub/dev I/O).
- **UI** does not own ZMK encode/decode.
- **API** does not own editor state or compose presentation.

## Keycap / compose (target UX)

- **ZMK mode**: behavior + params (current editor).
- **Composed preview**: quadrant-style host legend (base/shift language pair + AltGr pair + hold badge), driven by a `ComposedLegend` model in core.
- Full host-layout editors and XKB/KLC export are product steps *after* round-trip safety and a stable compose model.

## Keymap file contract

Accepted in [ADR 0002](adr/0002-keymap-file-contract.md):

- Preserve user `.keymap` preamble on Save via **template** or **in-place bindings splice** (else default template + warning).
- DTS import expands `#define` aliases in bindings (`VU` → `C_VOL_UP`); Save writes expanded tokens; UI shows `macros_expanded` (no reverse-sub yet).
- `keymap.json` is the editor interchange format and becomes the preferred reload source after Save.

## Out of scope (for now)

- Full DTS AST rewriter
- Collaborating multiplayer editing
- Building firmware in-app
- Growing a general-purpose local filesystem server

## Related docs

- [running-locally.md](../running-locally.md) — how to run the monorepo today
- [AGENTS.md](../AGENTS.md) — short guidance for coding agents
- [adr/](adr/) — architecture decision records
