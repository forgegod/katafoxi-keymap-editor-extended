import { SYSTEM_DE_SYMBOLS } from './system-de-symbols.js'
import { SYSTEM_RU_SYMBOLS } from './system-ru-symbols.js'
import { SYSTEM_UA_SYMBOLS } from './system-ua-symbols.js'
import { SYSTEM_US_SYMBOLS } from './system-us-symbols.js'

export interface HostLanguage {
  readonly id: string
  readonly name: string
  readonly flag: string
  /** ISO 3166-1 alpha-2 file name for the vendored rectangular flag SVG. */
  readonly flagCode: string
  /** xkb symbols file name (`us`, `ru`, `ua`, `de`). */
  readonly xkbModule: string
  readonly sections: readonly string[]
  readonly primarySection: string
  readonly addable: boolean
  readonly symbols: string
}

function language<Id extends string>(spec: HostLanguage & { id: Id }): HostLanguage & { id: Id } {
  return spec
}

/**
 * One row per host language. A new language is this entry, its vendored xkb
 * module, and a `WindowsLocale` in `klc-locale.ts` so .klc export knows the
 * locale id. `flagCode` selects `apps/web/public/flags/<code>.svg`. Dead-key
 * accents are shared (`klc-dead.ts`), not per language.
 */
export const HOST_LANGUAGES = [
  language({
    id: 'en',
    name: 'English',
    flag: '🇺🇸',
    flagCode: 'us',
    xkbModule: 'us',
    sections: ['basic'],
    primarySection: 'basic',
    addable: false,
    symbols: SYSTEM_US_SYMBOLS
  }),
  language({
    id: 'ru',
    name: 'Russian',
    flag: '🇷🇺',
    flagCode: 'ru',
    xkbModule: 'ru',
    sections: [
      'winkeys',
      'legacy',
      'typewriter',
      'typewriter-legacy',
      'phonetic',
      'phonetic_winkeys',
      'phonetic_yazherty',
      'dos',
      'phonetic_azerty',
      'phonetic_dvorak',
      'rulemak',
      'ruu',
      'mac',
      'prxn',
      'unipunct',
      'phonetic_mac'
    ],
    primarySection: 'winkeys',
    addable: true,
    symbols: SYSTEM_RU_SYMBOLS
  }),
  language({
    id: 'uk',
    name: 'Ukrainian',
    flag: '🇺🇦',
    flagCode: 'ua',
    xkbModule: 'ua',
    sections: ['unicode', 'macOS', 'legacy', 'winkeys', 'typewriter', 'phonetic', 'homophonic'],
    primarySection: 'unicode',
    addable: true,
    symbols: SYSTEM_UA_SYMBOLS
  }),
  language({
    id: 'de',
    name: 'German',
    flag: '🇩🇪',
    flagCode: 'de',
    xkbModule: 'de',
    sections: [
      'basic',
      'deadtilde',
      'nodeadkeys',
      'deadgraveacute',
      'deadacute',
      'e1',
      'e2',
      'T3',
      'dvorak',
      'neo',
      'mac',
      'mac_nodeadkeys',
      'qwerty',
      'us',
      'hu',
      'adnw',
      'koy',
      'bone',
      'bone_eszett_home',
      'neo_qwertz',
      'neo_qwerty',
      'noted'
    ],
    primarySection: 'basic',
    addable: true,
    symbols: SYSTEM_DE_SYMBOLS
  })
] as const

export type HostLanguageId = (typeof HOST_LANGUAGES)[number]['id']

export const HOST_LANGUAGE_IDS: readonly HostLanguageId[] = HOST_LANGUAGES.map(
  item => item.id
)

export const ADDABLE_HOST_LANGUAGE_IDS: readonly HostLanguageId[] = HOST_LANGUAGES.filter(
  item => item.addable
).map(item => item.id)

const BY_ID = new Map<string, (typeof HOST_LANGUAGES)[number]>(
  HOST_LANGUAGES.map(item => [item.id, item])
)

export function isHostLanguageId(value: string): value is HostLanguageId {
  return BY_ID.has(value)
}

export function hostLanguage(id: HostLanguageId): (typeof HOST_LANGUAGES)[number] {
  return BY_ID.get(id)!
}

export function isAddableHostLanguage(
  language: string
): language is HostLanguageId {
  return (ADDABLE_HOST_LANGUAGE_IDS as readonly string[]).includes(language)
}

export function hostLanguageName(language: HostLanguageId): string {
  return hostLanguage(language).name
}

/**
 * Map browser/OS locale tags (`navigator.languages`) to the first addable
 * host language. English is never chosen — it is already the base column.
 */
export function preferredAddableHostLanguage(
  locales: readonly string[]
): HostLanguageId | null {
  for (const tag of locales) {
    if (typeof tag !== 'string') continue
    const primary = tag.trim().toLowerCase().split(/[-_]/)[0]
    if (!primary || primary === 'en') continue
    if (isAddableHostLanguage(primary)) return primary
  }
  return null
}
