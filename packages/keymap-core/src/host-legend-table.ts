import { resolveBinding, resolveHostColumns } from './compose.js'
import { hostComposeGlyphs } from './host-layout.js'
import { hostLevels } from './host-layout-registry.js'
import { hostKeyByZmk } from './host-key-id.js'
import type { HostLanguageId } from './host-languages.js'
import type { HostLegendView, KeyBindingNode } from './types.js'

/** One language's cells in the host-legend table. */
export interface HostLegendTableCell {
  language: HostLanguageId
  layoutId: string
  shown: boolean
  wide: boolean
  pair: string
  altGr: string
  altGrShift: string
}

/**
 * Pair and AltGr cells for every column in the view.
 * Collapsed extras stay in the row with empty glyphs; wide columns
 * always show the layout's own levels (not the keycap collapse).
 */
export function hostLegendTableRow(
  binding: KeyBindingNode | undefined,
  view: HostLegendView,
  options?: { allWide?: boolean }
): HostLegendTableCell[] {
  const tap = binding ? resolveBinding(binding).tap : null
  const zmk = tap ? hostKeyByZmk(tap)?.zmk : undefined
  return resolveHostColumns(view).map(column => {
    const wide = options?.allWide === true || column.wide
    const levels = zmk ? hostComposeGlyphs(hostLevels(column.layoutId, zmk)) : undefined
    return {
      language: column.language,
      layoutId: column.layoutId,
      shown: options?.allWide === true || column.shown,
      wide,
      pair: wide && levels ? `${levels[0]}${levels[1]}` : '',
      altGr: wide && column.altGr && levels ? levels[2] : '',
      altGrShift: wide && column.altGrShift && levels ? levels[3] : ''
    }
  })
}
