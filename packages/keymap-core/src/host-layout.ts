import { hostKeyByXkb } from './host-key-id.js'
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

