import { describe, expect, it } from 'vitest'
import {
  buildComboArcSegs,
  COMBO_ANCHOR_SIDE_FALLBACK
} from './combo-arcs'
import { getKeyBoundingBox } from './key-units'
import type { LayoutKey, ZmkCombo } from '@keymap-editor/keymap-core'

const layout: LayoutKey[] = [
  { x: 0, y: 0, row: 0, col: 0 },
  { x: 1, y: 0, row: 0, col: 1 },
  { x: 2, y: 0, row: 0, col: 2 },
  { x: 0, y: 1, row: 1, col: 0 }
]

const esc: ZmkCombo = {
  id: 'combo_esc',
  keyPositions: [0, 1],
  binding: { value: '&kp', params: [{ value: 'ESC', params: [] }] }
}

describe('buildComboArcSegs', () => {
  it('places a gap bead mid-gap for an adjacent same-row pair', () => {
    const segs = buildComboArcSegs(layout, [esc], {
      shownLayers: [0],
      labelFor: () => '&kp ESC'
    })
    expect(segs).toHaveLength(1)
    expect(segs[0]?.comboId).toBe('combo_esc')
    expect(segs[0]?.kind).toBe('gap')
    expect(segs[0]?.keyPositions).toEqual([0, 1])
    expect(segs[0]?.faceLayer).toBe(0)
    expect(segs[0]?.midX).toBeGreaterThan(0)
    expect(segs[0]?.midY).toBeGreaterThan(0)
  })

  it('places a gap bead between vertical neighbours', () => {
    const vertical: ZmkCombo = { ...esc, id: 'combo_v', keyPositions: [0, 3] }
    const segs = buildComboArcSegs(layout, [vertical], {
      shownLayers: [0],
      labelFor: () => '&kp ESC'
    })
    expect(segs).toHaveLength(1)
    expect(segs[0]?.kind).toBe('gap')
    expect(segs[0]?.keyPositions).toEqual([0, 3])
    const top = getKeyBoundingBox({ x: 0, y: 0 }, { u: 1, h: 1 })
    const bottom = getKeyBoundingBox({ x: 0, y: 1 }, { u: 1, h: 1 })
    expect(segs[0]!.midX).toBeCloseTo((top.min.x + top.max.x) / 2, 5)
    expect(segs[0]!.midY).toBeCloseTo((top.max.y + bottom.min.y) / 2, 5)
    expect(segs[0]!.midY).toBeGreaterThan(top.max.y)
    expect(segs[0]!.midY).toBeLessThan(bottom.min.y)
  })

  it('spreads vertical beads by shown-layer slot so L1/L2 do not overlap', () => {
    const v1: ZmkCombo = { ...esc, id: 'combo_v1', keyPositions: [0, 3], layers: [1] }
    const v2: ZmkCombo = { ...esc, id: 'combo_v2', keyPositions: [0, 3], layers: [2] }
    const segs = buildComboArcSegs(layout, [v1, v2], {
      shownLayers: [0, 1, 2],
      labelFor: c => c.id
    })
    expect(segs).toHaveLength(2)
    expect(segs[0]?.faceLayer).toBe(1)
    expect(segs[1]?.faceLayer).toBe(2)
    expect(segs[0]!.midY).not.toBeCloseTo(segs[1]!.midY, 5)
    expect(segs[0]!.midY).toBeLessThan(segs[1]!.midY)
  })

  it('places an anchor bead in the mid-gap to the right of the first key', () => {
    const skip: ZmkCombo = { ...esc, id: 'combo_skip', keyPositions: [0, 2] }
    const triple: ZmkCombo = { ...esc, id: 'combo_3', keyPositions: [0, 1, 2] }
    const segs = buildComboArcSegs(layout, [skip, triple], {
      shownLayers: [0],
      labelFor: c => c.id
    })
    expect(segs).toHaveLength(2)
    expect(segs.every(s => s.kind === 'anchor')).toBe(true)
    const left = getKeyBoundingBox({ x: 0, y: 0 }, { u: 1, h: 1 })
    const right = getKeyBoundingBox({ x: 1, y: 0 }, { u: 1, h: 1 })
    const gapMid = (left.max.x + right.min.x) / 2
    expect(segs[0]!.midX).toBeCloseTo(gapMid, 5)
    expect(segs[0]!.midX).toBeGreaterThan(left.max.x)
    expect(segs[0]!.midX).toBeLessThan(right.min.x)
    expect(segs[0]?.id).toContain('anchor-0')
    // Same anchor gutter → stacked along the strip, not sideways into the neighbour.
    expect(segs[1]!.midX).toBeCloseTo(segs[0]!.midX, 5)
    expect(segs[1]!.midY).toBeGreaterThan(segs[0]!.midY)
  })

  it('uses a tiny side fallback when the anchor has no right-hand neighbour', () => {
    const loneRow: LayoutKey[] = [
      { x: 0, y: 0, row: 0, col: 0 },
      { x: 0, y: 1, row: 1, col: 0 },
      { x: 1, y: 1, row: 1, col: 1 }
    ]
    // Geometric first key is (0,0); that row has no neighbour to the right.
    const odd: ZmkCombo = { ...esc, id: 'combo_odd', keyPositions: [0, 2] }
    const segs = buildComboArcSegs(loneRow, [odd], {
      shownLayers: [0],
      labelFor: () => '&kp ESC'
    })
    expect(segs).toHaveLength(1)
    const box = getKeyBoundingBox({ x: 0, y: 0 }, { u: 1, h: 1 })
    expect(segs[0]!.midX).toBeCloseTo(box.max.x + COMBO_ANCHOR_SIDE_FALLBACK, 5)
  })

  it('skips combos that touch a hidden key', () => {
    expect(
      buildComboArcSegs(layout, [esc], {
        shownLayers: [0],
        hidden: new Set([1]),
        labelFor: () => '&kp ESC'
      })
    ).toHaveLength(0)
  })

  it('hides combos restricted to other layers', () => {
    const layered: ZmkCombo = { ...esc, layers: [2] }
    expect(
      buildComboArcSegs(layout, [layered], {
        shownLayers: [0, 1],
        labelFor: () => '&kp ESC'
      })
    ).toHaveLength(0)
  })

  it('skips incomplete combos', () => {
    const one: ZmkCombo = { ...esc, keyPositions: [0] }
    expect(
      buildComboArcSegs(layout, [one], {
        shownLayers: [0],
        labelFor: () => '&kp ESC'
      })
    ).toHaveLength(0)
  })

  it('anchors Y on the top shown layer face when stacked', () => {
    const segs = buildComboArcSegs(layout, [esc], {
      shownLayers: [0, 1],
      labelFor: () => '&kp ESC'
    })
    expect(segs).toHaveLength(1)
    const box = getKeyBoundingBox({ x: 0, y: 0 }, { u: 1, h: 1 })
    const midY = (box.min.y + box.max.y) / 2
    const faceY = box.min.y + (box.max.y - box.min.y) / 4
    expect(segs[0]?.midY).toBeCloseTo(faceY, 5)
    expect(segs[0]!.midY).toBeLessThan(midY)
  })

  it('anchors Y on the combo layer strip among shown layers', () => {
    const onL2: ZmkCombo = { ...esc, layers: [2] }
    const segs = buildComboArcSegs(layout, [onL2], {
      shownLayers: [0, 1, 2],
      labelFor: () => '&kp ESC'
    })
    expect(segs).toHaveLength(1)
    const box = getKeyBoundingBox({ x: 0, y: 0 }, { u: 1, h: 1 })
    const keyH = box.max.y - box.min.y
    const faceH = keyH / 3
    const faceY = box.min.y + faceH * 2 + faceH / 2
    expect(segs[0]?.midY).toBeCloseTo(faceY, 5)
  })

  it('keeps side-anchor beads on the combo layer strip', () => {
    const skip: ZmkCombo = {
      ...esc,
      id: 'combo_skip',
      keyPositions: [0, 2],
      layers: [1]
    }
    const segs = buildComboArcSegs(layout, [skip], {
      shownLayers: [0, 1, 2],
      labelFor: () => '&kp ESC'
    })
    expect(segs).toHaveLength(1)
    expect(segs[0]?.kind).toBe('anchor')
    expect(segs[0]?.faceLayer).toBe(1)
    const box = getKeyBoundingBox({ x: 0, y: 0 }, { u: 1, h: 1 })
    const keyH = box.max.y - box.min.y
    const faceH = keyH / 3
    const faceY = box.min.y + faceH * 1 + faceH / 2
    expect(segs[0]?.midY).toBeCloseTo(faceY, 5)
    expect(segs[0]!.midX).toBeGreaterThan(box.max.x)
  })
})
