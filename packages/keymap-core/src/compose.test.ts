import { describe, expect, it } from 'vitest'
import {
  behaviorKeycapRole,
  bindingReferencesLayer,
  bindingSendsAltGr,
  bindingSendsShift,
  composeKey,
  composeLayerRows,
  composeLegendDecode,
  encodeKeyBinding,
  formatDecodeWord,
  legendHoverHit,
  isCompactKeycapLegend,
  isCompactModifierChord,
  isHoldTapBehavior,
  isHoldTapParam,
  isKeypadChoice,
  isKeypadCode,
  isLayerLegendSymbol,
  keycapLegend,
  compactBehaviorLegend,
  prefixedCommandLegend,
  layerLegendSymbol,
  formatAltGrPair,
  getBehaviorCatalog,
  getKeycodeCatalog,
  hostLegendFor,
  resolveHostColumns,
  addHostLanguage,
  assignHostLanguageLayout,
  keycapColumns,
  parseKeyBinding,
  setHostColumnAlt,
  standardHostLegendView,
  toggleHostLanguage,
  parseKeymap,
  generateKeymap,
  normalizeZmkKeycodes,
  resolveBinding,
  registerHostLayout,
  unregisterHostLayout,
  withEditableLegendDecodeGaps,
  ALT_LEVEL_EMPTY,
  type HostLegendView
} from '../src/index.js'
import { registerLarkHostFixture } from './testing/lark-host.js'

function larkView(): HostLegendView {
  registerLarkHostFixture()
  return assignHostLanguageLayout(
    assignHostLanguageLayout(standardHostLegendView(), 'en', 'lark-en'),
    'ru',
    'lark-ru'
  )
}

/** Join live keycap columns the way the deleted compact helper did. */
function compactKeycap(legend: NonNullable<ReturnType<typeof composeKey>>): string {
  const cols = keycapColumns(legend).map(column =>
    column.pieces.map(piece => piece.text).join('')
  )
  const hold = legend.hold ? ` ${legend.hold}` : ''
  return `${cols.join(' ')}${hold}`.trim()
}

function baseColumn(legend: NonNullable<ReturnType<typeof composeKey>>) {
  return legend.columns.find(column => column.tone === 'base')
}

function extraColumn(legend: NonNullable<ReturnType<typeof composeKey>>) {
  return legend.columns.find(column => column.tone === 'second' && column.onKeycap) ?? null
}

function altText(legend: NonNullable<ReturnType<typeof composeKey>>): string | undefined {
  const alt = keycapColumns(legend).find(column => column.kind === 'alt')
  return alt?.pieces.map(piece => piece.text).join('')
}

describe('parseKeyBinding', () => {
  it('parses simple &kp', () => {
    expect(parseKeyBinding('&kp A')).toEqual({
      value: '&kp',
      params: [{ value: 'A', params: [] }]
    })
  })

  it('parses nested params', () => {
    expect(parseKeyBinding('&mt LSHFT A')).toEqual({
      value: '&mt',
      params: [
        { value: 'LSHFT', params: [] },
        { value: 'A', params: [] }
      ]
    })
  })
})

describe('parseKeymap / generateKeymap', () => {
  it('round-trips a minimal keymap', () => {
    const layout = [
      { x: 0, y: 0, row: 0, col: 0 },
      { x: 1, y: 0, row: 0, col: 1 }
    ]
    const raw = {
      layer_names: ['default'],
      layers: [['&kp A', '&trans']]
    }
    const parsed = parseKeymap(raw)
    expect(parsed.layers[0][0].value).toBe('&kp')
    const { json, code } = generateKeymap(layout, parsed)
    expect(json).toContain('&kp A')
    expect(code).toContain('bindings')
  })
})

describe('normalizeZmkKeycodes', () => {
  it('expands aliases and modifiers', () => {
    const result = normalizeZmkKeycodes([
      {
        names: ['A', 'KC_A'],
        description: 'A',
        symbol: 'A'
      },
      {
        names: ['LSHFT', 'LS', 'LC(code)'],
        description: 'Left Shift'
      }
    ])
    expect(result.some(k => k.code === 'A')).toBe(true)
    expect(result.some(k => k.code === 'LC' && k.params.includes('code'))).toBe(true)
  })

  it('uses digit symbols for number-row aliases like N1', () => {
    const result = normalizeZmkKeycodes([
      {
        names: ['NUMBER_1', 'N1'],
        description: '1 and ! [Exclamation]',
        symbol: '1'
      }
    ])
    const n1 = result.find(k => k.code === 'N1')
    expect(n1?.symbol).toBe('1')
  })

  it('uses host signs for keypad operators', () => {
    const result = normalizeZmkKeycodes([
      { names: ['KP_MINUS', 'KP_SUBTRACT'], symbol: '-', description: '- [Minus]' },
      { names: ['KP_PLUS'], symbol: '+', description: '+ [Plus]' },
      { names: ['KP_DIVIDE', 'KP_SLASH'], symbol: '/', description: '/ [Divide]' },
      { names: ['KP_MULTIPLY', 'KP_ASTERISK'], symbol: '*', description: '* [Multiply]' }
    ])
    expect(result.find(k => k.code === 'KP_MINUS')?.symbol).toBe('-')
    expect(result.find(k => k.code === 'KP_PLUS')?.symbol).toBe('+')
    expect(result.find(k => k.code === 'KP_SLASH')?.symbol).toBe('/')
    expect(result.find(k => k.code === 'KP_MULTIPLY')?.symbol).toBe('*')
  })
})

describe('resolveBinding / composeKey', () => {
  it('resolves &kp tap without hold', () => {
    expect(resolveBinding(parseKeyBinding('&kp A'))).toEqual({ tap: 'A' })
    const legend = composeKey({ binding: parseKeyBinding('&kp A'), hostView: larkView() })
    expect(baseColumn(legend!)?.pair).toEqual(['a', 'A'])
    expect(extraColumn(legend!)?.pair).toEqual(['ф', 'Ф'])
    expect(legend?.hold).toBeUndefined()
    expect(legend?.holdRef).toBeUndefined()
    expect(compactKeycap(legend!)).toBe('aA фФ @α')
    expect(altText(legend!)).toBe('@α')
  })

  it('carries hold as a layer or modifier ref', () => {
    expect(resolveBinding(parseKeyBinding('&lt 1 A'))).toEqual({
      tap: 'A',
      hold: { kind: 'layer', layer: 1 }
    })
    expect(resolveBinding(parseKeyBinding('&mt LCTRL J'))).toEqual({
      tap: 'J',
      hold: { kind: 'mod', code: 'LCTRL' }
    })
    expect(resolveBinding(parseKeyBinding('&mt RALT LBKT'))).toEqual({
      tap: 'LBKT',
      hold: { kind: 'mod', code: 'RALT' }
    })
  })

  it('marks host levels that differ between English and Russian', () => {
    const tee = composeKey({ binding: parseKeyBinding('&kp T'), hostView: larkView() })
    expect(baseColumn(tee!)?.pair).toEqual(['t', 'T'])
    expect(extraColumn(tee!)?.pair).toEqual(['е', 'Е'])
    expect(baseColumn(tee!)?.altGr).toBe('Δ')
    expect(baseColumn(tee!)?.altGrShift).toBe('τ')
    expect(altText(tee!)).toBe('Δτ/ёЁ')
    expect(compactKeycap(tee!)).toBe('tT еЕ Δτ/ёЁ')

    const em = composeKey({ binding: parseKeyBinding('&kp M'), hostView: larkView() })
    expect(baseColumn(em!)?.pair).toEqual(['m', 'M'])
    expect(extraColumn(em!)?.pair).toEqual(['ь', 'Ь'])
    expect(altText(em!)).toBe('ˬμ/ъЪ')
    expect(compactKeycap(em!)).toBe('mM ьЬ ˬμ/ъЪ')

    const grave = composeKey({ binding: parseKeyBinding('&kp GRAVE'), hostView: larkView() })
    expect(baseColumn(grave!)?.pair).toEqual(['`', '~'])
    expect(altText(grave!)).toBe('/ёЁ')
  })

  it('draws a second-language pair once when it matches the first', () => {
    const hostView = addHostLanguage(larkView(), 'de')
    const gee = composeKey({ binding: parseKeyBinding('&kp G'), hostView })
    expect(baseColumn(gee!)?.pair).toEqual(['g', 'G'])
    expect(extraColumn(gee!)?.pair).toEqual(['g', 'G'])
    expect(compactKeycap(gee!)).toBe(`gG ${altText(gee!)}`)
    expect(keycapColumns(gee!)[0]?.pieces).toEqual([{ text: 'gG', tone: 'base' }])
  })

  it('colors diverging AltGr halves by language', () => {
    const tee = composeKey({ binding: parseKeyBinding('&kp T'), hostView: larkView() })
    expect(keycapColumns(tee!).at(-1)).toEqual({
      kind: 'alt',
      pieces: [
        { text: 'Δτ', tone: 'base' },
        { text: '/', tone: null },
        { text: 'ёЁ', tone: 'second' }
      ]
    })
    const grave = composeKey({ binding: parseKeyBinding('&kp GRAVE'), hostView: larkView() })
    expect(keycapColumns(grave!).at(-1)?.pieces).toEqual([
      { text: '/', tone: null },
      { text: 'ёЁ', tone: 'second' }
    ])
  })

  it('splits E into En / Ru / AltGr columns', () => {
    const legend = composeKey({ binding: parseKeyBinding('&kp E'), hostView: larkView() })
    expect(baseColumn(legend!)?.pair).toEqual(['e', 'E'])
    expect(extraColumn(legend!)?.pair).toEqual(['у', 'У'])
    expect(baseColumn(legend!)?.altGr).toBe('&')
    expect(baseColumn(legend!)?.altGrShift).toBe('ε')
    expect(compactKeycap(legend!)).toBe('eE уУ &ε')
  })

  it('puts hold badge only on &mt, not on bare &kp J', () => {
    const kp = composeKey({ binding: parseKeyBinding('&kp J'), hostView: larkView() })
    expect(kp?.hold).toBeUndefined()
    expect(baseColumn(kp!)?.pair).toEqual(['j', 'J'])
    expect(extraColumn(kp!)?.pair).toEqual(['о', 'О'])
    expect(baseColumn(kp!)?.altGr).toBe('')
    expect(baseColumn(kp!)?.altGrShift).toBe('ξ')
    expect(compactKeycap(kp!)).toContain('ˬξ')

    const mt = composeKey({ binding: parseKeyBinding('&mt LCTRL J'), hostView: larkView() })
    expect(baseColumn(mt!)?.pair).toEqual(['j', 'J'])
    expect(mt?.hold).toBe('⧗⌃')
    expect(mt?.holdRef).toEqual({ kind: 'mod', code: 'LCTRL' })

    const ralt = composeKey({ binding: parseKeyBinding('&mt RALT LBKT') })
    expect(ralt?.hold).toBe('⧗R⎇')
    expect(ralt?.holdRef).toEqual({ kind: 'mod', code: 'RALT' })
  })

  it('keeps ZMK glyphs for keys that are not host characters', () => {
    for (const binding of [
      '&kp ESC',
      '&kp TAB',
      '&kp LWIN',
      '&kp LCTRL',
      '&kp LSHIFT',
      '&kp LALT',
      '&kp CAPS',
      '&kp BSPC',
      '&kp DEL',
      '&kp SPACE',
      '&kp LEFT',
      '&kp RIGHT',
      '&kp C_AC_BACK',
      '&kp K_FORWARD',
      '&kp LC(BSPC)',
      '&kp LS(CAPS)',
      '&lt 1 LS(CAPS)',
      '&mo 1',
      '&kp KP_N7'
    ]) {
      expect(composeKey({ binding: parseKeyBinding(binding) }), binding).toBeNull()
    }
  })

  it('hides language columns on the keycap without dropping the host pick', () => {
    const hiddenEn = composeKey({
      binding: parseKeyBinding('&kp E'),
      hostView: toggleHostLanguage(larkView(), 'en')
    })
    expect(baseColumn(hiddenEn!)?.onKeycap).toBe(false)
    expect(baseColumn(hiddenEn!)?.pair).toEqual(['e', 'E'])
    expect(extraColumn(hiddenEn!)?.pair).toEqual(['у', 'У'])
    expect(keycapColumns(hiddenEn!).filter(column => column.kind === 'letters')).toEqual([
      { kind: 'letters', pieces: [{ text: 'уУ', tone: 'second' }] }
    ])
    expect(hostLegendFor('E', larkView())?.columns[0]?.pair).toEqual(['e', 'E'])
  })

  it('keeps three visible columns on the legend and draws base plus open on the keycap', () => {
    const hostView = addHostLanguage(larkView(), 'uk')
    expect(resolveHostColumns(hostView).filter(column => column.visible)).toHaveLength(3)
    const legend = composeKey({ binding: parseKeyBinding('&kp A'), hostView })
    expect(legend?.columns.map(column => column.language)).toEqual(['en', 'ru', 'uk'])
    expect(legend?.columns.map(column => column.onKeycap)).toEqual([true, false, true])
    expect(
      keycapColumns(legend!)
        .filter(column => column.kind === 'letters')
        .map(column => column.pieces[0])
    ).toEqual([
      { text: 'aA', tone: 'base' },
      { text: 'фФ', tone: 'second' }
    ])
  })

  it('omits a hidden layer so remaining rows keep their real indices', () => {
    const rows = composeLayerRows(
      [
        parseKeyBinding('&kp E'),
        parseKeyBinding('&kp KP_N8'),
        parseKeyBinding('&kp F8'),
        parseKeyBinding('&kp SLCK')
      ],
      standardHostLegendView(),
      { shown: [0, 2, 3], layer0Raw: false }
    )
    expect(rows).toHaveLength(3)
    expect(rows.map(row => row.layer)).toEqual([0, 2, 3])
    expect(rows.some(row => row.layer === 1)).toBe(false)
  })

  it('returns only the two shown layers with their real indices', () => {
    const rows = composeLayerRows(
      [
        parseKeyBinding('&kp E'),
        parseKeyBinding('&kp KP_N8'),
        parseKeyBinding('&kp F8'),
        parseKeyBinding('&kp SLCK')
      ],
      standardHostLegendView(),
      { shown: [0, 2], layer0Raw: false }
    )
    expect(rows).toHaveLength(2)
    expect(rows.map(row => row.layer)).toEqual([0, 2])
  })

  it('returns one row for a single-layer keymap', () => {
    const rows = composeLayerRows([parseKeyBinding('&kp E')])
    expect(rows).toHaveLength(1)
    expect(rows[0].layer).toBe(0)
  })

  it('marks &trans and &none as blank rows', () => {
    const rows = composeLayerRows(
      [parseKeyBinding('&trans'), parseKeyBinding('&none'), parseKeyBinding('&kp E')],
      standardHostLegendView(),
      { shown: [0, 1, 2], layer0Raw: false }
    )
    expect(rows.map(row => row.blank)).toEqual([true, true, false])
  })

  it('drops the host legend on layer0 when layer0Raw is set', () => {
    const rows = composeLayerRows(
      [parseKeyBinding('&kp E'), parseKeyBinding('&kp A')],
      larkView(),
      { shown: [0, 1], layer0Raw: true }
    )
    expect(rows[0].legend).toBeNull()
    expect(rows[0].blank).toBe(false)
    expect(rows[0].raw).toBe(true)
    expect(rows[0].title).toBe('&kp E')
    expect(rows[1].raw).toBe(false)
    expect(rows[1].legend?.columns[0]?.pair).toEqual(['a', 'A'])
  })

  it('sets each row title to the encoded binding', () => {
    const holdTap = parseKeyBinding('&mt LCTRL J')
    const letter = parseKeyBinding('&kp E')
    const rows = composeLayerRows([holdTap, letter], standardHostLegendView(), {
      shown: [0, 1],
      layer0Raw: false
    })
    expect(rows[0].title).toBe(encodeKeyBinding(holdTap))
    expect(rows[1].title).toBe(encodeKeyBinding(letter))
  })

  it('follows the host view for the second language and AltGr columns', () => {
    registerLarkHostFixture()
    const englishOnly = composeKey({
      binding: parseKeyBinding('&kp A'),
      hostView: {
        columns: [
          {
            language: 'en',
            layoutId: 'lark-en',
            visible: true,
            altGr: false,
            altGrShift: false
          }
        ],
        open: null
      }
    })
    expect(baseColumn(englishOnly!)?.pair).toEqual(['a', 'A'])
    expect(extraColumn(englishOnly!)).toBeNull()
    expect(baseColumn(englishOnly!)?.altGr).toBe('')
    expect(baseColumn(englishOnly!)?.altGrShift).toBe('')
    expect(compactKeycap(englishOnly!)).toBe('aA')
    expect(formatAltGrPair(baseColumn(englishOnly!)!)).toBeNull()
  })

  it('keeps an AltGr pair of empty marks while either column is on', () => {
    const both = composeKey({ binding: parseKeyBinding('&kp K'), hostView: larkView() })
    expect(baseColumn(both!)?.altGr).toBe('')
    expect(baseColumn(both!)?.altGrShift).toBe('')
    expect(formatAltGrPair(baseColumn(both!)!)).toBe('ˬˬ')

    const shiftOnly = composeKey({
      binding: parseKeyBinding('&kp K'),
      hostView: setHostColumnAlt(
        setHostColumnAlt(larkView(), 'en', 'altGr', false),
        'ru',
        'altGr',
        false
      )
    })
    expect(formatAltGrPair(baseColumn(shiftOnly!)!)).toBe('ˬ')

    const hidden = composeKey({
      binding: parseKeyBinding('&kp E'),
      hostView: setHostColumnAlt(
        setHostColumnAlt(
          setHostColumnAlt(setHostColumnAlt(larkView(), 'en', 'altGr', false), 'en', 'altGrShift', false),
          'ru',
          'altGr',
          false
        ),
        'ru',
        'altGrShift',
        false
      )
    })
    expect(formatAltGrPair(baseColumn(hidden!)!)).toBeNull()
  })

  it('detects layer references on &mo / &lt / &to', () => {
    expect(bindingReferencesLayer(parseKeyBinding('&mo 1'), 1)).toBe(true)
    expect(bindingReferencesLayer(parseKeyBinding('&mo 1'), 2)).toBe(false)
    expect(bindingReferencesLayer(parseKeyBinding('&lt 1 A'), 1)).toBe(true)
    expect(bindingReferencesLayer(parseKeyBinding('&to 0'), 0)).toBe(true)
    expect(bindingReferencesLayer(parseKeyBinding('&kp E'), 0)).toBe(false)
  })

  it('highlights the combo that names that layer', () => {
    const mo = parseKeyBinding('&mo 1')
    expect(legendHoverHit(mo, { kind: 'layer', layer: 1 })).toBe('combo')
    expect(legendHoverHit(mo, { kind: 'layer', layer: 0 })).toBe('none')
    expect(legendHoverHit(parseKeyBinding('&mo 3'), { kind: 'layer', layer: 2 })).toBe(
      'none'
    )
    expect(legendHoverHit(parseKeyBinding('&mo 3'), { kind: 'layer', layer: 3 })).toBe(
      'combo'
    )
    expect(legendHoverHit(parseKeyBinding('&to 4'), { kind: 'layer', layer: 3 })).toBe(
      'none'
    )
    expect(legendHoverHit(parseKeyBinding('&to 4'), { kind: 'layer', layer: 4 })).toBe(
      'combo'
    )
    expect(legendHoverHit(parseKeyBinding('&lt 1 LS(CAPS)'), { kind: 'layer', layer: 1 })).toBe(
      'combo'
    )
    expect(legendHoverHit(parseKeyBinding('&lt 1 A'), { kind: 'layer', layer: 1 })).toBe(
      'hold'
    )
    expect(legendHoverHit(parseKeyBinding('&kp E'), { kind: 'layer', layer: 0 })).toBe('none')
  })

  it('highlights RAlt for AltGr and RAlt plus Shift for AltGr+Shift', () => {
    expect(bindingSendsAltGr(parseKeyBinding('&mt RALT LBKT'))).toBe(true)
    expect(bindingSendsAltGr(parseKeyBinding('&kp RALT'))).toBe(true)
    expect(bindingSendsAltGr(parseKeyBinding('&kp E'))).toBe(false)
    expect(bindingSendsShift(parseKeyBinding('&kp LSHIFT'))).toBe(true)
    expect(bindingSendsShift(parseKeyBinding('&mt LSHIFT K'))).toBe(true)
    expect(bindingSendsShift(parseKeyBinding('&lt 1 LS(CAPS)'))).toBe(false)
    expect(legendHoverHit(parseKeyBinding('&mt RALT LBKT'), { kind: 'altGr' })).toBe('hold')
    expect(legendHoverHit(parseKeyBinding('&kp RALT'), { kind: 'altGr' })).toBe('combo')
    expect(legendHoverHit(parseKeyBinding('&kp LSHIFT'), { kind: 'altGrShift' })).toBe(
      'combo'
    )
    expect(legendHoverHit(parseKeyBinding('&mt LSHIFT K'), { kind: 'altGrShift' })).toBe(
      'hold'
    )
    expect(legendHoverHit(parseKeyBinding('&kp E'), { kind: 'altGr' })).toBe('none')
  })

  it('still composes a host letter on a hold-tap', () => {
    const legend = composeKey({ binding: parseKeyBinding('&lt 1 A') })
    expect(baseColumn(legend!)?.pair).toEqual(['a', 'A'])
    expect(extraColumn(legend!)?.pair).toEqual(['ф', 'Ф'])
    expect(legend?.hold).toBe('⧗L1')
    expect(legend?.holdRef).toEqual({ kind: 'layer', layer: 1 })
  })

  it('keeps empty layer slots so a missing row does not shift the others', () => {
    const rows = composeLayerRows([
      parseKeyBinding('&kp E'),
      parseKeyBinding('&trans'),
      parseKeyBinding('&kp F8'),
      parseKeyBinding('&none')
    ])
    expect(rows.map(row => row.layer)).toEqual([0, 1, 2, 3])
    expect(rows.map(row => row.blank)).toEqual([false, true, false, true])
    expect(rows[0].legend?.columns[0]?.pair).toEqual(['e', 'E'])
    expect(rows[2].legend).toBeNull()
  })

  it('previews only the first four firmware layers', () => {
    const rows = composeLayerRows([
      parseKeyBinding('&kp E'),
      parseKeyBinding('&kp F8'),
      parseKeyBinding('&kp A'),
      parseKeyBinding('&kp S'),
      parseKeyBinding('&kp D')
    ])
    expect(rows.map(row => row.layer)).toEqual([0, 1, 2, 3])
    expect(rows[3].legend?.columns[0]?.pair).toEqual(['s', 'S'])
  })

  it('does not pad a short keymap to four layer slots', () => {
    const rows = composeLayerRows([
      parseKeyBinding('&trans'),
      parseKeyBinding('&none')
    ])
    expect(rows).toHaveLength(2)
    expect(rows.map(row => row.layer)).toEqual([0, 1])
    expect(rows.every(row => row.blank)).toBe(true)
  })

  it('returns null for &trans / &none', () => {
    expect(composeKey({ binding: parseKeyBinding('&trans') })).toBeNull()
    expect(composeKey({ binding: parseKeyBinding('&none') })).toBeNull()
  })
})

describe('behaviorKeycapRole', () => {
  it('hides the default &kp and hold-tap when the pill is visible', () => {
    expect(behaviorKeycapRole('&kp', { paramCount: 1 })).toBe('hidden')
    expect(behaviorKeycapRole('&bt', { paramCount: 1 })).toBe('hidden')
    expect(behaviorKeycapRole('&out', { paramCount: 1 })).toBe('hidden')
    expect(
      behaviorKeycapRole('&mt', { paramCount: 2, holdTapVisible: true })
    ).toBe('hidden')
    expect(
      behaviorKeycapRole('&lt', { paramCount: 2, holdTapVisible: true })
    ).toBe('hidden')
  })

  it('puts parameterless binds in the center and the rest in the corner', () => {
    expect(behaviorKeycapRole('&none', { paramCount: 0 })).toBe('center')
    expect(behaviorKeycapRole('&trans', { paramCount: 0 })).toBe('center')
    expect(behaviorKeycapRole('&caps_word', { paramCount: 0 })).toBe('center')
    expect(behaviorKeycapRole('&mo', { paramCount: 1 })).toBe('corner')
    expect(behaviorKeycapRole('&sk', { paramCount: 1 })).toBe('corner')
    expect(
      behaviorKeycapRole('&mt', { paramCount: 2, holdTapVisible: false })
    ).toBe('corner')
  })
})

describe('isHoldTapBehavior', () => {
  it('marks &mt and &lt hold/tap params', () => {
    expect(isHoldTapBehavior('&mt')).toBe(true)
    expect(isHoldTapBehavior('&lt')).toBe(true)
    expect(isHoldTapBehavior('&kp')).toBe(false)
    expect(isHoldTapParam('mod')).toBe(true)
    expect(isHoldTapParam('layer')).toBe(true)
    expect(isHoldTapParam('code')).toBe(false)
  })
})

describe('keycapLegend', () => {
  it('keeps the behavior token and drops the repeated prefix', () => {
    expect(prefixedCommandLegend('BT_CLR')).toBe('CLR')
    expect(prefixedCommandLegend('BT_SEL')).toBe('SEL')
    expect(prefixedCommandLegend('BT_CLR_ALL')).toBe('CLR_ALL')
    expect(prefixedCommandLegend('BT1')).toBe('SEL1')
    expect(prefixedCommandLegend('OUT_USB')).toBe('USB')
    expect(prefixedCommandLegend('OUT_BLE')).toBe('BLE')
    expect(keycapLegend('BT_CLR')).toBe('CLR')
    expect(keycapLegend('BT0')).toBe('SEL0')
    expect(compactBehaviorLegend(parseKeyBinding('&bt BT_CLR'))).toBe('&bt CLR')
    expect(compactBehaviorLegend(parseKeyBinding('&bt BT_SEL 1'))).toBe('&bt SEL1')
    expect(compactBehaviorLegend(parseKeyBinding('&bt BT1'))).toBe('&bt SEL1')
    expect(compactBehaviorLegend(parseKeyBinding('&bt BT_CLR_ALL'))).toBe(
      '&bt CLR_ALL'
    )
    expect(compactBehaviorLegend(parseKeyBinding('&out OUT_USB'))).toBe('&out USB')
    expect(compactBehaviorLegend(parseKeyBinding('&out OUT_BLE'))).toBe('&out BLE')
  })

  it('leaves left modifiers unmarked and marks the right side', () => {
    expect(keycapLegend('LCTRL', '⌃')).toBe('⌃')
    expect(keycapLegend('RCTRL', '⌃')).toBe('R⌃')
    expect(keycapLegend('LALT', '⎇')).toBe('⎇')
    expect(keycapLegend('RALT', '⎇')).toBe('R⎇')
    expect(keycapLegend('LGUI', '⌘')).toBe('⌘')
    expect(keycapLegend('RGUI', '⌘')).toBe('R⌘')
    expect(keycapLegend('LC', '⌃')).toBe('⌃')
    expect(keycapLegend('RC', '⌃')).toBe('R⌃')
  })

  it('passes through non-modifier symbols', () => {
    expect(keycapLegend('BSPC', '⌫')).toBe('⌫')
    expect(keycapLegend('DEL', '⌦')).toBe('⌦')
    expect(keycapLegend('CAPS', '⇪')).toBe('⇪')
    expect(keycapLegend('C_AC_BACK', '←')).toBe('←')
    expect(keycapLegend('K_FORWARD', '→')).toBe('→')
    expect(keycapLegend('N1', '1')).toBe('1')
    expect(keycapLegend('KP_N7', '7')).toBe('7')
    expect(keycapLegend('KP_MINUS', '-')).toBe('-')
    expect(keycapLegend('KP_PLUS', '+')).toBe('+')
    expect(keycapLegend('KP_SLASH', '/')).toBe('/')
    expect(keycapLegend('KP_MULTIPLY', '*')).toBe('*')
  })

  it('marks HID keypad codes without changing the digit glyph', () => {
    expect(isKeypadCode('KP_N7')).toBe(true)
    expect(isKeypadCode('KP_ENTER')).toBe(true)
    expect(isKeypadCode('KC_KP_MINUS')).toBe(true)
    expect(isKeypadCode('N7')).toBe(false)
    expect(isKeypadCode('ENTER')).toBe(false)
    expect(isKeypadChoice({ code: 'CLEAR2', context: 'Keypad' })).toBe(true)
    expect(isKeypadChoice({ code: 'N7', context: 'Keyboard' })).toBe(false)
  })

  it('treats compact chords as short legends', () => {
    expect(isCompactKeycapLegend('⌃')).toBe(true)
    expect(isCompactKeycapLegend('R⌃')).toBe(true)
    expect(isCompactKeycapLegend('⎇')).toBe(true)
    expect(isCompactKeycapLegend('R⎇')).toBe(true)
    expect(isCompactModifierChord('LC', '⌦')).toBe(true)
    expect(isCompactModifierChord('LS', '⇪')).toBe(true)
    expect(isCompactModifierChord('LA', 'F4')).toBe(true)
    expect(isCompactModifierChord('LA', 'TAB')).toBe(true)
    expect(isCompactModifierChord('LA', 'ESC')).toBe(true)
    expect(isCompactModifierChord('LA', 'F12')).toBe(true)
    expect(isCompactModifierChord('LA', 'F13')).toBe(false)
    expect(isCompactModifierChord('LA', 'PAUSE_BREAK')).toBe(false)
    expect(isCompactModifierChord('A', '⌦')).toBe(false)
    expect(isCompactKeycapLegend('ESC')).toBe(false)
    expect(isCompactKeycapLegend('F4')).toBe(false)
  })

  it('uses display symbols for pause and mouse scroll', () => {
    expect(getKeycodeCatalog().byCode.LALT?.symbol).toBe('⎇')
    expect(getKeycodeCatalog().byCode.RALT?.symbol).toBe('⎇')
    expect(getKeycodeCatalog().byCode.PAUSE_BREAK?.symbol).toBe('⏸')
    expect(getKeycodeCatalog().byCode.MINUS?.symbol).toBe('-')
    expect(getKeycodeCatalog().byCode.EQUAL?.symbol).toBe('=')
    const scroll = getBehaviorCatalog().byCode['&msc']?.commands ?? []
    const symbol = (code: string) =>
      scroll.find(command => command.code === code)?.symbol
    expect(symbol('SCRL_UP')).toBe('SCRL⬆')
    expect(symbol('SCRL_DOWN')).toBe('SCRL⬇')
    expect(symbol('SCRL_LEFT')).toBe('SCRL⬅')
    expect(symbol('SCRL_RIGHT')).toBe('SCRL➡')
  })
})

describe('composeLegendDecode', () => {
  it('names the physical key and grids the fixture layouts against the system primary', () => {
    const card = composeLegendDecode(parseKeyBinding('&kp MINUS'), larkView())
    expect(card.keycode).toBe('KC_MINUS')
    expect(card.vk).toBe('VK_OEM_MINUS')
    expect(card.evdevName).toBe('KEY_MINUS')
    expect(card.current.map(column => column.language)).toEqual(['en', 'ru'])
    expect(card.current.map(column => column.flag)).toEqual(['🇦🇺', '🇷🇺'])
    expect(card.current.map(formatDecodeWord)).toEqual(['-_±ˬ', 'хХ±ˬ'])
    expect(card.system?.map(formatDecodeWord)).toEqual(['-_ˬˬ', '-_ˬˬ'])
    expect(card.current[0].slots.map(slot => slot.differs)).toEqual([false, false, true, false])
    expect(card.current[1].slots.map(slot => slot.differs)).toEqual([true, true, true, false])
  })

  it('keeps an empty AltGr slot so μ stays on Shift-AltGr', () => {
    const card = composeLegendDecode(parseKeyBinding('&kp M'), larkView())
    expect(formatDecodeWord(card.current[0])).toBe('mMˬμ')
    expect(formatDecodeWord(card.current[1])).toBe('ьЬъЪ')
    expect(card.system?.map(formatDecodeWord)).toEqual(['mMˬˬ', 'ьЬˬˬ'])
  })

  it('hides the system row when the profile already is the primary', () => {
    const card = composeLegendDecode(
      parseKeyBinding('&kp MINUS'),
      assignHostLanguageLayout(
        assignHostLanguageLayout(standardHostLegendView(), 'en', 'system-us'),
        'ru',
        'system-ru'
      )
    )
    expect(card.current.map(column => column.flag)).toEqual(['🇺🇸', '🇷🇺'])
    expect(card.current.map(formatDecodeWord)).toEqual(['-_ˬˬ', '-_ˬˬ'])
    expect(card.system).toBeNull()
    expect(card.current.every(column => column.slots.every(slot => !slot.differs))).toBe(true)
  })

  it('keeps identifiers and skips the grid for a non-character bind', () => {
    const card = composeLegendDecode(parseKeyBinding('&mo 1'))
    expect(card.binding).toBe('&mo 1')
    expect(card.keycode).toBeUndefined()
    expect(card.current).toEqual([])
    expect(card.system).toBeNull()
  })

  it('shows empty editable slots when the layout has no record for the key', () => {
    registerHostLayout(
      {
        id: 'user:empty-en',
        language: 'en',
        name: 'Empty EN',
        flag: '🇺🇸',
        origin: 'user'
      },
      { id: 'user:empty-en', byZmk: new Map() }
    )
    try {
      const base = composeLegendDecode(
        parseKeyBinding('&kp A'),
        assignHostLanguageLayout(standardHostLegendView(), 'en', 'user:empty-en')
      )
      expect(base.current.find(column => column.language === 'en')).toBeUndefined()
      const card = withEditableLegendDecodeGaps(
        base,
        assignHostLanguageLayout(standardHostLegendView(), 'en', 'user:empty-en')
      )
      const en = card.current.find(column => column.language === 'en')
      expect(en?.slots.map(slot => slot.text)).toEqual([
        ALT_LEVEL_EMPTY,
        ALT_LEVEL_EMPTY,
        ALT_LEVEL_EMPTY,
        ALT_LEVEL_EMPTY
      ])
      expect(en?.slots.map(slot => slot.differs)).toEqual([true, true, false, false])
      expect(
        card.system?.find(column => column.language === 'en')?.slots.map(slot => slot.text)
      ).toEqual(['a', 'A', ALT_LEVEL_EMPTY, ALT_LEVEL_EMPTY])
    } finally {
      unregisterHostLayout('user:empty-en')
    }
  })
})

describe('layerLegendSymbol', () => {
  it('prefixes the numeric layer index', () => {
    expect(layerLegendSymbol(0)).toBe('L0')
    expect(layerLegendSymbol(1)).toBe('L1')
    expect(layerLegendSymbol('3')).toBe('L3')
  })

  it('recognizes compact layer legends', () => {
    expect(isLayerLegendSymbol('L0')).toBe(true)
    expect(isLayerLegendSymbol('L12')).toBe(true)
    expect(isLayerLegendSymbol('1')).toBe(false)
    expect(isLayerLegendSymbol('LC')).toBe(false)
  })
})
