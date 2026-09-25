import { composeHostPair } from './host-layout.js'
import {
  hostLayoutChoice,
  hostLayoutsForLanguage,
  layoutsById
} from './host-layout-catalog.js'
import { LARK_STANDARD_VIEW } from './host-legend-presets.js'
import {
  ADDABLE_HOST_LANGUAGE_IDS,
  isAddableHostLanguage,
  type HostLanguageId
} from './host-languages.js'
import type { ComposedLegend, HostLegendView } from './types.js'

/** Apply a language change. */
export function hostLegendView(
  current: HostLegendView,
  patch: Partial<Pick<HostLegendView, 'baseId' | 'secondId'>>
): HostLegendView {
  const next: HostLegendView = { ...current, ...patch }
  if (next.secondId === next.baseId) next.secondId = null
  return next
}

/** Show or hide columns and layer slots. */
export function hostLegendPreview(
  current: HostLegendView,
  patch: Partial<
    Pick<
      HostLegendView,
      | 'baseVisible'
      | 'secondVisible'
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

/** Legend for a view. Unknown ids and non-character keys return null. */
export function hostLegendFor(
  token: string,
  view: HostLegendView = LARK_STANDARD_VIEW
): Pick<ComposedLegend, 'en' | 'second' | 'altGr' | 'altGrShift' | 'showAltGr' | 'showAltGrShift' | 'bilingualNote' | 'bilingualAlt' | 'keycode'> | null {
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
  return ADDABLE_HOST_LANGUAGE_IDS.filter(language => !used.has(language))
}

/** Swap an extra language for another unused one. Keeps the slot order. */
export function replaceHostLanguage(
  view: HostLegendView,
  from: HostLanguageId,
  to: HostLanguageId
): HostLegendView {
  if (from === to || !isAddableHostLanguage(from) || !isAddableHostLanguage(to)) {
    return view
  }
  if (!hostLanguagesAvailable(view).includes(to)) return view
  const choice = hostLayoutsForLanguage(to).find(item => item.kind === 'system')
  if (!choice) return view
  let found = false
  const roster = rosterOf(view).map(slot => {
    if (slot.language !== from) return slot
    found = true
    return {
      language: to,
      layoutId: choice.id,
      altGr: slot.altGr,
      altGrShift: slot.altGrShift
    }
  })
  if (!found) return view
  const replacingOpen = hostLayoutChoice(view.secondId ?? '')?.language === from
  const next = replacingOpen
    ? hostLegendView(view, { secondId: choice.id })
    : { ...view }
  return { ...next, roster }
}

/** Drop an extra language. The last remaining extra, or Russian, stays open. */
export function removeHostLanguage(
  view: HostLegendView,
  language: HostLanguageId
): HostLegendView {
  if (!isAddableHostLanguage(language)) return view
  const before = rosterOf(view)
  const roster = before.filter(slot => slot.language !== language)
  if (roster.length === before.length) return view
  const removingOpen = hostLayoutChoice(view.secondId ?? '')?.language === language
  if (!removingOpen) return { ...view, roster }
  const fallback =
    [...roster].reverse().find(slot => isAddableHostLanguage(slot.language)) ??
    roster.find(slot => slot.language === 'ru') ??
    roster[0]
  if (!fallback) return { ...view, roster, secondId: null, secondVisible: false }
  const next = hostLegendView(view, { secondId: fallback.layoutId })
  return {
    ...next,
    roster,
    secondVisible: true,
    secondAltGr: fallback.altGr,
    secondAltGrShift: fallback.altGrShift
  }
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
    : { ...current }
  return { ...next, roster }
}
