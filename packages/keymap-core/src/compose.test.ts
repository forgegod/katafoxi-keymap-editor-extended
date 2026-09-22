import { describe, expect, it } from 'vitest'
import {
  composeKey,
  formatLegendCompact,
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
    expect(mt?.hold).toBe('⧗LC')
  })

  it('resolves &lt layer as hold badge', () => {
    const legend = composeKey({ binding: parseKeyBinding('&lt 1 ESC') })
    expect(legend?.keycode).toMatch(/ESC/)
    expect(legend?.hold).toBe('⧗L1')
  })

  it('returns null for &trans / &none', () => {
    expect(composeKey({ binding: parseKeyBinding('&trans') })).toBeNull()
    expect(composeKey({ binding: parseKeyBinding('&none') })).toBeNull()
  })
})
