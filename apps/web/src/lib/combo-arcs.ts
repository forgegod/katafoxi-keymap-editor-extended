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

type FacePoint = {
  index: number
  x: number
  y: number
  row: number
  col: number
}

/**
 * Centers on the top shown layer face (not the mid of a stacked key cell),
 * so marks align with layer-slot[0] rather than looking like L1.
 */
function faceCenters(layout: LayoutKey[], layerRowCount: number): FacePoint[] {
  const rows = Math.max(1, layerRowCount)
  return layout.map((key, index) => {
    const u = key.u || key.w || 1
    const h = key.h || 1
    const box = getKeyBoundingBox(
      { x: key.x, y: key.y },
      { u, h },
      { x: key.rx, y: key.ry, a: key.r }
    )
    const keyH = box.max.y - box.min.y
    const faceH = keyH / rows
    return {
      index,
      x: (box.min.x + box.max.x) / 2,
      y: box.min.y + faceH / 2,
      row: typeof key.row === 'number' ? key.row : 0,
      col: typeof key.col === 'number' ? key.col : index
    }
  })
}

function isAdjacentSameRow(a: FacePoint, b: FacePoint): boolean {
  return a.row === b.row && Math.abs(a.col - b.col) === 1
}

/**
 * Board beads for adjacent horizontal 2-key combos (gap mid only, no lines).
 * Vertical / diagonal / 3+ stay in the Combos list, not on the board.
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
  const centers = faceCenters(layout, options.shownLayers.length)
  const out: ComboArcSeg[] = []
  for (const combo of combos) {
    if (combo.keyPositions.length !== 2) continue
    if (!comboAppliesToAnyLayer(combo, options.shownLayers)) continue
    const [i, j] = combo.keyPositions
    if (i == null || j == null) continue
    if (options.hidden?.has(i) || options.hidden?.has(j)) continue
    const a = centers[i]
    const b = centers[j]
    if (!a || !b) continue
    if (!isAdjacentSameRow(a, b)) continue
    const left = a.x <= b.x ? a : b
    const right = a.x <= b.x ? b : a
    const label = options.labelFor(combo)
    out.push({
      id: `${combo.id}:${left.index}-${right.index}`,
      comboId: combo.id,
      label,
      title: `${combo.id}: ${label}`,
      midX: (left.x + right.x) / 2,
      midY: (left.y + right.y) / 2
    })
  }
  return out
}
