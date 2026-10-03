import {
  comboAppliesToAnyLayer,
  type LayoutKey,
  type ZmkCombo
} from '@keymap-editor/keymap-core'
import { getKeyBoundingBox } from './key-units'

export type ComboBeadKind = 'gap' | 'anchor'

export type ComboArcSeg = {
  id: string
  comboId: string
  label: string
  title: string
  midX: number
  midY: number
  kind: ComboBeadKind
  keyPositions: number[]
  /** Firmware layer index of the strip this bead sits on (among shown layers). */
  faceLayer: number
}

type KeyGeom = {
  index: number
  midX: number
  minX: number
  maxX: number
  minY: number
  maxY: number
  keyH: number
  row: number
  col: number
}

/** Fallback when the anchor has no right-hand neighbour gutter. */
const SIDE_FALLBACK = 2.5

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
      minX: box.min.x,
      maxX: box.max.x,
      minY: box.min.y,
      maxY: box.max.y,
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

function isAdjacentSameCol(a: KeyGeom, b: KeyGeom): boolean {
  return a.col === b.col && Math.abs(a.row - b.row) === 1
}

function faceMidY(key: KeyGeom, slot: number, rowCount: number): number {
  const faceH = key.keyH / rowCount
  return key.minY + faceH * slot + faceH / 2
}

/** Stable board-space pick: top-most, then left-most, then lowest index. */
function pickAnchorGeom(geoms: KeyGeom[], positions: readonly number[]): KeyGeom | null {
  let best: KeyGeom | null = null
  for (const index of positions) {
    const g = geoms[index]
    if (!g) continue
    if (
      !best ||
      g.row < best.row ||
      (g.row === best.row && g.col < best.col) ||
      (g.row === best.row && g.col === best.col && g.index < best.index)
    ) {
      best = g
    }
  }
  return best
}

/** Nearest visible key to the right on the same layout row. */
function rightNeighbor(
  anchor: KeyGeom,
  geoms: readonly KeyGeom[],
  hidden?: ReadonlySet<number>
): KeyGeom | null {
  let best: KeyGeom | null = null
  for (const g of geoms) {
    if (g.index === anchor.index) continue
    if (hidden?.has(g.index)) continue
    if (g.row !== anchor.row) continue
    if (g.midX <= anchor.midX) continue
    if (!best || g.midX < best.midX) best = g
  }
  return best
}

/**
 * Midpoint of the gutter to the right of the anchor — same “center of the
 * gap” feel as horizontal adjacent beads. Falls back to a tiny outset.
 */
function anchorBeadX(
  anchor: KeyGeom,
  geoms: readonly KeyGeom[],
  hidden?: ReadonlySet<number>
): number {
  const next = rightNeighbor(anchor, geoms, hidden)
  if (next && next.minX > anchor.maxX) {
    return (anchor.maxX + next.minX) / 2
  }
  return anchor.maxX + SIDE_FALLBACK
}

type DraftSeg = ComboArcSeg & { stackKey: string }

/**
 * Board beads for combos on shown layers.
 * - Adjacent horizontal 2-key → mid-gap (between keys)
 * - Adjacent vertical 2-key → mid-gap (between keys)
 * - Everything else → mid-gap to the right of the geometric first key
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
  const drafts: DraftSeg[] = []

  for (const combo of combos) {
    if (combo.keyPositions.length < 2) continue
    if (!comboAppliesToAnyLayer(combo, options.shownLayers)) continue
    const slot = comboFaceSlot(combo, options.shownLayers)
    if (slot < 0) continue
    if (combo.keyPositions.some(i => options.hidden?.has(i))) continue
    if (combo.keyPositions.some(i => !geoms[i])) continue

    const label = options.labelFor(combo)
    const keyPositions = [...combo.keyPositions]
    const positions = combo.keyPositions
    const faceLayer = options.shownLayers[slot]!

    if (positions.length === 2) {
      const [i, j] = positions
      const a = geoms[i!]
      const b = geoms[j!]
      if (a && b && isAdjacentSameRow(a, b)) {
        const left = a.midX <= b.midX ? a : b
        const right = a.midX <= b.midX ? b : a
        drafts.push({
          id: `${combo.id}:${left.index}-${right.index}`,
          comboId: combo.id,
          label,
          title: `${combo.id}: ${label}`,
          midX: (left.midX + right.midX) / 2,
          midY: faceMidY(left, slot, rowCount),
          kind: 'gap',
          keyPositions,
          faceLayer,
          stackKey: `gap-h:${left.index}-${right.index}:${slot}`
        })
        continue
      }
      if (a && b && isAdjacentSameCol(a, b)) {
        const top = a.minY <= b.minY ? a : b
        const bottom = a.minY <= b.minY ? b : a
        drafts.push({
          id: `${combo.id}:${top.index}-${bottom.index}`,
          comboId: combo.id,
          label,
          title: `${combo.id}: ${label}`,
          midX: (top.midX + bottom.midX) / 2,
          // Physical gutter between the two key bodies.
          midY: (top.maxY + bottom.minY) / 2,
          kind: 'gap',
          keyPositions,
          faceLayer,
          stackKey: `gap-v:${top.index}-${bottom.index}:${slot}`
        })
        continue
      }
    }

    const anchor = pickAnchorGeom(geoms, positions)
    if (!anchor) continue
    drafts.push({
      id: `${combo.id}:anchor-${anchor.index}`,
      comboId: combo.id,
      label,
      title: `${combo.id}: ${label}`,
      midX: anchorBeadX(anchor, geoms, options.hidden),
      midY: faceMidY(anchor, slot, rowCount),
      kind: 'anchor',
      keyPositions,
      faceLayer,
      stackKey: `anchor:${anchor.index}:${slot}`
    })
  }

  const stackCounts = new Map<string, number>()
  const out: ComboArcSeg[] = []
  for (const draft of drafts) {
    const n = stackCounts.get(draft.stackKey) ?? 0
    stackCounts.set(draft.stackKey, n + 1)
    const { stackKey: _stackKey, ...seg } = draft
    if (n > 0) {
      // Narrow gutters: stack along the strip, not into the neighbour key.
      out.push({ ...seg, midY: seg.midY + n * 7 })
    } else {
      out.push(seg)
    }
  }
  return out
}
