import { describe, expect, it } from 'vitest'
import {
  ADDABLE_HOST_LANGUAGE_IDS,
  HOST_LANGUAGES,
  HOST_LANGUAGE_IDS,
  hostLanguageName
} from './host-languages.js'
import { catalogLayoutsForLanguage, hostLayoutChoices } from './host-layout-catalog.js'
import {
  addHostLanguage,
  hostLanguagesAvailable,
  standardHostLegendView
} from './host-legend-view.js'

describe('HOST_LANGUAGES table', () => {
  it('gives each language exactly one primary system layout', () => {
    for (const language of HOST_LANGUAGES) {
      const primaries = hostLayoutChoices.filter(
        choice => choice.language === language.id && choice.kind === 'system' && choice.primary
      )
      expect(primaries, language.id).toHaveLength(1)
      expect(primaries[0]?.id).toBe(`system-${language.xkbModule}`)
      expect(primaries[0]?.layoutName).toBe(
        language.sections.length === 1 ? language.xkbModule : language.primarySection
      )
    }
  })

  it('keeps hostLanguagesAvailable and the catalog aligned with the table', () => {
    const catalogLanguages = new Set(
      hostLayoutChoices.filter(choice => choice.kind === 'system').map(choice => choice.language)
    )
    expect([...catalogLanguages].sort()).toEqual([...HOST_LANGUAGE_IDS].sort())

    for (const language of HOST_LANGUAGES) {
      const system = catalogLayoutsForLanguage(language.id).filter(choice => choice.kind === 'system')
      const expectedNames =
        language.sections.length === 1 ? [language.xkbModule] : [...language.sections]
      expect(system.map(choice => choice.layoutName)).toEqual(expectedNames)
      expect(hostLanguageName(language.id)).toBe(language.name)
    }

    const view = standardHostLegendView()
    expect(hostLanguagesAvailable(view)).toEqual([...ADDABLE_HOST_LANGUAGE_IDS])

    let next = view
    for (const language of ADDABLE_HOST_LANGUAGE_IDS) {
      next = addHostLanguage(next, language)
      expect(hostLanguagesAvailable(next)).not.toContain(language)
    }
    expect(hostLanguagesAvailable(next)).toEqual([])
  })
})
