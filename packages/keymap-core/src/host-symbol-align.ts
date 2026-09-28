import { HOST_KEY_IDS } from './host-key-id.js'
import { withHostKey, type HostKeyLevels, type HostLayout } from './host-layout.js'

/** One glyph on one physical key and shift level. */
export interface GlyphPlace {
  zmk: string
  level: 0 | 1 | 2 | 3
}

/**
 * A non-letter glyph that both layouts produce, but not on the same keys and levels.
 * Letters are omitted: a second alphabet is supposed to disagree.
 */
export interface MovedSymbol {
  glyph: string
  base: GlyphPlace[]
  extra: GlyphPlace[]
}

/**
 * AltGr or AltGr+Shift where both layouts have a symbol and they differ.
 * The combined Windows file keeps `extra` and drops `base` (empty extra keeps base).
 */
export interface AltGrConflict {
  zmk: string
  level: 2 | 3
  baseGlyph: string
  extraGlyph: string
  baseKeysym: string
  extraKeysym: string
}

export interface SymbolAlign {
  /** Moved symbols that occupy this ZMK key in either layout. */
  byZmk: ReadonlyMap<string, MovedSymbol[]>
  conflictByZmk: ReadonlyMap<string, AltGrConflict[]>
}

export interface SymbolAlignOptions {
  /**
   * Levels to compare. Levels 2 and 3 in this list also produce Windows AltGr
   * conflicts. Omitted levels are ignored, so a hidden AltGr column stays quiet.
   */
  levels?: readonly (0 | 1 | 2 | 3)[]
}

/** One AltGr / AltGr+Shift cell copied from the extra layout onto the base. */
export interface AltGrCopyEdit {
  zmk: string
  level: 2 | 3
  baseGlyph: string
  extraGlyph: string
  baseKeysym: string
  extraKeysym: string
  /** Base already had a different symbol. False means the base cell was empty. */
  overwrites: boolean
}

const ALL_LEVELS = [0, 1, 2, 3] as const

function isEmptyKeysym(name: string | undefined): boolean {
  return !name || name === 'NoSymbol' || name === 'VoidSymbol'
}

/** Single letter, including one letter plus combining marks. Punctuation and digits stay. */
function isLetterGlyph(glyph: string): boolean {
  return /^\p{L}\p{M}*$/u.test(glyph)
}

function levelKeysym(row: HostKeyLevels | undefined, level: number): string {
  return row?.keysyms[level] ?? 'NoSymbol'
}

function levelGlyph(row: HostKeyLevels | undefined, level: number): string {
  return row?.glyphs[level] ?? ''
}

function placeKey(place: GlyphPlace): string {
  return `${place.zmk}:${place.level}`
}

function samePlaces(left: GlyphPlace[], right: GlyphPlace[]): boolean {
  if (left.length !== right.length) return false
  const keys = new Set(left.map(placeKey))
  return right.every(place => keys.has(placeKey(place)))
}

function placesFor(
  layout: HostLayout,
  levels: ReadonlySet<number>
): Map<string, GlyphPlace[]> {
  const map = new Map<string, GlyphPlace[]>()
  for (const [zmk, row] of layout.byZmk) {
    for (const level of levels) {
      const glyph = row.glyphs[level]
      if (!glyph || isLetterGlyph(glyph)) continue
      const place: GlyphPlace = { zmk, level: level as GlyphPlace['level'] }
      const list = map.get(glyph)
      if (list) list.push(place)
      else map.set(glyph, [place])
    }
  }
  return map
}

function disagrees(
  base: HostKeyLevels | undefined,
  extra: HostKeyLevels | undefined,
  level: number
): boolean {
  const baseKey = levelKeysym(base, level)
  const extraKey = levelKeysym(extra, level)
  if (isEmptyKeysym(baseKey) || isEmptyKeysym(extraKey)) return false
  const baseGlyph = levelGlyph(base, level)
  const extraGlyph = levelGlyph(extra, level)
  if (baseGlyph && extraGlyph) return baseGlyph !== extraGlyph
  return baseKey !== extraKey
}

/**
 * Shared punctuation and symbols that moved, plus AltGr cells a combined
 * Windows layout cannot keep for both languages.
 */
export function symbolAlign(
  base: HostLayout,
  extra: HostLayout,
  options: SymbolAlignOptions = {}
): SymbolAlign {
  const levels = new Set<number>(options.levels ?? ALL_LEVELS)
  const basePlaces = placesFor(base, levels)
  const extraPlaces = placesFor(extra, levels)
  const byZmk = new Map<string, MovedSymbol[]>()
  for (const [glyph, baseAt] of basePlaces) {
    const extraAt = extraPlaces.get(glyph)
    if (!extraAt || samePlaces(baseAt, extraAt)) continue
    const moved: MovedSymbol = { glyph, base: baseAt, extra: extraAt }
    for (const place of [...baseAt, ...extraAt]) {
      const list = byZmk.get(place.zmk)
      if (list) {
        if (!list.includes(moved)) list.push(moved)
      } else byZmk.set(place.zmk, [moved])
    }
  }

  const conflictByZmk = new Map<string, AltGrConflict[]>()
  const zmkNames = new Set<string>([...base.byZmk.keys(), ...extra.byZmk.keys()])
  for (const zmk of zmkNames) {
    const baseRow = base.byZmk.get(zmk)
    const extraRow = extra.byZmk.get(zmk)
    const conflicts: AltGrConflict[] = []
    for (const level of [2, 3] as const) {
      if (!levels.has(level) || !disagrees(baseRow, extraRow, level)) continue
      conflicts.push({
        zmk,
        level,
        baseGlyph: levelGlyph(baseRow, level),
        extraGlyph: levelGlyph(extraRow, level),
        baseKeysym: levelKeysym(baseRow, level),
        extraKeysym: levelKeysym(extraRow, level)
      })
    }
    if (conflicts.length) conflictByZmk.set(zmk, conflicts)
  }
  return { byZmk, conflictByZmk }
}

/** Tooltip for one key. Empty when this key has neither kind of mark. */
export function symbolAlignCaption(zmk: string, align: SymbolAlign): string {
  const parts: string[] = []
  const moved = align.byZmk.get(zmk)
  if (moved?.length) {
    const glyphs = [...new Set(moved.map(item => item.glyph))]
    parts.push(`Different position: ${glyphs.join(' ')}`)
  }
  for (const conflict of align.conflictByZmk.get(zmk) ?? []) {
    const which = conflict.level === 2 ? 'AltGr' : 'AltGr+Shift'
    const kept = conflict.extraGlyph || conflict.extraKeysym
    const dropped = conflict.baseGlyph || conflict.baseKeysym
    parts.push(`Windows ${which} keeps ${kept}, drops ${dropped}`)
  }
  return parts.join('. ')
}

/**
 * AltGr and AltGr+Shift cells to copy from `extra` onto `base`.
 * An empty extra cell does not clear base. A cell that already shows the same
 * glyph is left alone. Levels 0 and 1 are never copied.
 */
export function planAltGrCopy(base: HostLayout, extra: HostLayout): AltGrCopyEdit[] {
  const edits: AltGrCopyEdit[] = []
  for (const key of HOST_KEY_IDS) {
    const baseRow = base.byZmk.get(key.zmk)
    const extraRow = extra.byZmk.get(key.zmk)
    for (const level of [2, 3] as const) {
      const extraKeysym = levelKeysym(extraRow, level)
      if (isEmptyKeysym(extraKeysym)) continue
      const baseKeysym = levelKeysym(baseRow, level)
      if (baseKeysym === extraKeysym) continue
      const baseGlyph = levelGlyph(baseRow, level)
      const extraGlyph = levelGlyph(extraRow, level)
      if (baseGlyph && extraGlyph && baseGlyph === extraGlyph) continue
      edits.push({
        zmk: key.zmk,
        level,
        baseGlyph,
        extraGlyph,
        baseKeysym,
        extraKeysym,
        overwrites: !isEmptyKeysym(baseKeysym)
      })
    }
  }
  return edits
}

/** New layout with `planAltGrCopy` applied. The source tables are not mutated. */
export function applyAltGrCopy(base: HostLayout, extra: HostLayout): HostLayout {
  let next = base
  for (const edit of planAltGrCopy(base, extra)) {
    const updated = withHostKey(next, edit.zmk, edit.level, edit.extraKeysym)
    if (updated) next = updated
  }
  return next
}

export function formatAltGrCopyLine(edit: AltGrCopyEdit): string {
  const level = edit.level === 2 ? 'AltGr' : 'AltGr+Shift'
  const from = edit.overwrites ? edit.baseGlyph || edit.baseKeysym : 'empty'
  const to = edit.extraGlyph || edit.extraKeysym
  return `${edit.zmk} ${level}: ${from} → ${to}`
}
