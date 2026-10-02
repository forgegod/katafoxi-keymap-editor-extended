import { describe, expect, it } from 'vitest'
import { loadDemo } from '../../../demo/catalog'
import { layoutThumbVisibleIndexes } from './layout-thumb-visible'

describe('layoutThumbVisibleIndexes', () => {
  it('hides Lark absent slots and the blank top row', () => {
    const { layout, keymap } = loadDemo('lark')
    const visible = layoutThumbVisibleIndexes(layout, keymap.layers)
    const labels = visible.map(index => layout[index].label)

    expect(labels).not.toContain('0,0')
    expect(labels).not.toContain('0,6')
    expect(labels).not.toContain('5,6')
    expect(labels).not.toContain('6,0')
    expect(labels).not.toContain('6,6')
    // Blank top-row labels (non-absent corners already listed above).
    expect(labels.some(label => label?.startsWith('0,'))).toBe(false)
    expect(visible.length).toBe(layout.length - 5 - 10)
  })

  it('keeps every key when the top row is used', () => {
    const { layout, keymap } = loadDemo('corne')
    expect(layoutThumbVisibleIndexes(layout, keymap.layers)).toHaveLength(layout.length)
  })
})
