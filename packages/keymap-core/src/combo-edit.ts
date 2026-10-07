import type { ZmkCombo } from './types.js'

/**
 * Merge a patch onto one combo. Passing `undefined` for timeout, prior-idle,
 * or layers drops that field (ZMK default / all layers). A falsy
 * `slowRelease` is omitted the same way.
 */
export function patchCombo(
  combos: readonly ZmkCombo[],
  id: string,
  patch: Partial<ZmkCombo>
): ZmkCombo[] {
  return combos.map(combo => {
    if (combo.id !== id) return combo
    const merged: ZmkCombo = { ...combo, ...patch }
    if ('timeoutMs' in patch && patch.timeoutMs === undefined) {
      delete merged.timeoutMs
    }
    if (
      'requirePriorIdleMs' in patch &&
      patch.requirePriorIdleMs === undefined
    ) {
      delete merged.requirePriorIdleMs
    }
    if (
      'layers' in patch &&
      (patch.layers === undefined || patch.layers.length === 0)
    ) {
      delete merged.layers
    }
    if ('slowRelease' in patch && !patch.slowRelease) {
      delete merged.slowRelease
    }
    return merged
  })
}

/**
 * Toggle one layer on the combo filter.
 * Empty set or every layer selected means no filter (all layers).
 */
export function toggleComboLayer(
  combo: Pick<ZmkCombo, 'layers'>,
  index: number,
  layerCount: number
): number[] | undefined {
  const global = !combo.layers || combo.layers.length === 0
  if (global) return [index]
  const set = new Set(combo.layers)
  if (set.has(index)) set.delete(index)
  else set.add(index)
  if (set.size === 0 || set.size >= layerCount) return undefined
  return [...set].sort((a, b) => a - b)
}

function sanitizeComboNodeId(raw: string, fallback: string): string {
  return raw.trim().replace(/[^a-zA-Z0-9_]/g, '_') || fallback
}

/**
 * Rename a combo node. Returns null when the id is unchanged or already taken.
 */
export function renameCombo(
  combos: readonly ZmkCombo[],
  id: string,
  raw: string
): { combos: ZmkCombo[]; id: string } | null {
  const nextId = sanitizeComboNodeId(raw, id)
  if (nextId === id) return null
  if (combos.some(combo => combo.id === nextId)) return null
  return { combos: patchCombo(combos, id, { id: nextId }), id: nextId }
}
