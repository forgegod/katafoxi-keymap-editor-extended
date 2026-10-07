import { describe, expect, it } from 'vitest'
import records from '../data/host-symbols.json' with { type: 'json' }
import { hostSymbolByGlyph } from './host-symbols.js'
import { glyphToKeysym, keysymToGlyph } from './xkb-keysyms.js'

/** Unwraps a result the test expects to succeed. */
function keysym(text: string): string {
  const result = glyphToKeysym(text)
  expect(result, text).toMatchObject({ ok: true })
  return result.ok ? result.keysym : ''
}

const DICTIONARY_GLYPHS = (records as readonly { cp: number }[]).map(row =>
  String.fromCodePoint(row.cp)
)

describe('glyphToKeysym', () => {
  it('round-trips every dictionary character through keysymToGlyph', () => {
    expect(DICTIONARY_GLYPHS.length).toBeGreaterThan(5000)
    const broken = DICTIONARY_GLYPHS.filter(glyph => keysymToGlyph(keysym(glyph)) !== glyph)
    expect(broken).toEqual([])
  })

  it('prefers the dictionary name over the numeric spelling', () => {
    expect(keysym('ё')).toBe('Cyrillic_io')
    expect(keysym('є')).toBe('Ukrainian_ie')
    expect(keysym('@')).toBe('at')
    expect(keysym(' ')).toBe('space')
  })

  it('keeps Latin and Cyrillic a apart', () => {
    expect(keysym('a')).toBe('a')
    expect(keysym('а')).toBe('Cyrillic_a')
    expect(keysym('a')).not.toBe(keysym('а'))
  })

  it('spells a character the dictionary does not know as U%04X', () => {
    for (const [glyph, spelling] of [
      ['☕', 'U2615'],
      ['🙂', 'U1F642']
    ] as const) {
      expect(hostSymbolByGlyph(glyph), glyph).toBeUndefined()
      expect(keysym(glyph)).toBe(spelling)
      expect(keysymToGlyph(spelling)).toBe(glyph)
    }
  })

  it('reads an empty field as NoSymbol', () => {
    expect(keysym('')).toBe('NoSymbol')
  })

  it('returns a keysym name as typed', () => {
    for (const name of [
      'dead_acute',
      'Multi_key',
      'NoSymbol',
      'ISO_Level3_Shift',
      'ISO_Level5_Shift',
      'Cyrillic_io',
      'Ukranian_je',
      'space',
      'U0451',
      '0x01000451'
    ]) {
      expect(keysym(name), name).toBe(name)
    }
  })

  it('rejects anything that is not one character', () => {
    expect(glyphToKeysym('ab')).toEqual({ ok: false, reason: 'multiple-code-points' })
    expect(glyphToKeysym('e\u0301')).toEqual({ ok: false, reason: 'multiple-code-points' })
    expect(glyphToKeysym('й ')).toEqual({ ok: false, reason: 'multiple-code-points' })
    expect(glyphToKeysym('\ud83d\ude42\ud83d\ude42')).toEqual({
      ok: false,
      reason: 'multiple-code-points'
    })
    expect(glyphToKeysym('\ud83d')).toEqual({ ok: false, reason: 'lone-surrogate' })
    expect(glyphToKeysym('\ude42')).toEqual({ ok: false, reason: 'lone-surrogate' })
  })

  it('accepts the precomposed character behind a combining sequence', () => {
    expect(keysym('\u00e9')).toBe('eacute')
    expect(keysymToGlyph('eacute')).toBe('\u00e9')
  })
})
