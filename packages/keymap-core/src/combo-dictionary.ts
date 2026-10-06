/**
 * Chord-dictionary grouping: when combos *are* the keymap (few keys, many
 * chords), cluster variants that share a finger core and differ by hold extras
 * (usually the bottom-row thumbs). UI-agnostic.
 */

import { encodeKeyBinding } from './keymap.js'
import type { KeyBindingNode, LayoutKey, ZmkCombo } from './types.js'

/** Below this count the on-board beads are enough; skip the dictionary. */
export const COMBO_DICTIONARY_MIN_COMBOS = 12

export type ComboDictionaryVariant = {
  comboId: string
  extras: number[]
  binding: KeyBindingNode
}

export type ComboDictionaryFamily = {
  id: string
  core: number[]
  variants: ComboDictionaryVariant[]
}

function comboKeyRow(layout: readonly LayoutKey[], index: number): number {
  const key = layout[index]
  if (!key || typeof key.row !== 'number') return 0
  return key.row
}

function sortedUnique(values: readonly number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b)
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

export function comboDictionaryCore(
  positions: readonly number[],
  modifiers: readonly number[]
): number[] {
  const extra = new Set(modifiers)
  return sortedUnique(positions.filter(index => !extra.has(index)))
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

function familyId(core: readonly number[]): string {
  return core.join('-')
}

function compareNumberLists(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return a[i]! - b[i]!
  }
  return a.length - b.length
}

/** Compact chip text: drop `&kp `, keep wraps (`LS(B)`) and other behaviours. */
export function comboDictionaryLabel(binding: KeyBindingNode): string {
  const raw = encodeKeyBinding(binding).trim()
  if (raw === '&none' || raw === '&trans') return '·'
  if (raw.startsWith('&kp ')) return raw.slice(4)
  if (raw.startsWith('&')) return raw.slice(1)
  return raw
}

/**
 * Group combos by finger core. Combos that are only modifier keys (e.g. a
 * 1-key thumb Space) stay out of the dictionary.
 */
export function comboDictionaryFamilies(
  layout: readonly LayoutKey[],
  combos: readonly ZmkCombo[] | undefined
): ComboDictionaryFamily[] {
  const list = combos ?? []
  const modifiers = comboDictionaryModifierIndexes(layout, list)
  const extra = new Set(modifiers)
  const byCore = new Map<string, ComboDictionaryFamily>()

  for (const combo of list) {
    const core = comboDictionaryCore(combo.keyPositions, modifiers)
    if (core.length === 0) continue
    const extras = sortedUnique(combo.keyPositions.filter(index => extra.has(index)))
    const id = familyId(core)
    let family = byCore.get(id)
    if (!family) {
      family = { id, core, variants: [] }
      byCore.set(id, family)
    }
    family.variants.push({
      comboId: combo.id,
      extras,
      binding: combo.binding
    })
  }

  const families = [...byCore.values()]
  for (const family of families) {
    family.variants.sort((a, b) => {
      if (a.extras.length !== b.extras.length) return a.extras.length - b.extras.length
      return compareNumberLists(a.extras, b.extras)
    })
  }
  families.sort((a, b) => compareNumberLists(a.core, b.core))
  return families
}

export function comboDictionaryPrimary(
  family: ComboDictionaryFamily
): ComboDictionaryVariant {
  return family.variants[0]!
}
