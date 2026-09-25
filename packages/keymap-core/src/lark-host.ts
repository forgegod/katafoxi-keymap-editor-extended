import { composeHostPair, hostLayoutFromSymbols, type HostLayout } from './host-layout.js'
import type { ComposedLegend, HostLegendView } from './types.js'
import { LARK_AU_BASIC, LARK_RU_LEGACY } from './lark-host-symbols.js'
import { SYSTEM_RU_SYMBOLS } from './system-ru-symbols.js'
import { SYSTEM_US_SYMBOLS } from './system-us-symbols.js'

export type HostLanguageId = 'en' | 'ru'
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
  const match = /^(en|ru):(system|in-layout)$/.exec(id)
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
  [SYSTEM_RU_LAYOUT_ID, systemRussianLayout]
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
    view.secondId && view.secondId !== view.baseId
      ? (layoutsById.get(view.secondId) ?? null)
      : null
  return composeHostPair(base, second, token, {
    altGr: view.altGr,
    altGrShift: view.altGrShift,
    altGrFrom:
      view.secondId === SYSTEM_RU_LAYOUT_ID || view.baseId === SYSTEM_US_LAYOUT_ID
        ? 'second'
        : 'base'
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
