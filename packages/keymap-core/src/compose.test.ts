import { describe, expect, it } from 'vitest'
import {
  behaviorKeycapRole,
  bindingReferencesLayer,
  bindingSendsAltGr,
  bindingSendsShift,
  composeKey,
  composeLayerRows,
  encodeKeyBinding,
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
  formatLegendCompact,
  getBehaviorCatalog,
  getKeycodeCatalog,
  hostLegendFor,
  parseKeyBinding,
  standardHostLegendView,
  parseKeymap,
  generateKeymap,
  normalizeZmkKeycodes,
  resolveBinding
} from '../src/index.js'

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
    const legend = composeKey({ binding: parseKeyBinding('&kp A') })
    expect(legend?.en).toEqual(['a', 'A'])
    expect(legend?.second).toEqual(['ф', 'Ф'])
    expect(legend?.hold).toBeUndefined()
    expect(formatLegendCompact(legend!)).toBe('aA фФ @α')
    expect(legend?.bilingualNote).toBeUndefined()
  })

  it('marks host levels that differ between English and Russian', () => {
    const tee = composeKey({ binding: parseKeyBinding('&kp T') })
    expect(tee?.en).toEqual(['t', 'T'])
    expect(tee?.second).toEqual(['е', 'Е'])
    expect(tee?.altGr).toBe('Δ')
    expect(tee?.altGrShift).toBe('τ')
    expect(tee?.bilingualNote).toBe('Δτ/ёЁ')
    expect(formatLegendCompact(tee!)).toBe('tT еЕ Δτ/ёЁ')

    const em = composeKey({ binding: parseKeyBinding('&kp M') })
    expect(em?.en).toEqual(['m', 'M'])
    expect(em?.second).toEqual(['ь', 'Ь'])
    expect(em?.bilingualNote).toBe('μ/ъЪ')

    const grave = composeKey({ binding: parseKeyBinding('&kp GRAVE') })
    expect(grave?.en).toEqual(['`', '~'])
    expect(grave?.bilingualNote).toBe('/ёЁ')
  })

  it('splits E into En / Ru / AltGr columns', () => {
    const legend = composeKey({ binding: parseKeyBinding('&kp E') })
    expect(legend?.en).toEqual(['e', 'E'])
    expect(legend?.second).toEqual(['у', 'У'])
    expect(legend?.altGr).toBe('&')
    expect(legend?.altGrShift).toBe('ε')
    expect(formatLegendCompact(legend!)).toBe('eE уУ &ε')
  })

  it('puts hold badge only on &mt, not on bare &kp J', () => {
    const kp = composeKey({ binding: parseKeyBinding('&kp J') })
    expect(kp?.hold).toBeUndefined()
    expect(kp?.en).toEqual(['j', 'J'])
    expect(kp?.second).toEqual(['о', 'О'])
    expect(kp?.altGr).toBe('')
    expect(kp?.altGrShift).toBe('ξ')
    expect(formatLegendCompact(kp!)).toContain('ˬξ')

    const mt = composeKey({ binding: parseKeyBinding('&mt LCTRL J') })
    expect(mt?.en).toEqual(['j', 'J'])
    expect(mt?.hold).toBe('⧗⌃')
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
      hostView: { ...standardHostLegendView(), baseVisible: false }
    })
    expect(hiddenEn?.en).toEqual(['', ''])
    expect(hiddenEn?.second).toEqual(['у', 'У'])
    expect(hostLegendFor('E')?.en).toEqual(['e', 'E'])
  })

  it('omits a hidden layer so remaining rows keep their real indices', () => {
    const rows = composeLayerRows(
      [
        parseKeyBinding('&kp E'),
        parseKeyBinding('&kp KP_N8'),
        parseKeyBinding('&kp F8'),
        parseKeyBinding('&kp SLCK')
      ],
      { ...standardHostLegendView(), shownLayers: [0, 2, 3] }
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
      { ...standardHostLegendView(), shownLayers: [0, 2] }
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
      { ...standardHostLegendView(), shownLayers: [0, 1, 2] }
    )
    expect(rows.map(row => row.blank)).toEqual([true, true, false])
  })

  it('sets each row title to the encoded binding', () => {
    const holdTap = parseKeyBinding('&mt LCTRL J')
    const letter = parseKeyBinding('&kp E')
    const rows = composeLayerRows([holdTap, letter], {
      ...standardHostLegendView(),
      shownLayers: [0, 1]
    })
    expect(rows[0].title).toBe(encodeKeyBinding(holdTap))
    expect(rows[1].title).toBe(encodeKeyBinding(letter))
  })

  it('follows the host view for the second language and AltGr columns', () => {
    const englishOnly = composeKey({
      binding: parseKeyBinding('&kp A'),
      hostView: {
        baseId: 'lark-en',
        secondId: null,
        altGr: false,
        altGrShift: false,
        source: 'custom'
      }
    })
    expect(englishOnly?.en).toEqual(['a', 'A'])
    expect(englishOnly?.second).toBeNull()
    expect(englishOnly?.altGr).toBe('')
    expect(englishOnly?.altGrShift).toBe('')
    expect(formatLegendCompact(englishOnly!)).toBe('aA')
    expect(formatAltGrPair(englishOnly!)).toBeNull()
  })

  it('keeps an AltGr pair of empty marks while either column is on', () => {
    const both = composeKey({ binding: parseKeyBinding('&kp K') })
    expect(both?.altGr).toBe('')
    expect(both?.altGrShift).toBe('')
    expect(formatAltGrPair(both!)).toBe('ˬˬ')

    const shiftOnly = composeKey({
      binding: parseKeyBinding('&kp K'),
      hostView: { ...standardHostLegendView(), altGr: false }
    })
    expect(formatAltGrPair(shiftOnly!)).toBe('ˬ')

    const hidden = composeKey({
      binding: parseKeyBinding('&kp E'),
      hostView: { ...standardHostLegendView(), altGr: false, altGrShift: false }
    })
    expect(formatAltGrPair(hidden!)).toBeNull()
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
    expect(legend?.en).toEqual(['a', 'A'])
    expect(legend?.second).toEqual(['ф', 'Ф'])
    expect(legend?.hold).toBe('⧗L1')
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
    expect(rows[0].legend?.en).toEqual(['e', 'E'])
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
    expect(rows[3].legend?.en).toEqual(['s', 'S'])
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
    expect(keycapLegend('LALT', '⌥')).toBe('⌥')
    expect(keycapLegend('RALT', '⌥')).toBe('R⌥')
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
