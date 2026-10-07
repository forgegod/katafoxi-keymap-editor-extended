import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { hostKeyByXkb } from './host-key-id.js'
import { hostLayoutFromSymbols } from './host-layout.js'
import {
  hostSymbolByCodepoint,
  hostSymbolByGlyph,
  hostSymbolByKeysym
} from './host-symbols.js'
import { keysymToGlyph } from './xkb-keysyms.js'

const uaSymbols = readFileSync(
  path.resolve(fileURLToPath(new URL('../fixtures/xkb/symbols/ua', import.meta.url))),
  'utf8'
)

describe('host symbol dictionary', () => {
  it('folds Ukrainian ie spellings onto one character', () => {
    const symbol = hostSymbolByKeysym('Ukrainian_ie')
    expect(symbol?.glyph).toBe('є')
    expect(symbol?.keysym).toBe('Ukrainian_ie')
    expect(symbol?.codepoint).toBe(0x0454)
    expect(symbol?.windows).toBeUndefined()
    expect(hostSymbolByKeysym('Ukranian_je')).toBe(symbol)
    expect(hostSymbolByKeysym('U0454')).toBe(symbol)
    expect(hostSymbolByKeysym('u0454')).toBeUndefined()
    expect(hostSymbolByKeysym('0x01000454')).toBe(symbol)
    expect(hostSymbolByGlyph('є')).toBe(symbol)
    expect(hostSymbolByCodepoint(0x0454)).toBe(symbol)
  })

  it('keeps the LARK shcha truncation as an alias', () => {
    const symbol = hostSymbolByKeysym('Cyrillic_SHCHA')
    expect(symbol?.glyph).toBe('Щ')
    expect(hostSymbolByKeysym('Cyrillic_SHCH')).toBe(symbol)
    expect(keysymToGlyph('Cyrillic_SHCH')).toBe('Щ')
  })

  it('does not treat a keypad keysym as the digit character', () => {
    expect(hostSymbolByKeysym('KP_0')).toBeUndefined()
    expect(keysymToGlyph('KP_0')).toBeNull()
    expect(hostSymbolByGlyph('0')?.keysym).toBe('0')
  })

  it('keeps Latin and Cyrillic a apart', () => {
    expect(hostSymbolByGlyph('a')?.keysym).toBe('a')
    expect(hostSymbolByGlyph('а')?.keysym).toBe('Cyrillic_a')
  })

  it('reads Ukrainian ie from the system ua layout', () => {
    const layout = hostLayoutFromSymbols(uaSymbols, 'unicode', 'ua-unicode')
    const quote = hostKeyByXkb('AC11')
    expect(quote?.zmk).toBe('SQT')
    expect(layout.byZmk.get('SQT')?.glyphs).toEqual(['є', 'Є', 'э', 'Э'])
  })
})
