import { SYSTEM_RU_LAYOUT_ID, SYSTEM_US_LAYOUT_ID } from './host-layout-catalog.js'
import type { HostLegendView } from './types.js'

/**
 * Default view: primary system English only. ZMK sends US key codes, so this
 * column is the firmware alphabet. A host language is chosen per keyboard.
 */
export const STANDARD_HOST_LEGEND_VIEW: HostLegendView = {
  columns: [
    { language: 'en', layoutId: SYSTEM_US_LAYOUT_ID, visible: true, altGr: true, altGrShift: true }
  ],
  open: null
}

/**
 * The former product default (system English + system Russian). A saved view
 * that still matches this was the demo, not a choice for that keyboard.
 */
const LEGACY_BILINGUAL_HOST_LEGEND: HostLegendView = {
  columns: [
    { language: 'en', layoutId: SYSTEM_US_LAYOUT_ID, visible: true, altGr: true, altGrShift: true },
    { language: 'ru', layoutId: SYSTEM_RU_LAYOUT_ID, visible: true, altGr: true, altGrShift: true }
  ],
  open: 'ru'
}

export function isLegacyBilingualHostLegend(view: HostLegendView): boolean {
  const legacy = LEGACY_BILINGUAL_HOST_LEGEND
  if (view.open !== legacy.open || view.columns.length !== legacy.columns.length) return false
  return view.columns.every((column, index) => {
    const expected = legacy.columns[index]
    return (
      column.language === expected.language &&
      column.layoutId === expected.layoutId &&
      column.visible === expected.visible &&
      column.altGr === expected.altGr &&
      column.altGrShift === expected.altGrShift
    )
  })
}
