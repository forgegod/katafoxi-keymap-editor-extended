import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { hostComposeGlyphs, hostLayoutFromSymbols } from './host-layout.js'
import { registerLarkHostFixture } from './testing/lark-host.js'
import { hostLegendFor, keycapColumns } from './compose.js'
import {
  catalogLayoutsForLanguage,
  SYSTEM_DE_LAYOUT_ID,
  SYSTEM_RU_LAYOUT_ID,
  SYSTEM_UA_LAYOUT_ID,
  SYSTEM_US_LAYOUT_ID
} from './host-layout-catalog.js'
import { hostLayout, hostLevels } from './host-layout-registry.js'
import {
  addHostLanguage,
  assignHostLanguageLayout,
  hostLegendColumns,
  removeHostLanguage,
  replaceHostLanguage,
  setHostColumnAlt,
  standardHostLegendView,
  toggleHostLanguage
} from './host-legend-view.js'
import type { HostLegendView } from './types.js'
import { SYSTEM_US_SYMBOLS } from './system-us-symbols.js'
import { parseXkbSymbolsSection } from './xkb-symbols.js'
import { keysymToGlyph } from './xkb-keysyms.js'

function extraPair(legend: NonNullable<ReturnType<typeof hostLegendFor>>) {
  return legend.columns.find(column => column.tone === 'second' && column.onKeycap)?.pair ?? null
}

function altNote(legend: NonNullable<ReturnType<typeof hostLegendFor>>): string | undefined {
  const alt = keycapColumns(legend).find(column => column.kind === 'alt')
  return alt?.pieces.map(piece => piece.text).join('')
}

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
    expect(keysymToGlyph('dead_acute')).toBeNull()
  })
})

function larkView(): HostLegendView {
  registerLarkHostFixture()
  return assignHostLanguageLayout(
    assignHostLanguageLayout(standardHostLegendView(), 'en', 'lark-en'),
    'ru',
    'lark-ru'
  )
}

describe('lark host layouts', () => {
  it('joins AC01 to A / ф and keeps shared AltGr', () => {
    registerLarkHostFixture()
    expect(hostLayout('lark-en')?.byZmk.get('A')?.glyphs).toEqual(['a', 'A', '@', 'α'])
    expect(hostLayout('lark-ru')?.byZmk.get('A')?.glyphs).toEqual(['ф', 'Ф', '@', 'α'])
    expect(hostLegendFor('KC_A', larkView())).toEqual({
      columns: [
        {
          language: 'en',
          tone: 'base',
          pair: ['a', 'A'],
          altGr: '@',
          altGrShift: 'α',
          showAltGr: true,
          showAltGrShift: true,
          onKeycap: true
        },
        {
          language: 'ru',
          tone: 'second',
          pair: ['ф', 'Ф'],
          altGr: '@',
          altGrShift: 'α',
          showAltGr: true,
          showAltGrShift: true,
          onKeycap: true
        }
      ],
      keycode: 'KC_A'
    })
  })

  it('keeps an empty AltGr cell empty', () => {
    expect(hostLegendFor('J', larkView())).toMatchObject({
      columns: [
        { language: 'en', pair: ['j', 'J'], altGr: '', altGrShift: 'ξ' },
        { language: 'ru', pair: ['о', 'О'] }
      ]
    })
  })

  it('records the three LARK divergences', () => {
    expect(altNote(hostLegendFor('T', larkView())!)).toBe('Δτ/ёЁ')
    expect(altNote(hostLegendFor('M', larkView())!)).toBe('ˬμ/ъЪ')
    expect(altNote(hostLegendFor('GRAVE', larkView())!)).toBe('/ёЁ')
    expect(extraPair(hostLegendFor('O', larkView())!)).toEqual(['щ', 'Щ'])
  })

  it('splits E into language and AltGr columns', () => {
    expect(hostLegendFor('E', larkView())).toMatchObject({
      columns: [
        { language: 'en', pair: ['e', 'E'], altGr: '&', altGrShift: 'ε' },
        { language: 'ru', pair: ['у', 'У'] }
      ]
    })
  })

  it('keeps non-character bases in the table and skips them in composition', () => {
    const layout = hostLayoutFromSymbols(
      `
      xkb_symbols "basic" {
        key <AC01> {[ a, A, at, Greek_alpha ]};
        key <RALT> {[ ISO_Level3_Shift, Multi_key ]};
        key <TLDE> {[ dead_circumflex, degree, U2032, U2033 ]};
      };
    `,
      'basic',
      'test-nonchar'
    )
    expect(layout.byZmk.get('RALT')).toEqual({
      keysyms: ['ISO_Level3_Shift', 'Multi_key', 'NoSymbol', 'NoSymbol'],
      glyphs: ['', '', '', '']
    })
    expect(layout.byZmk.get('GRAVE')).toEqual({
      keysyms: ['dead_circumflex', 'degree', 'U2032', 'U2033'],
      glyphs: ['', '°', '′', '″']
    })
    expect(hostComposeGlyphs(layout.byZmk.get('RALT'))).toBeUndefined()
    expect(hostComposeGlyphs(layout.byZmk.get('GRAVE'))).toBeUndefined()
    registerLarkHostFixture()
    expect(hostLayout('lark-en')?.byZmk.get('RWIN')).toEqual({
      keysyms: ['Multi_key', 'NoSymbol', 'NoSymbol', 'NoSymbol'],
      glyphs: ['', '', '', '']
    })
    expect(hostLayout('lark-en')?.byZmk.get('RALT')?.keysyms[0]).toBe('ISO_Level3_Shift')
    expect(hostLayout('lark-en')?.byZmk.get('RALT')?.glyphs[0]).toBe('')
    expect(hostLegendFor('RWIN', larkView())).toBeNull()
    expect(hostLegendFor('RALT', larkView())).toBeNull()
    expect(hostLegendFor('ESC', larkView())).toBeNull()
    expect(hostLegendFor('COLON', larkView())).toBeNull()
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
    const systemEnglishLayout = hostLayout(SYSTEM_US_LAYOUT_ID)!
    expect(systemEnglishLayout.id).toBe(SYSTEM_US_LAYOUT_ID)
    expect(systemEnglishLayout.byZmk.get('A')?.glyphs).toEqual(['a', 'A', '', ''])
    expect(systemEnglishLayout.byZmk.get('E')?.glyphs).toEqual(['e', 'E', '', ''])
    expect(systemEnglishLayout.byZmk.get('N1')?.glyphs).toEqual(['1', '!', '', ''])
    expect(systemEnglishLayout.byZmk.get('SEMI')?.glyphs).toEqual([';', ':', '', ''])
    expect(systemEnglishLayout.byZmk.get('SLASH')?.glyphs).toEqual(['/', '?', '', ''])
    expect(systemEnglishLayout.byZmk.get('GRAVE')?.glyphs).toEqual(['`', '~', '', ''])
  })

  it('fills the first column when chosen as the English system profile', () => {
    const view = assignHostLanguageLayout(
      standardHostLegendView(),
      'en',
      SYSTEM_US_LAYOUT_ID
    )
    expect(view.columns[0].layoutId).toBe(SYSTEM_US_LAYOUT_ID)
    expect(hostLegendFor('E', view)?.columns[0]?.pair).toEqual(['e', 'E'])
    expect(extraPair(hostLegendFor('E', view)!)).toEqual(['у', 'У'])
    expect(altNote(hostLegendFor('E', view)!)).toBe('ˬˬ')
    expect(hostLegendFor('N1', view)?.columns[0]?.pair).toEqual(['1', '!'])
  })

  it('groups system variants by language', () => {
    expect(catalogLayoutsForLanguage('en').map(choice => choice.kind)).toEqual(['system'])
    const russian = catalogLayoutsForLanguage('ru')
    expect(russian[0]?.id).toBe('system-ru')
    expect(russian[0]?.primary).toBe(true)
    expect(russian.map(choice => choice.id)).toContain('system-ru-phonetic')
    expect(russian.every(choice => choice.kind === 'system')).toBe(true)
  })

  it('maps phonetic Q to я and typewriter slash to ё', () => {
    const phonetic = assignHostLanguageLayout(
      standardHostLegendView(),
      'ru',
      'system-ru-phonetic'
    )
    expect(extraPair(hostLegendFor('Q', phonetic)!)).toEqual(['я', 'Я'])
    const typewriter = assignHostLanguageLayout(
      standardHostLegendView(),
      'ru',
      'system-ru-typewriter'
    )
    expect(extraPair(hostLegendFor('SLASH', typewriter)!)?.[0]).toBe('ё')
  })
})

function hideAllAlt(view: HostLegendView): HostLegendView {
  return view.columns.reduce(
    (next, column) =>
      setHostColumnAlt(setHostColumnAlt(next, column.language, 'altGr', false), column.language, 'altGrShift', false),
    view
  )
}

function openLayoutId(view: HostLegendView): string | null {
  if (view.open == null) return null
  return view.columns.find(column => column.language === view.open)?.layoutId ?? null
}

describe('system Russian winkeys', () => {
  const view = hideAllAlt(
    assignHostLanguageLayout(standardHostLegendView(), 'ru', SYSTEM_RU_LAYOUT_ID)
  )

  it('uses common letters and winkeys punctuation', () => {
    const systemRussianLayout = hostLayout(SYSTEM_RU_LAYOUT_ID)!
    expect(systemRussianLayout.byZmk.get('Q')?.glyphs).toEqual(['й', 'Й', '', ''])
    expect(systemRussianLayout.byZmk.get('A')?.glyphs).toEqual(['ф', 'Ф', '', ''])
    expect(systemRussianLayout.byZmk.get('GRAVE')?.glyphs).toEqual(['ё', 'Ё', '', ''])
    expect(systemRussianLayout.byZmk.get('N3')?.glyphs).toEqual(['3', '№', '', ''])
    expect(systemRussianLayout.byZmk.get('N4')?.glyphs).toEqual(['4', ';', '', ''])
    expect(systemRussianLayout.byZmk.get('N8')?.glyphs).toEqual(['8', '*', '₽', ''])
    expect(systemRussianLayout.byZmk.get('SLASH')?.glyphs).toEqual(['.', ',', '', ''])
    expect(systemRussianLayout.byZmk.get('BSLH')?.glyphs).toEqual(['\\', '/', '', ''])
    expect(systemRussianLayout.byZmk.get('MINUS')?.glyphs).toEqual(['-', '_', '', ''])
  })

  it('shows English first and system Russian second, both visible', () => {
    expect(view.columns[0].layoutId).toBe(SYSTEM_US_LAYOUT_ID)
    expect(openLayoutId(view)).toBe('system-ru')
    expect(view.columns[0].visible).toBe(true)
    expect(view.columns.find(column => column.language === 'ru')?.visible).toBe(true)
    expect(view.columns[0].altGr).toBe(false)
    expect(view.columns[0].altGrShift).toBe(false)
    expect(hostLegendFor('Q', view)).toMatchObject({
      columns: [
        { language: 'en', pair: ['q', 'Q'], altGr: '', altGrShift: '' },
        { language: 'ru', pair: ['й', 'Й'] }
      ]
    })
    expect(extraPair(hostLegendFor('N8', view)!)).toEqual(['8', '*'])
  })

  it('shows both AltGr pairs when the English fixture and winkeys differ', () => {
    const shown = hideAllAlt(larkView())
    const withWinkeys = assignHostLanguageLayout(shown, 'ru', SYSTEM_RU_LAYOUT_ID)
    const withAlt = withWinkeys.columns.reduce(
      (next, column) =>
        setHostColumnAlt(setHostColumnAlt(next, column.language, 'altGr', true), column.language, 'altGrShift', true),
      withWinkeys
    )
    expect(hostLegendFor('A', withAlt)?.columns[0]?.pair).toEqual(['a', 'A'])
    expect(extraPair(hostLegendFor('A', withAlt)!)).toEqual(['ф', 'Ф'])
    expect(altNote(hostLegendFor('A', withAlt)!)).toBe('@α/')
    expect(altNote(hostLegendFor('Q', withAlt)!)).toBe('øØ/')
    expect(altNote(hostLegendFor('N8', withAlt)!)).toContain('₽')
  })
})

describe('Ukrainian system layout', () => {
  it('uses Ukrainian letters on the quote key', () => {
    const systemUkrainianLayout = hostLayout(SYSTEM_UA_LAYOUT_ID)!
    expect(systemUkrainianLayout.byZmk.get('SQT')?.glyphs[0]).toBe('є')
    expect(systemUkrainianLayout.byZmk.get('Q')?.glyphs[0]).toBe('й')
  })

  it('lists Ukrainian system variants and maps phonetic Q to я', () => {
    const ukrainian = catalogLayoutsForLanguage('uk')
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
    const phonetic = assignHostLanguageLayout(
      addHostLanguage(standardHostLegendView(), 'uk'),
      'uk',
      'system-ua-phonetic'
    )
    expect(extraPair(hostLegendFor('Q', phonetic)!)).toEqual(['я', 'Я'])
  })

  it('adds Ukrainian and collapses Russian to a flag', () => {
    const view = addHostLanguage(standardHostLegendView(), 'uk')
    const columns = hostLegendColumns(view)
    expect(columns.map(column => [column.language, column.wide])).toEqual([
      ['en', true],
      ['ru', false],
      ['uk', true]
    ])
    expect(openLayoutId(view)).toBe('system-ua')
    expect(extraPair(hostLegendFor('SQT', view)!)?.[0]).toBe('є')
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
    expect(extraPair(hostLegendFor('Q', back)!)).toEqual(['й', 'Й'])
  })
})

describe('German system layout', () => {
  it('uses QWERTZ letters and ß on the minus key', () => {
    const systemGermanLayout = hostLayout(SYSTEM_DE_LAYOUT_ID)!
    expect(systemGermanLayout.byZmk.get('A')?.glyphs.slice(0, 2)).toEqual(['a', 'A'])
    expect(systemGermanLayout.byZmk.get('Y')?.glyphs[0]).toBe('z')
    expect(systemGermanLayout.byZmk.get('Z')?.glyphs[0]).toBe('y')
    expect(systemGermanLayout.byZmk.get('MINUS')?.glyphs[0]).toBe('ß')
    expect(systemGermanLayout.byZmk.get('SEMI')?.glyphs[0]).toBe('ö')
    expect(systemGermanLayout.byZmk.get('SQT')?.glyphs[0]).toBe('ä')
  })

  it('keeps dead_* keysyms on de(basic) and winkeys AC01 names from source', () => {
    const grave = hostLevels(SYSTEM_DE_LAYOUT_ID, 'GRAVE')
    expect(grave?.keysyms).toEqual(['dead_circumflex', 'degree', 'U2032', 'U2033'])
    expect(grave?.glyphs[0]).toBe('')
    const equal = hostLevels(SYSTEM_DE_LAYOUT_ID, 'EQUAL')
    expect(equal?.keysyms).toEqual(['dead_acute', 'dead_grave', 'dead_cedilla', 'dead_ogonek'])
    expect(equal?.glyphs[0]).toBe('')
    expect(hostLevels(SYSTEM_RU_LAYOUT_ID, 'A')?.keysyms).toEqual([
      'Cyrillic_ef',
      'Cyrillic_EF',
      'NoSymbol',
      'NoSymbol'
    ])
    const deOnly: HostLegendView = {
      columns: [
        {
          language: 'de',
          layoutId: SYSTEM_DE_LAYOUT_ID,
          visible: true,
          altGr: true,
          altGrShift: true
        }
      ],
      open: null
    }
    expect(hostLegendFor('GRAVE', deOnly)).toBeNull()
    expect(hostLegendFor('EQUAL', deOnly)).toBeNull()
  })

  it('lists German system variants and maps nodeadkeys caret', () => {
    const german = catalogLayoutsForLanguage('de')
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
    const nodead = assignHostLanguageLayout(
      addHostLanguage(standardHostLegendView(), 'de'),
      'de',
      'system-de-nodeadkeys'
    )
    expect(extraPair(hostLegendFor('GRAVE', nodead)!)?.[0]).toBe('^')
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
    expect(openLayoutId(de)).toBe('system-de')
    expect(extraPair(hostLegendFor('Y', de)!)?.[0]).toBe('z')
  })

  it('replaces an extra language and keeps the slot', () => {
    const uk = addHostLanguage(standardHostLegendView(), 'uk')
    const de = replaceHostLanguage(uk, 'uk', 'de')
    expect(hostLegendColumns(de).map(column => [column.language, column.wide])).toEqual([
      ['en', true],
      ['ru', false],
      ['de', true]
    ])
    expect(openLayoutId(de)).toBe('system-de')
    expect(extraPair(hostLegendFor('Y', de)!)?.[0]).toBe('z')
  })

  it('removes an extra language and reopens Russian', () => {
    const uk = addHostLanguage(standardHostLegendView(), 'uk')
    const gone = removeHostLanguage(uk, 'uk')
    expect(hostLegendColumns(gone).map(column => [column.language, column.wide])).toEqual([
      ['en', true],
      ['ru', true]
    ])
    expect(openLayoutId(gone)).toBe(SYSTEM_RU_LAYOUT_ID)
  })
})

describe('host legend view', () => {
  it('drops the second language back to the base shift', () => {
    const view = toggleHostLanguage(larkView(), 'ru')
    expect(view.open).toBe('ru')
    expect(view.columns.find(column => column.language === 'ru')?.visible).toBe(false)
    const legend = hostLegendFor('A', view)!
    expect(legend.columns).toHaveLength(1)
    expect(legend.columns[0]).toMatchObject({
      language: 'en',
      pair: ['a', 'A'],
      altGr: '@',
      altGrShift: 'α'
    })
    expect(extraPair(legend)).toBeNull()
    expect(altNote(legend)).toBe('@α')
  })

  it('hides AltGr columns without changing the layout', () => {
    const standard = larkView()
    const noAlt = hideAllAlt(standard)
    expect(hostLegendFor('T', noAlt)?.columns[0]?.pair).toEqual(['t', 'T'])
    expect(extraPair(hostLegendFor('T', noAlt)!)).toEqual(['е', 'Е'])
    expect(hostLegendFor('T', noAlt)?.columns[0]?.altGr).toBe('')
    expect(hostLegendFor('T', noAlt)?.columns[0]?.altGrShift).toBe('')
    expect(altNote(hostLegendFor('T', noAlt)!)).toBeUndefined()

    const onlyShift = setHostColumnAlt(setHostColumnAlt(standard, 'en', 'altGr', false), 'ru', 'altGr', false)
    expect(hostLegendFor('E', onlyShift)?.columns[0]).toMatchObject({
      altGr: '',
      altGrShift: 'ε'
    })
  })

  it('uses Russian as the base alphabet', () => {
    registerLarkHostFixture()
    const view: HostLegendView = {
      columns: [
        { language: 'ru', layoutId: 'lark-ru', visible: true, altGr: true, altGrShift: true }
      ],
      open: null
    }
    expect(hostLegendFor('A', view)?.columns[0]?.pair).toEqual(['ф', 'Ф'])
    expect(extraPair(hostLegendFor('A', view)!)).toBeNull()
  })

  it('keeps open off the base language', () => {
    const standard = standardHostLegendView()
    expect(standard.open).not.toBe(standard.columns[0].language)
    const hiddenBase = toggleHostLanguage(standard, 'en')
    expect(hiddenBase.open).not.toBe(hiddenBase.columns[0].language)
  })

  it('toggles preview visibility without changing the layout ids', () => {
    const hidden = toggleHostLanguage(larkView(), 'ru')
    expect(openLayoutId(hidden)).toBe('lark-ru')
    expect(hidden.columns.find(column => column.language === 'ru')?.visible).toBe(false)
    expect(hidden.columns[0].layoutId).toBe('lark-en')
  })
})
