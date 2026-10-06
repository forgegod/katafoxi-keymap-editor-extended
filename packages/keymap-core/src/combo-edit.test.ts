import { describe, expect, it } from 'vitest'
import {
  buildKeymapCode,
  parseDtsKeymap,
  parseKeymap,
  patchCombo,
  renameCombo,
  toggleComboLayer
} from './index.js'
import type { LayoutKey, ZmkCombo } from './types.js'

const ESC = { value: '&kp', params: [{ value: 'ESC', params: [] }] }
const TAB = { value: '&kp', params: [{ value: 'TAB', params: [] }] }

const TINY_LAYOUT: LayoutKey[] = [
  { x: 0, y: 0, row: 0, col: 0 },
  { x: 1, y: 0, row: 0, col: 1 }
]

function combo(id: string, extra: Partial<ZmkCombo> = {}): ZmkCombo {
  return {
    id,
    keyPositions: [0, 1],
    binding: ESC,
    ...extra
  }
}

describe('patchCombo', () => {
  const list = [
    combo('combo_esc', { timeoutMs: 40, slowRelease: true, layers: [0] }),
    combo('combo_tab', { binding: TAB, requirePriorIdleMs: 100 })
  ]

  it.each([
    {
      name: 'sets timeoutMs',
      id: 'combo_esc',
      patch: { timeoutMs: 80 } as Partial<ZmkCombo>,
      check: (next: ZmkCombo) => expect(next.timeoutMs).toBe(80)
    },
    {
      name: 'drops timeoutMs when undefined',
      id: 'combo_esc',
      patch: { timeoutMs: undefined } as Partial<ZmkCombo>,
      check: (next: ZmkCombo) => expect(next.timeoutMs).toBeUndefined()
    },
    {
      name: 'drops requirePriorIdleMs when undefined',
      id: 'combo_tab',
      patch: { requirePriorIdleMs: undefined } as Partial<ZmkCombo>,
      check: (next: ZmkCombo) => expect(next.requirePriorIdleMs).toBeUndefined()
    },
    {
      name: 'drops empty layers (all layers)',
      id: 'combo_esc',
      patch: { layers: [] } as Partial<ZmkCombo>,
      check: (next: ZmkCombo) => expect(next.layers).toBeUndefined()
    },
    {
      name: 'drops layers when undefined',
      id: 'combo_esc',
      patch: { layers: undefined } as Partial<ZmkCombo>,
      check: (next: ZmkCombo) => expect(next.layers).toBeUndefined()
    },
    {
      name: 'drops falsy slowRelease',
      id: 'combo_esc',
      patch: { slowRelease: false } as Partial<ZmkCombo>,
      check: (next: ZmkCombo) => expect(next.slowRelease).toBeUndefined()
    },
    {
      name: 'keeps a true slowRelease',
      id: 'combo_tab',
      patch: { slowRelease: true } as Partial<ZmkCombo>,
      check: (next: ZmkCombo) => expect(next.slowRelease).toBe(true)
    }
  ])('$name', ({ id, patch, check }) => {
    const next = patchCombo(list, id, patch)
    const edited = next.find(c => c.id === id)
    expect(edited).toBeDefined()
    check(edited!)
    const otherId = id === 'combo_esc' ? 'combo_tab' : 'combo_esc'
    expect(next.find(c => c.id === otherId)).toEqual(
      list.find(c => c.id === otherId)
    )
    expect(list.find(c => c.id === 'combo_esc')?.timeoutMs).toBe(40)
  })

  it('leaves the list unchanged when the id is missing', () => {
    const next = patchCombo(list, 'missing', { timeoutMs: 9 })
    expect(next).toEqual(list)
  })
})

describe('toggleComboLayer', () => {
  it.each([
    {
      name: 'starts a layer filter from all-layers',
      layers: undefined as number[] | undefined,
      index: 1,
      layerCount: 3,
      expected: [1] as number[] | undefined
    },
    {
      name: 'treats an empty filter as all-layers',
      layers: [] as number[],
      index: 0,
      layerCount: 2,
      expected: [0] as number[] | undefined
    },
    {
      name: 'clears the last remaining layer (all layers)',
      layers: [1],
      index: 1,
      layerCount: 3,
      expected: undefined
    },
    {
      name: 'clears when every layer is selected',
      layers: [0],
      index: 1,
      layerCount: 2,
      expected: undefined
    },
    {
      name: 'adds a layer and sorts indexes',
      layers: [2],
      index: 0,
      layerCount: 3,
      expected: [0, 2]
    },
    {
      name: 'drops one layer from a partial filter',
      layers: [0, 2],
      index: 2,
      layerCount: 3,
      expected: [0]
    }
  ])('$name', ({ layers, index, layerCount, expected }) => {
    const combo = layers === undefined ? { layers: undefined } : { layers }
    expect(toggleComboLayer(combo, index, layerCount)).toEqual(expected)
  })
})

describe('renameCombo', () => {
  const list = [combo('combo_esc'), combo('combo_tab', { binding: TAB })]

  it.each([
    {
      name: 'accepts a unique sanitized id',
      raw: 'combo enter',
      want: 'combo_enter'
    },
    {
      name: 'replaces punctuation with underscores',
      raw: 'combo-enter!',
      want: 'combo_enter_'
    }
  ])('$name', ({ raw, want }) => {
    const result = renameCombo(list, 'combo_esc', raw)
    expect(result).not.toBeNull()
    expect(result!.id).toBe(want)
    expect(result!.combos.map(c => c.id)).toEqual([want, 'combo_tab'])
    expect(list[0]!.id).toBe('combo_esc')
  })

  it.each([
    { name: 'rejects an unchanged id', raw: 'combo_esc' },
    { name: 'rejects a taken id', raw: 'combo_tab' },
    { name: 'rejects a taken id after sanitize', raw: 'combo-tab' },
    { name: 'falls back to the current id when empty', raw: '   ' }
  ])('$name', ({ raw }) => {
    expect(renameCombo(list, 'combo_esc', raw)).toBeNull()
  })
})

describe('combo-edit round-trip', () => {
  it('survives buildKeymapCode after patch, layer toggle, and rename', () => {
    const source = `#include <behaviors.dtsi>

keymap {
    compatible = "zmk,keymap";
    layer_0 { bindings = <&kp A &kp B>; };
    layer_1 { bindings = <&trans &trans>; };
};
`
    let combos: ZmkCombo[] = [combo('combo_esc')]
    combos = patchCombo(combos, 'combo_esc', {
      timeoutMs: 40,
      requirePriorIdleMs: 80,
      slowRelease: true,
      layers: [0]
    })
    combos = patchCombo(combos, 'combo_esc', {
      layers: toggleComboLayer(combos[0]!, 1, 2)
    })
    const renamed = renameCombo(combos, 'combo_esc', 'combo_esc_hold')
    expect(renamed).not.toBeNull()
    combos = renamed!.combos

    const km = parseKeymap(parseDtsKeymap(source))
    km.combos = combos
    const built = buildKeymapCode(TINY_LAYOUT, km, { originalSource: source })
    expect(built.mode).toBe('splice')
    expect(parseKeymap(parseDtsKeymap(built.code)).combos).toEqual([
      {
        id: 'combo_esc_hold',
        keyPositions: [0, 1],
        binding: ESC,
        timeoutMs: 40,
        requirePriorIdleMs: 80,
        slowRelease: true
      }
    ])
  })
})
