import { hostLayoutFromSymbols, type HostLayout } from './host-layout.js'
import { larkEnglishLayout, larkRussianLayout } from './host-legend-presets.js'
import type { HostLanguageId } from './host-languages.js'
import { SYSTEM_DE_SYMBOLS } from './system-de-symbols.js'
import { SYSTEM_LATIN_SYMBOLS } from './system-latin-symbols.js'
import { SYSTEM_RU_SYMBOLS } from './system-ru-symbols.js'
import { SYSTEM_UA_SYMBOLS } from './system-ua-symbols.js'
import { SYSTEM_US_SYMBOLS } from './system-us-symbols.js'
import { SYSTEM_US_XKB_SYMBOLS } from './system-us-xkb-symbols.js'

export type HostLayoutKind = 'system' | 'in-layout'

export interface HostLayoutChoice {
  id: string
  language: HostLanguageId
  languageName: string
  /** Symbols section, shown next to the flag (`us`, `au`, `winkeys`). */
  layoutName: string
  flag: string
  kind: HostLayoutKind
  /** The usual OS layout for this language. */
  primary?: boolean
}

export interface BuiltinLanguageProfile {
  language: HostLanguageId
  kind: HostLayoutKind
  variant?: string
}

/** Russian-language sections in `ru`. Other languages in that file stay out. */
export const RU_SYSTEM_SECTIONS = [
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
] as const

/** System English group (`us(basic)`). */
export const SYSTEM_US_LAYOUT_ID = 'system-us'

/** System Russian group (`ru(winkeys)`), not the LARK legacy group. */
export const SYSTEM_RU_LAYOUT_ID = 'system-ru'

function russianSystemLayoutId(section: string): string {
  return section === 'winkeys' ? SYSTEM_RU_LAYOUT_ID : `system-ru-${section}`
}

export const systemEnglishLayout: HostLayout = hostLayoutFromSymbols(
  SYSTEM_US_SYMBOLS,
  'basic',
  SYSTEM_US_LAYOUT_ID
)

export const russianSystemLayouts: readonly HostLayout[] = RU_SYSTEM_SECTIONS.map(section =>
  hostLayoutFromSymbols(SYSTEM_RU_SYMBOLS, section, russianSystemLayoutId(section))
)

export const systemRussianLayout = russianSystemLayouts.find(
  layout => layout.id === SYSTEM_RU_LAYOUT_ID
)!

/** Ukrainian-language sections in `ua`. Crimean Tatar stays out. */
export const UA_SYSTEM_SECTIONS = [
  'unicode',
  'macOS',
  'legacy',
  'winkeys',
  'typewriter',
  'phonetic',
  'homophonic'
] as const

/** System Ukrainian group (`ua(unicode)`). */
export const SYSTEM_UA_LAYOUT_ID = 'system-ua'

function ukrainianSystemLayoutId(section: string): string {
  return section === 'unicode' ? SYSTEM_UA_LAYOUT_ID : `system-ua-${section}`
}

export const ukrainianSystemLayouts: readonly HostLayout[] = UA_SYSTEM_SECTIONS.map(section =>
  hostLayoutFromSymbols(SYSTEM_UA_SYMBOLS, section, ukrainianSystemLayoutId(section))
)

export const systemUkrainianLayout = ukrainianSystemLayouts.find(
  layout => layout.id === SYSTEM_UA_LAYOUT_ID
)!

/** German-language sections in `de`. Other languages in that file stay out. */
export const DE_SYSTEM_SECTIONS = [
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
] as const

/** System German group (`de(basic)` over `latin(type4)`). */
export const SYSTEM_DE_LAYOUT_ID = 'system-de'

function germanSystemLayoutId(section: string): string {
  return section === 'basic' ? SYSTEM_DE_LAYOUT_ID : `system-de-${section}`
}

const XKB_SYMBOL_FILES = {
  latin: SYSTEM_LATIN_SYMBOLS,
  us: SYSTEM_US_XKB_SYMBOLS,
  de: SYSTEM_DE_SYMBOLS
}

export const germanSystemLayouts: readonly HostLayout[] = DE_SYSTEM_SECTIONS.map(section =>
  hostLayoutFromSymbols(
    SYSTEM_DE_SYMBOLS,
    section,
    germanSystemLayoutId(section),
    XKB_SYMBOL_FILES
  )
)

export const systemGermanLayout = germanSystemLayouts.find(
  layout => layout.id === SYSTEM_DE_LAYOUT_ID
)!

const russianSystemChoices: HostLayoutChoice[] = RU_SYSTEM_SECTIONS.map(section => ({
  id: russianSystemLayoutId(section),
  language: 'ru',
  languageName: 'Russian',
  layoutName: section,
  flag: '🇷🇺',
  kind: 'system',
  primary: section === 'winkeys'
}))

const ukrainianSystemChoices: HostLayoutChoice[] = UA_SYSTEM_SECTIONS.map(section => ({
  id: ukrainianSystemLayoutId(section),
  language: 'uk',
  languageName: 'Ukrainian',
  layoutName: section,
  flag: '🇺🇦',
  kind: 'system',
  primary: section === 'unicode'
}))

const germanSystemChoices: HostLayoutChoice[] = DE_SYSTEM_SECTIONS.map(section => ({
  id: germanSystemLayoutId(section),
  language: 'de',
  languageName: 'German',
  layoutName: section,
  flag: '🇩🇪',
  kind: 'system',
  primary: section === 'basic'
}))

export const hostLayoutChoices: readonly HostLayoutChoice[] = [
  {
    id: SYSTEM_US_LAYOUT_ID,
    language: 'en',
    languageName: 'English',
    layoutName: 'us',
    flag: '🇺🇸',
    kind: 'system',
    primary: true
  },
  {
    id: 'lark-en',
    language: 'en',
    languageName: 'English',
    layoutName: 'au',
    flag: '🇦🇺',
    kind: 'in-layout'
  },
  ...russianSystemChoices,
  {
    id: 'lark-ru',
    language: 'ru',
    languageName: 'Russian',
    layoutName: 'legacy',
    flag: '🇷🇺',
    kind: 'in-layout'
  },
  ...ukrainianSystemChoices,
  ...germanSystemChoices
]

export function hostLayoutsForLanguage(language: HostLanguageId): HostLayoutChoice[] {
  const all = hostLayoutChoices.filter(choice => choice.language === language)
  return [
    ...all.filter(choice => choice.kind === 'system' && choice.primary),
    ...all.filter(choice => choice.kind === 'system' && !choice.primary),
    ...all.filter(choice => choice.kind === 'in-layout')
  ]
}

export function hostLayoutShelves(language: HostLanguageId): {
  primary?: HostLayoutChoice
  systems: HostLayoutChoice[]
  inLayout?: HostLayoutChoice
} {
  const layouts = hostLayoutsForLanguage(language)
  return {
    primary: layouts.find(choice => choice.kind === 'system' && choice.primary),
    systems: layouts.filter(choice => choice.kind === 'system' && !choice.primary),
    inLayout: layouts.find(choice => choice.kind === 'in-layout')
  }
}

export function builtinLanguageProfileId(
  language: HostLanguageId,
  kind: HostLayoutKind,
  variant?: string
): string {
  if (kind === 'system' && variant) {
    const primary = hostLayoutShelves(language).primary
    if (primary && variant !== primary.layoutName) return `${language}:system:${variant}`
  }
  return `${language}:${kind}`
}

export function builtinProfileIdForChoice(choice: HostLayoutChoice): string {
  if (choice.kind === 'in-layout' || choice.primary) {
    return `${choice.language}:${choice.kind}`
  }
  return `${choice.language}:system:${choice.layoutName}`
}

export function parseBuiltinLanguageProfileId(id: string): BuiltinLanguageProfile | null {
  const match = /^(en|ru|uk|de):(in-layout|system)(?::([A-Za-z0-9_-]+))?$/.exec(id)
  if (!match) return null
  return {
    language: match[1] as HostLanguageId,
    kind: match[2] as HostLayoutKind,
    variant: match[3]
  }
}

export function builtinLanguageProfileLabel(kind: HostLayoutKind): string {
  return kind === 'system' ? 'Системная' : 'В раскладке'
}

export function hostLayoutChoiceLabel(choice: HostLayoutChoice): string {
  if (choice.kind === 'in-layout') return 'В раскладке'
  if (choice.primary) return 'Системная'
  return choice.layoutName
}

export function reservedHostProfileNames(): string[] {
  return ['Системная', 'В раскладке']
}

export function layoutForBuiltinProfile(id: string): HostLayoutChoice | undefined {
  const parsed = parseBuiltinLanguageProfileId(id)
  if (!parsed) return undefined
  const layouts = hostLayoutsForLanguage(parsed.language)
  if (parsed.kind === 'in-layout') {
    return layouts.find(choice => choice.kind === 'in-layout')
  }
  if (parsed.variant) {
    return layouts.find(
      choice => choice.kind === 'system' && choice.layoutName === parsed.variant
    )
  }
  return layouts.find(choice => choice.kind === 'system' && choice.primary)
}

export const layoutsById = new Map<string, HostLayout>([
  ['lark-en', larkEnglishLayout],
  ['lark-ru', larkRussianLayout],
  [SYSTEM_US_LAYOUT_ID, systemEnglishLayout],
  ...russianSystemLayouts.map(layout => [layout.id, layout] as const),
  ...ukrainianSystemLayouts.map(layout => [layout.id, layout] as const),
  ...germanSystemLayouts.map(layout => [layout.id, layout] as const)
])

export function hostLayoutChoice(id: string): HostLayoutChoice | undefined {
  return hostLayoutChoices.find(choice => choice.id === id)
}

/** Symbols for a built-in layout id (`lark-en`, `system-ru`, …). */
export function hostLayoutById(id: string): HostLayout | undefined {
  return layoutsById.get(id)
}
