import { composeHostPair, hostLayoutFromSymbols, type HostLayout } from './host-layout.js'
import type { ComposedLegend, HostLegendView } from './types.js'
import { LARK_AU_BASIC, LARK_RU_LEGACY } from './lark-host-symbols.js'
import { SYSTEM_RU_SYMBOLS } from './system-ru-symbols.js'
import { SYSTEM_UA_SYMBOLS } from './system-ua-symbols.js'
import { SYSTEM_US_SYMBOLS } from './system-us-symbols.js'

export type HostLanguageId = 'en' | 'ru' | 'uk'
export type HostLayoutKind = 'system' | 'in-layout'

/** English (Australian) LARK host group. */
export const larkEnglishLayout: HostLayout = hostLayoutFromSymbols(
  LARK_AU_BASIC,
  'basic',
  'lark-en'
)

/** Russian (legacy) LARK host group. */
export const larkRussianLayout: HostLayout = hostLayoutFromSymbols(
  LARK_RU_LEGACY,
  'legacy',
  'lark-ru'
)

/** Default host legend: English and Russian columns, AltGr from English. */
export function larkHostLegend(
  token: string
): Pick<ComposedLegend, 'en' | 'second' | 'altGr' | 'altGrShift' | 'showAltGr' | 'showAltGrShift' | 'bilingualNote' | 'keycode'> | null {
  return composeHostPair(larkEnglishLayout, larkRussianLayout, token)
}

export interface HostLayoutChoice {
  id: string
  language: HostLanguageId
  languageName: string
  /** Symbols section, shown next to the flag (`us`, `au`, `winkeys`). */
  layoutName: string
  flag: string
  kind: HostLayoutKind
}

/** System English group (`us(basic)`). */
export const SYSTEM_US_LAYOUT_ID = 'system-us'

export const systemEnglishLayout: HostLayout = hostLayoutFromSymbols(
  SYSTEM_US_SYMBOLS,
  'basic',
  SYSTEM_US_LAYOUT_ID
)

/** System Russian group (`ru(winkeys)`), not the LARK legacy group. */
export const SYSTEM_RU_LAYOUT_ID = 'system-ru'

export const systemRussianLayout: HostLayout = hostLayoutFromSymbols(
  SYSTEM_RU_SYMBOLS,
  'winkeys',
  SYSTEM_RU_LAYOUT_ID
)

/** System Ukrainian group (`ua(unicode)`). */
export const SYSTEM_UA_LAYOUT_ID = 'system-ua'

export const systemUkrainianLayout: HostLayout = hostLayoutFromSymbols(
  SYSTEM_UA_SYMBOLS,
  'unicode',
  SYSTEM_UA_LAYOUT_ID
)

/** Built-in profile: English, then OS Russian. Both language columns are shown. */
export function systemRuHostLegendView(): HostLegendView {
  return {
    baseId: 'lark-en',
    secondId: SYSTEM_RU_LAYOUT_ID,
    altGr: false,
    altGrShift: false,
    source: 'custom',
    baseVisible: true,
    secondVisible: true,
    layers: [true, true, true, true],
    shownLayers: [0, 1, 2, 3]
  }
}

export const hostLayoutChoices: readonly HostLayoutChoice[] = [
  {
    id: SYSTEM_US_LAYOUT_ID,
    language: 'en',
    languageName: 'English',
    layoutName: 'us',
    flag: '🇺🇸',
    kind: 'system'
  },
  {
    id: 'lark-en',
    language: 'en',
    languageName: 'English',
    layoutName: 'au',
    flag: '🇦🇺',
    kind: 'in-layout'
  },
  {
    id: SYSTEM_RU_LAYOUT_ID,
    language: 'ru',
    languageName: 'Russian',
    layoutName: 'winkeys',
    flag: '🇷🇺',
    kind: 'system'
  },
  {
    id: 'lark-ru',
    language: 'ru',
    languageName: 'Russian',
    layoutName: 'legacy',
    flag: '🇷🇺',
    kind: 'in-layout'
  },
  {
    id: SYSTEM_UA_LAYOUT_ID,
    language: 'uk',
    languageName: 'Ukrainian',
    layoutName: 'unicode',
    flag: '🇺🇦',
    kind: 'system'
  }
]

export function hostLayoutsForLanguage(language: HostLanguageId): HostLayoutChoice[] {
  return hostLayoutChoices.filter(choice => choice.language === language)
}

export function builtinLanguageProfileId(
  language: HostLanguageId,
  kind: HostLayoutKind
): string {
  return `${language}:${kind}`
}

export function parseBuiltinLanguageProfileId(
  id: string
): { language: HostLanguageId; kind: HostLayoutKind } | null {
  const match = /^(en|ru|uk):(system|in-layout)$/.exec(id)
  if (!match) return null
  return { language: match[1] as HostLanguageId, kind: match[2] as HostLayoutKind }
}

export function builtinLanguageProfileLabel(kind: HostLayoutKind): string {
  return kind === 'system' ? 'Системная' : 'В раскладке'
}

export function reservedHostProfileNames(): string[] {
  return ['Системная', 'В раскладке', 'Стандарт', 'Системная ru']
}

export function layoutForLanguageKind(
  language: HostLanguageId,
  kind: HostLayoutKind
): HostLayoutChoice | undefined {
  return hostLayoutsForLanguage(language).find(choice => choice.kind === kind)
}

/** LARK preset: English `au` plus Russian, with AltGr. */
export const LARK_STANDARD_VIEW: HostLegendView = {
  baseId: 'lark-en',
  secondId: 'lark-ru',
  altGr: true,
  altGrShift: true,
  source: 'standard',
  baseVisible: true,
  secondVisible: true,
  layers: [true, true, true, true],
  shownLayers: [0, 1, 2, 3]
}

const layoutsById = new Map<string, HostLayout>([
  ['lark-en', larkEnglishLayout],
  ['lark-ru', larkRussianLayout],
  [SYSTEM_US_LAYOUT_ID, systemEnglishLayout],
  [SYSTEM_RU_LAYOUT_ID, systemRussianLayout],
  [SYSTEM_UA_LAYOUT_ID, systemUkrainianLayout]
])

export function hostLayoutChoice(id: string): HostLayoutChoice | undefined {
  return hostLayoutChoices.find(choice => choice.id === id)
}

function sameLanguages(view: HostLegendView, preset: HostLegendView): boolean {
  return view.baseId === preset.baseId && view.secondId === preset.secondId
}

/** Apply a language change. Matching the LARK preset returns `standard`. */
export function hostLegendView(
  current: HostLegendView,
  patch: Partial<Pick<HostLegendView, 'baseId' | 'secondId'>>
): HostLegendView {
  const next: HostLegendView = { ...current, ...patch, source: 'custom' }
  if (next.secondId === next.baseId) next.secondId = null
  if (sameLanguages(next, LARK_STANDARD_VIEW)) next.source = 'standard'
  return next
}

/** Show or hide columns and layer slots. Does not change `source`. */
export function hostLegendPreview(
  current: HostLegendView,
  patch: Partial<
    Pick<
      HostLegendView,
      | 'baseVisible'
      | 'secondVisible'
      | 'layers'
      | 'shownLayers'
      | 'altGr'
      | 'altGrShift'
      | 'layer0Raw'
    >
  >
): HostLegendView {
  return { ...current, ...patch }
}

const DEFAULT_SHOWN_LAYERS = [0, 1, 2, 3]

function markedShownLayers(view: HostLegendView): number[] {
  return view.shownLayers ? [...view.shownLayers] : [...DEFAULT_SHOWN_LAYERS]
}

/**
 * Toggle a layer in inclusion order. A fifth pick evicts the earliest
 * marked layer; layer0 is never evicted. Clearing the last eye returns [0].
 */
export function toggleShownLayer(
  view: HostLegendView,
  index: number,
  limit = 4
): HostLegendView {
  const current = markedShownLayers(view)
  const pos = current.indexOf(index)
  let next: number[]
  if (pos >= 0) {
    next = current.filter((_, i) => i !== pos)
    if (next.length === 0) next = [0]
  } else {
    next = [...current, index]
    while (next.length > limit) {
      const evictAt = next.findIndex(layer => layer !== 0)
      if (evictAt < 0) break
      next.splice(evictAt, 1)
    }
  }
  return { ...view, shownLayers: next }
}

/**
 * Shift `shownLayers` after a keymap layer is removed. Layer0 raw view
 * resets when the old layer0 is gone. An empty mark set falls back to [0].
 */
export function remapShownLayersAfterDelete(
  view: HostLegendView,
  deletedIndex: number,
  nextLayerCount: number
): HostLegendView {
  let remapped = markedShownLayers(view)
    .filter(index => index !== deletedIndex)
    .map(index => (index > deletedIndex ? index - 1 : index))
    .filter(index => index >= 0 && index < nextLayerCount)
  if (remapped.length === 0 && nextLayerCount > 0) remapped = [0]
  return {
    ...view,
    shownLayers: remapped,
    layer0Raw: deletedIndex === 0 ? false : view.layer0Raw
  }
}

/**
 * Layers drawn on the keycap: section-6 rules, clipped to `layerCount`,
 * sorted ascending. Missing `shownLayers` defaults to [0, 1, 2, 3].
 */
export function effectiveShownLayers(view: HostLegendView, layerCount: number): number[] {
  const raw = view.shownLayers ?? DEFAULT_SHOWN_LAYERS
  const seen = new Set<number>()
  const marked: number[] = []
  for (const index of raw) {
    if (index < 0 || index >= layerCount || seen.has(index)) continue
    seen.add(index)
    marked.push(index)
  }
  if (marked.length === 0) return layerCount > 0 ? [0] : []
  if (marked.length === 1 && marked[0] !== 0) return [0, marked[0]]
  return [...marked].sort((a, b) => a - b)
}

export function standardHostLegendView(): HostLegendView {
  return { ...LARK_STANDARD_VIEW }
}

/** Keep the current languages and mark them as the user's own set. */
export function customHostLegendView(current: HostLegendView): HostLegendView {
  return { ...current, source: 'custom' }
}

/** Legend for a view. Unknown ids and non-character keys return null. */
export function hostLegendFor(
  token: string,
  view: HostLegendView = LARK_STANDARD_VIEW
): Pick<ComposedLegend, 'en' | 'second' | 'altGr' | 'altGrShift' | 'showAltGr' | 'showAltGrShift' | 'bilingualNote' | 'keycode'> | null {
  const base = layoutsById.get(view.baseId)
  if (!base) return null
  const second =
    view.secondVisible !== false && view.secondId && view.secondId !== view.baseId
      ? (layoutsById.get(view.secondId) ?? null)
      : null
  return composeHostPair(base, second, token, {
    altGr: view.altGr,
    altGrShift: view.altGrShift,
    secondAltGr: view.secondAltGr ?? view.altGr,
    secondAltGrShift: view.secondAltGrShift ?? view.altGrShift
  })
}

/** Put a layout into the English (base) or Russian (second) column. */
export function applyColumnLayout(
  current: HostLegendView,
  column: 'base' | 'second',
  layoutId: string
): HostLegendView {
  const choice = hostLayoutChoice(layoutId)
  if (!choice) return current
  if (column === 'base' && choice.language !== 'en') return current
  if (column === 'second' && choice.language !== 'ru') return current
  return hostLegendView(current, column === 'base' ? { baseId: layoutId } : { secondId: layoutId })
}

export interface HostLegendColumn {
  language: HostLanguageId
  layoutId: string
  /** Drawn on the keycap. */
  shown: boolean
  /** Profile and AltGr columns. A collapsed language is only the eye and flag. */
  wide: boolean
  altGr: boolean
  altGrShift: boolean
}

type HostRosterSlot = NonNullable<HostLegendView['roster']>[number]

const ADDABLE_LANGUAGES: readonly HostLanguageId[] = ['uk']

function rosterOf(view: HostLegendView): HostRosterSlot[] {
  if (view.roster && view.roster.length > 0) return view.roster.map(slot => ({ ...slot }))
  if (!view.secondId) return []
  const choice = hostLayoutChoice(view.secondId)
  return [
    {
      language: choice?.language ?? 'ru',
      layoutId: view.secondId,
      altGr: view.secondAltGr ?? view.altGr,
      altGrShift: view.secondAltGrShift ?? view.altGrShift
    }
  ]
}

/** Base column, then the other languages in table order. */
export function hostLegendColumns(view: HostLegendView): HostLegendColumn[] {
  const baseChoice = hostLayoutChoice(view.baseId)
  const base: HostLegendColumn = {
    language: baseChoice?.language ?? 'en',
    layoutId: view.baseId,
    shown: view.baseVisible !== false,
    wide: true,
    altGr: view.altGr,
    altGrShift: view.altGrShift
  }
  const extras = rosterOf(view).map((slot): HostLegendColumn => {
    const active = view.secondId === slot.layoutId && view.secondVisible !== false
    return {
      language: slot.language,
      layoutId: slot.layoutId,
      shown: active,
      wide: active,
      altGr: active ? (view.secondAltGr ?? slot.altGr) : slot.altGr,
      altGrShift: active ? (view.secondAltGrShift ?? slot.altGrShift) : slot.altGrShift
    }
  })
  return [base, ...extras]
}

/** Languages that can still be added after the open columns. */
export function hostLanguagesAvailable(view: HostLegendView): HostLanguageId[] {
  const used = new Set(hostLegendColumns(view).map(column => column.language))
  return ADDABLE_LANGUAGES.filter(language => !used.has(language))
}

/** Open another language. The previous second column collapses to its flag. */
export function addHostLanguage(
  view: HostLegendView,
  language: HostLanguageId
): HostLegendView {
  if (!hostLanguagesAvailable(view).includes(language)) return view
  const choice = hostLayoutsForLanguage(language).find(item => item.kind === 'system')
  if (!choice) return view
  const roster = rosterOf(view)
  roster.push({
    language,
    layoutId: choice.id,
    altGr: true,
    altGrShift: true
  })
  const next = hostLegendView(view, { secondId: choice.id })
  return {
    ...next,
    roster,
    secondVisible: true,
    secondAltGr: true,
    secondAltGrShift: true
  }
}

/**
 * Eye on the base column hides its glyphs. Eye on the open second column
 * collapses it. Eye on a collapsed language opens it and collapses the other.
 */
export function toggleHostLanguage(
  view: HostLegendView,
  language: HostLanguageId
): HostLegendView {
  const columns = hostLegendColumns(view)
  const column = columns.find(item => item.language === language)
  if (!column) return view
  if (column.layoutId === view.baseId) {
    return hostLegendPreview(view, { baseVisible: !column.shown })
  }
  const roster = rosterOf(view)
  if (column.wide) return { ...view, roster, secondVisible: false }
  const next = hostLegendView({ ...view, roster }, { secondId: column.layoutId })
  return {
    ...next,
    roster,
    secondVisible: true,
    secondAltGr: column.altGr,
    secondAltGrShift: column.altGrShift
  }
}

export function setHostColumnAlt(
  view: HostLegendView,
  language: HostLanguageId,
  field: 'altGr' | 'altGrShift',
  on: boolean
): HostLegendView {
  const columns = hostLegendColumns(view)
  const column = columns.find(item => item.language === language)
  if (!column) return view
  if (column.layoutId === view.baseId) return hostLegendPreview(view, { [field]: on })
  const roster = rosterOf(view).map(slot =>
    slot.language === language ? { ...slot, [field]: on } : slot
  )
  const next: HostLegendView = { ...view, roster }
  if (view.secondId === column.layoutId) {
    if (field === 'altGr') next.secondAltGr = on
    else next.secondAltGrShift = on
  }
  return next
}

/** Replace the layout of one language column, including a collapsed one. */
export function assignHostLanguageLayout(
  current: HostLegendView,
  language: HostLanguageId,
  layoutId: string
): HostLegendView {
  const baseLanguage = hostLayoutChoice(current.baseId)?.language
  if (language === baseLanguage) return hostLegendView(current, { baseId: layoutId })
  const roster = rosterOf(current).map(slot =>
    slot.language === language ? { ...slot, layoutId } : slot
  )
  const updatesSecond = hostLayoutChoice(current.secondId ?? '')?.language === language
  if (!updatesSecond && !roster.some(slot => slot.language === language)) return current
  const next = updatesSecond
    ? hostLegendView(current, { secondId: layoutId })
    : { ...current, source: 'custom' as const }
  return { ...next, roster }
}
