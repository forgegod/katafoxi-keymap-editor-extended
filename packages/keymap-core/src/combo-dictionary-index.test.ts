import { describe, expect, it } from 'vitest'
import {
  comboBindingIndexRef,
  comboDictionaryIndexHits,
  comboDictionaryIndexModel,
  typewriterIndexFace,
  TYPEWRITER_INDEX_KEYS
} from './combo-dictionary-index.js'
import type { KeyBindingNode, LayoutKey, ZmkCombo } from './types.js'

function kp(code: string): KeyBindingNode {
  return { value: '&kp', params: [{ value: code, params: [] }] }
}

function kpWrap(wrap: string, inner: string): KeyBindingNode {
  return {
    value: '&kp',
    params: [{ value: wrap, params: [{ value: inner, params: [] }] }]
  }
}

function combo(id: string, keyPositions: number[], binding: KeyBindingNode): ZmkCombo {
  return { id, keyPositions, binding }
}

const LAYOUT: LayoutKey[] = [
  { x: 0, y: 0, row: 0, col: 0 },
  { x: 1, y: 0, row: 0, col: 1 },
  { x: 2, y: 2, row: 2, col: 2 },
  { x: 3, y: 2, row: 2, col: 3 }
]

describe('combo typewriter index', () => {
  it('maps letters, wraps, shift aliases, and F-keys onto the skeleton', () => {
    expect(comboBindingIndexRef(kp('A'))).toEqual({
      kind: 'key',
      keyId: 'a',
      band: 'base'
    })
    expect(comboBindingIndexRef(kp('LS(B)'))).toEqual({
      kind: 'key',
      keyId: 'b',
      band: 'shift'
    })
    expect(comboBindingIndexRef(kpWrap('LS', 'B'))).toEqual({
      kind: 'key',
      keyId: 'b',
      band: 'shift'
    })
    expect(comboBindingIndexRef(kp('EXCL'))).toEqual({
      kind: 'key',
      keyId: 'n1',
      band: 'shift'
    })
    expect(comboBindingIndexRef(kp('F5'))).toEqual({
      kind: 'key',
      keyId: 'f5',
      band: 'base'
    })
    expect(comboBindingIndexRef(kp('LEFT'))).toEqual({
      kind: 'key',
      keyId: 'left',
      band: 'base'
    })
    expect(comboBindingIndexRef({ value: '&none', params: [] })).toEqual({ kind: 'skip' })
    expect(comboBindingIndexRef({ value: '&bootloader', params: [] })).toEqual({
      kind: 'other',
      label: 'bootloader'
    })
  })

  it('peeks the fewest-extra chords when several variants share a letter', () => {
    const combos = [
      combo('l_a', [0], kp('A')),
      combo('li_a', [0, 2], kpWrap('LS', 'A')),
      combo('r_a', [1], kp('A')),
      combo('lo_a', [0, 3], kp('LEFT')),
      combo('boot', [0, 1], { value: '&bootloader', params: [] })
    ]
    const hits = comboDictionaryIndexHits(combos, [2, 3])
    expect(hits.get('a')?.base?.positions).toEqual([0, 1])
    expect(hits.get('a')?.shift?.positions).toEqual([0, 2])
    expect(hits.get('left')?.base?.positions).toEqual([0, 3])
    const model = comboDictionaryIndexModel(LAYOUT, combos)
    expect(model.hits.get('a')?.base?.positions).toEqual([0, 1])
    expect(model.other.map(item => item.label)).toEqual(['bootloader'])
  })

  it('shows y/Y and 1/! when a key has both bands', () => {
    const stub = (keyId: string, band: 'base' | 'shift') => ({
      keyId,
      band,
      positions: [0],
      comboIds: ['x']
    })
    const y = TYPEWRITER_INDEX_KEYS.find(key => key.id === 'y')
    const n1 = TYPEWRITER_INDEX_KEYS.find(key => key.id === 'n1')
    expect(y && typewriterIndexFace(y, { base: stub('y', 'base'), shift: stub('y', 'shift') })).toEqual({
      base: 'y',
      shift: 'Y'
    })
    expect(
      n1 && typewriterIndexFace(n1, { base: stub('n1', 'base'), shift: stub('n1', 'shift') })
    ).toEqual({
      base: '1',
      shift: '!'
    })
  })
})
