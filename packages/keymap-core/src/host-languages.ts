import { hostLayoutsForLanguage } from './host-layout-catalog.js'
import { hostLegendColumns } from './host-legend-view.js'
import type { HostLegendView } from './types.js'

export type HostLanguageId = 'en' | 'ru' | 'uk' | 'de'

const ADDABLE_LANGUAGES: readonly HostLanguageId[] = ['uk', 'de']

export function isAddableHostLanguage(
  language: string
): language is HostLanguageId {
  return (ADDABLE_LANGUAGES as readonly string[]).includes(language)
}

export function hostLanguageName(language: HostLanguageId): string {
  return hostLayoutsForLanguage(language)[0]?.languageName ?? language
}

/** Languages that can still be added after the open columns. */
export function hostLanguagesAvailable(view: HostLegendView): HostLanguageId[] {
  const used = new Set(hostLegendColumns(view).map(column => column.language))
  return ADDABLE_LANGUAGES.filter(language => !used.has(language))
}
