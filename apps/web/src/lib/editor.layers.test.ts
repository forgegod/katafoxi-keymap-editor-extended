import { beforeEach, describe, expect, it } from 'vitest'
import { editor } from './editor.svelte.js'

const esc = {
  value: '&kp',
  params: [{ value: 'ESC', params: [] }]
}

function mo(layer: string) {
  return { value: '&mo', params: [{ value: layer, params: [] }] }
}

function kp(code: string) {
  return { value: '&kp', params: [{ value: code, params: [] }] }
}

function seedFourLayers() {
  editor.layout = [{ x: 0, y: 0, row: 0, col: 0 }]
  const keymap = {
    layers: [
      [mo('2')],
      [kp('A')],
      [kp('B')],
      [kp('C')]
    ],
    layer_names: ['Base', 'Lower', 'Raise', 'Adjust'],
    combos: [
      { id: 'combo_raise', keyPositions: [0, 0], binding: esc, layers: [2] }
    ]
  }
  editor.baselineKeymap = structuredClone(keymap)
  editor.draftKeymap = structuredClone(keymap)
}

describe('editor deleteLayer remaps combo filters and layer refs', () => {
  beforeEach(() => {
    editor.resetForTests()
    seedFourLayers()
  })

  it('shifts combos[].layers so a filter still names the same remaining layer', () => {
    editor.deleteLayer(1)
    expect(editor.draftKeymap?.combos).toEqual([
      { id: 'combo_raise', keyPositions: [0, 0], binding: esc, layers: [1] }
    ])
  })

  it('drops a combo whose only listed layer was deleted', () => {
    editor.draftKeymap = {
      ...editor.draftKeymap!,
      combos: [{ id: 'combo_lower', keyPositions: [0, 0], binding: esc, layers: [1] }]
    }
    editor.deleteLayer(1)
    expect(editor.draftKeymap?.combos).toEqual([])
  })

  it('renumbers &mo / &lt and clears a ref to the deleted layer', () => {
    editor.draftKeymap = {
      ...editor.draftKeymap!,
      layers: [
        [mo('2')],
        [kp('A')],
        [
          {
            value: '&lt',
            params: [
              { value: '1', params: [] },
              { value: 'A', params: [] }
            ]
          }
        ],
        [kp('C')]
      ]
    }
    editor.deleteLayer(1)
    expect(editor.draftKeymap?.layers[0][0]).toEqual(mo('1'))
    expect(editor.draftKeymap?.layers[1][0]).toEqual({ value: '&trans', params: [] })
    expect(editor.saveNotice?.kind).toBe('warning')
    expect(editor.saveNotice?.messages[0]).toMatch(/transparent/i)
  })
})
