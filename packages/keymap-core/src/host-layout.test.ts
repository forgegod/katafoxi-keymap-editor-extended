import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  addHostLanguage,
  applyColumnLayout,
  replaceHostLanguage,
  removeHostLanguage,
  builtinLanguageProfileId,
  customHostLegendView,
  effectiveShownLayers,
  hostLegendColumns,
  hostLegendFor,
  hostLegendPreview,
  hostLegendView,
  hostLayoutsForLanguage,
  larkEnglishLayout,
  larkHostLegend,
  larkRussianLayout,
  standardHostLegendView,
  SYSTEM_US_LAYOUT_ID,
  systemEnglishLayout,
  systemRuHostLegendView,
  systemRussianLayout,
  systemGermanLayout,
  systemUkrainianLayout,
  toggleHostLanguage,
  toggleShownLayer,
  remapShownLayersAfterDelete
} from './lark-host.js'
import { SYSTEM_US_SYMBOLS } from './system-us-symbols.js'
import { parseXkbSymbolsSection } from './xkb-symbols.js'
import { keysymToGlyph } from './xkb-keysyms.js'

const xkbSymbolsDir = path.resolve(
  fileURLToPath(new URL('../fixtures/xkb/symbols', import.meta.url))
)

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
      showAltGr: true,
      showAltGrShift: true,
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
    expect(larkHostLegend('M')?.bilingualNote).toBe('ˬμ/ъЪ')
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

describe('system English us(basic)', () => {
  it('matches fixtures/xkb/symbols/us basic keys', () => {
    const fixture = readFileSync(path.join(xkbSymbolsDir, 'us'), 'utf8')
    expect(parseXkbSymbolsSection(SYSTEM_US_SYMBOLS, 'basic')).toEqual(
      parseXkbSymbolsSection(fixture, 'basic')
    )
  })

  it('uses US letters and punctuation, without AltGr', () => {
    expect(systemEnglishLayout.id).toBe(SYSTEM_US_LAYOUT_ID)
    expect(systemEnglishLayout.byZmk.get('A')).toEqual(['a', 'A', '', ''])
    expect(systemEnglishLayout.byZmk.get('E')).toEqual(['e', 'E', '', ''])
    expect(systemEnglishLayout.byZmk.get('N1')).toEqual(['1', '!', '', ''])
    expect(systemEnglishLayout.byZmk.get('SEMI')).toEqual([';', ':', '', ''])
    expect(systemEnglishLayout.byZmk.get('SLASH')).toEqual(['/', '?', '', ''])
    expect(systemEnglishLayout.byZmk.get('GRAVE')).toEqual(['`', '~', '', ''])
  })

  it('fills the first column when chosen as the English system profile', () => {
    const view = applyColumnLayout(standardHostLegendView(), 'base', SYSTEM_US_LAYOUT_ID)
    expect(view.baseId).toBe(SYSTEM_US_LAYOUT_ID)
    expect(hostLegendFor('E', view)).toMatchObject({
      en: ['e', 'E'],
      second: ['у', 'У'],
      bilingualNote: '/&ε'
    })
    expect(hostLegendFor('N1', view)?.en).toEqual(['1', '!'])
  })

  it('groups system and in-layout variants by language', () => {
    expect(hostLayoutsForLanguage('en').map(choice => choice.kind)).toEqual([
      'system',
      'in-layout'
    ])
    expect(builtinLanguageProfileId('en', 'system')).toBe('en:system')
    const russian = hostLayoutsForLanguage('ru')
    expect(russian[0]?.id).toBe('system-ru')
    expect(russian[0]?.primary).toBe(true)
    expect(russian.map(choice => choice.id)).toContain('system-ru-phonetic')
    expect(russian.at(-1)?.id).toBe('lark-ru')
    expect(russian.at(-1)?.kind).toBe('in-layout')
  })

  it('maps phonetic Q to я and typewriter slash to ё', () => {
    const phonetic = hostLegendView(standardHostLegendView(), {
      secondId: 'system-ru-phonetic'
    })
    expect(hostLegendFor('Q', phonetic)?.second).toEqual(['я', 'Я'])
    const typewriter = hostLegendView(standardHostLegendView(), {
      secondId: 'system-ru-typewriter'
    })
    expect(hostLegendFor('SLASH', typewriter)?.second?.[0]).toBe('ё')
  })
})

describe('system Russian winkeys', () => {
  const view = systemRuHostLegendView()

  it('uses common letters and winkeys punctuation', () => {
    expect(systemRussianLayout.byZmk.get('Q')).toEqual(['й', 'Й', '', ''])
    expect(systemRussianLayout.byZmk.get('A')).toEqual(['ф', 'Ф', '', ''])
    expect(systemRussianLayout.byZmk.get('GRAVE')).toEqual(['ё', 'Ё', '', ''])
    expect(systemRussianLayout.byZmk.get('N3')).toEqual(['3', '№', '', ''])
    expect(systemRussianLayout.byZmk.get('N4')).toEqual(['4', ';', '', ''])
    expect(systemRussianLayout.byZmk.get('N8')).toEqual(['8', '*', '₽', ''])
    expect(systemRussianLayout.byZmk.get('SLASH')).toEqual(['.', ',', '', ''])
    expect(systemRussianLayout.byZmk.get('BSLH')).toEqual(['\\', '/', '', ''])
    expect(systemRussianLayout.byZmk.get('MINUS')).toEqual(['-', '_', '', ''])
  })

  it('shows English first and system Russian second, both visible', () => {
    expect(view.baseId).toBe('lark-en')
    expect(view.secondId).toBe('system-ru')
    expect(view.baseVisible).toBe(true)
    expect(view.secondVisible).toBe(true)
    expect(view.altGr).toBe(false)
    expect(view.altGrShift).toBe(false)
    expect(hostLegendFor('Q', view)).toMatchObject({
      en: ['q', 'Q'],
      second: ['й', 'Й'],
      altGr: '',
      altGrShift: ''
    })
    expect(hostLegendFor('N8', view)?.second).toEqual(['8', '*'])
  })

  it('shows both AltGr pairs when LARK English and winkeys differ', () => {
    const shown = { ...view, altGr: true, altGrShift: true }
    expect(hostLegendFor('A', shown)).toMatchObject({
      en: ['a', 'A'],
      second: ['ф', 'Ф'],
      bilingualNote: '@α/'
    })
    expect(hostLegendFor('Q', shown)?.bilingualNote).toBe('øØ/')
    expect(hostLegendFor('N8', shown)?.bilingualNote).toContain('₽')
  })
})

describe('Ukrainian system layout', () => {
  it('uses Ukrainian letters on the quote key', () => {
    expect(systemUkrainianLayout.byZmk.get('SQT')?.[0]).toBe('є')
    expect(systemUkrainianLayout.byZmk.get('Q')?.[0]).toBe('й')
  })

  it('lists Ukrainian system variants and maps phonetic Q to я', () => {
    const ukrainian = hostLayoutsForLanguage('uk')
    expect(ukrainian[0]?.id).toBe('system-ua')
    expect(ukrainian[0]?.primary).toBe(true)
    expect(ukrainian.map(choice => choice.layoutName)).toEqual([
      'unicode',
      'macOS',
      'legacy',
      'winkeys',
      'typewriter',
      'phonetic',
      'homophonic'
    ])
    const phonetic = hostLegendView(addHostLanguage(standardHostLegendView(), 'uk'), {
      secondId: 'system-ua-phonetic'
    })
    expect(hostLegendFor('Q', phonetic)?.second).toEqual(['я', 'Я'])
  })

  it('adds Ukrainian and collapses Russian to a flag', () => {
    const view = addHostLanguage(standardHostLegendView(), 'uk')
    const columns = hostLegendColumns(view)
    expect(columns.map(column => [column.language, column.wide])).toEqual([
      ['en', true],
      ['ru', false],
      ['uk', true]
    ])
    expect(view.secondId).toBe('system-ua')
    expect(hostLegendFor('SQT', view)?.second?.[0]).toBe('є')
  })

  it('opens Russian again and collapses Ukrainian', () => {
    const added = addHostLanguage(standardHostLegendView(), 'uk')
    const back = toggleHostLanguage(added, 'ru')
    const columns = hostLegendColumns(back)
    expect(columns.map(column => [column.language, column.wide])).toEqual([
      ['en', true],
      ['ru', true],
      ['uk', false]
    ])
    expect(hostLegendFor('Q', back)?.second).toEqual(['й', 'Й'])
  })
})

describe('German system layout', () => {
  it('uses QWERTZ letters and ß on the minus key', () => {
    expect(systemGermanLayout.byZmk.get('A')?.slice(0, 2)).toEqual(['a', 'A'])
    expect(systemGermanLayout.byZmk.get('Y')?.[0]).toBe('z')
    expect(systemGermanLayout.byZmk.get('Z')?.[0]).toBe('y')
    expect(systemGermanLayout.byZmk.get('MINUS')?.[0]).toBe('ß')
    expect(systemGermanLayout.byZmk.get('SEMI')?.[0]).toBe('ö')
    expect(systemGermanLayout.byZmk.get('SQT')?.[0]).toBe('ä')
  })

  it('lists German system variants and maps nodeadkeys caret', () => {
    const german = hostLayoutsForLanguage('de')
    expect(german[0]?.id).toBe('system-de')
    expect(german[0]?.primary).toBe(true)
    expect(german.map(choice => choice.layoutName)).toEqual([
      'basic',
      'deadtilde',
      'nodeadkeys',
      'deadgraveacute',
      'deadacute',
      'e1',
      'e2',
      'T3',
      'dvorak',
      'neo',
      'mac',
      'mac_nodeadkeys',
      'qwerty',
      'us',
      'hu',
      'adnw',
      'koy',
      'bone',
      'bone_eszett_home',
      'neo_qwertz',
      'neo_qwerty',
      'noted'
    ])
    const nodead = hostLegendView(addHostLanguage(standardHostLegendView(), 'de'), {
      secondId: 'system-de-nodeadkeys'
    })
    expect(hostLegendFor('GRAVE', nodead)?.second?.[0]).toBe('^')
  })

  it('adds German after Ukrainian and collapses the open extra', () => {
    const uk = addHostLanguage(standardHostLegendView(), 'uk')
    const de = addHostLanguage(uk, 'de')
    expect(hostLegendColumns(de).map(column => [column.language, column.wide])).toEqual([
      ['en', true],
      ['ru', false],
      ['uk', false],
      ['de', true]
    ])
    expect(de.secondId).toBe('system-de')
    expect(hostLegendFor('Y', de)?.second?.[0]).toBe('z')
  })

  it('replaces an extra language and keeps the slot', () => {
    const uk = addHostLanguage(standardHostLegendView(), 'uk')
    const de = replaceHostLanguage(uk, 'uk', 'de')
    expect(hostLegendColumns(de).map(column => [column.language, column.wide])).toEqual([
      ['en', true],
      ['ru', false],
      ['de', true]
    ])
    expect(de.secondId).toBe('system-de')
    expect(hostLegendFor('Y', de)?.second?.[0]).toBe('z')
  })

  it('removes an extra language and reopens Russian', () => {
    const uk = addHostLanguage(standardHostLegendView(), 'uk')
    const gone = removeHostLanguage(uk, 'uk')
    expect(hostLegendColumns(gone).map(column => [column.language, column.wide])).toEqual([
      ['en', true],
      ['ru', true]
    ])
    expect(gone.secondId).toBe('lark-ru')
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

  it('hides AltGr columns without changing the layout', () => {
    const noAlt = hostLegendPreview(standard, { altGr: false, altGrShift: false })
    expect(noAlt.source).toBe('standard')
    expect(hostLegendFor('T', noAlt)).toMatchObject({
      en: ['t', 'T'],
      second: ['е', 'Е'],
      altGr: '',
      altGrShift: '',
      bilingualNote: undefined
    })

    const onlyShift = hostLegendPreview(standard, { altGr: false })
    expect(onlyShift.source).toBe('standard')
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

describe('shown layers', () => {
  const standard = standardHostLegendView()

  it('evicts the earliest marked layer when a fifth is picked', () => {
    const next = toggleShownLayer(standard, 4)
    expect(next.shownLayers).toEqual([0, 2, 3, 4])
  })

  it('never evicts layer0', () => {
    const afterFourth = toggleShownLayer(standard, 4)
    expect(afterFourth.shownLayers).toContain(0)
    const afterFifth = toggleShownLayer(afterFourth, 5)
    expect(afterFifth.shownLayers).toEqual([0, 3, 4, 5])
  })

  it('adds layer0 when exactly one non-zero layer is marked', () => {
    const view = { ...standard, shownLayers: [2] }
    expect(effectiveShownLayers(view, 4)).toEqual([0, 2])
  })

  it('keeps a single layer0 mark as one row', () => {
    const view = { ...standard, shownLayers: [0] }
    expect(effectiveShownLayers(view, 4)).toEqual([0])
  })

  it('returns to layer0 when the last eye is cleared', () => {
    expect(toggleShownLayer({ ...standard, shownLayers: [0] }, 0).shownLayers).toEqual([0])
    expect(toggleShownLayer({ ...standard, shownLayers: [3] }, 3).shownLayers).toEqual([0])
  })

  it('drops indices at or above layerCount', () => {
    expect(effectiveShownLayers(standard, 2)).toEqual([0, 1])
    const missing = { ...standard, shownLayers: undefined }
    expect(effectiveShownLayers(missing, 2)).toEqual([0, 1])
  })

  it('sorts the effective set in ascending order', () => {
    const view = { ...standard, shownLayers: [3, 1, 0] }
    expect(effectiveShownLayers(view, 4)).toEqual([0, 1, 3])
  })

  it('shifts shownLayers after a middle layer is deleted', () => {
    const view = { ...standard, shownLayers: [0, 2, 3] }
    expect(remapShownLayersAfterDelete(view, 1, 3).shownLayers).toEqual([0, 1, 2])
  })

  it('drops the deleted mark and resets layer0Raw when layer0 is removed', () => {
    const view = { ...standard, shownLayers: [0, 2], layer0Raw: true }
    const next = remapShownLayersAfterDelete(view, 0, 3)
    expect(next.shownLayers).toEqual([1])
    expect(next.layer0Raw).toBe(false)
  })

  it('falls back to layer0 when the last marked layer is deleted', () => {
    const view = { ...standard, shownLayers: [2] }
    expect(remapShownLayersAfterDelete(view, 2, 2).shownLayers).toEqual([0])
  })
})
