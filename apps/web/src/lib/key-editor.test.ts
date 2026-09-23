import { describe, expect, it } from 'vitest'
import {
  buildEditorSlots,
  codeColumnMinPx,
  codeGridMetrics,
  isKeycodeParam,
  slotLabel,
  type EditorSlot
} from './key-editor'
import type { HydratedNode } from './hydrate'

function slotSummary(slots: EditorSlot[]) {
  return slots.map(s => `${s.label}:${s.value ?? ''}`)
}

describe('slotLabel', () => {
  it('maps known param kinds and named enums', () => {
    expect(slotLabel('code')).toBe('Key')
    expect(slotLabel('mod')).toBe('Modifier')
    expect(slotLabel({ name: 'index' })).toBe('index')
  })
})

describe('isKeycodeParam', () => {
  it('is true only for keycode slots', () => {
    expect(isKeycodeParam('code')).toBe(true)
    expect(isKeycodeParam('layer')).toBe(false)
  })
})

describe('codeGridMetrics', () => {
  it('sizes columns from width and fills them top to bottom', () => {
    expect(codeGridMetrics(96, 1045)).toEqual({ cols: 14, rows: 7 })
  })

  it('keeps short HID names on the dense 72px track', () => {
    expect(codeColumnMinPx(['ALT_ERASE', 'AMPS', 'K_APP', 'INT1'])).toBe(72)
  })

  it('uses fewer wider columns for long Consumer-style names', () => {
    const minColPx = codeColumnMinPx(
      [
        'C_AL_TEXT_EDITOR',
        'C_AL_SPREADSHEET',
        'C_AL_AV_CAPTURE_PLAYBACK',
        'C_AL_EMAIL_READER'
      ],
      { fitLongest: true }
    )
    expect(minColPx).toBeGreaterThanOrEqual(200)
    expect(codeGridMetrics(18, 1045, minColPx).cols).toBeLessThanOrEqual(5)
  })
})

describe('buildEditorSlots', () => {
  it('adds a Key slot for &kp', () => {
    const tree: HydratedNode = {
      value: '&kp',
      params: [{ value: 'A', source: { code: 'A' }, params: [] }]
    }
    expect(slotSummary(buildEditorSlots(tree, ['code']))).toEqual([
      'Behaviour:&kp',
      'Key:A'
    ])
  })

  it('keeps separate modifier and key slots for &mt', () => {
    const tree: HydratedNode = {
      value: '&mt',
      params: [
        { value: 'LCTRL', source: { code: 'LCTRL' }, params: [] },
        { value: 'A', source: { code: 'A' }, params: [] }
      ]
    }
    expect(slotSummary(buildEditorSlots(tree, ['mod', 'code']))).toEqual([
      'Behaviour:&mt',
      'Modifier:LCTRL',
      'Key:A'
    ])
  })

  it('walks nested modifier wrappers such as LC(A)', () => {
    const tree: HydratedNode = {
      value: '&kp',
      params: [
        {
          value: 'LC',
          source: { code: 'LC', params: ['code'] },
          params: [{ value: 'A', source: { code: 'A' }, params: [] }]
        }
      ]
    }
    expect(slotSummary(buildEditorSlots(tree, ['code']))).toEqual([
      'Behaviour:&kp',
      'Key:LC',
      'Key:A'
    ])
  })
})
