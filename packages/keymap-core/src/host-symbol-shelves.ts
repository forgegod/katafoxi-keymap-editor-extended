/**
 * Ordered symbol shelves for the host-layout glyph picker.
 *
 * Membership comes from `host-symbols.json` via codepoint ranges (and a fixed
 * modifier keysym list). Open shelves start with universal Signs, then
 * language-adjacent letters, then Modifiers. Everything else is collapsed by
 * script family.
 *
 * Priority when a character could match more than one open shelf: language
 * letter shelves claim letters in their ranges first; Signs takes the rest of
 * its ranges. Open shelves never share a glyph.
 */

import records from '../data/host-symbols.json' with { type: 'json' }
import {
  hostLanguage,
  type HostLanguageId,
  type HostLanguageScript
} from './host-languages.js'
import { primarySystemLayoutId } from './host-layout-catalog.js'
import { hostLayout } from './host-layout-registry.js'
import { hostSymbolByCodepoint } from './host-symbols.js'
import { deadKeySpacingGlyph } from './klc-dead.js'
import { keysymToGlyph } from './xkb-keysyms.js'

export interface HostSymbolShelfEntry {
  /**
   * Dictionary glyph, dead-key spacing mark, or empty for non-character
   * modifiers (`NoSymbol`, `Multi_key`, …). Pick still stores `keysym` when
   * `dead` is set, so spacing `^` does not become `asciicircum`.
   */
  glyph: string
  keysym: string
  /** Spacing mark for a `dead_*` keysym. */
  dead?: boolean
}

export interface HostSymbolShelf {
  id: string
  title: string
  open: boolean
  entries: readonly HostSymbolShelfEntry[]
}

type Range = readonly [number, number]

/** Basic Latin letters, Latin-1 letters, Extended-A/B, Extended Additional. */
const LATIN_RANGES: readonly Range[] = [
  [0x0041, 0x005a],
  [0x0061, 0x007a],
  [0x00c0, 0x00d6],
  [0x00d8, 0x00f6],
  [0x00f8, 0x00ff],
  [0x0100, 0x017f],
  [0x0180, 0x024f],
  [0x1e00, 0x1eff]
]

const CYRILLIC_RANGES: readonly Range[] = [
  [0x0400, 0x04ff],
  [0x0500, 0x052f]
]

const GREEK_RANGES: readonly Range[] = [
  [0x0370, 0x03ff],
  [0x1f00, 0x1fff]
]

const ARABIC_RANGES: readonly Range[] = [
  [0x0600, 0x06ff],
  [0x0750, 0x077f],
  [0x08a0, 0x08ff],
  [0xfb50, 0xfdff],
  [0xfe70, 0xfeff]
]

/** ASCII/punct, Latin-1 symbols, currency, arrows, math, super/sub, letterlike, misc-tech. */
const SIGN_RANGES: readonly Range[] = [
  [0x0020, 0x0040],
  [0x005b, 0x0060],
  [0x007b, 0x007e],
  [0x00a0, 0x00bf],
  [0x00d7, 0x00d7],
  [0x00f7, 0x00f7],
  [0x2000, 0x206f],
  [0x2070, 0x209f],
  [0x20a0, 0x20cf],
  [0x2100, 0x214f],
  [0x2150, 0x218f],
  [0x2190, 0x21ff],
  [0x2200, 0x22ff],
  [0x2300, 0x23ff]
]

const EMOJI_RANGES: readonly Range[] = [
  [0x2600, 0x26ff],
  [0x2700, 0x27bf],
  [0x1f300, 0x1faff]
]

/** Structural modifiers always listed first on the open Modifiers shelf. */
const STRUCTURAL_MODIFIER_KEYSYMS = [
  'NoSymbol',
  'Multi_key',
  'ISO_Level3_Shift',
  'ISO_Level5_Shift'
] as const

/**
 * Non-glyph keysyms shown in the Modifiers shelves. `dead_*` names are the set
 * used by vendored xkb layouts in this package; they are not dictionary rows.
 * Language-typical dead keys (from the primary system layout) sit on the open
 * Modifiers shelf; the rest are under collapsed "More dead keys".
 */
export const HOST_SYMBOL_MODIFIER_KEYSYMS: readonly string[] = Object.freeze([
  ...STRUCTURAL_MODIFIER_KEYSYMS,
  'dead_grave',
  'dead_acute',
  'dead_circumflex',
  'dead_tilde',
  'dead_macron',
  'dead_breve',
  'dead_abovedot',
  'dead_diaeresis',
  'dead_abovering',
  'dead_doubleacute',
  'dead_caron',
  'dead_cedilla',
  'dead_ogonek',
  'dead_iota',
  'dead_belowdot',
  'dead_hook',
  'dead_horn',
  'dead_stroke',
  'dead_abovecomma',
  'dead_doublegrave',
  'dead_belowcomma',
  'dead_currency',
  'dead_greek',
  'dead_a',
  'dead_A',
  'dead_e',
  'dead_E',
  'dead_i',
  'dead_I',
  'dead_o',
  'dead_O',
  'dead_u',
  'dead_U',
  'dead_hamza',
  'dead_psili',
  'dead_dasia',
  'dead_invertedbreve',
  'dead_belowring',
  'dead_belowmacron',
  'dead_belowcircumflex',
  'dead_belowbreve',
  'dead_capital_schwa'
])

type LanguageFamily = HostLanguageScript

const FAMILY_TITLES: Record<LanguageFamily, string> = {
  latin: 'Latin',
  cyrillic: 'Cyrillic',
  greek: 'Greek'
}

const FAMILY_RANGES: Record<LanguageFamily, readonly Range[]> = {
  latin: LATIN_RANGES,
  cyrillic: CYRILLIC_RANGES,
  greek: GREEK_RANGES
}

function languageFamily(language: HostLanguageId): LanguageFamily {
  return hostLanguage(language).script
}

function inRanges(codepoint: number, ranges: readonly Range[]): boolean {
  for (const [lo, hi] of ranges) {
    if (codepoint >= lo && codepoint <= hi) return true
  }
  return false
}

function isLetter(glyph: string): boolean {
  return /\p{L}/u.test(glyph)
}

function isMark(glyph: string): boolean {
  return /\p{M}/u.test(glyph)
}

function isSingleGlyph(glyph: string): boolean {
  return [...glyph].length === 1
}

/** Spaces and format controls (soft hyphen, bidi marks, zero-width) draw no ink. */
export function isUninkedHostGlyph(glyph: string): boolean {
  return /^[\p{Z}\p{C}]$/u.test(glyph)
}

function entryForCodepoint(codepoint: number): HostSymbolShelfEntry | undefined {
  const symbol = hostSymbolByCodepoint(codepoint)
  if (!symbol) return undefined
  const glyph = keysymToGlyph(symbol.keysym)
  if (glyph == null || glyph === '') return undefined
  if (!isSingleGlyph(glyph)) return undefined
  return { glyph, keysym: symbol.keysym }
}

function sortEntries(entries: HostSymbolShelfEntry[]): HostSymbolShelfEntry[] {
  return entries.sort((a, b) => {
    const ac = a.glyph.codePointAt(0) ?? 0
    const bc = b.glyph.codePointAt(0) ?? 0
    if (ac !== bc) return ac - bc
    return a.keysym.localeCompare(b.keysym)
  })
}

function modifierEntry(keysym: string): HostSymbolShelfEntry {
  const deadGlyph = deadKeySpacingGlyph(keysym)
  if (deadGlyph != null) return { glyph: deadGlyph, keysym, dead: true }
  const glyph = keysymToGlyph(keysym)
  return { glyph: glyph ?? '', keysym }
}

/** Dead accents that appear on the language's primary system layout, layout order. */
export function primaryLayoutDeadKeysyms(language: HostLanguageId): string[] {
  const layoutId = primarySystemLayoutId(language)
  const layout = layoutId ? hostLayout(layoutId) : undefined
  if (!layout) return []
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const row of layout.byZmk.values()) {
    for (const keysym of row.keysyms) {
      if (!keysym.startsWith('dead_') || seen.has(keysym)) continue
      seen.add(keysym)
      ordered.push(keysym)
    }
  }
  return ordered
}

function modifierShelfEntries(language: HostLanguageId): {
  primary: HostSymbolShelfEntry[]
  moreDead: HostSymbolShelfEntry[]
} {
  const typicalDead = primaryLayoutDeadKeysyms(language)
  const typicalSet = new Set<string>([...STRUCTURAL_MODIFIER_KEYSYMS, ...typicalDead])
  const primary = [
    ...STRUCTURAL_MODIFIER_KEYSYMS.map(modifierEntry),
    ...typicalDead.map(modifierEntry)
  ]
  const moreDead = HOST_SYMBOL_MODIFIER_KEYSYMS.filter(
    keysym => keysym.startsWith('dead_') && !typicalSet.has(keysym)
  ).map(modifierEntry)
  return { primary, moreDead }
}

interface Bucket {
  id: string
  title: string
  open: boolean
  entries: HostSymbolShelfEntry[]
}

function buildShelves(language: HostLanguageId): readonly HostSymbolShelf[] {
  const family = languageFamily(language)

  const languageBucket: Bucket = {
    id: family,
    title: FAMILY_TITLES[family],
    open: true,
    entries: []
  }
  const signsBucket: Bucket = { id: 'signs', title: 'Signs', open: true, entries: [] }
  const { primary: modifierPrimary, moreDead } = modifierShelfEntries(language)
  const modifiersBucket: Bucket = {
    id: 'modifiers',
    title: 'Modifiers',
    open: true,
    entries: modifierPrimary
  }
  const moreDeadBucket: Bucket = {
    id: 'more-dead-keys',
    title: 'More dead keys',
    open: false,
    entries: moreDead
  }

  const latinCollapsed: Bucket = { id: 'latin', title: 'Latin', open: false, entries: [] }
  const cyrillicCollapsed: Bucket = {
    id: 'cyrillic',
    title: 'Cyrillic',
    open: false,
    entries: []
  }
  const greekCollapsed: Bucket = { id: 'greek', title: 'Greek', open: false, entries: [] }
  const arabicBucket: Bucket = { id: 'arabic', title: 'Arabic', open: false, entries: [] }
  const combiningBucket: Bucket = {
    id: 'combining',
    title: 'Combining marks',
    open: false,
    entries: []
  }
  const emojiBucket: Bucket = { id: 'emoji', title: 'Emoji', open: false, entries: [] }
  const otherBucket: Bucket = {
    id: 'other-scripts',
    title: 'Other scripts',
    open: false,
    entries: []
  }

  const languageRanges = FAMILY_RANGES[family]

  for (const row of records as readonly { cp: number }[]) {
    const entry = entryForCodepoint(row.cp)
    if (!entry) continue
    const { glyph } = entry
    const cp = row.cp

    if (isMark(glyph)) {
      combiningBucket.entries.push(entry)
      continue
    }

    // Open language shelf: letters in the language-adjacent ranges only.
    if (inRanges(cp, languageRanges) && isLetter(glyph)) {
      languageBucket.entries.push(entry)
      continue
    }

    // Open Signs: universal non-letter symbols (after language claims letters).
    // Spaces and format controls have no ink, so they stay off this shelf.
    if (inRanges(cp, SIGN_RANGES) && !isLetter(glyph)) {
      if (!isUninkedHostGlyph(glyph)) signsBucket.entries.push(entry)
      continue
    }

    if (inRanges(cp, GREEK_RANGES)) {
      // Open Greek already claimed letters; leftover block glyphs go to Other.
      if (family === 'greek') otherBucket.entries.push(entry)
      else greekCollapsed.entries.push(entry)
      continue
    }

    if (inRanges(cp, ARABIC_RANGES)) {
      arabicBucket.entries.push(entry)
      continue
    }

    if (inRanges(cp, LATIN_RANGES) && isLetter(glyph)) {
      latinCollapsed.entries.push(entry)
      continue
    }

    if (inRanges(cp, CYRILLIC_RANGES) && isLetter(glyph)) {
      cyrillicCollapsed.entries.push(entry)
      continue
    }

    if (inRanges(cp, EMOJI_RANGES) || cp >= 0x1f000) {
      emojiBucket.entries.push(entry)
      continue
    }

    otherBucket.entries.push(entry)
  }

  const shelves: HostSymbolShelf[] = [
    { ...signsBucket, entries: sortEntries(signsBucket.entries) },
    { ...languageBucket, entries: sortEntries(languageBucket.entries) },
    modifiersBucket
  ]
  if (moreDeadBucket.entries.length > 0) shelves.push(moreDeadBucket)

  // Collapsed letter shelves for scripts that are not the open language family.
  if (family !== 'latin' && latinCollapsed.entries.length > 0) {
    shelves.push({ ...latinCollapsed, entries: sortEntries(latinCollapsed.entries) })
  }
  if (family !== 'cyrillic' && cyrillicCollapsed.entries.length > 0) {
    shelves.push({
      ...cyrillicCollapsed,
      entries: sortEntries(cyrillicCollapsed.entries)
    })
  }
  if (family !== 'greek' && greekCollapsed.entries.length > 0) {
    shelves.push({ ...greekCollapsed, entries: sortEntries(greekCollapsed.entries) })
  }

  for (const bucket of [arabicBucket, combiningBucket, emojiBucket, otherBucket]) {
    if (bucket.entries.length === 0) continue
    shelves.push({ ...bucket, entries: sortEntries(bucket.entries) })
  }

  return Object.freeze(
    shelves.map(shelf =>
      Object.freeze({
        ...shelf,
        entries: Object.freeze(shelf.entries.map(entry => Object.freeze({ ...entry })))
      })
    )
  )
}

const cache = new Map<HostLanguageId, readonly HostSymbolShelf[]>()

/** Ordered shelves for the host symbol picker for a column language. */
export function hostSymbolShelves(language: HostLanguageId): readonly HostSymbolShelf[] {
  let shelves = cache.get(language)
  if (!shelves) {
    shelves = buildShelves(language)
    cache.set(language, shelves)
  }
  return shelves
}
