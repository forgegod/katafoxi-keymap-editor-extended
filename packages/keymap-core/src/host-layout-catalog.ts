import { hostLayoutFromSymbols, type HostLayout } from './host-layout.js'
import { larkEnglishLayout, larkRussianLayout } from './host-legend-presets.js'
import {
  HOST_LANGUAGES,
  HOST_LANGUAGE_IDS,
  hostLanguage,
  isHostLanguageId,
  type HostLanguage,
  type HostLanguageId
} from './host-languages.js'
import { SYSTEM_DE_SYMBOLS } from './system-de-symbols.js'
import { SYSTEM_LATIN_SYMBOLS } from './system-latin-symbols.js'
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

/** Include map for xkb modules that pull in another file (`de` → `latin`). */
const XKB_INCLUDE_FILES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  de: {
    latin: SYSTEM_LATIN_SYMBOLS,
    us: SYSTEM_US_XKB_SYMBOLS,
    de: SYSTEM_DE_SYMBOLS
  }
}

function systemLayoutId(language: HostLanguage, section: string): string {
  const base = `system-${language.xkbModule}`
  return section === language.primarySection ? base : `${base}-${section}`
}

function systemLayoutName(language: HostLanguage, section: string): string {
  return language.sections.length === 1 ? language.xkbModule : section
}

function systemChoice(language: HostLanguage, section: string): HostLayoutChoice {
  return {
    id: systemLayoutId(language, section),
    language: language.id as HostLanguageId,
    languageName: language.name,
    layoutName: systemLayoutName(language, section),
    flag: language.flag,
    kind: 'system',
    primary: section === language.primarySection
  }
}

const IN_LAYOUT_EXTRAS: ReadonlyArray<{
  id: string
  language: HostLanguageId
  layoutName: string
  flag: string
  layout: HostLayout
}> = [
  { id: 'lark-en', language: 'en', layoutName: 'au', flag: '🇦🇺', layout: larkEnglishLayout },
  { id: 'lark-ru', language: 'ru', layoutName: 'legacy', flag: '🇷🇺', layout: larkRussianLayout }
]

function inLayoutChoices(language: HostLanguageId): HostLayoutChoice[] {
  const meta = hostLanguage(language)
  return IN_LAYOUT_EXTRAS.filter(extra => extra.language === language).map(extra => ({
    id: extra.id,
    language,
    languageName: meta.name,
    layoutName: extra.layoutName,
    flag: extra.flag,
    kind: 'in-layout'
  }))
}

const systemLayouts: HostLayout[] = HOST_LANGUAGES.flatMap(language =>
  language.sections.map(section =>
    hostLayoutFromSymbols(
      language.symbols,
      section,
      systemLayoutId(language, section),
      XKB_INCLUDE_FILES[language.xkbModule]
    )
  )
)

export const hostLayoutChoices: readonly HostLayoutChoice[] = HOST_LANGUAGES.flatMap(language => [
  ...language.sections.map(section => systemChoice(language, section)),
  ...inLayoutChoices(language.id)
])

/** System English group (`us(basic)`). */
export const SYSTEM_US_LAYOUT_ID = systemLayoutId(hostLanguage('en'), hostLanguage('en').primarySection)

/** System Russian group (`ru(winkeys)`), not the LARK legacy group. */
export const SYSTEM_RU_LAYOUT_ID = systemLayoutId(hostLanguage('ru'), hostLanguage('ru').primarySection)

/** System Ukrainian group (`ua(unicode)`). */
export const SYSTEM_UA_LAYOUT_ID = systemLayoutId(hostLanguage('uk'), hostLanguage('uk').primarySection)

/** System German group (`de(basic)` over `latin(type4)`). */
export const SYSTEM_DE_LAYOUT_ID = systemLayoutId(hostLanguage('de'), hostLanguage('de').primarySection)

function layoutsForModule(xkbModule: string): HostLayout[] {
  const prefix = `system-${xkbModule}`
  return systemLayouts.filter(layout => layout.id === prefix || layout.id.startsWith(`${prefix}-`))
}

export const systemEnglishLayout = systemLayouts.find(layout => layout.id === SYSTEM_US_LAYOUT_ID)!
export const russianSystemLayouts: readonly HostLayout[] = layoutsForModule(hostLanguage('ru').xkbModule)
export const systemRussianLayout = russianSystemLayouts.find(
  layout => layout.id === SYSTEM_RU_LAYOUT_ID
)!
export const ukrainianSystemLayouts: readonly HostLayout[] = layoutsForModule(
  hostLanguage('uk').xkbModule
)
export const systemUkrainianLayout = ukrainianSystemLayouts.find(
  layout => layout.id === SYSTEM_UA_LAYOUT_ID
)!
export const germanSystemLayouts: readonly HostLayout[] = layoutsForModule(hostLanguage('de').xkbModule)
export const systemGermanLayout = germanSystemLayouts.find(
  layout => layout.id === SYSTEM_DE_LAYOUT_ID
)!

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

const BUILTIN_PROFILE_ID = new RegExp(
  `^(${HOST_LANGUAGE_IDS.join('|')}):(in-layout|system)(?::([A-Za-z0-9_-]+))?$`
)

export function parseBuiltinLanguageProfileId(id: string): BuiltinLanguageProfile | null {
  const match = BUILTIN_PROFILE_ID.exec(id)
  if (!match || !isHostLanguageId(match[1])) return null
  return {
    language: match[1],
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
  ...IN_LAYOUT_EXTRAS.map(extra => [extra.id, extra.layout] as const),
  ...systemLayouts.map(layout => [layout.id, layout] as const)
])

export function hostLayoutChoice(id: string): HostLayoutChoice | undefined {
  return hostLayoutChoices.find(choice => choice.id === id)
}

/** Symbols for a built-in layout id (`lark-en`, `system-ru`, …). */
export function hostLayoutById(id: string): HostLayout | undefined {
  return layoutsById.get(id)
}
