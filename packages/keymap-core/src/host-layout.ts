import { hostKeyByXkb, hostKeyByZmk } from './host-key-id.js'
import type { ComposedLegend } from './types.js'
import { parseXkbSymbolsSection } from './xkb-symbols.js'
import { keysymToGlyph } from './xkb-keysyms.js'

/** Four glyphs: base, Shift, AltGr, AltGr+Shift. Empty string is NoSymbol. */
export type HostLevels = readonly [string, string, string, string]

export interface HostColumnOptions {
  altGr?: boolean
  altGrShift?: boolean
}

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

/**
 * Language columns from one or two host groups.
 * `en` is the first layout's own case pair. `second` is the other alphabet
 * when chosen. AltGr columns come from the first layout and stay empty when
 * the level is NoSymbol or the column is hidden. When the visible AltGr
 * pair differs from the second language, `bilingualNote` is `Δτ/ёЁ`.
 */
export function composeHostPair(
  base: HostLayout,
  second: HostLayout | null,
  token: string,
  columns: HostColumnOptions = {}
): Pick<ComposedLegend, 'en' | 'second' | 'altGr' | 'altGrShift' | 'bilingualNote' | 'keycode'> | null {
  const showAlt = columns.altGr !== false
  const showAltShift = columns.altGrShift !== false
  const id = hostKeyByZmk(token)
  if (!id) return null
  const baseLevels = base.byZmk.get(id.zmk)
  if (!baseLevels || baseLevels[0] === '') return null
  const secondLevels = second?.byZmk.get(id.zmk)
  let bilingualNote: string | undefined
  if (secondLevels && (showAlt || showAltShift)) {
    const baseAlt = `${showAlt ? baseLevels[2] : ''}${showAltShift ? baseLevels[3] : ''}`
    const secondAlt = `${showAlt ? secondLevels[2] : ''}${showAltShift ? secondLevels[3] : ''}`
    if (baseAlt !== secondAlt) bilingualNote = `${baseAlt}/${secondAlt}`
  }
  return {
    en: [baseLevels[0], baseLevels[1]],
    second: secondLevels ? [secondLevels[0], secondLevels[1]] : null,
    altGr: showAlt ? baseLevels[2] : '',
    altGrShift: showAltShift ? baseLevels[3] : '',
    bilingualNote,
    keycode: `KC_${id.zmk}`
  }
}
