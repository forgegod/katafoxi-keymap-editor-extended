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

1. **ZMK** lane: Source, then draft status (**Draft**, or a dot whose tooltip is **Up to date with repo** / **disk**), undo/redo, then Write files / Commit and **Latest** in that same cluster. Spare width stays after that cluster, before the Host divider. **Discard draft** sits beside **Draft** and restores the last loaded keymap. On GitHub, **Latest** is the branch’s Actions firmware build: neutral until a firmware artifact can be downloaded, then filled, with no commit hash in the label. A successful run with a firmware artifact downloads the zip through the API; the browser never sees the installation token. Any other finished state opens the Actions page. An unpublished binding washes that layer’s row until publish. The decode card’s first line is `Was …`, and the ZMK / Windows / Linux identifiers stay on the next line. Layer add, rename, and remove stay **Draft** without a per-key mark. Undo only walks the in-memory stack.
2. **Host** lane: shown once a keymap is loaded. Clean/Changed when any shown legend column uses a `user:` layout; **Linux** / **Windows** open install dialogs (not instant blob downloads). While a user layout is waiting to install, those buttons take a light green outline. A clean host leaves them disabled, and the tooltip says there is nothing to install. The keycap draws at most two languages, any pair (`keycap`). English stays column 0 when its eye is off. The combined Windows file uses that base and `open`, not whichever pair is drawn.
3. **Legend modes** sit on the assembly line, left of the remembered chips: **Stack languages** and **Symbol differences** are labeled mode buttons in one row. Stack stays pale until three host columns exist (two languages already share the key). **Highlight symbol differences** is on when a second language is open. While it is on, the samples `position` and `Win AltGr` sit on the keyboard stage, just above the board. Beside those modes, **Colors** and **Scheme** are board disclosures (not legend modes): Colors washes firmware layers on the keycap and in the table; Scheme shows the full matrix with row/col rails, including absent slots. A blank physical top row stays auto-hidden unless Scheme is on. The host symbol catalog (Ω) sits at the end of the language header row.
4. Tiny ⓘ tooltips are not the install channel — the OS button opens the sheet.

### Linux / Windows deliverables

1. **Linux dialog:** per dirty language — copy/download `xkb_symbols` section, copyable example paths, install steps. Prefer **`symbols/au`** for English (not the huge `us` file) and **`legacy`** in `symbols/ru` for Russian. Mention `sudo` for system paths. Cards appear only for languages that actually have dirty user layouts.
2. **Windows dialog:** link to official MSKLC download, install steps, and **Download .klc** for each active user layout. One of those files is one language. When the legend also has another language, the dialog explains and offers a combined file: English stays the Windows language, that language’s levels 0 and 1 sit on Caps Lock, and AltGr comes from that language. An English AltGr symbol is written only where the other language’s AltGr level is empty. The same AltGr symbols are repeated on the Caps Lock row. Do not pretend a checklist `.txt` is a `.klc`.
3. Profile-menu **Export xkb** may remain as an advanced round-trip aid; the Host lane is the product path for “take my host work to the OS.”

### Symbol differences

When a second language is open, **Highlight symbol differences** paints two marks. Neither is stored in the legend view.

1. **Position** (amber underline): a punctuation mark or other non-letter glyph with no key and level shared by both languages. That is a glyph both languages produce only on different keys (`Different position`), or a glyph only one language produces (`Only in one language`). Extra copies stay quiet once any one key and level produces the glyph in both languages. Letters are not marked.
2. **Win AltGr** (red outline): AltGr or AltGr+Shift is non-empty in both languages and the glyphs differ. That is the combined Windows file (`mergedAltGr` / `hostLayoutsToCapsKlc`): the open language wins, and an English symbol is written only where that language’s AltGr cell is empty. Two separate Windows layouts, switched with Win+Space, each keep their own AltGr; the outline is about the combined file. There is no command that copies AltGr from one layout onto the other.

### Missing basics

The far right of the host legend strip lists basic glyphs a changed host layout (`user:`) does not contain anywhere (`missingBasicGlyphs`). System columns stay quiet. A column with its eye off still counts. A letter counts as present when either case appears on any level. The set is that language's alphabet (Russian includes `ё` and `ъ`; Ukrainian uses `і ї є ґ` and not `ы э ъ ё`; German adds `ä ö ü ß`) plus digits and typewriter punctuation with each mark's shifted partner. A glyph the language's primary system layout never produces is not required. A keypad binding on the keymap (`KP_N3`, `KP_PLUS`, `KP_MINUS`) counts as present for every language; `KP_DOT` does not, because it follows the locale decimal separator. A shifted alias such as `PLUS` does not count: the host layout reads that report. Leaving a system position (`ъ` key now holds `ю`) is not a gap while the glyph still occurs. The list is not stored.

### `.klc` writer

`hostLayoutToKlc` / `encodeKlc` in `packages/keymap-core` (`klc-write.ts`). The browser downloads UTF-16 LE with BOM and CRLF, which is what MSKLC opens. MSKLC then builds the installer; the editor does not assign a custom KLID (`a000…`). `LOCALEID` stays the language id (`00000407` for German). `DESCRIPTIONS` and `LANGUAGENAMES` use `0409` because those strings are English.

Characters come from the host layout’s four keysyms. Levels 0, 1, 2, 3 land on shift states 0, 1, 6, 7. The Ctrl column (state 2) is `-1`, except space, which stays `0020`. The writer adds states 6 and 7 when a layout uses those levels even if the locale list omitted them. ASCII letters and digits are written as themselves; other characters are four hex digits. A `dead_*` keysym is `id@` plus one `DEADKEY` section.

`hostLayoutsToCapsKlc` is the same writer with a second layout. The base layout fills the normal letters and the virtual keys. Where the second layout’s levels 0 and 1 differ, the key is `SGCap` and the next line holds that alphabet for Caps Lock and Caps Lock+Shift. AltGr columns come from the second layout; a base AltGr symbol fills a level the second layout leaves empty. Those AltGr symbols are copied onto the Caps Lock row. Shift states 6 and 7 are added when either layout uses them. `LOCALEID` stays English (`00000409`). A new language still needs its own `WINDOWS_LOCALES` entry for a one-language file. The description stays readable (`English + Russian`). The DLL id is separate: three letters from each language plus a two-digit version (`EngRus01`), because MSKLC allows eight letters and digits and Windows keeps the old DLL when that id does not change. The browser stores the last version per caps language and advances it on each combined download.

MSKLC splits a section on CRLF only. A `KEYNAME` or `KEYNAME_EXT` block written with bare LF becomes one key name: scan code `01` and the rest of the list as its label. Project → Build rewrites the loaded file before `kbdutool`, so the same text can compile from the command line and still fail in the GUI. The rewritten C then reports `C2061` (identifier `Right`, from the glued `"Right Shift"`) and `C2021` / `C2059` (`0e`, the next scan code, read as a number). `KeyboardVerify.log` does not fail that build. Duplicate glyphs are the layout. Cyrillic and symbols outside CP1252 are expected on the combined file, whose `LOCALEID` stays `00000409`.

What is data, and what the writer infers:

| Piece | Where | Adding a language |
| --- | --- | --- |
| Locale name, `LOCALEID`, English language name, shift states | `WINDOWS_LOCALES` in `klc-locale.ts`, keyed by `HostLanguageId` | Required. The record is total, so a new language fails the build until the entry exists. |
| Letter virtual keys | Inferred from a Latin letter on the key | Nothing. Cyrillic and other non-Latin letters keep the US-position VK (`Q` stays `Q` on Russian й). |
| Punctuation VK that is not the US one | `vkByZmk` on that locale (German `MINUS` → `OEM_4`) | Only when a stock `.klc` shows the VK moved and it is not a letter. |
| Dead-key compositions | `WINDOWS_DEAD_KEYS` in `klc-dead.ts`, shared | A new accent is one entry. The same accent with a different spacing character is `deadIdByKeysym` (US International acute is `0027`, not `00b4`). An unknown `dead_*` is written as `-1`. |
| Caps Lock that is not the shift glyph | `sgcapByZmk` (codepoint) | Only for layouts like the Czech number row (`SGCap` plus a `-1 -1` row). Ordinary case pairs are inferred (`1`, `4`, or `5`). |

Scan codes for the typewriter block are the evdev code (`HostKeyId.scan`). Do not vendor Microsoft `.klc` dumps into the repo; they are a local oracle for filling the tables above.

### Reading a `.klc`

`parseKlc` / `decodeKlc` in `klc-read.ts`. The profile menu offers **Import klc…** beside **Import xkb…**. A file with one alphabet becomes one user layout on the column that imported it. A file whose Caps Lock rows carry another alphabet (the shape `hostLayoutsToCapsKlc` writes; eight or more keys whose unshifted or shifted character differs) becomes two layouts: the base language is `LOCALEID`, and the Caps Lock language is guessed from the letters (Russian, Ukrainian, or German). AltGr in that file stays on the Caps Lock language. An English AltGr symbol that was only filling a hole cannot be told apart and lands on the Caps Lock language too. Virtual keys, the Ctrl column, key names, and custom dead-key compositions are not stored. A few `SGCap` rows that only replace Shift stay in the one layout, and those Caps Lock characters are dropped. If the Caps Lock letters are not Russian, Ukrainian, or German, import from that language’s column so the second layout has a place to go.

### Persistence reminder

IndexedDB already persists user layouts. Host **Changed** means “there is an active user layout to install,” not “unsaved in the browser.”

## Consequences

- Agents must not reintroduce hover-to-edit, card pin-without-Alt, or bridge delays for decode cards.
- Do not put **Show empty row** back; blank top rows stay auto-hidden, and **Scheme** is the board disclosure for the full matrix.
- Do not invent a second AltGr merge for the Win AltGr mark, and do not put Copy AltGr back. The mark follows the combined Windows file: the open language wins, and an empty national cell keeps the base symbol.
- Do not add API routes for host layout files; install remains client-side download/copy + OS tools.
- KLC export stays one writer. A new host language adds a `WINDOWS_LOCALES` entry (and a dead-key row only when the accent is new). Do not grow a second `.klc` implementation in the web app, and do not commit stock Microsoft `.klc` files. KLC import stays the one reader in `klc-read.ts`. Do not store a paired file as a third profile type.
- Every `.klc` line is CRLF. A bare LF inside `KEYNAME` is the `Right` / `0e` compile failure above. Leave `KeyboardVerify.log` warnings alone: do not drop characters, and do not move the combined file off `00000409`, to silence them.
- UI chrome stays English; a short Russian tip on the Russian Linux card is allowed as install **content** for that language only (see TARGET / ui-english).

## Related

- [TARGET_SYSTEM.md](../TARGET_SYSTEM.md) — product UX summary
- [0001](0001-persistence-github-first.md) — host layouts in the browser
- [0002](0002-keymap-file-contract.md) — ZMK `#define` expansion vs host deliverables
