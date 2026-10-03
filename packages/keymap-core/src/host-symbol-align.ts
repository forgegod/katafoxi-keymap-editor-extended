import { isBasicAlignGlyph } from './host-basic-glyphs.js'
import type { HostKeyLevels, HostLayout } from './host-layout.js'
import { hostKeycapLanguages } from './host-legend-view.js'
import type { HostLanguageId } from './host-languages.js'
import type { HostLegendView } from './types.js'

/** One glyph on one physical key and shift level. */
export interface GlyphPlace {
  zmk: string
  level: 0 | 1 | 2 | 3
}

export type SymbolAlignSeverity = 'basic' | 'ornament'

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
  severity: SymbolAlignSeverity
}

/**
 * Basic typewriter mark on this key in only one of the two layouts.
 * Independent of a shared place elsewhere (Linux split / per-key gap).
 */
export interface KeyGapSymbol {
  glyph: string
  /** Which side of the compare pair has the glyph on this key. */
  side: 'base' | 'extra'
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
  /** Basic marks present on this key in only one language. */
  keyGapByZmk: ReadonlyMap<string, KeyGapSymbol[]>
  conflictByZmk: ReadonlyMap<string, AltGrConflict[]>
}

export interface SymbolAlignOptions {
  /**
   * Levels for position marks (`Different position` / `Only in one language`).
   * Defaults to all four. Does not gate Win AltGr when `winMerge` is set.
   */
  levels?: readonly (0 | 1 | 2 | 3)[]
  /**
   * Ordered pair for Windows AltGr conflict marks (extra wins in the combined
   * file). `undefined` uses `left`/`right` and only levels 2–3 that appear in
   * `levels` (legacy). `null` skips Win AltGr marks.
   */
  winMerge?: { base: HostLayout; extra: HostLayout } | null
}

/**
 * Two keycap languages to compare for Highlight symbol differences.
 * Win AltGr merge marks apply only when English and `open` are both drawn.
 */
export interface SymbolAlignViewPair {
  leftLanguage: HostLanguageId
  rightLanguage: HostLanguageId
  leftLayoutId: string
  rightLayoutId: string
  /** English × `open` when both sit on the keycap; else null. */
  winMerge: { baseLayoutId: string; extraLayoutId: string } | null
}

/**
 * Pair for Differences: the two languages drawn on the key, not the install
 * `open` slot alone. Null until two keycap languages are shown.
 */
export function symbolAlignPairFromView(view: HostLegendView): SymbolAlignViewPair | null {
  const keycap = hostKeycapLanguages(view)
  if (keycap.length < 2) return null
  const leftLanguage = keycap[0]!
  const rightLanguage = keycap[1]!
  const leftCol = view.columns.find(column => column.language === leftLanguage)
  const rightCol = view.columns.find(column => column.language === rightLanguage)
  if (!leftCol || !rightCol) return null
  const baseCol = view.columns[0]
  const open = view.open
  const openCol = open ? view.columns.find(column => column.language === open) : undefined
  const winMerge =
    baseCol &&
    openCol &&
    keycap.includes(baseCol.language) &&
    keycap.includes(openCol.language)
      ? { baseLayoutId: baseCol.layoutId, extraLayoutId: openCol.layoutId }
      : null
  return {
    leftLanguage,
    rightLanguage,
    leftLayoutId: leftCol.layoutId,
    rightLayoutId: rightCol.layoutId,
    winMerge
  }
}

const ALL_LEVELS = [0, 1, 2, 3] as const

function isEmptyKeysym(name: string | undefined): boolean {
  return !name || name === 'NoSymbol' || name === 'VoidSymbol'
}

/** Single letter, including one letter plus combining marks. Punctuation and digits stay. */
function isLetterGlyph(glyph: string): boolean {
  return /^\p{L}\p{M}*$/u.test(glyph)
}

function severityOf(glyph: string): SymbolAlignSeverity {
  return isBasicAlignGlyph(glyph) ? 'basic' : 'ornament'
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

/** Basic typewriter glyphs on one key across the compared levels. */
function basicGlyphsOnKey(
  layout: HostLayout,
  zmk: string,
  levels: ReadonlySet<number>
): Set<string> {
  const found = new Set<string>()
  const row = layout.byZmk.get(zmk)
  if (!row) return found
  for (const level of levels) {
    const glyph = row.glyphs[level]
    if (glyph && isBasicAlignGlyph(glyph)) found.add(glyph)
  }
  return found
}

function keyGapsFor(
  left: HostLayout,
  right: HostLayout,
  levels: ReadonlySet<number>
): Map<string, KeyGapSymbol[]> {
  const keyGapByZmk = new Map<string, KeyGapSymbol[]>()
  const zmkNames = new Set<string>([...left.byZmk.keys(), ...right.byZmk.keys()])
  for (const zmk of zmkNames) {
    const leftBasics = basicGlyphsOnKey(left, zmk, levels)
    const rightBasics = basicGlyphsOnKey(right, zmk, levels)
    const gaps: KeyGapSymbol[] = []
    for (const glyph of leftBasics) {
      if (!rightBasics.has(glyph)) gaps.push({ glyph, side: 'base' })
    }
    for (const glyph of rightBasics) {
      if (!leftBasics.has(glyph)) gaps.push({ glyph, side: 'extra' })
    }
    if (gaps.length) keyGapByZmk.set(zmk, gaps)
  }
  return keyGapByZmk
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

function altGrConflicts(
  base: HostLayout,
  extra: HostLayout,
  levels: ReadonlySet<number>
): Map<string, AltGrConflict[]> {
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
  return conflictByZmk
}

/**
 * Non-letter glyphs with no shared key and level, per-key basic gaps, plus
 * optional AltGr cells a combined Windows layout cannot keep for both languages.
 * A glyph both languages produce on the same key and level stays quiet for the
 * global move pass, even when other copies differ; basic extras on one key still
 * mark a key gap.
 */
export function symbolAlign(
  left: HostLayout,
  right: HostLayout,
  options: SymbolAlignOptions = {}
): SymbolAlign {
  const levels = new Set<number>(options.levels ?? ALL_LEVELS)
  const leftPlaces = placesFor(left, levels)
  const rightPlaces = placesFor(right, levels)
  const byZmk = new Map<string, MovedSymbol[]>()
  for (const [glyph, leftAt] of leftPlaces) {
    const rightAt = rightPlaces.get(glyph)
    if (!rightAt) {
      recordMoved(byZmk, { glyph, base: leftAt, extra: [], severity: severityOf(glyph) })
      continue
    }
    if (sharesPlace(leftAt, rightAt)) continue
    recordMoved(byZmk, {
      glyph,
      base: leftAt,
      extra: rightAt,
      severity: severityOf(glyph)
    })
  }
  for (const [glyph, rightAt] of rightPlaces) {
    if (leftPlaces.has(glyph)) continue
    recordMoved(byZmk, { glyph, base: [], extra: rightAt, severity: severityOf(glyph) })
  }

  const keyGapByZmk = keyGapsFor(left, right, levels)

  let conflictByZmk = new Map<string, AltGrConflict[]>()
  if (options.winMerge === null) {
    // Position-only helper: skip Windows merge marks.
  } else if (options.winMerge) {
    conflictByZmk = altGrConflicts(options.winMerge.base, options.winMerge.extra, new Set([2, 3]))
  } else {
    conflictByZmk = altGrConflicts(left, right, levels)
  }
  return { byZmk, keyGapByZmk, conflictByZmk }
}

/** True when this key has a serious basic mark (global or per-key gap). */
export function symbolAlignHasBasic(zmk: string, align: SymbolAlign): boolean {
  if (align.keyGapByZmk.has(zmk)) return true
  return (align.byZmk.get(zmk) ?? []).some(item => item.severity === 'basic')
}

/** True when this key has only-ornament position drift (no basic mark). */
export function symbolAlignHasOrnament(zmk: string, align: SymbolAlign): boolean {
  return (align.byZmk.get(zmk) ?? []).some(item => item.severity === 'ornament')
}

/** Tooltip for one key. Empty when this key has neither kind of mark. */
export function symbolAlignCaption(zmk: string, align: SymbolAlign): string {
  const parts: string[] = []
  const moved = align.byZmk.get(zmk)
  if (moved?.length) {
    const split: string[] = []
    const onlyBasic: string[] = []
    const onlyOrnament: string[] = []
    for (const item of moved) {
      if (item.base.length > 0 && item.extra.length > 0) {
        if (!split.includes(item.glyph)) split.push(item.glyph)
        continue
      }
      const list = item.severity === 'basic' ? onlyBasic : onlyOrnament
      if (!list.includes(item.glyph)) list.push(item.glyph)
    }
    if (split.length) parts.push(`Different position: ${split.join(' ')}`)
    if (onlyBasic.length) {
      parts.push(`Only in one language (Linux split): ${onlyBasic.join(' ')}`)
    }
    if (onlyOrnament.length) parts.push(`Only in one language: ${onlyOrnament.join(' ')}`)
  }
  const gaps = align.keyGapByZmk.get(zmk)
  if (gaps?.length) {
    const glyphs: string[] = []
    for (const gap of gaps) {
      if (!glyphs.includes(gap.glyph)) glyphs.push(gap.glyph)
    }
    // Skip glyphs already explained as global only-in-one / different position.
    const movedGlyphs = new Set((moved ?? []).map(item => item.glyph))
    const novel = glyphs.filter(glyph => !movedGlyphs.has(glyph))
    if (novel.length) parts.push(`On this key only in one language: ${novel.join(' ')}`)
  }
  for (const conflict of align.conflictByZmk.get(zmk) ?? []) {
    const which = conflict.level === 2 ? 'AltGr' : 'AltGr+Shift'
    const kept = conflict.extraGlyph || conflict.extraKeysym
    const dropped = conflict.baseGlyph || conflict.baseKeysym
    parts.push(`Windows ${which} keeps ${kept}, drops ${dropped}`)
  }
  return parts.join(' · ')
}
