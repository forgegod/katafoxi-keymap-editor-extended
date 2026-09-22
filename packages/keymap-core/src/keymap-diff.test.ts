import { describe, expect, it } from 'vitest'
import {
  diffKeymaps,
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
  })
})
