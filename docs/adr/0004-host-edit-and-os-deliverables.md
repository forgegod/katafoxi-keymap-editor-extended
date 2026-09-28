# ADR 0004: Host-edit session and OS install deliverables

- **Status:** Accepted
- **Date:** 2026-09-26

## Context

Host layouts live in the browser (IndexedDB) and are edited beside the ZMK keymap. Early UX tried to reach host edit by hovering the full decode card (click cells, revert, bridge delays, pin). That raced with stacked layer rows, stuck multiple cards, and blurred “peek” vs “edit”.

ZMK already has a visible chrome pipeline (Source → draft → Write files / GitHub). Host work had only a buried **Export xkb** in the profile menu. That export is an `xkb_symbols` **section** for round-trip / advanced paste — not a drop-in Linux `ru.xkb` or a Windows `.klc`. Agents and users confused “export” with “install on the OS.”

## Decision

### Host edit entry (decode card)

1. **Hover** = read-only peek (`pointer-events: none`). No cell edit, no revert, no pin, no hide/switch grace timers.
2. **Alt+click** a composed row = only entry into a **host-edit session**: lock the decode card (board exclusivity via `legend-decode-active`), show Accept / Cancel (Enter / Escape), open the persistent Ω catalog. Glyph picks **write immediately**; Accept/Cancel only end the session (Cancel does not roll back).
3. Plain click on the row = ZMK `KeyEditor` (unchanged).
4. Host edit is offered only when the binding’s tap is in the **host-key registry** (`hostKeyByZmk`). Non-character keys (e.g. `BSPC`) peek without Alt+click host affordance.
5. The docked **Host symbol catalog** (Ω) stays open across picks; expand/scroll/geometry persist in the module. When a host-edit session opens, and when that session’s decode card moves to another key, the catalog shifts off the card (8px of clearance), shrinking toward its minimum if the roomier side is tight. A drag is left where it is dropped.

### Chrome: two lanes

1. **ZMK** lane: Source, undo/redo, draft status, Write files / Commit.
2. **Host** lane: Clean/Changed when any shown legend column uses a `user:` layout; **Linux** / **Windows** open install dialogs (not instant blob downloads).
3. Tiny ⓘ tooltips are not the install channel — the OS button opens the sheet.

### Linux / Windows deliverables

1. **Linux dialog:** per dirty language — copy/download `xkb_symbols` section, copyable example paths, install steps. Prefer **`symbols/au`** for English (not the huge `us` file) and **`legacy`** in `symbols/ru` for Russian. Mention `sudo` for system paths. Cards appear only for languages that actually have dirty user layouts.
2. **Windows dialog:** link to official MSKLC download, install steps, **Download .klc** stays disabled until a KLC writer exists. Do not pretend a checklist `.txt` is a `.klc`.
3. Profile-menu **Export xkb** may remain as an advanced round-trip aid; the Host lane is the product path for “take my host work to the OS.”

### Persistence reminder

IndexedDB already persists user layouts. Host **Changed** means “there is an active user layout to install,” not “unsaved in the browser.”

## Consequences

- Agents must not reintroduce hover-to-edit, card pin-without-Alt, or bridge delays for decode cards.
- Do not add API routes for host layout files; install remains client-side download/copy + OS tools.
- KLC generation is explicitly future work; UI may show the Windows path without shipping a binary writer.
- UI chrome stays English; a short Russian tip on the Russian Linux card is allowed as install **content** for that language only (see TARGET / ui-english).

## Related

- [TARGET_SYSTEM.md](../TARGET_SYSTEM.md) — product UX summary
- [0001](0001-persistence-github-first.md) — host layouts in the browser
- [0002](0002-keymap-file-contract.md) — ZMK `#define` expansion vs host deliverables
