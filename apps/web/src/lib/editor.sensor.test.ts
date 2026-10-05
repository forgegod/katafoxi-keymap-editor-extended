import { beforeEach, describe, expect, it } from 'vitest'
import { editor } from './editor.svelte.js'

const vol = {
  value: '&inc_dec_kp',
  params: [
    { value: 'C_VOL_UP', params: [] },
    { value: 'C_VOL_DN', params: [] }
  ]
}

describe('editor encoders', () => {
  beforeEach(() => {
    editor.resetForTests()
    editor.layout = [{ x: 0, y: 0, row: 0, col: 0 }]
    const keymap = {
      layers: [[{ value: '&kp', params: [{ value: 'A', params: [] }] }]],
      layer_names: ['default'],
      sensorBindings: [[vol]]
    }
    editor.baselineKeymap = structuredClone(keymap)
    editor.draftKeymap = structuredClone(keymap)
  })

  it('copies encoder turns onto a new layer and drops them with the layer', () => {
    editor.addLayer()
    expect(editor.draftKeymap?.sensorBindings).toHaveLength(2)
    expect(editor.draftKeymap?.sensorBindings?.[1]).toEqual([vol])

    editor.deleteLayer(1)
    expect(editor.draftKeymap?.sensorBindings).toEqual([[vol]])
  })

  it('replaces one turn without touching the keys', () => {
    editor.updateSensorBinding(0, 0, {
      value: '&inc_dec_kp',
      params: [
        { value: 'PG_UP', params: [] },
        { value: 'PG_DN', params: [] }
      ]
    })
    expect(editor.draftKeymap?.layers[0][0]).toEqual({
      value: '&kp',
      params: [{ value: 'A', params: [] }]
    })
    expect(editor.draftKeymap?.sensorBindings?.[0][0].params.map(p => p.value)).toEqual([
      'PG_UP',
      'PG_DN'
    ])
  })
})
