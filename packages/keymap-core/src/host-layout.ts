import { hostKeyByXkb, hostKeyByZmk } from './host-key-id.js'
import type { ComposedLegend } from './types.js'
import { parseXkbSymbolsSection, type ParseXkbOptions } from './xkb-symbols.js'
import { keysymToGlyph } from './xkb-keysyms.js'

/** Four glyphs: base, Shift, AltGr, AltGr+Shift. Empty string is NoSymbol or a non-character. */
export type HostLevels = readonly [string, string, string, string]

/** Four keysym names. Missing levels are the explicit name `'NoSymbol'`. */
export type HostKeysyms = readonly [string, string, string, string]

/** Parsed levels: original keysyms plus the glyphs derived from them. */
export interface HostKeyLevels {
  keysyms: HostKeysyms
  glyphs: HostLevels
}

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
  byZmk: ReadonlyMap<string, HostKeyLevels>
}

function padKeysyms(keysyms: string[]): [string, string, string, string] {
  return [
    keysyms[0] ?? 'NoSymbol',
    keysyms[1] ?? 'NoSymbol',
    keysyms[2] ?? 'NoSymbol',
    keysyms[3] ?? 'NoSymbol'
  ]
}

/** Names and `U` / `0x01` spellings resolve through the host symbol dictionary. */
function levelsFromKeysyms(keysyms: string[]): HostKeyLevels {
  const padded = padKeysyms(keysyms)
  const glyphs = padded.map(name => keysymToGlyph(name) ?? '')
  return {
    keysyms: padded,
    glyphs: [glyphs[0], glyphs[1], glyphs[2], glyphs[3]]
  }
}

/**
 * Host keys in one symbols section, joined to canonical ZMK names.
 * Non-character bases (`Multi_key`, `ISO_Level3_Shift`, `dead_*`) stay in
 * the table with an empty base glyph; composition filters them.
 */
export function hostLayoutFromSymbols(
  source: string,
  section: string,
  id: string,
  files?: ParseXkbOptions['files']
): HostLayout {
  const byZmk = new Map<string, HostKeyLevels>()
  const fileId = files
    ? Object.keys(files).find(name => files[name] === source)
    : undefined
  for (const [xkb, keysyms] of parseXkbSymbolsSection(source, section, [], {
    files,
    fileId
  })) {
    const host = hostKeyByXkb(xkb)
    if (!host) continue
    byZmk.set(host.zmk, levelsFromKeysyms(keysyms))
  }
  return { id, byZmk }
}

/**
 * Glyphs used by composition. Non-character bases (`dead_*`, `Multi_key`)
 * are absent; explicit `NoSymbol` stays as empty glyphs.
 */
export function hostComposeGlyphs(levels: HostKeyLevels | undefined): HostLevels | undefined {
  if (!levels) return undefined
  if (keysymToGlyph(levels.keysyms[0]) == null) return undefined
  return levels.glyphs
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
  const baseLevels = hostComposeGlyphs(base.byZmk.get(id.zmk))
  if (!baseLevels || baseLevels[0] === '') return null
  const secondLevels = hostComposeGlyphs(second?.byZmk.get(id.zmk))
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
