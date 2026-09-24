import { describe, expect, it } from 'vitest'
import {
  collectUsedKeycodes,
  collectUsedKeycodesOnLayer,
  usedKeycodesRevision
} from './keymap-usage.js'

describe('collectUsedKeycodesOnLayer', () => {
  it('collects &kp taps and the tap plus modifier of &mt', () => {
    const used = collectUsedKeycodesOnLayer([
      { value: '&kp', params: [{ value: 'A', params: [] }] },
      {
        value: '&mt',
        params: [
          { value: 'LCTRL', params: [] },
          { value: 'B', params: [] }
        ]
      },
      { value: '&kp', params: [{ value: 'SPC', params: [] }] },
      { value: '&trans', params: [] }
    ])

    expect([...used].sort()).toEqual(['A', 'B', 'LCTRL', 'SPC'])
  })

  it('unwraps a modifier chain to the terminal key', () => {
    const used = collectUsedKeycodesOnLayer([
      {
        value: '&lt',
        params: [
          { value: 1, params: [] },
          { value: 'LS', params: [{ value: 'CAPS', params: [] }] }
        ]
      },
      { value: '&mo', params: [{ value: 2, params: [] }] }
    ])

    expect([...used]).toEqual(['CAPS'])
  })

  it('collects mouse and other command tokens already placed', () => {
    const used = collectUsedKeycodesOnLayer([
      { value: '&mkp', params: [{ value: 'LCLK', params: [] }] },
      { value: '&mkp', params: [{ value: 'MCLK', params: [] }] },
      { value: '&mkp', params: [{ value: 'RCLK', params: [] }] },
      { value: '&msc', params: [{ value: 'SCRL_UP', params: [] }] },
      { value: '&mo', params: [{ value: 1, params: [] }] }
    ])

    expect([...used].sort()).toEqual(['LCLK', 'MCLK', 'RCLK', 'SCRL_UP'])
  })

  it('returns an empty set for missing layers', () => {
    expect(collectUsedKeycodesOnLayer(undefined).size).toBe(0)
  })
})

describe('collectUsedKeycodes', () => {
  it('lists each layer index once, across the keymap', () => {
    const layer = (code: string) => [
      { value: '&kp', params: [{ value: code, params: [] }] }
    ]
    const used = collectUsedKeycodes([
      layer('Q'),
      [{ value: '&none', params: [] }],
      layer('F7'),
      undefined,
      [
        { value: '&kp', params: [{ value: 'Q', params: [] }] },
        { value: '&kp', params: [{ value: 'Q', params: [] }] }
      ]
    ])

    expect(used.get('Q')).toEqual([0, 4])
    expect(used.get('F7')).toEqual([2])
    expect(used.has('1')).toBe(false)
  })

  it('drops a deleted layer and shifts later indexes', () => {
    const layer = (code: string) => [
      { value: '&kp', params: [{ value: code, params: [] }] }
    ]
    const before = collectUsedKeycodes([layer('F4'), layer('A'), layer('F12')])
    expect(before.get('F4')).toEqual([0])
    expect(before.get('F12')).toEqual([2])

    const after = collectUsedKeycodes([layer('A'), layer('F12')])
    expect(after.has('F4')).toBe(false)
    expect(after.get('F12')).toEqual([1])
    expect(usedKeycodesRevision(after)).not.toBe(usedKeycodesRevision(before))
  })
})
