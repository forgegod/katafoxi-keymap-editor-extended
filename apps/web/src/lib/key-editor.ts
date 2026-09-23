import {
  isModifierWrapCode,
  modifierHoldForKey,
  modifierHoldForWrap,
  readModifierChain,
  toggleModifierWraps,
  writeModifierChain
} from '@keymap-editor/keymap-core'
import {
  childCodeIndex,
  makeIndex,
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

export function keycodeSlots(slots: EditorSlot[]): EditorSlot[] {
  return slots.filter(slot => isKeycodeParam(slot.param))
}

export function keycodeChainRootSlot(
  slots: EditorSlot[],
  activeIndex: number
): EditorSlot | undefined {
  const keys = keycodeSlots(slots)
  const activePos = keys.findIndex(slot => slot.codeIndex === activeIndex)
  if (activePos < 0) return slots.find(slot => slot.codeIndex === activeIndex)
  let rootPos = activePos
  while (rootPos > 0 && isModifierWrapCode(keys[rootPos - 1].value)) {
    rootPos -= 1
  }
  return keys[rootPos]
}

export function terminalKeySlot(
  slots: EditorSlot[],
  activeIndex: number
): EditorSlot | undefined {
  const root = keycodeChainRootSlot(slots, activeIndex)
  if (!root || !isKeycodeParam(root.param)) {
    return slots.find(slot => slot.codeIndex === activeIndex)
  }
  const keys = keycodeSlots(slots)
  const rootPos = keys.findIndex(slot => slot.codeIndex === root.codeIndex)
  let end = rootPos
  while (end + 1 < keys.length && isModifierWrapCode(keys[end].value)) {
    end += 1
  }
  return keys[end]
}

export function visibleValueSlots(slots: EditorSlot[]): EditorSlot[] {
  return slots.filter(
    slot => slot.param !== 'behaviour' && !isModifierWrapCode(slot.value)
  )
}

function replaceIndexedNode(
  tree: HydratedNode,
  index: number,
  next: HydratedNode
): HydratedNode {
  const nodes = makeIndex(tree)
  const target = nodes[index]
  if (!target) return tree
  target.value = next.value
  target.params = next.params
  return tree
}

function makeBindNode(
  value: string | number | undefined,
  params: HydratedNode[]
): HydratedNode {
  return { value, params }
}

function detachNode(node: HydratedNode | undefined): HydratedNode | undefined {
  if (!node) return undefined
  return { value: node.value, params: node.params ?? [] }
}

export function applyModifierHold(
  tree: HydratedNode,
  chainRootIndex: number,
  wrapCode: string
): HydratedNode {
  const root = makeIndex(tree)[chainRootIndex]
  if (!root) return tree
  const { wraps, terminal } = readModifierChain(root)
  const next = writeModifierChain(
    toggleModifierWraps(wraps, wrapCode, terminal?.value),
    detachNode(terminal),
    makeBindNode
  )
  return replaceIndexedNode(tree, chainRootIndex, next)
}

export function applyTerminalKey(
  tree: HydratedNode,
  chainRootIndex: number,
  keyCode: string | number
): HydratedNode {
  const root = makeIndex(tree)[chainRootIndex]
  if (!root) return tree
  const { wraps } = readModifierChain(root)
  const hold = modifierHoldForKey(keyCode)
  const nextWraps = hold
    ? wraps.filter(wrap => modifierHoldForWrap(wrap)?.role !== hold.role)
    : wraps
  const next = writeModifierChain(
    nextWraps,
    { value: keyCode, params: [] },
    makeBindNode
  )
  return replaceIndexedNode(tree, chainRootIndex, next)
}
