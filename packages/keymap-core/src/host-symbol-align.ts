import type { HostKeyLevels, HostLayout } from './host-layout.js'

/** One glyph on one physical key and shift level. */
export interface GlyphPlace {
  zmk: string
  level: 0 | 1 | 2 | 3
}

/**
 * A non-letter glyph with no key and level shared by both layouts.
 * `base` or `extra` is empty when only one language produces the glyph.
 * Letters are omitted: a second alphabet is supposed to disagree.
 * Extra copies stay out once any one place is shared.
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

function sharesPlace(left: GlyphPlace[], right: GlyphPlace[]): boolean {
  if (left.length === 0 || right.length === 0) return false
  const keys = new Set(left.map(placeKey))
  return right.some(place => keys.has(placeKey(place)))
}

function recordMoved(byZmk: Map<string, MovedSymbol[]>, moved: MovedSymbol): void {
  for (const place of [...moved.base, ...moved.extra]) {
    const list = byZmk.get(place.zmk)
    if (list) {
      if (!list.includes(moved)) list.push(moved)
    } else byZmk.set(place.zmk, [moved])
  }
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
 * Non-letter glyphs with no shared key and level, plus AltGr cells a combined
 * Windows layout cannot keep for both languages.
 * A glyph both languages produce on the same key and level stays quiet, even
 * when the other copies differ. A glyph missing from one language is marked.
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
    if (!extraAt) {
      recordMoved(byZmk, { glyph, base: baseAt, extra: [] })
      continue
    }
    if (sharesPlace(baseAt, extraAt)) continue
    recordMoved(byZmk, { glyph, base: baseAt, extra: extraAt })
  }
  for (const [glyph, extraAt] of extraPlaces) {
    if (basePlaces.has(glyph)) continue
    recordMoved(byZmk, { glyph, base: [], extra: extraAt })
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
    const split: string[] = []
    const only: string[] = []
    for (const item of moved) {
      const list = item.base.length > 0 && item.extra.length > 0 ? split : only
      if (!list.includes(item.glyph)) list.push(item.glyph)
    }
    if (split.length) parts.push(`Different position: ${split.join(' ')}`)
    if (only.length) parts.push(`Only in one language: ${only.join(' ')}`)
  }
  for (const conflict of align.conflictByZmk.get(zmk) ?? []) {
    const which = conflict.level === 2 ? 'AltGr' : 'AltGr+Shift'
    const kept = conflict.extraGlyph || conflict.extraKeysym
    const dropped = conflict.baseGlyph || conflict.baseKeysym
    parts.push(`Windows ${which} keeps ${kept}, drops ${dropped}`)
  }
  return parts.join(' · ')
}
