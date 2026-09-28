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
2. **Windows dialog:** link to official MSKLC download, install steps, and **Download .klc** for each active user layout. One of those files is one language. When the legend also has another language, the dialog explains and offers a combined file: English stays the Windows language, that language’s levels 0 and 1 sit on Caps Lock, and AltGr comes from that language. An English AltGr symbol is written only where the other language’s AltGr level is empty. The same AltGr symbols are repeated on the Caps Lock row. Do not pretend a checklist `.txt` is a `.klc`.
3. Profile-menu **Export xkb** may remain as an advanced round-trip aid; the Host lane is the product path for “take my host work to the OS.”

### `.klc` writer

`hostLayoutToKlc` / `encodeKlc` in `packages/keymap-core` (`klc-write.ts`). The browser downloads UTF-16 LE with BOM and CRLF, which is what MSKLC opens. MSKLC then builds the installer; the editor does not assign a custom KLID (`a000…`). `LOCALEID` stays the language id (`00000407` for German). `DESCRIPTIONS` and `LANGUAGENAMES` use `0409` because those strings are English.

Characters come from the host layout’s four keysyms. Levels 0, 1, 2, 3 land on shift states 0, 1, 6, 7. The Ctrl column (state 2) is `-1`, except space, which stays `0020`. The writer adds states 6 and 7 when a layout uses those levels even if the locale list omitted them. ASCII letters and digits are written as themselves; other characters are four hex digits. A `dead_*` keysym is `id@` plus one `DEADKEY` section.

`hostLayoutsToCapsKlc` is the same writer with a second layout. The base layout fills the normal letters and the virtual keys. Where the second layout’s levels 0 and 1 differ, the key is `SGCap` and the next line holds that alphabet for Caps Lock and Caps Lock+Shift. AltGr columns come from the second layout; a base AltGr symbol fills a level the second layout leaves empty. Those AltGr symbols are copied onto the Caps Lock row. Shift states 6 and 7 are added when either layout uses them. `LOCALEID` stays English (`00000409`). A new language still needs its own `WINDOWS_LOCALES` entry for a one-language file.

What is data, and what the writer infers:

| Piece | Where | Adding a language |
| --- | --- | --- |
| Locale name, `LOCALEID`, English language name, shift states | `WINDOWS_LOCALES` in `klc-locale.ts`, keyed by `HostLanguageId` | Required. The record is total, so a new language fails the build until the entry exists. |
| Letter virtual keys | Inferred from a Latin letter on the key | Nothing. Cyrillic and other non-Latin letters keep the US-position VK (`Q` stays `Q` on Russian й). |
| Punctuation VK that is not the US one | `vkByZmk` on that locale (German `MINUS` → `OEM_4`) | Only when a stock `.klc` shows the VK moved and it is not a letter. |
| Dead-key compositions | `WINDOWS_DEAD_KEYS` in `klc-dead.ts`, shared | A new accent is one entry. The same accent with a different spacing character is `deadIdByKeysym` (US International acute is `0027`, not `00b4`). An unknown `dead_*` is written as `-1`. |
| Caps Lock that is not the shift glyph | `sgcapByZmk` (codepoint) | Only for layouts like the Czech number row (`SGCap` plus a `-1 -1` row). Ordinary case pairs are inferred (`1`, `4`, or `5`). |

Scan codes for the typewriter block are the evdev code (`HostKeyId.scan`). Do not vendor Microsoft `.klc` dumps into the repo; they are a local oracle for filling the tables above.

### Persistence reminder

IndexedDB already persists user layouts. Host **Changed** means “there is an active user layout to install,” not “unsaved in the browser.”

## Consequences

- Agents must not reintroduce hover-to-edit, card pin-without-Alt, or bridge delays for decode cards.
- Do not add API routes for host layout files; install remains client-side download/copy + OS tools.
- KLC export stays one writer. A new host language adds a `WINDOWS_LOCALES` entry (and a dead-key row only when the accent is new). Do not grow a second `.klc` implementation in the web app, and do not commit stock Microsoft `.klc` files.
- UI chrome stays English; a short Russian tip on the Russian Linux card is allowed as install **content** for that language only (see TARGET / ui-english).

## Related

- [TARGET_SYSTEM.md](../TARGET_SYSTEM.md) — product UX summary
- [0001](0001-persistence-github-first.md) — host layouts in the browser
- [0002](0002-keymap-file-contract.md) — ZMK `#define` expansion vs host deliverables
