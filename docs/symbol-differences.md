# Highlight symbol differences

Intent and contract for the **Differences** legend mode. Implementation: `symbolAlign` / `symbolAlignPairFromView` in `packages/keymap-core`, marks on the board in `apps/web`. Decision summary also lives in [ADR 0004](adr/0004-host-edit-and-os-deliverables.md) (Symbol differences).

## Purpose

Differences is a **host-layout assembly helper**, not an export checklist alone. While the user tries to harmonize two (or more) host languages for one keyboard, it should surface places where standard or draft layouts disagree on **non-letter** access — especially typewriter basics — so muscle memory and OS install paths stay usable.

Letters are expected to disagree across alphabets. They stay quiet.

## North star

A coordinated bilingual key looks like shared basics beside different letters, e.g. `vV#]` / `мМ#]` drawn as `vV#]   мМ`: AltGr (and other levels) carry the same typewriter marks in both languages. That shape exports cleanly to:

- **Linux:** two files (en + national); the chord works in each language.
- **Windows:** separate layouts, or a Caps-paired file when that pairing is offered.

Misaligned stock layouts (e.g. `.,` on different keys in en vs ru, or basics only on national AltGr of a letter key) are what the mode should make obvious.

## Compared pair

| Rule | Detail |
|------|--------|
| Pair | The two languages **drawn on the keycap** (`hostKeycapLanguages` / `keycap`), any pair (en–ru, ru–fr, …). |
| Not the pair | `open` alone, or “English × whatever is open” when the key shows two nationals. |
| Enable | Differences applies when two keycap languages are shown. |
| Levels | All four host levels (tap / Shift / AltGr / AltGr+Shift). Column AltGr toggles do **not** hide marks. |
| `open` | Still the install counterpart for the combined Windows file; Win AltGr marks use English × `open` only when both are on the keycap. |

## Marks

Neither mark is stored in the legend view.

### Position (mild)

Non-basic non-letters (national ornament: `№`, many fr AltGr extras, …) with no shared key+level, or present in only one language.

- Captions: `Different position: …` / `Only in one language: …`
- Board: amber underline (`symbol-moved`)
- Stage sample: `position`

### Basic (serious)

Typewriter punctuation in `BASIC_ALIGN_GLYPHS` / `isBasicAlignGlyph` (punct half of `MARKS` in `host-basic-glyphs.ts`, plus `` ` `` and `~`). **Digits are out** of this severity set. Same glyph rules as position, plus:

| Situation | Why it matters | Caption cue |
|-----------|----------------|-------------|
| No shared place | Basics on different keys break shared muscle memory | `Different position: …` |
| Only in one layout | Missing from one host file entirely | `Only in one language (Linux split): …` |
| On this key in only one language | Even if the glyph exists elsewhere (e.g. `]` on `RBKT` in both, and also on ru `V` AltGr only) | `On this key only in one language: …` |

**Linux vs Windows:** a basic only on national AltGr of a letter key often still works in a **paired** Windows `.klc` (national AltGr wins / fills). With **Linux two files**, that chord is unreachable while the English layout is active. That asymmetry is why basic gaps are louder than ornament drift.

- Board: stronger wash (`symbol-basic`, `--mark-basic`)
- Stage sample: `basic`

### Win AltGr (merge)

Only when English and `open` share the keycap. Both AltGr (or AltGr+Shift) cells non-empty and different → combined Caps file keeps the open language and drops English there.

- Board: red outline (`altgr-conflict`)
- Stage sample: `Win AltGr` (hidden for national–national keycaps)
- Not a “copy AltGr” command; two Win+Space layouts each keep their own AltGr.

## Desires (product)

Keep these when changing the mode; do not collapse them back into “en × open + Win merge only.”

1. Help the user **align** host languages they put on the key, including pairs without English.
2. Prefer **shared access to basics** (any level) over silencing drift because a glyph exists somewhere else in the other layout.
3. Treat **Linux split reachability** as first-class for basics; do not assume Windows pairing fixes the host story.
4. Keep ornament noise mild so dense AltGr languages (fr, …) do not drown the board.
5. Leave letters quiet; alphabet change is not a defect.
6. Keep Win merge warnings separate from position/basic alignment.

## Out of scope (for now)

- Auto-collapsing matching AltGr in the face string (the face already shows four slots per language with `ˬ`; shared AltGr reads as the same trailing pair).
- Expanding `missingBasicGlyphs` (legend strip gaps) to match `BASIC_ALIGN_GLYPHS`; that list still includes digits and language letters for “layout incomplete.”
- Auto-fix or “copy AltGr from the other language.”

## Code map

| Piece | Where |
|-------|--------|
| Basic glyph set | `BASIC_ALIGN_GLYPHS` / `isBasicAlignGlyph` in `host-basic-glyphs.ts` |
| Align math + captions | `host-symbol-align.ts` |
| Keycap pair | `hostKeycapLanguages`, `symbolAlignPairFromView` |
| Editor wiring | `editor.symbolAlignIndex`, `canAlignHostSymbols`, `symbolAlignShowsWinAltGr` |
| Board paint | `Key.svelte` / `Key.css`, samples in `SymbolAlignKey.svelte` |
