import {
  comboAppliesToAnyLayer,
  type LayoutKey,
  type ZmkCombo
} from '@keymap-editor/keymap-core'
import { getKeyBoundingBox } from './key-units'

export type ComboArcSeg = {
  id: string
  comboId: string
  label: string
  title: string
  midX: number
  midY: number
}

type KeyGeom = {
  index: number
  midX: number
  minY: number
  keyH: number
  row: number
  col: number
}

function keyGeoms(layout: LayoutKey[]): KeyGeom[] {
  return layout.map((key, index) => {
    const u = key.u || key.w || 1
    const h = key.h || 1
    const box = getKeyBoundingBox(
      { x: key.x, y: key.y },
      { u, h },
      { x: key.rx, y: key.ry, a: key.r }
    )
    return {
      index,
      midX: (box.min.x + box.max.x) / 2,
      minY: box.min.y,
      keyH: box.max.y - box.min.y,
      row: typeof key.row === 'number' ? key.row : 0,
      col: typeof key.col === 'number' ? key.col : index
    }
  })
}

/**
 * Stack slot among `shownLayers` for this combo's face.
 * All-layers → top strip (0). Layer-restricted → first shown layer it applies to.
 */
function comboFaceSlot(
  combo: { layers?: readonly number[] },
  shownLayers: readonly number[]
): number {
  if (!combo.layers || combo.layers.length === 0) return 0
  for (let i = 0; i < shownLayers.length; i++) {
    if (combo.layers.includes(shownLayers[i]!)) return i
  }
  return -1
}

function isAdjacentSameRow(a: KeyGeom, b: KeyGeom): boolean {
  return a.row === b.row && Math.abs(a.col - b.col) === 1
}

/**
 * Board beads for adjacent horizontal 2-key combos (gap mid only, no lines).
 * Y sits on the shown-layer strip the combo actually applies to.
 */
export function buildComboArcSegs(
  layout: LayoutKey[],
  combos: readonly ZmkCombo[],
  options: {
    shownLayers: readonly number[]
    hidden?: ReadonlySet<number>
    labelFor: (combo: ZmkCombo) => string
  }
): ComboArcSeg[] {
  const geoms = keyGeoms(layout)
  const rowCount = Math.max(1, options.shownLayers.length)
  const out: ComboArcSeg[] = []
  for (const combo of combos) {
    if (combo.keyPositions.length !== 2) continue
    if (!comboAppliesToAnyLayer(combo, options.shownLayers)) continue
    const slot = comboFaceSlot(combo, options.shownLayers)
    if (slot < 0) continue
    const [i, j] = combo.keyPositions
    if (i == null || j == null) continue
    if (options.hidden?.has(i) || options.hidden?.has(j)) continue
    const a = geoms[i]
    const b = geoms[j]
    if (!a || !b) continue
    if (!isAdjacentSameRow(a, b)) continue
    const left = a.midX <= b.midX ? a : b
    const right = a.midX <= b.midX ? b : a
    const faceH = left.keyH / rowCount
    const midY = left.minY + faceH * slot + faceH / 2
    const label = options.labelFor(combo)
    out.push({
      id: `${combo.id}:${left.index}-${right.index}`,
      comboId: combo.id,
      label,
      title: `${combo.id}: ${label}`,
      midX: (left.midX + right.midX) / 2,
      midY
    })
  }
  return out
}
