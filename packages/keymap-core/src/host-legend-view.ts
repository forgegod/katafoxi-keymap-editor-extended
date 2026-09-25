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
    open: view.open
  }
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
  /** Drawn on the keycap. */
  shown: boolean
  /** Profile and AltGr columns. A collapsed language is only the eye and flag. */
  wide: boolean
  altGr: boolean
  altGrShift: boolean
}

/** Base column, then the other languages in table order. */
export function hostLegendColumns(view: HostLegendView): HostLegendColumn[] {
  return view.columns.map((column, index): HostLegendColumn => {
    const extraOpen = view.open === column.language && column.visible
    return {
      language: column.language,
      layoutId: column.layoutId,
      shown: index === 0 ? column.visible : extraOpen,
      wide: index === 0 || extraOpen,
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
  return next
}

/** Drop an extra language. The last remaining extra, or Russian, stays open. */
export function removeHostLanguage(
  view: HostLegendView,
  language: HostLanguageId
): HostLegendView {
  if (!isAddableHostLanguage(language)) return view
  const index = view.columns.findIndex(column => column.language === language)
  if (index <= 0) return view
  const next = cloneView(view)
  next.columns.splice(index, 1)
  if (next.open !== language) return next
  const extras = next.columns.slice(1)
  const fallback =
    [...extras].reverse().find(column => isAddableHostLanguage(column.language)) ??
    extras.find(column => column.language === 'ru') ??
    extras[0]
  if (!fallback) {
    next.open = null
    return next
  }
  fallback.visible = true
  next.open = fallback.language
  return next
}

/** Open another language. The previous second column collapses to its flag. */
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
  next.open = language
  return next
}

/**
 * Eye on the base column hides its glyphs. Eye on the open second column
 * collapses it. Eye on a collapsed language opens it and collapses the other.
 */
export function toggleHostLanguage(
  view: HostLegendView,
  language: HostLanguageId
): HostLegendView {
  const column = columnOf(view, language)
  if (!column) return view
  const next = cloneView(view)
  const target = columnOf(next, language)!
  if (next.columns[0].language === language) {
    target.visible = !target.visible
    return next
  }
  const wide = next.open === language && target.visible
  if (wide) {
    target.visible = false
    return next
  }
  target.visible = true
  next.open = language
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
