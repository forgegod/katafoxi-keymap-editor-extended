/**
 * Chord-dictionary gate and helpers shared with the typewriter index:
 * when combos outnumber keys, the SPA offers a collapsible dictionary.
 * Bottom-row keys that appear with higher-row partners count as hold extras.
 */

import { encodeKeyBinding } from './keymap.js'
import type { KeyBindingNode, LayoutKey } from './types.js'

/** Below this count the on-board beads are enough; skip the dictionary. */
export const COMBO_DICTIONARY_MIN_COMBOS = 12

function comboKeyRow(layout: readonly LayoutKey[], index: number): number {
  const key = layout[index]
  if (!key || typeof key.row !== 'number') return 0
  return key.row
}

/**
 * Bottom-row keys that appear in combos, treated as hold extras (thumbs),
 * but only when some combo key sits on a strictly higher row.
 */
export function comboDictionaryModifierIndexes(
  layout: readonly LayoutKey[],
  combos: readonly { keyPositions: readonly number[] }[]
): number[] {
  const appearing = new Set<number>()
  for (const combo of combos) {
    for (const index of combo.keyPositions) {
      if (index >= 0 && index < layout.length) appearing.add(index)
    }
  }
  if (appearing.size === 0) return []

  let maxRow = -Infinity
  let minRow = Infinity
  for (const index of appearing) {
    const row = comboKeyRow(layout, index)
    if (row > maxRow) maxRow = row
    if (row < minRow) minRow = row
  }
  if (!Number.isFinite(maxRow) || maxRow <= minRow) return []

  const extras: number[] = []
  for (const index of appearing) {
    if (comboKeyRow(layout, index) === maxRow) extras.push(index)
  }
  return extras.sort((a, b) => a - b)
}

export function shouldOfferComboDictionary(
  layout: readonly LayoutKey[],
  combos: readonly { keyPositions: readonly number[] }[] | undefined
): boolean {
  const list = combos ?? []
  if (list.length < COMBO_DICTIONARY_MIN_COMBOS) return false
  const visible = layout.reduce((n, key) => n + (key.absent ? 0 : 1), 0)
  return list.length >= visible
}

/** Compact chip text: drop `&kp `, keep wraps (`LS(B)`) and other behaviours. */
export function comboDictionaryLabel(binding: KeyBindingNode): string {
  const raw = encodeKeyBinding(binding).trim()
  if (raw === '&none' || raw === '&trans') return '·'
  if (raw.startsWith('&kp ')) return raw.slice(4)
  if (raw.startsWith('&')) return raw.slice(1)
  return raw
}
