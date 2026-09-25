/**
 * Character dictionary for host layouts.
 *
 * One record is one Unicode scalar. `keysym` is the X11 name to write.
 * `aliases` are other X11 names for that same scalar (`Ukranian_je` for
 * `Ukrainian_ie`, the LARK truncation `Cyrillic_SHCH`). Spellings `U0454`
 * and `0x01000454` are not stored; lookup derives them from the codepoint.
 *
 * Windows text for these characters is the same scalar encoded as UTF-16.
 * `windows` stays unset until a character needs a different WCHAR or a
 * multi-unit string.
 *
 * Data: `data/host-symbols.json`, built by `scripts/build-host-symbols.py`
 * from X11 `keysymdef.h` and the system xkb fixtures.
 */

import records from '../data/host-symbols.json' with { type: 'json' }

interface HostSymbolRecord {
  cp: number
  keysym: string
  aliases?: readonly string[]
}

export interface HostSymbol {
  codepoint: number
  glyph: string
  /** Canonical X11 keysym name. */
  keysym: string
  aliases: readonly string[]
  /**
   * Windows text production when it is not this scalar as UTF-16.
   * Absent for ordinary characters.
   */
  windows?: string
}

const U_FORM = /^U([0-9A-Fa-f]{4,6})$/
const HEX_FORM = /^0x([0-9A-Fa-f]+)$/

const byKeysym = new Map<string, HostSymbol>()
const byCodepoint = new Map<number, HostSymbol>()
const byGlyph = new Map<string, HostSymbol>()

for (const row of records as readonly HostSymbolRecord[]) {
  const symbol: HostSymbol = {
    codepoint: row.cp,
    glyph: String.fromCodePoint(row.cp),
    keysym: row.keysym,
    aliases: row.aliases ?? []
  }
  byCodepoint.set(symbol.codepoint, symbol)
  byGlyph.set(symbol.glyph, symbol)
  byKeysym.set(symbol.keysym, symbol)
  for (const alias of symbol.aliases) byKeysym.set(alias, symbol)
}

/** Codepoint written as `U0454` or `0x01000454`. Named keysyms return null. */
export function codepointFromKeysymSpelling(name: string): number | null {
  const uForm = U_FORM.exec(name)
  if (uForm) return scalar(Number.parseInt(uForm[1], 16))
  const hexForm = HEX_FORM.exec(name)
  if (!hexForm) return null
  const value = Number.parseInt(hexForm[1], 16)
  if ((value & 0xff000000) === 0x01000000) return scalar(value & 0x00ffffff)
  if ((value >= 0x20 && value <= 0x7e) || (value >= 0xa0 && value <= 0xff)) return value
  return null
}

function scalar(codepoint: number): number | null {
  if (codepoint < 0 || codepoint > 0x10ffff) return null
  if (codepoint >= 0xd800 && codepoint <= 0xdfff) return null
  return codepoint
}

/** Symbol for an X11 name, a deprecated alias, or a `U` / `0x01` spelling. */
export function hostSymbolByKeysym(name: string): HostSymbol | undefined {
  const named = byKeysym.get(name)
  if (named) return named
  const codepoint = codepointFromKeysymSpelling(name)
  if (codepoint == null) return undefined
  return byCodepoint.get(codepoint)
}

export function hostSymbolByCodepoint(codepoint: number): HostSymbol | undefined {
  return byCodepoint.get(codepoint)
}

/** Exact glyph match. Latin `a` and Cyrillic `а` are different records. */
export function hostSymbolByGlyph(glyph: string): HostSymbol | undefined {
  return byGlyph.get(glyph)
}
