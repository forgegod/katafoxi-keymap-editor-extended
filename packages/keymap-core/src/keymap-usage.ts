import { isModifierWrapCode, readModifierChain } from './modifiers.js'
import type { KeyBindingNode } from './types.js'

/** Param index of the tap keycode. Layer indexes are not keys. */
const TAP_CODE_PARAM: Record<string, number> = {
  '&kp': 0,
  '&sk': 0,
  '&mt': 1,
  '&lt': 1
}

/** Command token already placed on a key (`&mkp LCLK`), dimmed like a used keycode. */
const COMMAND_CODE_PARAM: Record<string, number> = {
  '&mkp': 0,
  '&msc': 0,
  '&mmv': 0,
  '&bt': 0,
  '&out': 0,
  '&bl': 0,
  '&rgb_ug': 0,
  '&ext_power': 0
}

/** Modifier key sitting on `&mt`, so a hold-only modifier still counts as placed. */
const MOD_CODE_PARAM: Record<string, number> = {
  '&mt': 0
}

function placedKeycode(node: KeyBindingNode | undefined): string | null {
  if (!node) return null
  const { terminal } = readModifierChain(node)
  const value = terminal?.value
  if (value == null || String(value) === '') return null
  if (isModifierWrapCode(value)) return null
  return String(value)
}

function rememberKeycode(
  found: Map<string, Array<number>>,
  code: string | null,
  layer: number
) {
  if (!code) return
  const list = found.get(code)
  if (!list) found.set(code, [layer])
  else if (list[list.length - 1] !== layer) list.push(layer)
}

function collectFromBinding(
  found: Map<string, Array<number>>,
  bind: KeyBindingNode,
  layer: number
) {
  const behavior = String(bind.value)
  const tapIndex = TAP_CODE_PARAM[behavior] ?? COMMAND_CODE_PARAM[behavior]
  if (tapIndex == null) return
  rememberKeycode(found, placedKeycode(bind.params?.[tapIndex]), layer)
  const modIndex = MOD_CODE_PARAM[behavior]
  if (modIndex != null) {
    rememberKeycode(found, placedKeycode(bind.params?.[modIndex]), layer)
  }
}

/**
 * Keycodes placed anywhere in the keymap, keyed to layer indexes.
 * Counts the tap of `&kp`, `&sk`, `&mt`, and `&lt`, the modifier of `&mt`,
 * and command tokens (`&mkp LCLK`, `&msc SCRL_UP`). `LS(CAPS)` and `LC(C)`
 * contribute the terminal key. Combo bindings use the combo's `layers`
 * filter, or every keymap layer when that filter is omitted.
 * Each layer index is listed once, in order.
 */
export function collectUsedKeycodes(
  layers: ReadonlyArray<ReadonlyArray<KeyBindingNode> | undefined>,
  combos?: ReadonlyArray<{
    binding: KeyBindingNode
    layers?: readonly number[]
  }>
): Map<string, Array<number>> {
  const found = new Map<string, Array<number>>()
  layers.forEach((layer, index) => {
    for (const bind of layer ?? []) {
      collectFromBinding(found, bind, index)
    }
  })
  if (!combos?.length) return found
  const allLayers = layers.map((_, index) => index)
  for (const combo of combos) {
    const indexes =
      combo.layers && combo.layers.length > 0 ? combo.layers : allLayers
    for (const index of indexes) {
      collectFromBinding(found, combo.binding, index)
    }
  }
  return found
}

/**
 * Keycodes already placed on this layer. Same rules as {@link collectUsedKeycodes}.
 */
export function collectUsedKeycodesOnLayer(
  layer: Array<KeyBindingNode> | undefined
): Set<string> {
  return new Set(collectUsedKeycodes([layer]).keys())
}

/** Stable snapshot so UI can remount when a layer delete remaps used marks. */
export function usedKeycodesRevision(
  used: ReadonlyMap<string, readonly number[]>
): string {
  return [...used.entries()]
    .map(([code, layers]) => `${code}:${layers.join(',')}`)
    .sort()
    .join('|')
}
