import { describe, expect, it } from 'vitest'
import {
  comboDictionaryCore,
  comboDictionaryFamilies,
  comboDictionaryLabel,
  comboDictionaryModifierIndexes,
  comboDictionaryPrimary,
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
const OUTER = 9

describe('combo dictionary grouping', () => {
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

  it('strips extras from the core and drops thumb-only combos', () => {
    const modifiers = [INNER, OUTER]
    expect(comboDictionaryCore([0, INNER], modifiers)).toEqual([0])
    expect(comboDictionaryCore([INNER], modifiers)).toEqual([])
    expect(comboDictionaryCore([0, 3, INNER, OUTER], modifiers)).toEqual([0, 3])
  })

  it('clusters press / inner / outer / both as one family', () => {
    const combos = [
      combo('space', [INNER], 'SPACE'),
      combo('bspc', [OUTER], 'BSPC'),
      combo('l_a', [0], 'A'),
      combo('li_a', [0, INNER], 'LS(A)'),
      combo('lo_a', [0, OUTER], 'LEFT'),
      combo('lb_a', [0, INNER, OUTER], 'HOME'),
      combo('l_d', [0, 3], 'D'),
      combo('li_d', [0, 3, INNER], 'LS(D)')
    ]
    const families = comboDictionaryFamilies(CHORD_LAYOUT, combos)
    expect(families.map(f => f.id)).toEqual(['0', '0-3'])
    expect(families[0]!.variants.map(v => v.comboId)).toEqual([
      'l_a',
      'li_a',
      'lo_a',
      'lb_a'
    ])
    expect(comboDictionaryPrimary(families[0]!).comboId).toBe('l_a')
    expect(families[1]!.variants).toHaveLength(2)
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
