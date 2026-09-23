import { describe, expect, it } from 'vitest'
import {
  bandCatalogChoices,
  catalogChoiceTooltip,
  collectUsedKeycodesOnLayer,
  groupChoicesByContext,
  initialTaxonomyContexts,
  isInstantBehavior,
  nextTaxonomyContexts,
  representativeLabel,
  sortBehaviorsByRole,
  uniqueCatalogChoices,
  valueBandKind
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

describe('valueBandKind', () => {
  it('keeps letters, digits, and F-keys out of the long-code grid', () => {
    expect(valueBandKind({ code: 'A' })).toBe('letters')
    expect(valueBandKind({ code: 'N1', symbol: '1' })).toBe('digits')
    expect(valueBandKind({ code: 'F12' })).toBe('function')
    expect(valueBandKind({ code: 'ESC' })).toBe('simple')
    expect(valueBandKind({ code: 'ALT_ERASE' })).toBe('codes')
  })
})

describe('bandCatalogChoices', () => {
  it('orders compact bands before even columns of long names', () => {
    const bands = bandCatalogChoices([
      { code: 'ALT_ERASE' },
      { code: 'BSPC' },
      { code: 'F24' },
      { code: 'A' },
      { code: 'F1' },
      { code: 'N2', symbol: '2' },
      { code: 'AMPS' }
    ])
    expect(bands.map(b => b.kind)).toEqual([
      'letters',
      'digits',
      'function',
      'simple',
      'codes'
    ])
    expect(bands.find(b => b.kind === 'function')?.items.map(i => i.code)).toEqual([
      'F1',
      'F24'
    ])
    expect(bands.find(b => b.kind === 'codes')?.items.map(i => i.code)).toEqual([
      'ALT_ERASE',
      'AMPS'
    ])
  })
})

describe('sortBehaviorsByRole', () => {
  it('puts &kp first and instant bindings last', () => {
    const sorted = sortBehaviorsByRole([
      { code: '&trans', params: [] },
      { code: '&bt', params: ['command'] },
      { code: '&mo', params: ['layer'] },
      { code: '&kp', params: ['code'] },
      { code: '&none', params: [] }
    ])
    expect(sorted.map(b => b.code)).toEqual([
      '&kp',
      '&mo',
      '&bt',
      '&trans',
      '&none'
    ])
  })
})

describe('isInstantBehavior', () => {
  it('is true only when there are no params', () => {
    expect(isInstantBehavior({ params: [] })).toBe(true)
    expect(isInstantBehavior({ params: ['code'] })).toBe(false)
  })
})

describe('catalogChoiceTooltip', () => {
  it('joins code and description', () => {
    expect(catalogChoiceTooltip({ code: 'M', description: 'm and M' })).toBe(
      'M — m and M'
    )
    expect(catalogChoiceTooltip({ code: '&kp', name: 'Key Press' })).toBe(
      '&kp — Key Press'
    )
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
