import { describe, expect, it } from 'vitest'
import {
  adoptHoldTaps,
  adoptSensorBindings,
  cloneLayout,
  cloneParsedKeymap,
  cloneSensorBinding
} from './keymap-clone.js'
import type { ParsedKeymap } from './types.js'

function kp(code: string) {
  return { value: '&kp', params: [{ value: code, params: [] }] }
}

describe('cloneLayout', () => {
  it('returns null for nullish input', () => {
    expect(cloneLayout(null)).toBeNull()
    expect(cloneLayout(undefined)).toBeNull()
  })

  it('shallow-clones keys so edits do not mutate the source', () => {
    const layout = [{ x: 0, y: 0, row: 0, col: 0, absent: true }]
    const copy = cloneLayout(layout)!
    copy[0].absent = false
    expect(layout[0].absent).toBe(true)
  })
})

describe('cloneSensorBinding', () => {
  it('deep-clones params', () => {
    const node = kp('A')
    const copy = cloneSensorBinding(node)
    copy.params[0].value = 'B'
    expect(node.params[0].value).toBe('A')
  })
})

describe('cloneParsedKeymap', () => {
  it('fills layer_names and clones layers', () => {
    const km: ParsedKeymap = {
      layers: [[kp('A')], [kp('B')]],
      combos: [
        {
          id: 'combo_ab',
          keyPositions: [0, 1],
          binding: kp('C'),
          timeoutMs: 40
        }
      ],
      holdTaps: [{ code: '&hm', tappingTermMs: 200, bindings: ['&kp', '&kp'] }],
      sensorBindings: [[kp('PG_UP')]]
    }
    const copy = cloneParsedKeymap(km)
    expect(copy.layer_names).toEqual(['Layer 0', 'Layer 1'])
    copy.layers[0][0].params[0].value = 'Z'
    copy.combos![0].keyPositions[0] = 9
    copy.holdTaps![0].tappingTermMs = 1
    copy.sensorBindings![0][0].params[0].value = 'PG_DN'
    expect(km.layers[0][0].params[0].value).toBe('A')
    expect(km.combos![0].keyPositions[0]).toBe(0)
    expect(km.holdTaps![0].tappingTermMs).toBe(200)
    expect(km.sensorBindings![0][0].params[0].value).toBe('PG_UP')
  })

  it('preserves explicit empty combos', () => {
    const copy = cloneParsedKeymap({ layers: [[kp('A')]], combos: [] })
    expect(copy.combos).toEqual([])
  })
})

describe('adoptHoldTaps', () => {
  const loaded: ParsedKeymap = {
    layers: [[kp('A')]],
    holdTaps: [{ code: '&mt', override: true, tappingTermMs: 180 }]
  }

  it('adopts loaded hold-taps when the draft has none', () => {
    const draft: ParsedKeymap = { layers: [[kp('B')]] }
    const next = adoptHoldTaps(draft, loaded)
    expect(next.holdTaps).toEqual(loaded.holdTaps)
    expect(next.layers[0][0].params[0].value).toBe('B')
  })

  it('keeps an explicit draft list, including empty', () => {
    expect(adoptHoldTaps({ layers: [[kp('A')]], holdTaps: [] }, loaded).holdTaps).toEqual(
      []
    )
    const draft: ParsedKeymap = {
      layers: [[kp('A')]],
      holdTaps: [{ code: '&hm', tappingTermMs: 99 }]
    }
    expect(adoptHoldTaps(draft, loaded).holdTaps).toEqual(draft.holdTaps)
  })
})

describe('adoptSensorBindings', () => {
  const loaded: ParsedKeymap = {
    layers: [[kp('A')]],
    sensorBindings: [[kp('PG_UP')]]
  }

  it('adopts loaded encoder rows when the draft has none', () => {
    const draft: ParsedKeymap = { layers: [[kp('B')]] }
    const next = adoptSensorBindings(draft, loaded)
    expect(next.sensorBindings).toEqual(loaded.sensorBindings)
  })

  it('keeps an explicit draft list, including empty', () => {
    expect(
      adoptSensorBindings({ layers: [[kp('A')]], sensorBindings: [] }, loaded)
        .sensorBindings
    ).toEqual([])
  })
})
