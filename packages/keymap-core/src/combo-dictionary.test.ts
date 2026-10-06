import { describe, expect, it } from 'vitest'
import {
  comboDictionaryLabel,
  comboDictionaryModifierIndexes,
  shouldOfferComboDictionary
} from './combo-dictionary.js'
import type { KeyBindingNode, LayoutKey, ZmkCombo } from './types.js'

function kp(code: string): KeyBindingNode {
  return { value: '&kp', params: [{ value: code, params: [] }] }
}

function combo(id: string, keyPositions: number[], code: string): ZmkCombo {
  return { id, keyPositions, binding: kp(code) }
}

/** 2×4 fingers + two bottom-row thumbs — chord-board shape, no board name. */
const CHORD_LAYOUT: LayoutKey[] = [
  { x: 0, y: 0, row: 0, col: 0 },
  { x: 1, y: 0, row: 0, col: 1 },
  { x: 2, y: 0, row: 0, col: 2 },
  { x: 3, y: 0, row: 0, col: 3 },
  { x: 0, y: 1, row: 1, col: 0 },
  { x: 1, y: 1, row: 1, col: 1 },
  { x: 2, y: 1, row: 1, col: 2 },
  { x: 3, y: 1, row: 1, col: 3 },
  { x: 2, y: 2, row: 2, col: 2 },
  { x: 3, y: 2, row: 2, col: 3 }
]

const INNER = 8

describe('combo dictionary helpers', () => {
  it('treats the bottom row as hold extras when a higher row is also used', () => {
    const combos = [
      combo('a', [0], 'A'),
      combo('a_in', [0, INNER], 'LS(A)'),
      combo('space', [INNER], 'SPACE')
    ]
    expect(comboDictionaryModifierIndexes(CHORD_LAYOUT, combos)).toEqual([INNER])
  })

  it('does not treat every key as an extra on a single-row board', () => {
    const row = [
      { x: 0, y: 0, row: 0, col: 0 },
      { x: 1, y: 0, row: 0, col: 1 }
    ]
    const combos = [combo('esc', [0, 1], 'ESC')]
    expect(comboDictionaryModifierIndexes(row, combos)).toEqual([])
  })

  it('offers the dictionary only when combos outnumber the keys', () => {
    const few = Array.from({ length: 5 }, (_, i) => combo(`c${i}`, [0, 1], 'ESC'))
    expect(shouldOfferComboDictionary(CHORD_LAYOUT, few)).toBe(false)
    const many = Array.from({ length: 12 }, (_, i) => combo(`c${i}`, [0, 1], 'ESC'))
    expect(shouldOfferComboDictionary(CHORD_LAYOUT, many)).toBe(true)
    expect(shouldOfferComboDictionary(CHORD_LAYOUT, [])).toBe(false)
  })

  it('shortens &kp labels and keeps other behaviours', () => {
    expect(comboDictionaryLabel(kp('LS(B)'))).toBe('LS(B)')
    expect(comboDictionaryLabel({ value: '&none', params: [] })).toBe('·')
    expect(
      comboDictionaryLabel({
        value: '&bt',
        params: [
          { value: 'BT_SEL', params: [] },
          { value: '0', params: [] }
        ]
      })
    ).toBe('bt BT_SEL 0')
  })
})
