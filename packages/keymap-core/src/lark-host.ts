import { composeHostPair, hostLayoutFromSymbols, type HostLayout } from './host-layout.js'
import type { ComposedLegend, HostLegendView } from './types.js'
import { LARK_AU_BASIC, LARK_RU_LEGACY } from './lark-host-symbols.js'

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

export const hostLayoutChoices: readonly HostLayoutChoice[] = [
  { id: 'lark-en', language: 'English', layoutName: 'au', flag: '🇦🇺' },
  { id: 'lark-ru', language: 'Russian', layoutName: 'ru', flag: '🇷🇺' }
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
  ['lark-ru', larkRussianLayout]
])

export function hostLayoutChoice(id: string): HostLayoutChoice | undefined {
  return hostLayoutChoices.find(choice => choice.id === id)
}

function sameLanguages(view: HostLegendView, preset: HostLegendView): boolean {
  return (
    view.baseId === preset.baseId &&
    view.secondId === preset.secondId &&
    view.altGr === preset.altGr &&
    view.altGrShift === preset.altGrShift
  )
}

/** Apply a language or column change. Matching the LARK preset returns `standard`. */
export function hostLegendView(
  current: HostLegendView,
  patch: Partial<Pick<HostLegendView, 'baseId' | 'secondId' | 'altGr' | 'altGrShift'>>
): HostLegendView {
  const next: HostLegendView = { ...current, ...patch, source: 'custom' }
  if (next.secondId === next.baseId) next.secondId = null
  if (sameLanguages(next, LARK_STANDARD_VIEW)) next.source = 'standard'
  return next
}

/** Show/hide columns or layer slots. Does not change `source`. */
export function hostLegendPreview(
  current: HostLegendView,
  patch: Partial<Pick<HostLegendView, 'baseVisible' | 'secondVisible' | 'layers'>>
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
    altGrShift: view.altGrShift
  })
}
