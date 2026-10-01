import { describe, expect, it } from 'vitest'
import { blankTopRowIndexes } from './blank-top-row'

const none = { value: '&none', params: [] }
const key = { value: '&kp', params: [{ value: 'A', params: [] }] }

describe('blankTopRowIndexes', () => {
  const layout = [
    { x: 0, y: 0, row: 0 },
    { x: 1, y: 0, row: 0 },
    { x: 0, y: 1, row: 1 }
  ]

  it('returns the top row when every layer leaves it blank', () => {
    expect(blankTopRowIndexes(layout, [[none, none, key]])).toEqual([0, 1])
  })

  it('returns nothing when any top-row key has a binding', () => {
    expect(blankTopRowIndexes(layout, [[key, none, key]])).toEqual([])
  })

  it('returns nothing for a single-row board', () => {
    expect(
      blankTopRowIndexes(
        [
          { x: 0, y: 0, row: 0 },
          { x: 1, y: 0, row: 0 }
        ],
        [[none, none]]
      )
    ).toEqual([])
  })
})
