import { describe, expect, it } from 'vitest'
import {
  customHostLegendView,
  hostLegendFor,
  hostLegendPreview,
  hostLegendView,
  larkEnglishLayout,
  larkHostLegend,
  larkRussianLayout,
  standardHostLegendView
} from './lark-host.js'
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
      en: ['a', 'A'],
      second: ['ф', 'Ф'],
      altGr: '@',
      altGrShift: 'α',
      bilingualNote: undefined,
      keycode: 'KC_A'
    })
  })

  it('keeps an empty AltGr cell empty', () => {
    expect(larkHostLegend('J')).toMatchObject({
      en: ['j', 'J'],
      second: ['о', 'О'],
      altGr: '',
      altGrShift: 'ξ'
    })
  })

  it('records the three LARK divergences', () => {
    expect(larkHostLegend('T')?.bilingualNote).toBe('Δτ/ёЁ')
    expect(larkHostLegend('M')?.bilingualNote).toBe('μ/ъЪ')
    expect(larkHostLegend('GRAVE')?.bilingualNote).toBe('/ёЁ')
    expect(larkHostLegend('O')?.second).toEqual(['щ', 'Щ'])
  })

  it('splits E into language and AltGr columns', () => {
    expect(larkHostLegend('E')).toMatchObject({
      en: ['e', 'E'],
      second: ['у', 'У'],
      altGr: '&',
      altGrShift: 'ε'
    })
  })

  it('skips modifier keysyms and keys outside the host block', () => {
    expect(larkEnglishLayout.byZmk.has('RALT')).toBe(false)
    expect(larkEnglishLayout.byZmk.has('RWIN')).toBe(false)
    expect(larkHostLegend('ESC')).toBeNull()
    expect(larkHostLegend('COLON')).toBeNull()
  })
})

describe('host legend view', () => {
  const standard = standardHostLegendView()

  it('drops the second language back to the base shift', () => {
    const view = hostLegendView(standard, { secondId: null })
    expect(view.source).toBe('custom')
    expect(hostLegendFor('A', view)).toMatchObject({
      en: ['a', 'A'],
      second: null,
      altGr: '@',
      altGrShift: 'α',
      bilingualNote: undefined
    })
  })

  it('hides AltGr columns independently', () => {
    const noAlt = hostLegendView(standard, { altGr: false, altGrShift: false })
    expect(hostLegendFor('T', noAlt)).toMatchObject({
      en: ['t', 'T'],
      second: ['е', 'Е'],
      altGr: '',
      altGrShift: '',
      bilingualNote: undefined
    })

    const onlyShift = hostLegendView(standard, { altGr: false })
    expect(hostLegendFor('E', onlyShift)).toMatchObject({
      altGr: '',
      altGrShift: 'ε'
    })
  })

  it('uses Russian as the base alphabet', () => {
    const view = hostLegendView(standard, { baseId: 'lark-ru', secondId: null })
    expect(hostLegendFor('A', view)?.en).toEqual(['ф', 'Ф'])
    expect(hostLegendFor('A', view)?.second).toBeNull()
  })

  it('returns to standard when the pick matches the LARK preset', () => {
    const declined = hostLegendView(standard, { secondId: null })
    expect(hostLegendView(declined, { secondId: 'lark-ru' }).source).toBe('standard')
  })

  it('refuses a second language that repeats the first', () => {
    expect(hostLegendView(standard, { secondId: 'lark-en' }).secondId).toBeNull()
  })

  it('marks the current languages as custom without changing them', () => {
    expect(customHostLegendView(standard)).toEqual({ ...standard, source: 'custom' })
  })

  it('toggles preview visibility without changing source', () => {
    const hidden = hostLegendPreview(standard, { secondVisible: false })
    expect(hidden.source).toBe('standard')
    expect(hidden.secondId).toBe('lark-ru')
    expect(hidden.secondVisible).toBe(false)
  })
})
