import type { LayoutKey } from '@keymap-editor/keymap-core'
import { getKeyBoundingBox } from './key-units'

export type SchemePoint = {
  index: number
  x: number
  y: number
  row: number
  col: number
  label: string
}

export type SchemePolyline = {
  id: string
  kind: 'row' | 'col'
  index: number
  color: string
  d: string
  labelX: number
  labelY: number
  label: string
}

/** Distinct hues for layout row/col rails. */
export function schemeRailColor(index: number, kind: 'row' | 'col'): string {
  const hue = (index * 47 + (kind === 'col' ? 210 : 12)) % 360
  const alpha = kind === 'row' ? 0.55 : 0.4
  return `hsl(${hue} 72% 58% / ${alpha})`
}

export function schemeKeyCenters(layout: LayoutKey[]): SchemePoint[] {
  return layout.map((key, index) => {
    const u = key.u || key.w || 1
    const h = key.h || 1
    const box = getKeyBoundingBox(
      { x: key.x, y: key.y },
      { u, h },
      { x: key.rx, y: key.ry, a: key.r }
    )
    const row = typeof key.row === 'number' ? key.row : 0
    const col = typeof key.col === 'number' ? key.col : index
    return {
      index,
      x: (box.min.x + box.max.x) / 2,
      y: (box.min.y + box.max.y) / 2,
      row,
      col,
      label: key.label ?? `${row},${col}`
    }
  })
}

function polylineForGroup(
  kind: 'row' | 'col',
  index: number,
  points: SchemePoint[]
): SchemePolyline | null {
  if (points.length === 0) return null
  const sorted =
    kind === 'row'
      ? [...points].sort((a, b) => a.x - b.x || a.y - b.y)
      : [...points].sort((a, b) => a.y - b.y || a.x - b.x)
  if (sorted.length === 1) {
    const p = sorted[0]!
    return {
      id: `${kind}-${index}`,
      kind,
      index,
      color: schemeRailColor(index, kind),
      d: `M ${p.x} ${p.y}`,
      labelX: p.x,
      labelY: p.y,
      label: kind === 'row' ? `R${index}` : `C${index}`
    }
  }
  const d = sorted
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(' ')
  const first = sorted[0]!
  return {
    id: `${kind}-${index}`,
    kind,
    index,
    color: schemeRailColor(index, kind),
    d,
    labelX: first.x,
    labelY: first.y,
    label: kind === 'row' ? `R${index}` : `C${index}`
  }
}

/** Row and column polylines through key centers for the scheme overlay. */
export function schemePolylines(layout: LayoutKey[]): SchemePolyline[] {
  const points = schemeKeyCenters(layout)
  const byRow = new Map<number, SchemePoint[]>()
  const byCol = new Map<number, SchemePoint[]>()
  for (const point of points) {
    const row = byRow.get(point.row) ?? []
    row.push(point)
    byRow.set(point.row, row)
    const col = byCol.get(point.col) ?? []
    col.push(point)
    byCol.set(point.col, col)
  }

  const lines: SchemePolyline[] = []
  for (const index of [...byRow.keys()].sort((a, b) => a - b)) {
    const line = polylineForGroup('row', index, byRow.get(index)!)
    if (line) lines.push(line)
  }
  for (const index of [...byCol.keys()].sort((a, b) => a - b)) {
    const line = polylineForGroup('col', index, byCol.get(index)!)
    if (line) lines.push(line)
  }
  return lines
}
