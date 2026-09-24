import { describe, expect, it } from 'vitest'
import {
  catalogKeyChoices,
  choiceMatchesCode,
  uniqueCatalogChoices,
  usedLayersForChoice
} from './catalog-choices.js'

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

describe('catalogKeyChoices', () => {
  it('drops wrappers from the value catalog', () => {
    const unique = catalogKeyChoices([
      { code: 'A' },
      { code: 'LC', params: ['code'] },
      { code: 'LCTRL', isModifier: true }
    ])
    expect(unique.map(c => c.code)).toEqual(['A', 'LCTRL'])
  })
})

describe('choice alias matching', () => {
  const ret = {
    code: 'RET',
    aliases: ['RETURN', 'ENTER', 'RET']
  }

  it('treats ENTER on a layer as the RET chip', () => {
    expect(choiceMatchesCode(ret, 'ENTER')).toBe(true)
    expect(choiceMatchesCode(ret, 'RET')).toBe(true)
    expect(choiceMatchesCode(ret, 'A')).toBe(false)
    expect(
      usedLayersForChoice(ret, new Map([['ENTER', [1, 3]], ['Q', [0]]]))
    ).toEqual([1, 3])
  })
})
