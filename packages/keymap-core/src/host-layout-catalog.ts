import {
  HOST_LANGUAGES,
  hostLanguage,
  type HostLanguage,
  type HostLanguageId
} from './host-languages.js'
import { SYSTEM_DE_SYMBOLS } from './system-de-symbols.js'
import { SYSTEM_ES_SYMBOLS } from './system-es-symbols.js'
import { SYSTEM_FR_SYMBOLS } from './system-fr-symbols.js'
import { SYSTEM_LATIN_SYMBOLS } from './system-latin-symbols.js'
import { SYSTEM_PL_SYMBOLS } from './system-pl-symbols.js'
import { SYSTEM_US_XKB_SYMBOLS } from './system-us-xkb-symbols.js'
import type { ParseXkbOptions } from './xkb-symbols.js'

export type HostLayoutKind = 'system' | 'user'

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

/** One builtin section the registry can parse on first `hostLayout(id)`. */
export interface BuiltinHostLayoutSpec {
  id: string
  language: HostLanguageId
  name: string
  flag: string
  primary?: boolean
  source: string
  section: string
  files?: ParseXkbOptions['files']
}

/** Include map for xkb modules that pull in another file (`de` → `latin`). */
const XKB_INCLUDE_FILES: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  de: {
    latin: SYSTEM_LATIN_SYMBOLS,
    us: SYSTEM_US_XKB_SYMBOLS,
    de: SYSTEM_DE_SYMBOLS
  },
  fr: {
    latin: SYSTEM_LATIN_SYMBOLS,
    us: SYSTEM_US_XKB_SYMBOLS,
    fr: SYSTEM_FR_SYMBOLS
  },
  pl: {
    latin: SYSTEM_LATIN_SYMBOLS,
    us: SYSTEM_US_XKB_SYMBOLS,
    pl: SYSTEM_PL_SYMBOLS
  },
  es: {
    latin: SYSTEM_LATIN_SYMBOLS,
    us: SYSTEM_US_XKB_SYMBOLS,
    es: SYSTEM_ES_SYMBOLS
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

function systemSpec(language: HostLanguage, section: string): BuiltinHostLayoutSpec {
  return {
    id: systemLayoutId(language, section),
    language: language.id as HostLanguageId,
    name: systemLayoutName(language, section),
    flag: language.flag,
    primary: section === language.primarySection,
    source: language.symbols,
    section,
    files: XKB_INCLUDE_FILES[language.xkbModule]
  }
}

export const hostLayoutChoices: readonly HostLayoutChoice[] = HOST_LANGUAGES.flatMap(language =>
  language.sections.map(section => systemChoice(language, section))
)

/** Builtin sections the registry parses lazily. Importing this list does not parse. */
export const builtinHostLayoutSpecs: readonly BuiltinHostLayoutSpec[] = HOST_LANGUAGES.flatMap(
  language => language.sections.map(section => systemSpec(language, section))
)

/** System English group (`us(basic)`). */
export const SYSTEM_US_LAYOUT_ID = systemLayoutId(hostLanguage('en'), hostLanguage('en').primarySection)

/** System Russian group (`ru(winkeys)`). */
export const SYSTEM_RU_LAYOUT_ID = systemLayoutId(hostLanguage('ru'), hostLanguage('ru').primarySection)

/** System Ukrainian group (`ua(unicode)`). */
export const SYSTEM_UA_LAYOUT_ID = systemLayoutId(hostLanguage('uk'), hostLanguage('uk').primarySection)

/** System German group (`de(basic)` over `latin(type4)`). */
export const SYSTEM_DE_LAYOUT_ID = systemLayoutId(hostLanguage('de'), hostLanguage('de').primarySection)

/** System French group (`fr(basic)` over `latin`). */
export const SYSTEM_FR_LAYOUT_ID = systemLayoutId(hostLanguage('fr'), hostLanguage('fr').primarySection)

/** System Polish group (`pl(basic)` over `latin`, programmers / AltGr). */
export const SYSTEM_PL_LAYOUT_ID = systemLayoutId(hostLanguage('pl'), hostLanguage('pl').primarySection)

/** System Spanish group (`es(basic)` over `latin(type4)`). */
export const SYSTEM_ES_LAYOUT_ID = systemLayoutId(hostLanguage('es'), hostLanguage('es').primarySection)

/** Static catalog rows for one language. Runtime layouts are merged in the registry. */
export function catalogLayoutsForLanguage(language: HostLanguageId): HostLayoutChoice[] {
  const all = hostLayoutChoices.filter(choice => choice.language === language)
  return [
    ...all.filter(choice => choice.kind === 'system' && choice.primary),
    ...all.filter(choice => choice.kind === 'system' && !choice.primary)
  ]
}

export function primarySystemLayoutId(language: HostLanguageId): string | undefined {
  return catalogLayoutsForLanguage(language).find(
    choice => choice.kind === 'system' && choice.primary
  )?.id
}

export function hostLayoutChoiceLabel(choice: HostLayoutChoice): string {
  if (choice.primary) return 'System'
  return choice.layoutName
}

export function reservedHostProfileNames(): string[] {
  return ['System']
}
