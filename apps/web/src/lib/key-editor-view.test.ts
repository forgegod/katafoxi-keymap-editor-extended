import { describe, expect, it } from 'vitest'
import {
  canConfirmBinding,
  collectActiveHolds,
  isHoldBlocked,
  needsTerminalKey,
  shouldShowPickKeyHint
} from './key-editor-view'
import type { EditorSlot } from './key-editor'

function slot(
  codeIndex: number,
  param: string,
  value?: string | number
): EditorSlot {
  return { codeIndex, param, value, label: param }
}

describe('collectActiveHolds', () => {
  it('collects wraps from the active keycode chain', () => {
    const slots = [
      slot(0, 'behaviour', '&kp'),
      slot(1, 'code', 'LC'),
      slot(2, 'code', 'LS'),
      slot(3, 'code', 'A')
    ]
    expect([...collectActiveHolds(slots, 3)]).toEqual(['LC', 'LS'])
  })
})

describe('needsTerminalKey', () => {
  it('is true when holds are on and no key is filled', () => {
    const params = [slot(1, 'code')]
    expect(needsTerminalKey(true, new Set(['LC']), params)).toBe(true)
    expect(needsTerminalKey(true, new Set(['LC']), [slot(1, 'code', 'A')])).toBe(
      false
    )
    expect(needsTerminalKey(false, new Set(['LC']), params)).toBe(false)
  })
})

describe('shouldShowPickKeyHint', () => {
  it('asks for a key after a filled modifier or hold', () => {
    const emptyKey = slot(2, 'code')
    const params = [slot(1, 'mod', 'LCTRL'), emptyKey]
    expect(shouldShowPickKeyHint(emptyKey, params, false)).toBe(true)
    expect(shouldShowPickKeyHint(emptyKey, [emptyKey], true)).toBe(true)
    expect(shouldShowPickKeyHint(emptyKey, [emptyKey], false)).toBe(false)
  })
})

describe('isHoldBlocked', () => {
  it('blocks wrapping a modifier key in the same role', () => {
    expect(isHoldBlocked('LS', new Set(), 'LSHFT')).toBe(true)
    expect(isHoldBlocked('LS', new Set(['LS']), 'LSHFT')).toBe(false)
    expect(isHoldBlocked('LC', new Set(), 'A')).toBe(false)
  })
})

describe('canConfirmBinding', () => {
  it('is true when every visible value is filled', () => {
    expect(
      canConfirmBinding([
        slot(0, 'behaviour', '&kp'),
        slot(1, 'code', 'A')
      ])
    ).toBe(true)
    expect(
      canConfirmBinding([slot(0, 'behaviour', '&kp'), slot(1, 'code')])
    ).toBe(false)
  })
})
