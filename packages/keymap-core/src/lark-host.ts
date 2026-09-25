import { composeHostPair, hostLayoutFromSymbols, type HostLayout } from './host-layout.js'
import type { ComposedLegend, HostLegendView } from './types.js'
import { LARK_AU_BASIC, LARK_RU_LEGACY } from './lark-host-symbols.js'
import { SYSTEM_RU_SYMBOLS } from './system-ru-symbols.js'

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
  language: string
  /** Symbols section, shown next to the flag (`au`, `ru`). */
  layoutName: string
  flag: string
}

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
    layers: [true, true, true, true]
  }
}

export const hostLayoutChoices: readonly HostLayoutChoice[] = [
  { id: 'lark-en', language: 'English', layoutName: 'au', flag: '🇦🇺' },
  { id: 'lark-ru', language: 'Russian', layoutName: 'ru', flag: '🇷🇺' },
  { id: SYSTEM_RU_LAYOUT_ID, language: 'Russian', layoutName: 'winkeys', flag: '🇷🇺' }
]

/** LARK preset: English `au` plus Russian, with AltGr. */
export const LARK_STANDARD_VIEW: HostLegendView = {
  baseId: 'lark-en',
  secondId: 'lark-ru',
  altGr: true,
  altGrShift: true,
  source: 'standard',
  baseVisible: true,
  secondVisible: true,
  layers: [true, true, true, true]
}

const layoutsById = new Map<string, HostLayout>([
  ['lark-en', larkEnglishLayout],
  ['lark-ru', larkRussianLayout],
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
    Pick<HostLegendView, 'baseVisible' | 'secondVisible' | 'layers' | 'altGr' | 'altGrShift'>
  >
): HostLegendView {
  return { ...current, ...patch }
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
    altGrFrom: view.secondId === SYSTEM_RU_LAYOUT_ID ? 'second' : 'base'
  })
}
