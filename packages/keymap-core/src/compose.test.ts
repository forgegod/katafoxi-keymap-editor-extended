import { describe, expect, it } from 'vitest'
import {
  composeKey,
  isCompactKeycapLegend,
  isCompactModifierChord,
  isHoldTapBehavior,
  isHoldTapParam,
  isKeypadChoice,
  isKeypadCode,
  isLayerLegendSymbol,
  keycapLegend,
  layerLegendSymbol,
  formatLegendCompact,
  getBehaviorCatalog,
  getKeycodeCatalog,
  parseKeyBinding,
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
    expect(legend?.primary).toEqual(['a', 'Ф'])
    expect(legend?.hold).toBeUndefined()
    expect(formatLegendCompact(legend!)).toBe('aФ @α')
  })

  it('puts hold badge only on &mt, not on bare &kp J', () => {
    const kp = composeKey({ binding: parseKeyBinding('&kp J') })
    expect(kp?.hold).toBeUndefined()
    expect(kp?.primary).toEqual(['j', 'О'])

    const mt = composeKey({ binding: parseKeyBinding('&mt LCTRL J') })
    expect(mt?.primary).toEqual(['j', 'О'])
    expect(mt?.hold).toBe('⧗⌃')
  })

  it('resolves &lt layer as hold badge', () => {
    const legend = composeKey({ binding: parseKeyBinding('&lt 1 ESC') })
    expect(legend?.keycode).toMatch(/ESC/)
    expect(legend?.hold).toBe('⧗L1')
  })

  it('flags keypad taps so the host glyph can stay boxed', () => {
    expect(composeKey({ binding: parseKeyBinding('&kp KP_N7') })?.keypad).toBe(true)
    expect(composeKey({ binding: parseKeyBinding('&kp N7') })?.keypad).toBe(false)
  })

  it('returns null for &trans / &none', () => {
    expect(composeKey({ binding: parseKeyBinding('&trans') })).toBeNull()
    expect(composeKey({ binding: parseKeyBinding('&none') })).toBeNull()
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
