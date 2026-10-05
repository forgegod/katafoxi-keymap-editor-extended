import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  hostComposeGlyphs,
  hostLayoutFromSymbols,
  withHostKey,
  type HostLayout
} from './host-layout.js'
import { registerLarkHostFixture } from './testing/lark-host.js'
import { hostLegendFor, keycapFace } from './compose.js'
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
  const text = keycapFace(legend)
    .packs.flatMap(pack =>
      pack.glyphs.filter(glyph => glyph.alt && !glyph.empty).map(glyph => glyph.text)
    )
    .join('')
  return text || undefined
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

  it('throws on cyclic includes when strictIncludes is set', () => {
    const source = `
      xkb_symbols "a" {
        include "cycle(b)"
        key <AC01> {[ a, A ]};
      };
      xkb_symbols "b" {
        include "cycle(a)"
        key <AC02> {[ s, S ]};
      };
    `
    expect(() =>
      parseXkbSymbolsSection(source, 'a', [], { fileId: 'cycle', strictIncludes: true })
    ).toThrow('Cyclic xkb include: cycle:a → cycle:b → cycle:a')
  })

  it('warns on cyclic includes without strictIncludes', () => {
    const source = `
      xkb_symbols "loop" {
        include "self(loop)"
        key <AC01> {[ a, A ]};
      };
    `
    const warnings: string[] = []
    const keys = parseXkbSymbolsSection(source, 'loop', [], {
      fileId: 'self',
      warnings
    })
    expect(keys.get('AC01')).toEqual(['a', 'A'])
    expect(warnings).toEqual(['Cyclic xkb include: self:loop → self:loop'])
  })

  it('escapes section names used in RegExp lookup', () => {
    const source = `
      xkb_symbols "basic+extra" {
        key <AC01> {[ a, A ]};
      };
    `
    expect(parseXkbSymbolsSection(source, 'basic+extra').get('AC01')).toEqual(['a', 'A'])
  })

  it('warns when a key keeps only the first of several keysym groups', () => {
    const source = `
      xkb_symbols "basic" {
        key <AC01> {
          [ a, A ],
          [ b, B ]
        };
      };
    `
    const warnings: string[] = []
    const keys = parseXkbSymbolsSection(source, 'basic', [], { warnings })
    expect(keys.get('AC01')).toEqual(['a', 'A'])
    expect(warnings).toEqual(['Key <AC01> has 2 keysym groups; using the first.'])
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

function withRussian(view: HostLegendView = standardHostLegendView()): HostLegendView {
  return view.columns.some(column => column.language === 'ru') ? view : addHostLanguage(view, 'ru')
}

function larkView(): HostLegendView {
  registerLarkHostFixture()
  return assignHostLanguageLayout(
    assignHostLanguageLayout(withRussian(), 'en', 'lark-en'),
    'ru',
    'lark-ru'
  )
}

describe('lark host layouts', () => {
  it('joins AC01 to A / ф and keeps shared AltGr', () => {
    registerLarkHostFixture()
    expect(hostLayout('lark-en')?.byZmk.get('A')?.glyphs).toEqual(['a', 'A', '@', '×'])
    expect(hostLayout('lark-ru')?.byZmk.get('A')?.glyphs).toEqual(['ф', 'Ф', '@', '×'])
    expect(hostLegendFor('KC_A', larkView())).toEqual({
      columns: [
        {
          language: 'en',
          tone: 'base',
          pair: ['a', 'A'],
          pairDead: [false, false],
          altGr: '@',
          altGrDead: false,
          altGrShift: '×',
          altGrShiftDead: false,
          showAltGr: true,
          showAltGrShift: true,
          onKeycap: true
        },
        {
          language: 'ru',
          tone: 'second',
          pair: ['ф', 'Ф'],
          pairDead: [false, false],
          altGr: '@',
          altGrDead: false,
          altGrShift: '×',
          altGrShiftDead: false,
          showAltGr: true,
          showAltGrShift: true,
          onKeycap: true
        }
      ],
      keycode: 'KC_A'
    })
  })

  it('shares bracket AltGr on J', () => {
    expect(hostLegendFor('J', larkView())).toMatchObject({
      columns: [
        { language: 'en', pair: ['j', 'J'], altGr: '[', altGrShift: '{' },
        { language: 'ru', pair: ['о', 'О'], altGr: '[', altGrShift: '{' }
      ]
    })
  })

  it('records LARK divergences on T, M, and O', () => {
    expect(altNote(hostLegendFor('T', larkView())!)).toBe('ёЁ')
    expect(altNote(hostLegendFor('M', larkView())!)).toBe('ъЪ')
    expect(extraPair(hostLegendFor('O', larkView())!)).toEqual(['щ', 'Щ'])
  })

  it('splits E into language and AltGr columns', () => {
    expect(hostLegendFor('E', larkView())).toMatchObject({
      columns: [
        { language: 'en', pair: ['e', 'E'], altGr: '№', altGrShift: '{' },
        { language: 'ru', pair: ['у', 'У'], altGr: '№', altGrShift: '{' }
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
    expect(extraPair(hostLegendFor('E', view)!)).toBeNull()
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
      withRussian(),
      'ru',
      'system-ru-phonetic'
    )
    expect(extraPair(hostLegendFor('Q', phonetic)!)).toEqual(['я', 'Я'])
    const typewriter = assignHostLanguageLayout(
      withRussian(),
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
    assignHostLanguageLayout(withRussian(), 'ru', SYSTEM_RU_LAYOUT_ID)
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
    expect(altNote(hostLegendFor('A', withAlt)!)).toBe('@×')
    expect(altNote(hostLegendFor('Q', withAlt)!)).toBe('ø÷')
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
    const view = addHostLanguage(withRussian(), 'uk')
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
    const added = addHostLanguage(withRussian(), 'uk')
    const back = toggleHostLanguage(added, 'ru')
    const columns = hostLegendColumns(back)
    expect(columns.map(column => [column.language, column.wide])).toEqual([
      ['en', true],
      ['ru', true],
      ['uk', false]
    ])
    expect(extraPair(hostLegendFor('Q', back)!)).toEqual(['й', 'Й'])
  })

  it('draws Russian and Ukrainian once English is hidden', () => {
    const added = addHostLanguage(withRussian(), 'uk')
    const hiddenEnglish = toggleHostLanguage(added, 'en')
    const both = toggleHostLanguage(hiddenEnglish, 'ru')
    expect(hostLegendColumns(both).map(column => [column.language, column.shown, column.wide])).toEqual([
      ['en', false, true],
      ['ru', true, true],
      ['uk', true, true]
    ])
    expect(both.open).toBe('ru')
    const legend = hostLegendFor('S', both)!
    expect(legend.columns.map(column => [column.language, column.onKeycap])).toEqual([
      ['en', false],
      ['ru', true],
      ['uk', true]
    ])
    expect(legend.columns[0]?.pair).toEqual(['s', 'S'])
    expect(
      keycapFace(legend).packs.map(pack =>
        pack.glyphs.filter(glyph => !glyph.alt).map(glyph => glyph.text).join('')
      )
    ).toEqual(['ыЫ', 'іІ'])
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
    // Stored glyphs stay empty for composition; the board shows spacing marks.
    expect(hostComposeGlyphs(grave)).toBeUndefined()
    expect(hostComposeGlyphs(equal)).toBeUndefined()
    expect(hostLegendFor('GRAVE', deOnly)).toMatchObject({
      columns: [{ language: 'de', pair: ['^', '°'], pairDead: [true, false] }]
    })
    expect(hostLegendFor('EQUAL', deOnly)).toMatchObject({
      columns: [{ language: 'de', pair: ['´', '`'], pairDead: [true, true] }]
    })
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
      ['de', true]
    ])
    expect(openLayoutId(de)).toBe('system-de')
    expect(extraPair(hostLegendFor('Y', de)!)?.[0]).toBe('z')
  })

  it('removes an extra language and reopens Russian', () => {
    const uk = addHostLanguage(withRussian(), 'uk')
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
      altGrShift: '×'
    })
    expect(extraPair(legend)).toBeNull()
    expect(altNote(legend)).toBe('@×')
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
      altGrShift: '{'
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

function editableLayout(): HostLayout {
  return hostLayoutFromSymbols(
    `
      xkb_symbols "basic" {
        key <AC01> {[ a, A, at, Greek_alpha ]};
        key <AD01> {[ q, Q, NoSymbol, NoSymbol ]};
      };
    `,
    'basic',
    'test-edit'
  )
}

function tableOf(layout: HostLayout): unknown {
  return [...layout.byZmk].map(([zmk, levels]) => [zmk, [...levels.keysyms], [...levels.glyphs]])
}

describe('withHostKey', () => {
  it('replaces one level and leaves the other levels and keys alone', () => {
    const base = editableLayout()
    const next = withHostKey(base, 'A', 2, 'Cyrillic_io')!
    expect(next.id).toBe('test-edit')
    expect(next.byZmk.get('A')).toEqual({
      keysyms: ['a', 'A', 'Cyrillic_io', 'Greek_alpha'],
      glyphs: ['a', 'A', 'ё', 'α']
    })
    expect(next.byZmk.get('Q')).toEqual(base.byZmk.get('Q'))
    expect([...next.byZmk.keys()]).toEqual([...base.byZmk.keys()])
  })

  it('derives the glyph from the keysym instead of taking one', () => {
    const next = withHostKey(editableLayout(), 'A', 1, 'U20BD')!
    expect(next.byZmk.get('A')?.glyphs).toEqual(['a', '₽', '@', 'α'])
    expect(withHostKey(editableLayout(), 'A', 3, '')?.byZmk.get('A')).toEqual({
      keysyms: ['a', 'A', 'at', 'NoSymbol'],
      glyphs: ['a', 'A', '@', '']
    })
  })

  it('leaves the source layout identical to itself', () => {
    const base = editableLayout()
    const before = tableOf(base)
    const next = withHostKey(base, 'A', 0, 'Cyrillic_ef')!
    expect(tableOf(base)).toEqual(before)
    expect(next.byZmk).not.toBe(base.byZmk)
    expect(next.byZmk.get('A')).not.toBe(base.byZmk.get('A'))
  })

  it('leaves a registered system layout untouched', () => {
    const system = hostLayout(SYSTEM_US_LAYOUT_ID)!
    const before = tableOf(system)
    withHostKey(system, 'A', 0, 'Cyrillic_ef')
    expect(tableOf(hostLayout(SYSTEM_US_LAYOUT_ID)!)).toEqual(before)
    expect(hostLevels(SYSTEM_US_LAYOUT_ID, 'A')?.glyphs).toEqual(['a', 'A', '', ''])
  })

  it('creates a missing key with NoSymbol on the other three levels', () => {
    const base = editableLayout()
    expect(base.byZmk.has('GRAVE')).toBe(false)
    const next = withHostKey(base, 'GRAVE', 1, 'asciitilde')!
    expect(next.byZmk.get('GRAVE')).toEqual({
      keysyms: ['NoSymbol', 'asciitilde', 'NoSymbol', 'NoSymbol'],
      glyphs: ['', '~', '', '']
    })
    expect(base.byZmk.has('GRAVE')).toBe(false)
  })

  it('writes an alias to the canonical key instead of a second entry', () => {
    const next = withHostKey(editableLayout(), 'KC_A', 0, 'b')!
    expect(next.byZmk.size).toBe(2)
    expect(next.byZmk.get('A')?.glyphs[0]).toBe('b')
  })

  it('drops the key from composition when the base level is a dead key', () => {
    // Known behaviour T7 leans on: the card has to warn before allowing this.
    const next = withHostKey(editableLayout(), 'A', 0, 'dead_acute')!
    const levels = next.byZmk.get('A')!
    expect(levels.keysyms).toEqual(['dead_acute', 'A', 'at', 'Greek_alpha'])
    expect(levels.glyphs).toEqual(['', 'A', '@', 'α'])
    expect(hostComposeGlyphs(levels)).toBeUndefined()
    expect(hostComposeGlyphs(next.byZmk.get('Q'))).toEqual(['q', 'Q', '', ''])
  })

  it('rejects an unknown key name and a level outside the four', () => {
    const base = editableLayout()
    expect(withHostKey(base, 'NOSUCHKEY', 0, 'a')).toBeUndefined()
    expect(withHostKey(base, 'F13', 0, 'a')).toBeUndefined()
    expect(withHostKey(base, 'A', 4, 'a')).toBeUndefined()
    expect(withHostKey(base, 'A', -1, 'a')).toBeUndefined()
    expect(withHostKey(base, 'A', 1.5, 'a')).toBeUndefined()
    expect(tableOf(base)).toEqual(tableOf(editableLayout()))
  })
})
