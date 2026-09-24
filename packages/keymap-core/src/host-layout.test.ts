import { describe, expect, it } from 'vitest'
import { larkEnglishLayout, larkHostLegend, larkRussianLayout } from './lark-host.js'
import { parseXkbSymbolsSection } from './xkb-symbols.js'
import { keysymToGlyph } from './xkb-keysyms.js'

describe('parseXkbSymbolsSection', () => {
  it('reads four levels and ignores a commented key', () => {
    const source = `
      xkb_symbols "basic" {
        // key <LSGT> {[ less, greater ]};
        key <AC01> {[ a, A, at, Greek_alpha ]};
        key <RALT> {
          type[Group1]="TWO_LEVEL",
          [ ISO_Level3_Shift, Multi_key ]
        };
      };
      xkb_symbols "other" {
        key <AC01> {[ b, B, NoSymbol, NoSymbol ]};
      };
    `
    expect(parseXkbSymbolsSection(source, 'basic').get('AC01')).toEqual([
      'a',
      'A',
      'at',
      'Greek_alpha'
    ])
    expect(parseXkbSymbolsSection(source, 'basic').has('LSGT')).toBe(false)
    expect(parseXkbSymbolsSection(source, 'other').get('AC01')).toEqual([
      'b',
      'B',
      'NoSymbol',
      'NoSymbol'
    ])
  })
})

describe('keysymToGlyph', () => {
  it('maps LARK names and unicode keysyms', () => {
    expect(keysymToGlyph('at')).toBe('@')
    expect(keysymToGlyph('Greek_alpha')).toBe('α')
    expect(keysymToGlyph('Cyrillic_ef')).toBe('ф')
    expect(keysymToGlyph('Cyrillic_SHCH')).toBe('Щ')
    expect(keysymToGlyph('numerosign')).toBe('№')
    expect(keysymToGlyph('notequal')).toBe('≠')
    expect(keysymToGlyph('NoSymbol')).toBe('')
    expect(keysymToGlyph('U20BD')).toBe('₽')
    expect(keysymToGlyph('0x01000451')).toBe('ё')
    expect(keysymToGlyph('Multi_key')).toBeNull()
  })
})

describe('lark host layouts', () => {
  it('joins AC01 to A / ф and keeps shared AltGr', () => {
    expect(larkEnglishLayout.byZmk.get('A')).toEqual(['a', 'A', '@', 'α'])
    expect(larkRussianLayout.byZmk.get('A')).toEqual(['ф', 'Ф', '@', 'α'])
    expect(larkHostLegend('KC_A')).toEqual({
      primary: ['a', 'Ф'],
      altGr: ['@', 'α'],
      bilingualNote: undefined,
      keycode: 'KC_A'
    })
  })

  it('uses ˬ for an empty AltGr level', () => {
    expect(larkHostLegend('J')).toMatchObject({
      primary: ['j', 'О'],
      altGr: ['ˬ', 'ξ']
    })
  })

  it('records the three LARK divergences', () => {
    expect(larkHostLegend('T')?.bilingualNote).toBe('Δτ/ёЁ')
    expect(larkHostLegend('M')?.bilingualNote).toBe('ˬμ/ъЪ')
    expect(larkHostLegend('GRAVE')?.bilingualNote).toBe('ˬˬ/ёЁ')
    expect(larkHostLegend('O')?.primary).toEqual(['o', 'Щ'])
  })

  it('skips modifier keysyms and keys outside the host block', () => {
    expect(larkEnglishLayout.byZmk.has('RALT')).toBe(false)
    expect(larkEnglishLayout.byZmk.has('RWIN')).toBe(false)
    expect(larkHostLegend('ESC')).toBeNull()
    expect(larkHostLegend('COLON')).toBeNull()
  })
})
