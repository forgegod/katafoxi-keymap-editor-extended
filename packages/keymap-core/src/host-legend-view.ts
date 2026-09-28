import { primarySystemLayoutId } from './host-layout-catalog.js'
import { STANDARD_HOST_LEGEND_VIEW } from './host-legend-presets.js'
import {
  ADDABLE_HOST_LANGUAGE_IDS,
  isAddableHostLanguage,
  type HostLanguageId
} from './host-languages.js'
import type { HostColumn, HostLegendView } from './types.js'

function cloneView(view: HostLegendView): HostLegendView {
  return {
    columns: view.columns.map(column => ({ ...column })),
    open: view.open,
    ...(view.keycap ? { keycap: [...view.keycap] } : {})
  }
}

/** Languages drawn on the keycap, oldest first. At most two, and only visible columns. */
function shownKeycap(view: HostLegendView): HostLanguageId[] {
  const columns = new Map(view.columns.map(column => [column.language, column]))
  const raw = view.keycap ?? derivedKeycap(view)
  return raw.filter(language => columns.get(language)?.visible === true).slice(-2)
}

/** Legacy pair: the visible base, then the open language when that column is visible. */
function derivedKeycap(view: HostLegendView): HostLanguageId[] {
  const derived: HostLanguageId[] = []
  const base = view.columns[0]
  if (base?.visible) derived.push(base.language)
  if (view.open && view.open !== base?.language) {
    const extra = view.columns.find(column => column.language === view.open)
    if (extra?.visible) derived.push(view.open)
  }
  return derived
}

/**
 * Put `language` on the keycap.
 * Two slots. When both are full and English is one of them, a national language
 * replaces the other national. Otherwise the oldest glyph set leaves.
 */
function placeOnKeycap(view: HostLegendView, language: HostLanguageId): HostLanguageId[] {
  const base = view.columns[0]?.language
  let keycap = shownKeycap(view).filter(id => id !== language)
  if (keycap.length >= 2) {
    if (base != null && keycap.includes(base) && language !== base) {
      keycap = keycap.filter(id => id === base)
    } else {
      keycap = keycap.slice(-1)
    }
  }
  keycap.push(language)
  return keycap
}

function columnOf(view: HostLegendView, language: HostLanguageId): HostColumn | undefined {
  return view.columns.find(column => column.language === language)
}

export function standardHostLegendView(): HostLegendView {
  return cloneView(STANDARD_HOST_LEGEND_VIEW)
}

export interface HostLegendColumn {
  language: HostLanguageId
  layoutId: string
  /** Eye state of the column itself, before the base/extra rule. */
  visible: boolean
  /** Drawn on the keycap. */
  shown: boolean
  /** Profile and AltGr columns. A collapsed language is only the eye and flag. */
  wide: boolean
  altGr: boolean
  altGrShift: boolean
}

/** Base column, then the other languages in table order. */
export function hostLegendColumns(view: HostLegendView): HostLegendColumn[] {
  const onKeycap = new Set(shownKeycap(view))
  return view.columns.map((column, index): HostLegendColumn => {
    const shown = onKeycap.has(column.language)
    return {
      language: column.language,
      layoutId: column.layoutId,
      visible: column.visible,
      shown,
      wide: index === 0 || shown,
      altGr: column.altGr,
      altGrShift: column.altGrShift
    }
  })
}

/** Languages that can still be added after the open columns. */
export function hostLanguagesAvailable(view: HostLegendView): HostLanguageId[] {
  const used = new Set(view.columns.map(column => column.language))
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
  const layoutId = primarySystemLayoutId(to)
  if (!layoutId) return view
  const next = cloneView(view)
  const slot = next.columns.find(column => column.language === from)
  if (!slot || slot === next.columns[0]) return view
  slot.language = to
  slot.layoutId = layoutId
  if (next.open === from) next.open = to
  if (next.keycap) next.keycap = next.keycap.map(id => (id === from ? to : id))
  return next
}

/** Drop an extra language. The last remaining extra stays open. */
export function removeHostLanguage(
  view: HostLegendView,
  language: HostLanguageId
): HostLegendView {
  if (!isAddableHostLanguage(language)) return view
  const index = view.columns.findIndex(column => column.language === language)
  if (index <= 0) return view
  const next = cloneView(view)
  next.columns.splice(index, 1)
  if (next.keycap) next.keycap = next.keycap.filter(id => id !== language)
  if (next.open !== language) return next
  const fallback = next.columns.at(-1)
  if (!fallback || fallback === next.columns[0]) {
    next.open = null
    return next
  }
  fallback.visible = true
  next.open = fallback.language
  next.keycap = placeOnKeycap(next, fallback.language)
  return next
}

/** Open another language and draw it on the keycap. The install pair follows it. */
export function addHostLanguage(
  view: HostLegendView,
  language: HostLanguageId
): HostLegendView {
  if (!hostLanguagesAvailable(view).includes(language)) return view
  const layoutId = primarySystemLayoutId(language)
  if (!layoutId) return view
  const next = cloneView(view)
  next.columns.push({
    language,
    layoutId,
    visible: true,
    altGr: true,
    altGrShift: true
  })
  next.keycap = placeOnKeycap(next, language)
  next.open = language
  return next
}

/**
 * Eye toggles that language on the keycap. At most two languages are drawn.
 * Hiding the base keeps it as the ZMK reference. Showing a national language
 * makes it the install counterpart (`open`).
 */
export function toggleHostLanguage(
  view: HostLegendView,
  language: HostLanguageId
): HostLegendView {
  const column = columnOf(view, language)
  if (!column) return view
  const next = cloneView(view)
  const target = columnOf(next, language)!
  const base = next.columns[0]?.language
  if (shownKeycap(next).includes(language)) {
    target.visible = false
    next.keycap = shownKeycap(next).filter(id => id !== language)
    if (next.open === language) {
      const other = [...next.keycap].reverse().find(id => id !== base)
      if (other) next.open = other
    }
    return next
  }
  target.visible = true
  next.keycap = placeOnKeycap(next, language)
  if (language !== base) next.open = language
  return next
}

export function setHostColumnAlt(
  view: HostLegendView,
  language: HostLanguageId,
  field: 'altGr' | 'altGrShift',
  on: boolean
): HostLegendView {
  if (!columnOf(view, language)) return view
  const next = cloneView(view)
  columnOf(next, language)![field] = on
  return next
}

/** Replace the layout of one language column, including a collapsed one. */
export function assignHostLanguageLayout(
  current: HostLegendView,
  language: HostLanguageId,
  layoutId: string
): HostLegendView {
  if (!columnOf(current, language)) return current
  const next = cloneView(current)
  columnOf(next, language)!.layoutId = layoutId
  return next
}
