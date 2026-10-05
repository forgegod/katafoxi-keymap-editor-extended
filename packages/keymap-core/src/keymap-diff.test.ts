import { describe, expect, it } from 'vitest'
import {
  diffKeymaps,
  formatKeymapChange,
  keymapsAreEqual,
  summarizeKeymapDiff
} from './keymap-diff.js'
import { parseKeymap } from './keymap.js'

const base = () =>
  parseKeymap({
    layer_names: ['Base', 'Nav'],
    layers: [
      ['&kp A', '&kp B'],
      ['&trans', '&kp C']
    ]
  })

describe('diffKeymaps', () => {
  it('reports no changes for equal keymaps', () => {
    const a = base()
    const b = base()
    expect(diffKeymaps(a, b)).toEqual([])
    expect(keymapsAreEqual(a, b)).toBe(true)
  })

  it('treats equivalent bind trees as equal via encode', () => {
    const a = {
      layer_names: ['Base'],
      layers: [[{ value: '&kp A', params: [] }]]
    }
    const b = {
      layer_names: ['Base'],
      layers: [[{ value: '&kp', params: [{ value: 'A', params: [] }] }]]
    }
    expect(diffKeymaps(a, b)).toEqual([])
    expect(keymapsAreEqual(a, b)).toBe(true)
  })

  it('detects binding changes', () => {
    const a = base()
    const b = base()
    b.layers[0][1] = { value: '&kp', params: [{ value: 'Z', params: [] }] }
    expect(diffKeymaps(a, b)).toEqual([
      {
        type: 'binding',
        layer: 0,
        index: 1,
        before: '&kp B',
        after: '&kp Z'
      }
    ])
  })

  it('detects layer rename', () => {
    const a = base()
    const b = base()
    b.layer_names = ['Base', 'Navigation']
    expect(diffKeymaps(a, b)).toEqual([
      {
        type: 'layer_rename',
        layer: 1,
        before: 'Nav',
        after: 'Navigation'
      }
    ])
  })

  it('detects layer add and remove', () => {
    const a = base()
    const added = base()
    added.layer_names = ['Base', 'Nav', 'Sym']
    added.layers.push([{ value: '&trans', params: [] }])
    expect(diffKeymaps(a, added)).toEqual([
      { type: 'layer_add', layer: 2, name: 'Sym' }
    ])

    const removed = base()
    removed.layer_names = ['Base']
    removed.layers = [removed.layers[0]]
    expect(diffKeymaps(a, removed)).toEqual([
      { type: 'layer_remove', layer: 1, name: 'Nav' }
    ])
  })

  it('detects combo add, change, and remove', () => {
    const a = base()
    const withCombo = base()
    withCombo.combos = [
      {
        id: 'combo_esc',
        keyPositions: [0, 1],
        binding: { value: '&kp', params: [{ value: 'ESC', params: [] }] }
      }
    ]
    expect(diffKeymaps(a, withCombo)).toEqual([
      {
        type: 'combo',
        id: 'combo_esc',
        before: '',
        after: '[0 1] &kp ESC all'
      }
    ])
    expect(keymapsAreEqual(a, withCombo)).toBe(false)

    const edited = base()
    edited.combos = [
      {
        id: 'combo_esc',
        keyPositions: [0, 1],
        binding: { value: '&kp', params: [{ value: 'ESC', params: [] }] },
        timeoutMs: 30,
        layers: [0],
        slowRelease: true
      }
    ]
    expect(diffKeymaps(withCombo, edited)).toEqual([
      {
        type: 'combo',
        id: 'combo_esc',
        before: '[0 1] &kp ESC all',
        after: '[0 1] &kp ESC 30ms L0 slow'
      }
    ])

    expect(diffKeymaps(withCombo, a)).toEqual([
      {
        type: 'combo',
        id: 'combo_esc',
        before: '[0 1] &kp ESC all',
        after: ''
      }
    ])
  })

  it('treats missing and empty combos as equal', () => {
    const a = base()
    const b = base()
    b.combos = []
    expect(diffKeymaps(a, b)).toEqual([])
  })
})

describe('formatKeymapChange', () => {
  it('names bindings and layer edits', () => {
    expect(
      formatKeymapChange({
        type: 'binding',
        layer: 0,
        index: 2,
        before: '&kp A',
        after: ''
      })
    ).toBe('L0 key 2: &kp A → (empty)')
    expect(
      formatKeymapChange({
        type: 'layer_rename',
        layer: 1,
        before: 'Nav',
        after: 'Navigation'
      })
    ).toBe('L1: Nav → Navigation')
    expect(formatKeymapChange({ type: 'layer_add', layer: 2, name: 'Sym' })).toBe(
      'L2 added: Sym'
    )
    expect(
      formatKeymapChange({ type: 'layer_remove', layer: 1, name: 'Nav' })
    ).toBe('L1 removed: Nav')
    expect(
      formatKeymapChange({
        type: 'combo',
        id: 'combo_esc',
        before: '',
        after: '[0 1] &kp ESC all'
      })
    ).toBe('combo_esc added: [0 1] &kp ESC all')
    expect(
      formatKeymapChange({
        type: 'combo',
        id: 'combo_esc',
        before: '[0 1] &kp ESC all',
        after: ''
      })
    ).toBe('combo_esc removed: [0 1] &kp ESC all')
  })
})

describe('summarizeKeymapDiff', () => {
  it('formats mixed typed changes', () => {
    const summary = summarizeKeymapDiff([
      {
        type: 'binding',
        layer: 0,
        index: 0,
        before: '&kp A',
        after: '&kp B'
      },
      {
        type: 'binding',
        layer: 0,
        index: 1,
        before: '&kp B',
        after: '&kp C'
      },
      {
        type: 'binding',
        layer: 1,
        index: 0,
        before: '&trans',
        after: '&kp X'
      },
      {
        type: 'layer_rename',
        layer: 1,
        before: 'Nav',
        after: 'Navigation'
      }
    ])
    expect(summary).toBe('3 bindings, 1 layer renamed')
  })

  it('uses singular labels', () => {
    expect(
      summarizeKeymapDiff([{ type: 'layer_add', layer: 2, name: 'Sym' }])
    ).toBe('1 layer added')
    expect(
      summarizeKeymapDiff([
        {
          type: 'combo',
          id: 'combo_esc',
          before: '',
          after: '[0 1] &kp ESC all'
        }
      ])
    ).toBe('1 combo')
  })

  it('reports an encoder turn change', () => {
    const before = parseKeymap({
      layer_names: ['Base'],
      layers: [['&kp A']],
      sensorBindings: [['&inc_dec_kp C_VOL_UP C_VOL_DN']]
    })
    const after = parseKeymap({
      layer_names: ['Base'],
      layers: [['&kp A']],
      sensorBindings: [['&inc_dec_kp PG_UP PG_DN']]
    })
    const changes = diffKeymaps(before, after)
    expect(changes).toEqual([
      {
        type: 'sensor',
        layer: 0,
        index: 0,
        before: '&inc_dec_kp C_VOL_UP C_VOL_DN',
        after: '&inc_dec_kp PG_UP PG_DN'
      }
    ])
    expect(summarizeKeymapDiff(changes)).toBe('1 encoder')
  })
})
