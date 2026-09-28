# Target system

Vision for this fork of the keymap editor. Living document — update when product intent changes. Decisions belong in [ADR](adr/).

## Product intent

A browser editor that shows what a key **actually produces**, not only what a ZMK `.keymap` line says.

Users combine:

1. **Firmware keymap** (ZMK layers, behaviors, hold-taps, etc.)
2. **Host input layouts** (e.g. Windows/Linux layouts for EN + RU and AltGr levels)

so each physical key can show a compact **composed legend** (host-resolved glyphs from the selected language columns + optional hold annotation), not a single-layer dump of the text file.

Editing should stay honest to ZMK: composed view is an **editor** over firmware bindings — a stack row opens KeyEditor for that layer — but you still change the ZMK binding, not the host glyph.

## UI language

The SPA chrome is **English only** for now (labels, buttons, hints, notices). Agents and contributors should not add new non-English UI strings; rename leftover tails when touching a screen. Glyphs on keycaps (including Cyrillic) are content, not chrome.

## Persistence (product)

Primary user workflows (aligned with upstream intent):

| Source | Role |
|--------|------|
| **GitHub** | Load/save `zmk-config` via GitHub App + OAuth. Loading host layouts from a keyboard repo (`host_keymap/` or equivalent) is future work and needs its own ADR. |
| **Clipboard** | Paste/copy keymap text (planned / restore) |
| **File System Access API** | Chromium: read/write local files without a Node file server (planned / restore) |

The Node API exists mainly for **GitHub secrets and commits**. It is not the long-term home for “open my firmware folder on disk.”

### Dev-only local bridge

Sibling/`zmk-config` junction + `GET/POST /layout|/keymap` is a **development adapter** so we can iterate on a cloned firmware repo quickly. Do not grow product features that *require* this path. Prefer the same file contracts as GitHub (parse/generate/splice in `keymap-core`). Host layouts the user imports or copies live in the browser (IndexedDB), not on this adapter.

See [ADR 0001](adr/0001-persistence-github-first.md).

## Runtime shape

```
apps/web          Svelte 5 + Vite SPA — UI, pickers, composed key editor
apps/api          Thin Hono API — GitHub OAuth/App + optional dev-local I/O
packages/keymap-core   Pure TS — parse/generate/splice .keymap, host-layout registry, compose
```

- **Domain logic** lives in `keymap-core` and runs in the browser (and on the API only when needed for GitHub/dev I/O).
- **UI** does not own ZMK encode/decode.
- **API** does not own editor state or compose presentation.

## Key editor

Click a stacked keycap row. One dialog edits that layer’s ZMK binding:

- Behaviour chips, then the value list for the active slot. `code` is Keyboard/Keypad, `command` is that behaviour's commands (`&mkp`, `&msc`, `&mmv`, `&bt`, `&out`, …), `layer` and `mod` are the layer or modifier slot (`&mo`, `&mt`, `&lt`).
- Enter applies a complete binding. Esc cancels. An unfinished hold-tap stays open.
- Pointing behaviours remind that firmware needs `CONFIG_ZMK_POINTING=y`. The editor only adds `#include <dt-bindings/zmk/pointing.h>`.

## Keycap / compose (target UX)

- **ZMK legends** (compact codes on a raw layer0 row, and inside KeyEditor): helpers in `packages/keymap-core` `compose.ts` (`layerLegendSymbol`, `keycapLegend`, `isHoldTapBehavior`). Binding tokens stay ZMK (`1`, `LCTRL`, `LC(DEL)`).
  - Layers: `L1` (index, not the layer name).
  - Left modifiers unmarked (`⌃ ⎇ ⌘ ⇧`); right side `R⌃` / `R⎇` / `R⌘` / `R⇧`. Alt is the ISO alternative-key symbol.
  - Compact chords drop parens: `LC(DEL)` → `⌃⌦`, `LS(CAPS)` → `⇧⇪`, and a short token `LA(F4)` → `⎇F4`, `LA(TAB)` → `⎇TAB`, `LA(ESC)` → `⎇ESC` (`F1`–`F12`).
  - Host-legend AltGr columns use the same mark: `R⎇` and `⇧R⎇`.
  - Mouse scroll keeps the family prefix: `SCRL⬆` `SCRL⬇` `SCRL⬅` `SCRL➡`. Pause/Break is `⏸`. Volume up / down / mute are `🔊` `🔉` `🔇`. Tooltip keeps the raw code.
  - Behaviour on the cap: hide `&kp`; hide `&mt`/`&lt` when the hold-tap pill is shown; `&none` / `&trans` / instant binds are the center legend; other behaviours stay a small corner mark.
  - Caps Lock `⇪`. Browser back/forward `←` / `→` (not cursor `⏴` `⏵`). Number-row `-` / `=` (not the words `MINUS` / `EQUAL`). Tooltip keeps the raw code.
  - Keypad (`KP_*`): same glyph as the number row (`7`), boxed. Operators `+ - / *`, plus `KP_ENTER` `⮐`, `KP_DOT` `.`, `KP_EQUAL` `=`. Color is only a light fill. Host composed stays the same glyph.
- **Composed view**: an N-column `ComposedLegend` in core (visible extras; a hidden base column is kept so AltGr collapse can still see it). The keycap still draws the visible base column plus the open extra (`onKeycap`); the table and decode card share the same `hostLevels` / `resolveHostColumns` path. Hold badges come from the binding (`holdRef`), not from the letter.
- Host glyphs are editable from an **Alt+click** host-edit session on the decode card (see below). A fuller standalone host-layout editor and **KLC file generation** remain future work. An xkb section writer round-trips layouts for Linux paste/download; the Host chrome lane walks install steps (prefer `symbols/au` / `ru` `legacy`).

## Host layouts

Core and the web app do **not** know any concrete keyboard. Built-in host data is OS language tables (`HOST_LANGUAGES`: en, ru, uk, de) plus vendored xkb modules. A named board (for example LARK) is only a test/dev fixture — see [running-locally.md](../running-locally.md).

- **Registry.** `hostLayout(id)` / `hostLayoutMeta(id)` resolve both builtins and layouts registered at runtime. Builtin xkb sections parse on first use. `registerHostLayout` / `unregisterHostLayout` make an imported or copied layout available to the keycap, table, decode card, and profile menu the same way as a system id.
- **Storage in the layout.** Each `HostLayout` stores four **keysyms** per key and derives glyphs. `'NoSymbol'` is explicit. Non-character bases (`dead_*`, `Multi_key`) stay in the table; composition filters them.
- **Legend view.** `HostLegendView = { columns, open }`. `columns[0]` is the base language. Each `HostColumn` is `{ language, layoutId, visible, altGr, altGrShift }`. The default is primary system English only (`system-us`, `us(basic)`, AltGr on, `open: null`). That column is the firmware key-code alphabet: ZMK sends US positions, and it is not a language picker. Every other catalog language, including Russian, is a host language the user chooses for that keyboard. The choice is stored in IndexedDB under the same identity as an unpublished draft (source, repository, branch, keyboard name), not in the firmware repo. A browser-wide legend left by the old English+Russian default is ignored; any other saved browser-wide view is adopted by the first keymap opened and then removed, so the next keyboard starts from English again.
- **Layer view.** Firmware-layer visibility is a separate `LayerView = { shown, layer0Raw }` on the editor (`editor.layerView`). It is not part of the host-legend view.
- **Edit from the decode card.** Hover a composed keycap row for a **read-only** peek (levels table + ZMK hint; no edit/revert; `pointer-events: none`). **Alt+click** the row starts a host-edit session only when the tap is a host-character key (`hostKeyByZmk`): the card locks (one active decode owner), shows Accept / Cancel (Enter / Escape), and opens the persistent symbol catalog (Ω). Level cells arm the catalog; glyph picks **write immediately**; Accept/Cancel only end the session (no draft rollback). Plain click on the row still opens `KeyEditor` for the ZMK binding. The first edit of a system layout forks a user copy (`user:<uuid>`, origin `{ from: 'copy', layoutId }`), switches that language column to the copy, and leaves the system table unchanged; the card keeps the primary system row for comparison and diffs. Further edits update the user layout in place; the board repaints immediately and the change persists in IndexedDB with the legend view. Details: [ADR 0004](adr/0004-host-edit-and-os-deliverables.md).
- **Chrome lanes.** Header splits **ZMK** (Source, undo/redo, draft status, Write files / Commit) from **Host** (Clean/Changed when a shown column uses a `user:` layout). Linux / Windows open install dialogs: copy/download xkb sections with path hints (English → prefer `symbols/au`; Russian → prefer `legacy` in `symbols/ru`; note `sudo` for system files); Windows links MSKLC and keeps **Download .klc** disabled until a writer exists.
- **Profile = layout.** One id space: catalog ids (`system-us`, `system-ru-legacy`, …) and user layouts `user:<uuid>`. A profile menu entry is a layout. Copies (including the decode-card fork) materialize the source table; xkb import (`Import xkb…`) registers a user layout with origin `{ from: 'xkb', fileName, section }` and assigns it to that language column. Browser IndexedDB stores user layouts once, and stores each keyboard's legend view (`columns`, `open`) separately. Profile **Export xkb** remains an advanced section dump; product install UX is the Host lane.
- **Keyboard-repo host files.** Loading layouts that ship with a keyboard (`host_keymap/` in a config repo) is out of scope here and needs an ADR.
- **Vendored xkb ships eagerly.** All `system-*-symbols.ts` blobs sit in the web entry chunk. The default view needs only `us`; other languages load from the same tables when chosen. Splitting them out was measured at −25.8 KB gzip (177.4 → 151.6), but it is all-or-nothing: `host-layout-catalog.ts` imports the modules statically, so a dynamic import in `host-layout-import.ts` alone is defeated by Rollup. Doing it properly means an async preload step in front of the synchronous `hostLayout()` used during render, whose failure mode is a silently blank legend. Deferred as not worth that trade today; revisit when the language catalog grows.

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

- [running-locally.md](../running-locally.md) — how to run the monorepo, and how to run `pnpm test` / `pnpm test:e2e`
- [AGENTS.md](../AGENTS.md) — short guidance for coding agents
- [adr/](adr/) — architecture decision records
