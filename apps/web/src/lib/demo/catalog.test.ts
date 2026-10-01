import { describe, expect, it } from 'vitest'
import {
  DEMO_CATALOG,
  defaultDemoId,
  loadDemo,
  readStoredDemoId,
  writeStoredDemoId
} from './catalog'

describe('demo catalog', () => {
  it('lists Lark first, then Corne, Lily58, and Sweep', () => {
    expect(DEMO_CATALOG.map(entry => entry.id)).toEqual([
      'lark',
      'corne',
      'lily58',
      'cradio'
    ])
    expect(defaultDemoId()).toBe('lark')
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

  it('remembers the selected demo id', () => {
    localStorage.clear()
    expect(readStoredDemoId()).toBe('lark')
    writeStoredDemoId('lily58')
    expect(readStoredDemoId()).toBe('lily58')
    writeStoredDemoId('nope')
    localStorage.setItem('selectedDemo', 'nope')
    expect(readStoredDemoId()).toBe('lark')
  })
})
