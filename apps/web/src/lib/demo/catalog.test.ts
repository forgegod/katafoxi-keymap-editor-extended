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

  it('loads each demo with matching layout and keymap sizes', async () => {
    for (const entry of DEMO_CATALOG) {
      const bundle = await loadDemo(entry.id)
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

  it('seeds Corne with a J+K Esc combo so Combos beads show on first visit', async () => {
    const { keymap } = await loadDemo('corne')
    expect(keymap.combos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'combo_esc',
          keyPositions: [19, 20],
          timeoutMs: 50,
          binding: {
            value: '&kp',
            params: [{ value: 'ESC', params: [] }]
          }
        })
      ])
    )
  })

  it('seeds each demo with gap and anchor combos on layers 1 and 2', async () => {
    for (const entry of DEMO_CATALOG) {
      const { keymap } = await loadDemo(entry.id)
      const combos = keymap.combos ?? []
      expect(combos.length, entry.id).toBeGreaterThanOrEqual(4)

      const onL1 = combos.filter(c => c.layers?.includes(1))
      const onL2 = combos.filter(c => c.layers?.includes(2))
      expect(onL1.length, `${entry.id} L1`).toBeGreaterThanOrEqual(2)
      expect(onL2.length, `${entry.id} L2`).toBeGreaterThanOrEqual(2)

      expect(
        combos.some(c => c.keyPositions.length === 2),
        `${entry.id} has a 2-key combo`
      ).toBe(true)
      expect(
        combos.some(c => c.keyPositions.length >= 3),
        `${entry.id} has a 3+ key combo`
      ).toBe(true)
    }
  })

  it('keeps Lark phantom matrix slots in the keymap but marks them absent', async () => {
    const { layout } = await loadDemo('lark')
    const absent = layout.filter(key => key.absent)
    expect(absent.map(key => key.label)).toEqual([
      '0,0',
      '0,1',
      '0,2',
      '0,3',
      '0,4',
      '0,5',
      '0,11',
      '0,10',
      '0,9',
      '0,8',
      '0,7',
      '0,6',
      '5,6',
      '6,0',
      '6,6'
    ])
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
