import { canApplyModifierHold, isModifierWrapCode } from '@keymap-editor/keymap-core'
import {
  isBindingComplete,
  isKeycodeParam,
  isSlotFilled,
  keycodeChainRootSlot,
  type EditorSlot
} from './key-editor'

export function collectActiveHolds(
  slots: EditorSlot[],
  activeCodeIndex: number
): Set<string> {
  const root = keycodeChainRootSlot(slots, activeCodeIndex)
  const on = new Set<string>()
  if (!root) return on
  const keys = slots.filter(slot => isKeycodeParam(slot.param))
  const start = keys.findIndex(slot => slot.codeIndex === root.codeIndex)
  for (let i = start; i < keys.length; i++) {
    if (!isModifierWrapCode(keys[i].value)) break
    on.add(String(keys[i].value).toUpperCase())
  }
  return on
}

export function needsTerminalKey(
  showHolds: boolean,
  activeHolds: ReadonlySet<string>,
  paramSlots: EditorSlot[]
): boolean {
  return (
    showHolds &&
    activeHolds.size > 0 &&
    paramSlots.every(slot => !isKeycodeParam(slot.param) || !isSlotFilled(slot))
  )
}

export function shouldShowPickKeyHint(
  activeSlot: EditorSlot | undefined,
  paramSlots: EditorSlot[],
  needsTerminal: boolean
): boolean {
  return (
    !!activeSlot &&
    isKeycodeParam(activeSlot.param) &&
    !isSlotFilled(activeSlot) &&
    (needsTerminal ||
      paramSlots.some(
        slot => (slot.param === 'mod' || slot.param === 'layer') && isSlotFilled(slot)
      ))
  )
}

export function isHoldBlocked(
  wrap: string,
  activeHolds: ReadonlySet<string>,
  terminalValue?: string | number
): boolean {
  return !activeHolds.has(wrap) && !canApplyModifierHold(wrap, terminalValue)
}

export function canConfirmBinding(slots: EditorSlot[]): boolean {
  return isBindingComplete(slots)
}
