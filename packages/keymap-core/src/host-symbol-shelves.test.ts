import { describe, expect, it } from 'vitest'
import records from '../data/host-symbols.json' with { type: 'json' }
import { hostSymbolByGlyph } from './host-symbols.js'
import { hostSymbolShelves, type HostSymbolShelf } from './host-symbol-shelves.js'

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

  it('lists NoSymbol and dead_acute in the Modifiers section', () => {
    const modifiers = shelfById(hostSymbolShelves('en'), 'modifiers')
    expect(modifiers.open).toBe(true)
    const keysyms = new Set(modifiers.entries.map(entry => entry.keysym))
    expect(keysyms.has('NoSymbol')).toBe(true)
    expect(keysyms.has('dead_acute')).toBe(true)
    expect(keysyms.has('Multi_key')).toBe(true)
    expect(keysyms.has('ISO_Level3_Shift')).toBe(true)
    expect(keysyms.has('ISO_Level5_Shift')).toBe(true)
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
    // non-letters in its ranges. Open shelves must not share a glyph.
    for (const language of ['en', 'ru'] as const) {
      const open = openShelves(hostSymbolShelves(language))
      const seen = new Set<string>()
      for (const shelf of open) {
        for (const entry of shelf.entries) {
          if (entry.glyph === '') continue
          expect(seen.has(entry.glyph), `${language} duplicate ${entry.glyph}`).toBe(false)
          seen.add(entry.glyph)
        }
      }
      const languageShelf = open.find(shelf => shelf.id === 'latin' || shelf.id === 'cyrillic')!
      const signs = open.find(shelf => shelf.id === 'signs')!
      expect(glyphsOf(languageShelf).has('a') || glyphsOf(languageShelf).has('а')).toBe(true)
      expect(glyphsOf(signs).has('a')).toBe(false)
      expect(glyphsOf(signs).has('а')).toBe(false)
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
})
