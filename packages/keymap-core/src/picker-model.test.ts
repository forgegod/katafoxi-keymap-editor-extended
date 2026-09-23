import { describe, expect, it } from 'vitest'
import {
  collectUsedKeycodesOnLayer,
  groupChoicesByContext,
  representativeLabel,
  uniqueCatalogChoices
} from './picker-model.js'

describe('representativeLabel', () => {
  it('prefers a symbol over the raw code', () => {
    expect(representativeLabel({ code: 'N1', symbol: '1' })).toBe('1')
  })

  it('falls back to the code when no symbol is set', () => {
    expect(representativeLabel({ code: 'A' })).toBe('A')
  })
})

describe('uniqueCatalogChoices', () => {
  it('keeps the shortest alias and the LC wrapper separately', () => {
    const unique = uniqueCatalogChoices([
      {
        code: 'LCONTROL',
        aliases: ['LCTRL', 'LCONTROL'],
        symbol: 'LCTRL',
        isModifier: true,
        params: []
      },
      {
        code: 'LCTRL',
        aliases: ['LCTRL', 'LCONTROL'],
        symbol: 'LCTRL',
        isModifier: true,
        params: []
      },
      {
        code: 'LC',
        aliases: ['LCTRL', 'LCONTROL'],
        symbol: 'LCTRL',
        params: ['code']
      }
    ])
    expect(unique.map(c => c.code)).toEqual(['LCTRL', 'LC'])
  })
})

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

describe('collectUsedKeycodesOnLayer', () => {
  it('collects only &kp tap codes', () => {
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

    expect([...used].sort()).toEqual(['A', 'SPC'])
  })

  it('returns an empty set for missing layers', () => {
    expect(collectUsedKeycodesOnLayer(undefined).size).toBe(0)
  })
})
