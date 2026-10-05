import { hostKeyByXkb, hostKeyByZmk } from './host-key-id.js'
import { deadKeySpacingGlyph } from './klc-dead.js'
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

export interface HostLayoutFromSymbolsOptions {
  /** Name `source` goes by in `files`. Looked up in `files` when omitted. */
  fileId?: string
  /** When set, a missing include throws and names the include spec. */
  strictIncludes?: boolean
  /** Append-only bag for include cycles and multi-group keys. */
  warnings?: string[]
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
  files?: ParseXkbOptions['files'],
  options: HostLayoutFromSymbolsOptions = {}
): HostLayout {
  const fileId =
    options.fileId ?? (files ? Object.keys(files).find(name => files[name] === source) : undefined)
  const byZmk = new Map<string, HostKeyLevels>()
  for (const [xkb, keysyms] of parseXkbSymbolsSection(source, section, [], {
    files,
    fileId,
    strictIncludes: options.strictIncludes,
    warnings: options.warnings
  })) {
    const host = hostKeyByXkb(xkb)
    if (!host) continue
    byZmk.set(host.zmk, levelsFromKeysyms(keysyms))
  }
  return { id, byZmk }
}

/**
 * One layout from keysym names. An unknown ZMK name is skipped. Glyphs come
 * from the keysyms through the same path as parsing, so callers never pass
 * them in. Missing levels are `NoSymbol`.
 */
export function hostLayoutFromKeysyms(
  id: string,
  entries: Iterable<readonly [string, readonly string[]]>
): HostLayout {
  const byZmk = new Map<string, HostKeyLevels>()
  for (const [zmk, keysyms] of entries) {
    const host = hostKeyByZmk(zmk)
    if (!host) continue
    byZmk.set(host.zmk, levelsFromKeysyms([...keysyms]))
  }
  return { id, byZmk }
}

/**
 * One level of one key replaced, as a new layout. The source table is left
 * alone and its `byZmk` is not reused. Glyphs come from the keysyms through
 * the same path as parsing, so callers never pass them in. A key the layout
 * has no record for is created with `NoSymbol` on the other three levels.
 * An unknown ZMK name or a level outside `0..3` returns undefined rather
 * than a junk entry; an empty keysym is stored as `NoSymbol`.
 */
export function withHostKey(
  layout: HostLayout,
  zmk: string,
  level: number,
  keysym: string
): HostLayout | undefined {
  const host = hostKeyByZmk(zmk)
  if (!host) return undefined
  if (!Number.isInteger(level) || level < 0 || level > 3) return undefined
  const current =
    layout.byZmk.get(host.zmk)?.keysyms ?? ['NoSymbol', 'NoSymbol', 'NoSymbol', 'NoSymbol']
  const keysyms = [...current]
  keysyms[level] = keysym.trim() || 'NoSymbol'
  const byZmk = new Map(layout.byZmk)
  byZmk.set(host.zmk, levelsFromKeysyms(keysyms))
  return { id: layout.id, byZmk }
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

/** One level for keycap / decode display (spacing mark for `dead_*`). */
export interface HostLevelDisplay {
  text: string
  dead: boolean
}

/**
 * Display glyph for one keysym. Dead accents use the MSKLC spacing character.
 * Composition still uses `hostComposeGlyphs` / `keysymToGlyph`, which omit dead.
 */
export function hostLevelDisplay(keysym: string): HostLevelDisplay {
  const deadGlyph = deadKeySpacingGlyph(keysym)
  if (deadGlyph != null) return { text: deadGlyph, dead: true }
  const glyph = keysymToGlyph(keysym)
  return { text: glyph && glyph.length > 0 ? glyph : '', dead: false }
}

/**
 * Four display levels for the board and decode. Undefined when the key has no
 * character and no dead accent on the base level (pure modifiers stay out).
 */
export function hostDisplayLevels(
  levels: HostKeyLevels | undefined
): readonly [HostLevelDisplay, HostLevelDisplay, HostLevelDisplay, HostLevelDisplay] | undefined {
  if (!levels) return undefined
  const row: [HostLevelDisplay, HostLevelDisplay, HostLevelDisplay, HostLevelDisplay] = [
    hostLevelDisplay(levels.keysyms[0]),
    hostLevelDisplay(levels.keysyms[1]),
    hostLevelDisplay(levels.keysyms[2]),
    hostLevelDisplay(levels.keysyms[3])
  ]
  if (!row[0].text) return undefined
  return row
}

