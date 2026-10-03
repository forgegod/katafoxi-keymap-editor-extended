import { SYSTEM_BG_SYMBOLS } from './system-bg-symbols.js'
import { SYSTEM_BR_SYMBOLS } from './system-br-symbols.js'
import { SYSTEM_CZ_SYMBOLS } from './system-cz-symbols.js'
import { SYSTEM_DE_SYMBOLS } from './system-de-symbols.js'
import { SYSTEM_DK_SYMBOLS } from './system-dk-symbols.js'
import { SYSTEM_ES_SYMBOLS } from './system-es-symbols.js'
import { SYSTEM_FI_SYMBOLS } from './system-fi-symbols.js'
import { SYSTEM_FR_SYMBOLS } from './system-fr-symbols.js'
import { SYSTEM_GR_SYMBOLS } from './system-gr-symbols.js'
import { SYSTEM_HU_SYMBOLS } from './system-hu-symbols.js'
import { SYSTEM_IT_SYMBOLS } from './system-it-symbols.js'
import { SYSTEM_NO_SYMBOLS } from './system-no-symbols.js'
import { SYSTEM_PL_SYMBOLS } from './system-pl-symbols.js'
import { SYSTEM_PT_SYMBOLS } from './system-pt-symbols.js'
import { SYSTEM_RO_SYMBOLS } from './system-ro-symbols.js'
import { SYSTEM_RU_SYMBOLS } from './system-ru-symbols.js'
import { SYSTEM_SE_SYMBOLS } from './system-se-symbols.js'
import { SYSTEM_TR_SYMBOLS } from './system-tr-symbols.js'
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
  }),
  language({
    id: 'fr',
    name: 'French',
    flag: '🇫🇷',
    flagCode: 'fr',
    xkbModule: 'fr',
    sections: [
      'basic',
      'nodeadkeys',
      'oss',
      'oss_latin9',
      'oss_nodeadkeys',
      'latin9',
      'latin9_nodeadkeys',
      'bepo',
      'bepo_latin9',
      'dvorak',
      'mac',
      'azerty',
      'us'
    ],
    primarySection: 'basic',
    addable: true,
    symbols: SYSTEM_FR_SYMBOLS
  }),
  language({
    id: 'pl',
    name: 'Polish',
    flag: '🇵🇱',
    flagCode: 'pl',
    xkbModule: 'pl',
    sections: [
      'basic',
      'legacy',
      'qwertz',
      'lefty',
      'dvorak',
      'dvorak_quotes',
      'dvorak_altquotes',
      'intl'
    ],
    primarySection: 'basic',
    addable: true,
    symbols: SYSTEM_PL_SYMBOLS
  }),
  language({
    id: 'es',
    name: 'Spanish',
    flag: '🇪🇸',
    flagCode: 'es',
    xkbModule: 'es',
    sections: ['basic', 'winkeys', 'nodeadkeys', 'deadtilde', 'dvorak', 'cat', 'ast'],
    primarySection: 'basic',
    addable: true,
    symbols: SYSTEM_ES_SYMBOLS
  }),
  language({
    id: 'it',
    name: 'Italian',
    flag: '🇮🇹',
    flagCode: 'it',
    xkbModule: 'it',
    sections: ['basic', 'nodeadkeys', 'winkeys', 'mac', 'us', 'dvorak'],
    primarySection: 'basic',
    addable: true,
    symbols: SYSTEM_IT_SYMBOLS
  }),
  language({
    id: 'pt',
    name: 'Portuguese',
    flag: '🇵🇹',
    flagCode: 'pt',
    xkbModule: 'pt',
    sections: ['basic', 'nodeadkeys', 'mac', 'mac_nodeadkeys', 'nativo'],
    primarySection: 'basic',
    addable: true,
    symbols: SYSTEM_PT_SYMBOLS
  }),
  language({
    id: 'br',
    name: 'Portuguese (Brazil)',
    flag: '🇧🇷',
    flagCode: 'br',
    xkbModule: 'br',
    sections: ['abnt2', 'nodeadkeys', 'thinkpad', 'dvorak', 'nativo'],
    primarySection: 'abnt2',
    addable: true,
    symbols: SYSTEM_BR_SYMBOLS
  }),
  language({
    id: 'cs',
    name: 'Czech',
    flag: '🇨🇿',
    flagCode: 'cz',
    xkbModule: 'cz',
    sections: ['basic', 'bksl', 'qwerty', 'qwerty_bksl', 'winkeys', 'winkeys-qwerty', 'prog'],
    primarySection: 'basic',
    addable: true,
    symbols: SYSTEM_CZ_SYMBOLS
  }),
  language({
    id: 'da',
    name: 'Danish',
    flag: '🇩🇰',
    flagCode: 'dk',
    xkbModule: 'dk',
    sections: ['basic', 'nodeadkeys', 'winkeys', 'mac', 'mac_nodeadkeys'],
    primarySection: 'basic',
    addable: true,
    symbols: SYSTEM_DK_SYMBOLS
  }),
  language({
    id: 'sv',
    name: 'Swedish',
    flag: '🇸🇪',
    flagCode: 'se',
    xkbModule: 'se',
    sections: ['basic', 'nodeadkeys', 'dvorak', 'mac', 'us'],
    primarySection: 'basic',
    addable: true,
    symbols: SYSTEM_SE_SYMBOLS
  }),
  language({
    id: 'hu',
    name: 'Hungarian',
    flag: '🇭🇺',
    flagCode: 'hu',
    xkbModule: 'hu',
    sections: ['basic', 'standard', 'nodeadkeys', 'qwerty'],
    primarySection: 'basic',
    addable: true,
    symbols: SYSTEM_HU_SYMBOLS
  }),
  language({
    id: 'tr',
    name: 'Turkish',
    flag: '🇹🇷',
    flagCode: 'tr',
    xkbModule: 'tr',
    sections: ['basic', 'f', 'alt', 'intl', 'us'],
    primarySection: 'basic',
    addable: true,
    symbols: SYSTEM_TR_SYMBOLS
  }),
  language({
    id: 'ro',
    name: 'Romanian',
    flag: '🇷🇴',
    flagCode: 'ro',
    xkbModule: 'ro',
    sections: ['basic', 'std', 'winkeys'],
    primarySection: 'basic',
    addable: true,
    symbols: SYSTEM_RO_SYMBOLS
  }),
  language({
    id: 'fi',
    name: 'Finnish',
    flag: '🇫🇮',
    flagCode: 'fi',
    xkbModule: 'fi',
    sections: ['kotoistus', 'winkeys', 'classic', 'nodeadkeys', 'mac'],
    primarySection: 'kotoistus',
    addable: true,
    symbols: SYSTEM_FI_SYMBOLS
  }),
  language({
    id: 'no',
    name: 'Norwegian',
    flag: '🇳🇴',
    flagCode: 'no',
    xkbModule: 'no',
    sections: ['basic', 'nodeadkeys', 'winkeys', 'dvorak', 'mac', 'mac_nodeadkeys'],
    primarySection: 'basic',
    addable: true,
    symbols: SYSTEM_NO_SYMBOLS
  }),
  language({
    id: 'el',
    name: 'Greek',
    flag: '🇬🇷',
    flagCode: 'gr',
    xkbModule: 'gr',
    sections: ['basic', 'simple', 'polytonic', 'nodeadkeys'],
    primarySection: 'basic',
    addable: true,
    symbols: SYSTEM_GR_SYMBOLS
  }),
  language({
    id: 'bg',
    name: 'Bulgarian',
    flag: '🇧🇬',
    flagCode: 'bg',
    xkbModule: 'bg',
    sections: ['bds', 'bekl', 'phonetic', 'bas_phonetic'],
    primarySection: 'bds',
    addable: true,
    symbols: SYSTEM_BG_SYMBOLS
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
 * Region tags that disagree with the primary subtag are checked first
 * (`pt-BR` → Brazilian `br`, not Portugal `pt`).
 */
export function preferredAddableHostLanguage(
  locales: readonly string[]
): HostLanguageId | null {
  for (const tag of locales) {
    if (typeof tag !== 'string') continue
    const normalized = tag.trim().toLowerCase().replace(/_/g, '-')
    if (normalized === 'pt-br' || normalized.startsWith('pt-br-')) return 'br'
    // Bokmål / Nynorsk tags map to the Norwegian host column (`no`).
    const primary = normalized.split('-')[0]
    if (primary === 'nb' || primary === 'nn') return 'no'
    if (!primary || primary === 'en') continue
    if (isAddableHostLanguage(primary)) return primary
  }
  return null
}

/**
 * Whether Caps Lock pairing with English is the recommended Windows install.
 *
 * Cyrillic alphabets (ru, uk, bg) leave AltGr sparse enough that English letters
 * on the key and the national alphabet on Caps Lock work as one layout.
 * Dense Latin layouts (fr, de, es, pl, …) fill all four levels and often use
 * dead keys — prefer a separate `.klc` per language and Win+Space instead.
 * Greek stays separate (different script, but not Caps-paired today).
 */
export function windowsCapsPairingRecommended(language: HostLanguageId): boolean {
  return language === 'ru' || language === 'uk' || language === 'bg'
}
