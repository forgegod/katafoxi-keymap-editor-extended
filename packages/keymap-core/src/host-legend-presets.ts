import { primarySystemLayoutId } from './host-layout-catalog.js'
import type { HostColumn, HostLegendView } from './types.js'

function freezeColumn(column: HostColumn): HostColumn {
  return Object.freeze({ ...column })
}

function freezeLegendView(view: HostLegendView): HostLegendView {
  const frozen = Object.freeze({
    columns: Object.freeze(view.columns.map(freezeColumn)),
    open: view.open,
    ...(view.keycap ? { keycap: Object.freeze([...view.keycap]) } : {})
  })
  // Runtime-frozen; HostLegendView keeps mutable array types for editor clones.
  return frozen as HostLegendView
}

/**
 * Default view: primary system English only. ZMK sends US key codes, so this
 * column is the firmware alphabet. A host language is chosen per keyboard.
 * Frozen and module-private — callers take a mutable clone via
 * `standardHostLegendView()`.
 */
const STANDARD_HOST_LEGEND_VIEW: HostLegendView = freezeLegendView({
  columns: [
    {
      language: 'en',
      layoutId: primarySystemLayoutId('en')!,
      visible: true,
      altGr: true,
      altGrShift: true
    }
  ],
  open: null
})

/**
 * The former product default (system English + system Russian). A saved view
 * that still matches this was the demo, not a choice for that keyboard.
 */
const LEGACY_BILINGUAL_HOST_LEGEND: HostLegendView = freezeLegendView({
  columns: [
    {
      language: 'en',
      layoutId: primarySystemLayoutId('en')!,
      visible: true,
      altGr: true,
      altGrShift: true
    },
    {
      language: 'ru',
      layoutId: primarySystemLayoutId('ru')!,
      visible: true,
      altGr: true,
      altGrShift: true
    }
  ],
  open: 'ru'
})

/** Mutable clone of the default legend view. */
export function standardHostLegendView(): HostLegendView {
  return {
    columns: STANDARD_HOST_LEGEND_VIEW.columns.map(column => ({ ...column })),
    open: STANDARD_HOST_LEGEND_VIEW.open,
    ...(STANDARD_HOST_LEGEND_VIEW.keycap
      ? { keycap: [...STANDARD_HOST_LEGEND_VIEW.keycap] }
      : {})
  }
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
