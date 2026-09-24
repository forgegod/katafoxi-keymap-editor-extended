import { describe, expect, it } from 'vitest'
import {
  groupChoicesByContext,
  initialTaxonomyContexts,
  nextTaxonomyContexts
} from './taxonomy.js'

describe('groupChoicesByContext', () => {
  it('groups by context and sorts Keyboard first, then by label', () => {
    const groups = groupChoicesByContext([
      { code: 'C_VOL_UP', context: 'Consumer', symbol: '🔊' },
      { code: 'B', context: 'Keyboard', symbol: 'B' },
      { code: 'A', context: 'Keyboard', symbol: 'A' },
      { code: 'KP_ENTER', context: 'Keypad' },
      { code: 'BT_CLR' }
    ])

    expect(groups.map(g => g.context)).toEqual([
      'Keyboard',
      'Keypad',
      'Consumer',
      'Other'
    ])
    expect(groups[0].items.map(i => i.code)).toEqual(['A', 'B'])
    expect(groups[3].items.map(i => i.code)).toEqual(['BT_CLR'])
  })
})

describe('taxonomy contexts', () => {
  const groups = groupChoicesByContext([
    { code: 'A', context: 'Keyboard' },
    { code: 'KP_ENTER', context: 'Keypad' },
    { code: 'C_VOL_UP', context: 'Consumer Media' }
  ])

  it('defaults to Keyboard and Keypad', () => {
    expect(initialTaxonomyContexts(groups)).toEqual(['Keyboard', 'Keypad'])
  })

  it('opens on the current value group when it is not the home pair', () => {
    expect(initialTaxonomyContexts(groups, 'C_VOL_UP')).toEqual([
      'Consumer Media'
    ])
  })

  it('restores the home pair from Keyboard or Keypad', () => {
    expect(nextTaxonomyContexts(groups, 'Keyboard')).toEqual([
      'Keyboard',
      'Keypad'
    ])
  })

  it('replaces the view for other subgroups', () => {
    expect(nextTaxonomyContexts(groups, 'Consumer Media')).toEqual([
      'Consumer Media'
    ])
  })
})
