import { hostKeyByXkb, hostKeyByZmk } from './host-key-id.js'
import type { ComposedLegend } from './types.js'
import { parseXkbSymbolsSection, type ParseXkbOptions } from './xkb-symbols.js'
import { keysymToGlyph } from './xkb-keysyms.js'

/** Four glyphs: base, Shift, AltGr, AltGr+Shift. Empty string is NoSymbol. */
export type HostLevels = readonly [string, string, string, string]

/** Marks a missing shown AltGr / AltGr+Shift glyph so the other level stays anchored. */
export const ALT_LEVEL_EMPTY = 'ˬ'

export interface HostColumnOptions {
  altGr?: boolean
  altGrShift?: boolean
  /** Second language's AltGr column. Defaults to the first language's flag. */
  secondAltGr?: boolean
  /** Second language's AltGr+Shift column. Defaults to the first language's flag. */
  secondAltGrShift?: boolean
}

export interface HostLayout {
  id: string
  byZmk: ReadonlyMap<string, HostLevels>
}

/** Names and `U` / `0x01` spellings resolve through the host symbol dictionary. */
function padLevels(keysyms: string[]): [string, string, string, string] {
  const glyphs = [0, 1, 2, 3].map(index => {
    const name = keysyms[index] ?? 'NoSymbol'
    const glyph = keysymToGlyph(name)
    return glyph ?? ''
  })
  return [glyphs[0], glyphs[1], glyphs[2], glyphs[3]]
}

/**
 * Character keys in one symbols section, joined to canonical ZMK names.
 * Keys whose base level is not a character (`Multi_key`, `ISO_Level3_Shift`)
 * are omitted.
 */
export function hostLayoutFromSymbols(
  source: string,
  section: string,
  id: string,
  files?: ParseXkbOptions['files']
): HostLayout {
  const byZmk = new Map<string, HostLevels>()
  const fileId = files
    ? Object.keys(files).find(name => files[name] === source)
    : undefined
  for (const [xkb, keysyms] of parseXkbSymbolsSection(source, section, [], {
    files,
    fileId
  })) {
    const host = hostKeyByXkb(xkb)
    if (!host) continue
    const base = keysymToGlyph(keysyms[0] ?? 'NoSymbol')
    if (base == null) continue
    byZmk.set(host.zmk, padLevels(keysyms))
  }
  return { id, byZmk }
}

function shownPair(
  levels: HostLevels,
  alt: boolean,
  altShift: boolean
): string {
  const left = alt ? levels[2] : ''
  const right = altShift ? levels[3] : ''
  if (!left && !right) return ''
  return `${alt ? left || ALT_LEVEL_EMPTY : ''}${altShift ? right || ALT_LEVEL_EMPTY : ''}`
}

/**
 * Language columns from one or two host groups.
 * `en` is the first layout's own case pair. `second` is the other alphabet
 * when chosen. Each layout has its own AltGr pair. A pair that is the same
 * on both open languages is returned once. A pair that differs is
 * `bilingualNote` (`Δτ/ёЁ`).
 */
export function composeHostPair(
  base: HostLayout,
  second: HostLayout | null,
  token: string,
  columns: HostColumnOptions = {}
): Pick<ComposedLegend, 'en' | 'second' | 'altGr' | 'altGrShift' | 'showAltGr' | 'showAltGrShift' | 'bilingualNote' | 'bilingualAlt' | 'keycode'> | null {
  const showAlt = columns.altGr !== false
  const showAltShift = columns.altGrShift !== false
  const showSecondAlt = columns.secondAltGr ?? showAlt
  const showSecondAltShift = columns.secondAltGrShift ?? showAltShift
  const id = hostKeyByZmk(token)
  if (!id) return null
  const baseLevels = base.byZmk.get(id.zmk)
  if (!baseLevels || baseLevels[0] === '') return null
  const secondLevels = second?.byZmk.get(id.zmk)
  const baseShown = showAlt || showAltShift
  const secondShown = Boolean(secondLevels) && (showSecondAlt || showSecondAltShift)
  const basePair = shownPair(baseLevels, showAlt, showAltShift)
  const secondPair = secondLevels
    ? shownPair(secondLevels, showSecondAlt, showSecondAltShift)
    : ''
  let bilingualNote: string | undefined
  let bilingualAlt: [string, string] | undefined
  let altLevels = baseLevels
  let altOn = showAlt
  let altShiftOn = showAltShift
  if (secondLevels && baseShown && secondShown && basePair !== secondPair) {
    bilingualNote = `${basePair}/${secondPair}`
    bilingualAlt = [basePair, secondPair]
  } else if (secondLevels && secondShown && !baseShown) {
    altLevels = secondLevels
    altOn = showSecondAlt
    altShiftOn = showSecondAltShift
  }
  return {
    en: [baseLevels[0], baseLevels[1]],
    second: secondLevels ? [secondLevels[0], secondLevels[1]] : null,
    altGr: altOn ? altLevels[2] : '',
    altGrShift: altShiftOn ? altLevels[3] : '',
    showAltGr: altOn,
    showAltGrShift: altShiftOn,
    bilingualNote,
    bilingualAlt,
    keycode: `KC_${id.zmk}`
  }
}
