import { describe, expect, it } from 'vitest'
import { schemePolylines, schemeRailColor } from './matrix-scheme'

describe('matrix-scheme', () => {
  it('builds a row polyline left-to-right and a col polyline top-to-bottom', () => {
    const lines = schemePolylines([
      { x: 2, y: 0, row: 0, col: 1, label: '0,1' },
      { x: 0, y: 0, row: 0, col: 0, label: '0,0' },
      { x: 0, y: 2, row: 1, col: 0, label: '1,0' }
    ])
    const row0 = lines.find(line => line.id === 'row-0')
    const col0 = lines.find(line => line.id === 'col-0')
    expect(row0?.d.startsWith('M')).toBe(true)
    expect(row0?.d).toMatch(/L/)
    expect(col0?.d).toMatch(/L/)
    expect(row0?.label).toBe('R0')
    expect(col0?.label).toBe('C0')
  })

  it('keeps row and column hues apart', () => {
    expect(schemeRailColor(0, 'row')).not.toBe(schemeRailColor(0, 'col'))
  })
})
