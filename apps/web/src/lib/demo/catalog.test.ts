import { describe, expect, it } from 'vitest'
import {
  DEMO_CATALOG,
  defaultDemoId,
  loadDemo,
  readStoredDemoId,
  writeStoredDemoId
} from './catalog'

describe('demo catalog', () => {
  it('lists Corne first as the default demo, then Lark, Lily58, and Sweep', () => {
    expect(DEMO_CATALOG.map(entry => entry.id)).toEqual([
      'corne',
      'lark',
      'lily58',
      'cradio'
    ])
    expect(defaultDemoId()).toBe('corne')
    expect(DEMO_CATALOG.filter(entry => entry.default).map(entry => entry.id)).toEqual([
      'corne'
    ])
  })

  it('loads each demo with matching layout and keymap sizes', () => {
    for (const entry of DEMO_CATALOG) {
      const bundle = loadDemo(entry.id)
      expect(bundle.entry.id).toBe(entry.id)
      expect(bundle.layout.length).toBeGreaterThan(0)
      expect(bundle.keymap.layers.length).toBeGreaterThan(0)
      for (const layer of bundle.keymap.layers) {
        expect(layer.length).toBe(bundle.layout.length)
      }
      expect(bundle.keymap.layers[0][0]).toMatchObject({
        value: expect.any(String),
        params: expect.any(Array)
      })
    }
  })

  it('keeps Lark phantom matrix slots in the keymap but marks them absent', () => {
    const { layout } = loadDemo('lark')
    const absent = layout.filter(key => key.absent)
    expect(absent.map(key => key.label)).toEqual(['0,0', '0,6', '5,6', '6,0', '6,6'])
    expect(layout).toHaveLength(84)
  })

  it('remembers the selected demo id', () => {
    localStorage.clear()
    expect(readStoredDemoId()).toBe('corne')
    writeStoredDemoId('lily58')
    expect(readStoredDemoId()).toBe('lily58')
    writeStoredDemoId('nope')
    localStorage.setItem('selectedDemo', 'nope')
    expect(readStoredDemoId()).toBe('corne')
  })
})
