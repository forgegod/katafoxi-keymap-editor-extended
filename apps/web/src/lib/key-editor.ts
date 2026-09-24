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

export {
  codeColumnMinPx,
  codeGridMetrics,
  typicalCodeLabelChars
} from './code-grid'

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

export function isSlotFilled(slot: EditorSlot): boolean {
  return slot.value != null && String(slot.value) !== ''
}

/** Every visible value slot has a value. `&none` has none, so it can apply. */
export function isBindingComplete(slots: EditorSlot[]): boolean {
  return visibleValueSlots(slots).every(isSlotFilled)
}

/**
 * After a filled modifier or layer, move to the empty key.
 * A still-empty modifier stays put, so choosing `&mt` starts on Modifier.
 */
export function nextEditorSlot(slots: EditorSlot[], preferIndex: number): number {
  const preferred = slots.find(slot => slot.codeIndex === preferIndex)
  if (
    preferred &&
    (preferred.param === 'mod' || preferred.param === 'layer') &&
    isSlotFilled(preferred)
  ) {
    const emptyKey = slots.find(slot => isKeycodeParam(slot.param) && !isSlotFilled(slot))
    if (emptyKey) return emptyKey.codeIndex
  }
  return terminalKeySlot(slots, preferIndex)?.codeIndex ?? preferIndex
}

/** Empty key first, then any other empty value. */
export function firstMissingSlot(slots: EditorSlot[]): EditorSlot | undefined {
  const visible = visibleValueSlots(slots)
  return (
    visible.find(slot => isKeycodeParam(slot.param) && !isSlotFilled(slot)) ??
    visible.find(slot => !isSlotFilled(slot))
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
