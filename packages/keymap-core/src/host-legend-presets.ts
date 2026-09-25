import { hostLayoutFromSymbols, type HostLayout } from './host-layout.js'
import { LARK_AU_BASIC, LARK_RU_LEGACY } from './lark-host-symbols.js'
import type { HostLegendView } from './types.js'

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

/** LARK preset: English `au` plus Russian, with AltGr. */
export const LARK_STANDARD_VIEW: HostLegendView = {
  columns: [
    { language: 'en', layoutId: 'lark-en', visible: true, altGr: true, altGrShift: true },
    { language: 'ru', layoutId: 'lark-ru', visible: true, altGr: true, altGrShift: true }
  ],
  open: 'ru'
}
