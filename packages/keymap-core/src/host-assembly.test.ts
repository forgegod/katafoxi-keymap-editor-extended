import { describe, expect, it } from 'vitest'
import { hostAssemblyName } from './host-assembly.js'
import { addHostLanguage, sameHostLegendView, standardHostLegendView } from './host-legend-view.js'

describe('hostAssemblyName', () => {
  it('joins unique layout names', () => {
    expect(
      hostAssemblyName([
        { languageName: 'English', layoutName: 'System' },
        { languageName: 'Russian', layoutName: 'typewriter' }
      ])
    ).toBe('System + typewriter')
  })

  it('qualifies a layout name that repeats', () => {
    expect(
      hostAssemblyName([
        { languageName: 'English', layoutName: 'System' },
        { languageName: 'Russian', layoutName: 'System' }
      ])
    ).toBe('English System + Russian System')
  })
})

describe('sameHostLegendView', () => {
  it('treats an omitted keycap as the derived one', () => {
    const plain = standardHostLegendView()
    const explicit = addHostLanguage(plain, 'ru')
    const omitted = {
      columns: explicit.columns.map(column => ({ ...column })),
      open: explicit.open
    }
    expect(sameHostLegendView(explicit, omitted)).toBe(true)
    expect(sameHostLegendView(plain, explicit)).toBe(false)
  })
})
