import {
  addHostLanguage,
  standardHostLegendView,
  toggleHostLanguage
} from '@keymap-editor/keymap-core'
import { describe, expect, it } from 'vitest'
import {
  defaultHostEditTarget,
  hostEditCycleLanguages,
  hostEditCycleTargets,
  stepHostEditTarget
} from './host-edit-cycle'

describe('hostEditCycle', () => {
  it('lists extras before the base language', () => {
    const view = addHostLanguage(standardHostLegendView(), 'ru')
    expect(hostEditCycleLanguages(view)).toEqual(['ru', 'en'])
  })

  it('walks AltGr then AltGr+Shift across languages', () => {
    const view = addHostLanguage(standardHostLegendView(), 'ru')
    expect(hostEditCycleTargets('G', view)).toEqual([
      { language: 'ru', zmk: 'G', level: 2 },
      { language: 'en', zmk: 'G', level: 2 },
      { language: 'ru', zmk: 'G', level: 3 },
      { language: 'en', zmk: 'G', level: 3 }
    ])
  })

  it('defaults to the first AltGr cycle cell', () => {
    expect(defaultHostEditTarget('A', standardHostLegendView())).toEqual({
      language: 'en',
      zmk: 'A',
      level: 2
    })
    const both = addHostLanguage(standardHostLegendView(), 'ru')
    expect(defaultHostEditTarget('A', both)).toEqual({
      language: 'ru',
      zmk: 'A',
      level: 2
    })
  })

  it('steps forward and clamps at the ends', () => {
    const view = addHostLanguage(standardHostLegendView(), 'ru')
    const start = { language: 'ru' as const, zmk: 'G', level: 2 }
    expect(stepHostEditTarget(start, view, 1)).toEqual({
      language: 'en',
      zmk: 'G',
      level: 2
    })
    expect(stepHostEditTarget(start, view, 3)).toEqual({
      language: 'en',
      zmk: 'G',
      level: 3
    })
    expect(
      stepHostEditTarget({ language: 'en', zmk: 'G', level: 3 }, view, 1)
    ).toEqual({ language: 'en', zmk: 'G', level: 3 })
    expect(
      stepHostEditTarget({ language: 'ru', zmk: 'G', level: 2 }, view, -1)
    ).toEqual({ language: 'ru', zmk: 'G', level: 2 })
  })

  it('enters the cycle from a tap/shift cell on the next step', () => {
    const view = addHostLanguage(standardHostLegendView(), 'ru')
    expect(
      stepHostEditTarget({ language: 'en', zmk: 'G', level: 0 }, view, 1)
    ).toEqual({ language: 'ru', zmk: 'G', level: 2 })
  })

  it('skips a collapsed extra language', () => {
    const view = toggleHostLanguage(addHostLanguage(standardHostLegendView(), 'ru'), 'ru')
    expect(hostEditCycleLanguages(view)).toEqual(['en'])
    expect(hostEditCycleTargets('A', view)).toEqual([
      { language: 'en', zmk: 'A', level: 2 },
      { language: 'en', zmk: 'A', level: 3 }
    ])
  })
})
