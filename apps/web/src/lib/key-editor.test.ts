import { describe, expect, it } from 'vitest'
import {
  applyModifierHold,
  applyTerminalKey,
  buildEditorSlots,
  codeColumnMinPx,
  codeGridMetrics,
  editorBindingPreview,
  firstMissingSlot,
  isBindingComplete,
  isKeycodeParam,
  nextEditorSlot,
  slotLabel,
  terminalKeySlot,
  visibleValueSlots,
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

  it('drops unused columns so leftover HID cells can grow', () => {
    expect(codeGridMetrics(44, 1045)).toEqual({ cols: 11, rows: 4 })
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
    expect(
      slotSummary(visibleValueSlots(buildEditorSlots(tree, ['code'])))
    ).toEqual(['Key:A'])
    expect(terminalKeySlot(buildEditorSlots(tree, ['code']), 1)?.value).toBe('A')
    expect(editorBindingPreview(buildEditorSlots(tree, ['code']))).toBe('&kp LC(A)')
  })
})

describe('editorBindingPreview', () => {
  it('keeps hold wraps in the encoded line', () => {
    const slots = buildEditorSlots(
      {
        value: '&kp',
        params: [
          {
            value: 'LS',
            source: { code: 'LS', params: ['code'] },
            params: [{ value: 'H', source: { code: 'H' }, params: [] }]
          }
        ]
      },
      ['code']
    )
    expect(visibleValueSlots(slots).map(slot => slot.value)).toEqual(['H'])
    expect(editorBindingPreview(slots)).toBe('&kp LS(H)')
  })
})

describe('incomplete mod-tap', () => {
  const incomplete: HydratedNode = {
    value: '&mt',
    params: [
      { value: 'LALT', params: [] },
      { value: undefined, params: [] }
    ]
  }

  it('moves from a filled modifier to the empty key', () => {
    const slots = buildEditorSlots(incomplete, ['mod', 'code'])
    expect(nextEditorSlot(slots, 1)).toBe(2)
    expect(firstMissingSlot(slots)?.label).toBe('Key')
    expect(isBindingComplete(slots)).toBe(false)
  })

  it('stays on an empty modifier when &mt is first chosen', () => {
    const slots = buildEditorSlots(
      { value: '&mt', params: [] },
      ['mod', 'code']
    )
    expect(nextEditorSlot(slots, 1)).toBe(1)
  })

  it('stays on the modifier once the key is filled', () => {
    const slots = buildEditorSlots(
      {
        value: '&mt',
        params: [
          { value: 'LALT', params: [] },
          { value: 'A', params: [] }
        ]
      },
      ['mod', 'code']
    )
    expect(nextEditorSlot(slots, 1)).toBe(1)
    expect(isBindingComplete(slots)).toBe(true)
  })

  it('treats layer 0 as filled and an instant behaviour as complete', () => {
    expect(
      isBindingComplete(
        buildEditorSlots(
          { value: '&mo', params: [{ value: 0, params: [] }] },
          ['layer']
        )
      )
    ).toBe(true)
    expect(
      isBindingComplete(buildEditorSlots({ value: '&none', params: [] }, []))
    ).toBe(true)
  })
})

describe('modifier hold apply', () => {
  it('wraps a tap key and later replaces only the terminal', () => {
    let tree: HydratedNode = {
      value: '&kp',
      params: [{ value: 'A', params: [] }]
    }
    tree = applyModifierHold(tree, 1, 'LC')
    expect(tree.params[0]).toEqual({
      value: 'LC',
      params: [{ value: 'A', params: [] }]
    })
    tree = applyModifierHold(tree, 1, 'LS')
    expect(tree.params[0].value).toBe('LC')
    expect(tree.params[0].params[0].value).toBe('LS')
    tree = applyTerminalKey(tree, 1, 'B')
    expect(tree.params[0]).toEqual({
      value: 'LC',
      params: [{ value: 'LS', params: [{ value: 'B', params: [] }] }]
    })
  })

  it('does not stack the same wrap and drops it when assigning that modifier key', () => {
    let tree: HydratedNode = {
      value: '&kp',
      params: [{ value: 'A', params: [] }]
    }
    tree = applyModifierHold(tree, 1, 'LC')
    tree = applyModifierHold(tree, 1, 'LC')
    expect(tree.params[0]).toEqual({ value: 'A', params: [] })
    tree = applyModifierHold(tree, 1, 'LC')
    tree = applyTerminalKey(tree, 1, 'LCTRL')
    expect(tree.params[0]).toEqual({ value: 'LCTRL', params: [] })
  })

  it('does not wrap LSHFT in LS', () => {
    let tree: HydratedNode = {
      value: '&kp',
      params: [{ value: 'LSHFT', params: [] }]
    }
    tree = applyModifierHold(tree, 1, 'LS')
    expect(tree.params[0]).toEqual({ value: 'LSHFT', params: [] })
  })
})
