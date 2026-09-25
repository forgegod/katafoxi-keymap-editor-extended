import { SYSTEM_DE_SYMBOLS } from './system-de-symbols.js'
import { SYSTEM_RU_SYMBOLS } from './system-ru-symbols.js'
import { SYSTEM_UA_SYMBOLS } from './system-ua-symbols.js'
import { SYSTEM_US_SYMBOLS } from './system-us-symbols.js'

export interface HostLanguage {
  readonly id: string
  readonly name: string
  readonly flag: string
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

/** One row per host language. A new language is this entry plus its vendored xkb module. */
export const HOST_LANGUAGES = [
  language({
    id: 'en',
    name: 'English',
    flag: '🇺🇸',
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
    addable: false,
    symbols: SYSTEM_RU_SYMBOLS
  }),
  language({
    id: 'uk',
    name: 'Ukrainian',
    flag: '🇺🇦',
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
