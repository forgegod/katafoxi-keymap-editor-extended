import { SYSTEM_RU_LAYOUT_ID, SYSTEM_US_LAYOUT_ID } from './host-layout-catalog.js'
import type { HostLegendView } from './types.js'

/** Default view: primary system English plus primary system Russian, AltGr on. */
export const STANDARD_HOST_LEGEND_VIEW: HostLegendView = {
  columns: [
    { language: 'en', layoutId: SYSTEM_US_LAYOUT_ID, visible: true, altGr: true, altGrShift: true },
    { language: 'ru', layoutId: SYSTEM_RU_LAYOUT_ID, visible: true, altGr: true, altGrShift: true }
  ],
  open: 'ru'
}
