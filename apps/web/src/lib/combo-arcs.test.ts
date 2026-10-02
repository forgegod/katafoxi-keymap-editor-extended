import { describe, expect, it } from 'vitest'
import { buildComboArcSegs } from './combo-arcs'
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
  it('places a bead mid-gap for an adjacent same-row pair', () => {
    const segs = buildComboArcSegs(layout, [esc], {
      shownLayers: [0],
      labelFor: () => '&kp ESC'
    })
    expect(segs).toHaveLength(1)
    expect(segs[0]?.comboId).toBe('combo_esc')
    expect(segs[0]?.midX).toBeGreaterThan(0)
    expect(segs[0]?.midY).toBeGreaterThan(0)
    expect(segs[0]).not.toHaveProperty('d')
  })

  it('skips vertical neighbours', () => {
    const vertical: ZmkCombo = { ...esc, id: 'combo_v', keyPositions: [0, 3] }
    expect(
      buildComboArcSegs(layout, [vertical], {
        shownLayers: [0],
        labelFor: () => '&kp ESC'
      })
    ).toHaveLength(0)
  })

  it('skips non-adjacent same-row pairs and 3+ key combos', () => {
    const skip: ZmkCombo = { ...esc, id: 'combo_skip', keyPositions: [0, 2] }
    const triple: ZmkCombo = { ...esc, id: 'combo_3', keyPositions: [0, 1, 2] }
    expect(
      buildComboArcSegs(layout, [skip, triple], {
        shownLayers: [0],
        labelFor: c => c.id
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
})
