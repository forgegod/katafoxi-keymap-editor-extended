import { describe, expect, it } from 'vitest'
import { loadDemo } from '../../../demo/catalog'
import { layoutThumbVisibleIndexes } from './layout-thumb-visible'

describe('layoutThumbVisibleIndexes', () => {
  it('hides Lark absent slots including the unused top row', async () => {
    const { layout } = await loadDemo('lark')
    const visible = layoutThumbVisibleIndexes(layout)
    const labels = visible.map(index => layout[index].label)
    const absentCount = layout.filter(key => key.absent).length

    expect(labels.some(label => label?.startsWith('0,'))).toBe(false)
    expect(labels).not.toContain('5,6')
    expect(labels).not.toContain('6,0')
    expect(labels).not.toContain('6,6')
    expect(visible.length).toBe(layout.length - absentCount)
  })

  it('keeps every key when none are absent', async () => {
    const { layout } = await loadDemo('corne')
    expect(layoutThumbVisibleIndexes(layout)).toHaveLength(layout.length)
  })
})
