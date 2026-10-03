import { describe, expect, it } from 'vitest'
import {
  ADDABLE_HOST_LANGUAGE_IDS,
  HOST_LANGUAGES,
  HOST_LANGUAGE_IDS,
  hostLanguageName,
  preferredAddableHostLanguage,
  windowsCapsPairingRecommended
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
    const available = hostLanguagesAvailable(view)
    expect([...available].sort()).toEqual([...ADDABLE_HOST_LANGUAGE_IDS].sort())
    expect(available).toEqual(
      [...ADDABLE_HOST_LANGUAGE_IDS].sort((a, b) =>
        hostLanguageName(a).localeCompare(hostLanguageName(b), 'en')
      )
    )
    expect(available.map(hostLanguageName)).toEqual(
      [...ADDABLE_HOST_LANGUAGE_IDS]
        .sort((a, b) => hostLanguageName(a).localeCompare(hostLanguageName(b), 'en'))
        .map(hostLanguageName)
    )

    let next = view
    for (const language of ADDABLE_HOST_LANGUAGE_IDS) {
      next = addHostLanguage(next, language)
      expect(hostLanguagesAvailable(next)).not.toContain(language)
    }
    expect(hostLanguagesAvailable(next)).toEqual([])
  })
})

describe('preferredAddableHostLanguage', () => {
  it('picks the first addable locale and skips English', () => {
    expect(preferredAddableHostLanguage(['en-US', 'ru-RU', 'de'])).toBe('ru')
    expect(preferredAddableHostLanguage(['uk-UA'])).toBe('uk')
    expect(preferredAddableHostLanguage(['de-DE', 'ru'])).toBe('de')
    expect(preferredAddableHostLanguage(['fr-FR'])).toBe('fr')
    expect(preferredAddableHostLanguage(['pl-PL', 'es'])).toBe('pl')
    expect(preferredAddableHostLanguage(['es-ES'])).toBe('es')
    expect(preferredAddableHostLanguage(['cs-CZ', 'hu'])).toBe('cs')
    expect(preferredAddableHostLanguage(['sv-SE'])).toBe('sv')
    expect(preferredAddableHostLanguage(['pt-BR'])).toBe('br')
    expect(preferredAddableHostLanguage(['pt-PT'])).toBe('pt')
    expect(preferredAddableHostLanguage(['en', 'en-GB'])).toBeNull()
    expect(preferredAddableHostLanguage(['ja-JP', 'zh-CN'])).toBeNull()
    expect(preferredAddableHostLanguage([])).toBeNull()
  })
})

describe('windowsCapsPairingRecommended', () => {
  it('recommends Caps pairing for Cyrillic alphabets only', () => {
    expect(windowsCapsPairingRecommended('ru')).toBe(true)
    expect(windowsCapsPairingRecommended('uk')).toBe(true)
    expect(windowsCapsPairingRecommended('en')).toBe(false)
    expect(windowsCapsPairingRecommended('de')).toBe(false)
    expect(windowsCapsPairingRecommended('fr')).toBe(false)
    expect(windowsCapsPairingRecommended('pl')).toBe(false)
    expect(windowsCapsPairingRecommended('es')).toBe(false)
  })
})
