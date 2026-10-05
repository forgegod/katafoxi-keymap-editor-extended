import { describe, expect, it } from 'vitest'
import records from '../data/host-symbols.json' with { type: 'json' }
import { hostSymbolByGlyph } from './host-symbols.js'
import {
  hostSymbolPickValue,
  hostSymbolShelves,
  primaryLayoutDeadKeysyms,
  type HostSymbolShelf
} from './host-symbol-shelves.js'

function openShelves(shelves: HostSymbolShelf[]): HostSymbolShelf[] {
  return shelves.filter(shelf => shelf.open)
}

function shelfById(shelves: HostSymbolShelf[], id: string): HostSymbolShelf {
  const shelf = shelves.find(item => item.id === id)
  expect(shelf, id).toBeDefined()
  return shelf!
}

function glyphsOf(shelf: HostSymbolShelf): Set<string> {
  return new Set(shelf.entries.map(entry => entry.glyph).filter(glyph => glyph !== ''))
}

describe('hostSymbolShelves', () => {
  it('opens Cyrillic letters for ru and keeps Greek and Arabic out of that shelf', () => {
    const shelves = hostSymbolShelves('ru')
    const language = shelfById(shelves, 'cyrillic')
    expect(language.open).toBe(true)
    const glyphs = glyphsOf(language)
    expect(glyphs.has('а')).toBe(true)
    expect(glyphs.has('ё')).toBe(true)
    expect(glyphs.has('α')).toBe(false)
    // Dictionary has Arabic hamza; it must not sit on the open Cyrillic shelf.
    expect(hostSymbolByGlyph('ء')).toBeDefined()
    expect(glyphs.has('ء')).toBe(false)
  })

  it('opens Latin letters and diacritics for en without Cyrillic', () => {
    const shelves = hostSymbolShelves('en')
    const language = shelfById(shelves, 'latin')
    expect(language.open).toBe(true)
    const glyphs = glyphsOf(language)
    expect(glyphs.has('a')).toBe(true)
    expect(glyphs.has('é')).toBe(true)
    expect(glyphs.has('а')).toBe(false)
  })

  it('opens Cyrillic letters for bg and keeps Latin collapsed', () => {
    const shelves = hostSymbolShelves('bg')
    const language = shelfById(shelves, 'cyrillic')
    expect(language.open).toBe(true)
    const glyphs = glyphsOf(language)
    expect(glyphs.has('а')).toBe(true)
    expect(glyphs.has('ж')).toBe(true)
    expect(glyphs.has('я')).toBe(true)
    expect(glyphs.has('α')).toBe(false)
    const latin = shelfById(shelves, 'latin')
    expect(latin.open).toBe(false)
    expect(glyphsOf(latin).has('a')).toBe(true)
  })

  it('opens Greek letters for el and keeps Latin and Cyrillic collapsed', () => {
    const shelves = hostSymbolShelves('el')
    const language = shelfById(shelves, 'greek')
    expect(language.open).toBe(true)
    const glyphs = glyphsOf(language)
    expect(glyphs.has('α')).toBe(true)
    expect(glyphs.has('ω')).toBe(true)
    expect(glyphs.has('ς')).toBe(true)
    expect(glyphs.has('а')).toBe(false)
    expect(glyphs.has('a')).toBe(false)
    const latin = shelfById(shelves, 'latin')
    expect(latin.open).toBe(false)
    expect(glyphsOf(latin).has('a')).toBe(true)
    const cyrillic = shelfById(shelves, 'cyrillic')
    expect(cyrillic.open).toBe(false)
    expect(glyphsOf(cyrillic).has('а')).toBe(true)
  })

  it('puts Signs first among open shelves', () => {
    for (const language of ['en', 'ru', 'uk', 'de', 'bg', 'el'] as const) {
      const shelves = hostSymbolShelves(language)
      expect(shelves[0]?.id).toBe('signs')
      expect(shelves[0]?.open).toBe(true)
    }
  })

  it('puts currency, arrows, and math on the universal Signs shelf', () => {
    for (const language of ['en', 'ru', 'uk', 'de'] as const) {
      const signs = shelfById(hostSymbolShelves(language), 'signs')
      expect(signs.open).toBe(true)
      const glyphs = glyphsOf(signs)
      expect(glyphs.has('€') || glyphs.has('$') || glyphs.has('¥')).toBe(true)
      expect(glyphs.has('←') || glyphs.has('→') || glyphs.has('↔')).toBe(true)
      expect(glyphs.has('≠') || glyphs.has('±') || glyphs.has('×')).toBe(true)
    }
  })

  it('lists structural modifiers on the open Modifiers shelf', () => {
    const modifiers = shelfById(hostSymbolShelves('en'), 'modifiers')
    expect(modifiers.open).toBe(true)
    const keysyms = new Set(modifiers.entries.map(entry => entry.keysym))
    expect(keysyms.has('NoSymbol')).toBe(true)
    expect(keysyms.has('Multi_key')).toBe(true)
    expect(keysyms.has('ISO_Level3_Shift')).toBe(true)
    expect(keysyms.has('ISO_Level5_Shift')).toBe(true)
  })

  it('surfaces French primary dead keys with spacing glyphs on Modifiers', () => {
    const typical = primaryLayoutDeadKeysyms('fr')
    expect(typical).toContain('dead_circumflex')
    expect(typical).toContain('dead_acute')
    const modifiers = shelfById(hostSymbolShelves('fr'), 'modifiers')
    const byKeysym = new Map(modifiers.entries.map(entry => [entry.keysym, entry]))
    expect(byKeysym.get('dead_circumflex')).toMatchObject({ glyph: '^', dead: true })
    expect(byKeysym.get('dead_diaeresis')).toMatchObject({ glyph: '¨', dead: true })
    const more = shelfById(hostSymbolShelves('fr'), 'more-dead-keys')
    expect(more.open).toBe(false)
    expect(more.entries.some(entry => entry.keysym === 'dead_circumflex')).toBe(false)
    expect(more.entries.some(entry => entry.keysym === 'dead_iota')).toBe(true)
  })

  it('keeps German cedilla on Modifiers and not only under More dead keys', () => {
    const modifiers = shelfById(hostSymbolShelves('de'), 'modifiers')
    expect(modifiers.entries.some(entry => entry.keysym === 'dead_cedilla' && entry.dead)).toBe(
      true
    )
  })

  it('keeps unique glyphs across shelves within the dictionary size and open shelves filled', () => {
    const dictionarySize = (records as readonly unknown[]).length
    for (const language of ['en', 'ru', 'uk', 'de'] as const) {
      const shelves = hostSymbolShelves(language)
      const unique = new Set<string>()
      for (const shelf of shelves) {
        for (const entry of shelf.entries) {
          if (entry.glyph !== '') unique.add(entry.glyph)
        }
      }
      expect(unique.size).toBeLessThanOrEqual(dictionarySize)
      for (const shelf of openShelves(shelves)) {
        expect(shelf.entries.length, `${language}/${shelf.id}`).toBeGreaterThan(0)
      }
    }
  })

  it('gives open language shelves priority over Signs so letters are not duplicated', () => {
    // Priority: language letter ranges claim letters first; Signs only takes
    // non-letters in its ranges. Open dictionary shelves must not share a
    // glyph. Dead spacing marks on Modifiers may match a Signs character (`^`).
    for (const language of ['en', 'ru', 'bg', 'el'] as const) {
      const open = openShelves(hostSymbolShelves(language))
      const seen = new Set<string>()
      for (const shelf of open) {
        for (const entry of shelf.entries) {
          if (entry.glyph === '' || entry.dead) continue
          expect(seen.has(entry.glyph), `${language} duplicate ${entry.glyph}`).toBe(false)
          seen.add(entry.glyph)
        }
      }
      const languageShelf = open.find(
        shelf => shelf.id === 'latin' || shelf.id === 'cyrillic' || shelf.id === 'greek'
      )!
      const signs = open.find(shelf => shelf.id === 'signs')!
      expect(
        glyphsOf(languageShelf).has('a') ||
          glyphsOf(languageShelf).has('а') ||
          glyphsOf(languageShelf).has('α')
      ).toBe(true)
      expect(glyphsOf(signs).has('a')).toBe(false)
      expect(glyphsOf(signs).has('а')).toBe(false)
      expect(glyphsOf(signs).has('α')).toBe(false)
    }
  })

  it('includes German diacritics on the open Latin shelf for de', () => {
    const glyphs = glyphsOf(shelfById(hostSymbolShelves('de'), 'latin'))
    for (const glyph of ['ä', 'ö', 'ü', 'ß']) {
      expect(glyphs.has(glyph), glyph).toBe(true)
    }
  })

  it('includes Ukrainian letters on the open Cyrillic shelf for uk', () => {
    const glyphs = glyphsOf(shelfById(hostSymbolShelves('uk'), 'cyrillic'))
    for (const glyph of ['є', 'і', 'ї', 'ґ']) {
      expect(glyphs.has(glyph), glyph).toBe(true)
    }
  })

  it('keeps spaces and format controls off the open Signs shelf', () => {
    const glyphs = glyphsOf(shelfById(hostSymbolShelves('en'), 'signs'))
    expect(glyphs.has(' ')).toBe(false)
    expect(glyphs.has('\u00a0')).toBe(false)
    expect(glyphs.has('\u00ad')).toBe(false)
    expect(glyphs.has('\u200b')).toBe(false)
    expect(glyphs.has('\u200e')).toBe(false)
    expect(glyphs.has('\u201f')).toBe(true)
    expect(glyphs.has('.')).toBe(true)
  })

  it('collapses Greek and does not put combining marks on open letter shelves', () => {
    const shelves = hostSymbolShelves('en')
    const greek = shelfById(shelves, 'greek')
    expect(greek.open).toBe(false)
    expect(glyphsOf(greek).has('α')).toBe(true)

    const latin = shelfById(shelves, 'latin')
    for (const entry of latin.entries) {
      expect(/\p{M}/u.test(entry.glyph), entry.keysym).toBe(false)
    }
  })

  it('includes Bulgarian letters on the open Cyrillic shelf for bg', () => {
    const glyphs = glyphsOf(shelfById(hostSymbolShelves('bg'), 'cyrillic'))
    for (const glyph of ['а', 'ж', 'ъ', 'ь', 'ю', 'я']) {
      expect(glyphs.has(glyph), glyph).toBe(true)
    }
  })

  it('includes Greek letters on the open Greek shelf for el', () => {
    const glyphs = glyphsOf(shelfById(hostSymbolShelves('el'), 'greek'))
    for (const glyph of ['α', 'β', 'σ', 'ς', 'ω']) {
      expect(glyphs.has(glyph), glyph).toBe(true)
    }
  })

  it('returns frozen shelves and entries so cache consumers cannot mutate them', () => {
    const shelves = hostSymbolShelves('en')
    expect(Object.isFrozen(shelves)).toBe(true)
    expect(Object.isFrozen(shelves[0])).toBe(true)
    expect(Object.isFrozen(shelves[0]!.entries)).toBe(true)
    expect(Object.isFrozen(shelves[0]!.entries[0])).toBe(true)
    expect(() => {
      ;(shelves as HostSymbolShelf[]).push({
        id: 'x',
        title: 'x',
        open: false,
        entries: []
      })
    }).toThrow()
  })

  it('picks keysym for dead accents and empty glyphs, glyph otherwise', () => {
    expect(
      hostSymbolPickValue({ glyph: '^', keysym: 'dead_circumflex', dead: true })
    ).toBe('dead_circumflex')
    expect(hostSymbolPickValue({ glyph: '', keysym: 'NoSymbol' })).toBe('NoSymbol')
    expect(hostSymbolPickValue({ glyph: 'a', keysym: 'a' })).toBe('a')
    expect(hostSymbolPickValue({ glyph: '^', keysym: 'asciicircum' })).toBe('^')
  })
})
