import { hostKeyByXkb, hostKeyByZmk } from './host-key-id.js'
import type { ComposedLegend } from './types.js'
import { parseXkbSymbolsSection } from './xkb-symbols.js'
import { keysymToGlyph } from './xkb-keysyms.js'

/** Shown where a level is NoSymbol. */
export const HOST_LEVEL_EMPTY = 'ˬ'

/** Four glyphs: base, Shift, AltGr, AltGr+Shift. Empty string is NoSymbol. */
export type HostLevels = readonly [string, string, string, string]

export interface HostLayout {
  id: string
  byZmk: ReadonlyMap<string, HostLevels>
}

function padLevels(keysyms: string[]): [string, string, string, string] {
  const glyphs = [0, 1, 2, 3].map(index => {
    const name = keysyms[index] ?? 'NoSymbol'
    const glyph = keysymToGlyph(name)
    if (glyph == null) {
      throw new Error(`xkb keysym ${name} has no character`)
    }
    return glyph
  })
  return [glyphs[0], glyphs[1], glyphs[2], glyphs[3]]
}

/**
 * Character keys in one symbols section, joined to canonical ZMK names.
 * Keys whose base level is not a character (`Multi_key`, `ISO_Level3_Shift`)
 * are omitted.
 */
export function hostLayoutFromSymbols(source: string, section: string, id: string): HostLayout {
  const byZmk = new Map<string, HostLevels>()
  for (const [xkb, keysyms] of parseXkbSymbolsSection(source, section)) {
    const host = hostKeyByXkb(xkb)
    if (!host) continue
    const base = keysymToGlyph(keysyms[0] ?? 'NoSymbol')
    if (base == null) continue
    byZmk.set(host.zmk, padLevels(keysyms))
  }
  return { id, byZmk }
}

function slot(glyph: string): string {
  return glyph === '' ? HOST_LEVEL_EMPTY : glyph
}

/**
 * Four legend slots from two host groups.
 * Slot 1 is the base layout's level 1. Slot 2 is the second layout's Shift
 * (uppercase of that alphabet). AltGr slots come from the base layout.
 * When AltGr pairs differ, `bilingualNote` is `Δτ/ёЁ`.
 */
export function composeHostPair(
  base: HostLayout,
  second: HostLayout,
  token: string
): Pick<ComposedLegend, 'primary' | 'altGr' | 'bilingualNote' | 'keycode'> | null {
  const id = hostKeyByZmk(token)
  if (!id) return null
  const baseLevels = base.byZmk.get(id.zmk)
  if (!baseLevels || baseLevels[0] === '') return null
  const secondLevels = second.byZmk.get(id.zmk)
  const upper = secondLevels ? secondLevels[1] : baseLevels[1]
  const altGr: [string, string] = [slot(baseLevels[2]), slot(baseLevels[3])]
  let bilingualNote: string | undefined
  if (secondLevels) {
    const baseAlt = slot(baseLevels[2]) + slot(baseLevels[3])
    const secondAlt = slot(secondLevels[2]) + slot(secondLevels[3])
    if (baseAlt !== secondAlt) bilingualNote = `${baseAlt}/${secondAlt}`
  }
  return {
    primary: [slot(baseLevels[0]), slot(upper)],
    altGr,
    bilingualNote,
    keycode: `KC_${id.zmk}`
  }
}
