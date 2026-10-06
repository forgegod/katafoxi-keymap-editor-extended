const CODE_COL_MIN_PX = 64
const CODE_COL_WIDE_MIN_PX = 148
const CODE_COL_MAX_PX = 280
const CODE_CHAR_PX = 8
const CODE_CELL_PAD_PX = 16

/** Typical label length: longest when `fitLongest`, otherwise the 90th percentile. */
function typicalCodeLabelChars(
  labels: Iterable<string>,
  fitLongest = false
): number {
  const lengths = [...labels]
    .map(label => Array.from(String(label)).length)
    .sort((a, b) => a - b)
  if (lengths.length === 0) return 8
  if (fitLongest) return lengths[lengths.length - 1]
  return lengths[Math.floor((lengths.length - 1) * 0.9)]
}

/** Narrow HID names stay dense; long Consumer-style codes get wider cells. */
export function codeColumnMinPx(
  labels: Iterable<string>,
  options?: { fitLongest?: boolean }
): number {
  const needed =
    typicalCodeLabelChars(labels, options?.fitLongest) * CODE_CHAR_PX +
    CODE_CELL_PAD_PX
  if (needed <= CODE_COL_MIN_PX + 36) return CODE_COL_MIN_PX
  return Math.min(CODE_COL_MAX_PX, Math.max(CODE_COL_WIDE_MIN_PX, Math.round(needed)))
}

/**
 * Fit as many columns as the width allows, then drop unused tracks so
 * `1fr` stretches only columns that have cells.
 */
export function codeGridMetrics(
  itemCount: number,
  widthPx: number,
  minColPx = CODE_COL_MIN_PX
): {
  cols: number
  rows: number
} {
  const colW = Math.max(CODE_COL_MIN_PX, minColPx)
  const maxCols = Math.max(2, Math.floor(Math.max(widthPx, 1) / colW))
  const rows = itemCount <= 0 ? 1 : Math.ceil(itemCount / maxCols)
  const cols =
    itemCount <= 0 ? maxCols : Math.min(maxCols, Math.max(1, Math.ceil(itemCount / rows)))
  return { cols, rows }
}
