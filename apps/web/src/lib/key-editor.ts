import {
  childCodeIndex,
  type HydratedNode
} from './hydrate'

export interface EditorSlot {
  codeIndex: number
  param: unknown
  value: string | number | undefined
  label: string
}

const SLOT_LABELS: Record<string, string> = {
  layer: 'Layer',
  mod: 'Modifier',
  behaviour: 'Behaviour',
  command: 'Command',
  keycode: 'Key',
  code: 'Key'
}

export function slotLabel(param: unknown): string {
  if (param && typeof param === 'object' && 'name' in param) {
    const name = (param as { name?: string }).name
    if (name) return name
  }
  if (typeof param === 'string') return SLOT_LABELS[param] ?? param
  return 'Value'
}

export function isKeycodeParam(param: unknown): boolean {
  return param === 'code' || param === 'keycode'
}

const CODE_COL_MIN_PX = 72
const CODE_COL_WIDE_MIN_PX = 148
const CODE_COL_MAX_PX = 280
const CODE_CHAR_PX = 8
const CODE_CELL_PAD_PX = 16

/** Typical label length: longest when `fitLongest`, otherwise the 90th percentile. */
export function typicalCodeLabelChars(
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

/** Columns from width and cell min; rows = ceil(n / cols) for column-major grids. */
export function codeGridMetrics(
  itemCount: number,
  widthPx: number,
  minColPx = CODE_COL_MIN_PX
): {
  cols: number
  rows: number
} {
  const colW = Math.max(CODE_COL_MIN_PX, minColPx)
  const cols = Math.max(2, Math.floor(Math.max(widthPx, 1) / colW))
  const rows = itemCount <= 0 ? 1 : Math.ceil(itemCount / cols)
  return { cols, rows }
}

/** Behaviour slot plus each hydrated param (including nested LC(code) slots). */
export function buildEditorSlots(
  normalized: HydratedNode,
  behaviourParams: unknown[]
): EditorSlot[] {
  const slots: EditorSlot[] = [
    {
      codeIndex: 0,
      param: 'behaviour',
      value: normalized.value,
      label: slotLabel('behaviour')
    }
  ]

  function walk(
    parentIndex: number,
    params: unknown[],
    values: HydratedNode[]
  ) {
    params.forEach((param, i) => {
      const codeIndex = childCodeIndex(parentIndex, values, i)
      const node = values[i]
      slots.push({
        codeIndex,
        param,
        value: node?.value,
        label: slotLabel(param)
      })
      const nested = (node?.source?.params as unknown[]) || []
      if (nested.length > 0) {
        walk(codeIndex, nested, node?.params ?? [])
      }
    })
  }

  walk(0, behaviourParams, normalized.params)
  return slots
}
