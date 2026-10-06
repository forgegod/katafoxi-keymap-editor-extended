import { describe, expect, it } from 'vitest'
import {
  comboDictionaryFamilies,
  comboDictionaryIndexModel,
  shouldOfferComboDictionary
} from '@keymap-editor/keymap-core'
import {
  DEMO_CATALOG,
  defaultDemoId,
  loadDemo,
  readStoredDemoId,
  writeStoredDemoId
} from './catalog'

describe('demo catalog', () => {
  it('lists demos alphabetically by name and keeps Corne as the default', () => {
    expect(DEMO_CATALOG.map(entry => entry.name)).toEqual([
      'Corne',
      'Kabarga',
      'Lark',
      'Lily58',
      'nice!60',
      'Planck',
      'PNCATEHO',
      'Sofle',
      'Sweep'
    ])
    expect(DEMO_CATALOG.map(entry => entry.id)).toEqual([
      'corne',
      'kabarga',
      'lark',
      'lily58',
      'nice60',
      'planck',
      'pncateho',
      'sofle',
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

      expect(
        combos.some(c => c.keyPositions.length === 2),
        `${entry.id} has a 2-key combo`
      ).toBe(true)
      expect(
        combos.some(c => c.keyPositions.length >= 3),
        `${entry.id} has a 3+ key combo`
      ).toBe(true)

      if (keymap.layers.length < 3) continue

      const onL1 = combos.filter(c => c.layers?.includes(1))
      const onL2 = combos.filter(c => c.layers?.includes(2))
      expect(onL1.length, `${entry.id} L1`).toBeGreaterThanOrEqual(2)
      expect(onL2.length, `${entry.id} L2`).toBeGreaterThanOrEqual(2)
    }
  })

  it('loads PNCATEHO as a 20-key chord board with expanded combos', async () => {
    const { layout, keymap } = await loadDemo('pncateho')
    expect(layout).toHaveLength(20)
    expect(keymap.layers).toHaveLength(1)
    expect(keymap.layers[0]).toHaveLength(20)
    expect(keymap.combos?.length).toBe(324)
    expect(keymap.combos?.every(c => c.layers?.includes(0))).toBe(true)
  })

  it('loads Kabarga as a 42-key angled split with four layers', async () => {
    const { layout, keymap } = await loadDemo('kabarga')
    expect(layout).toHaveLength(42)
    expect(keymap.layers).toHaveLength(4)
    for (const layer of keymap.layers) {
      expect(layer).toHaveLength(42)
    }
    expect(keymap.combos).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'combo_esc',
          keyPositions: [19, 20]
        })
      ])
    )
  })

  it('loads Sofle as a 60-key dual-encoder split with four layers', async () => {
    const { layout, keymap } = await loadDemo('sofle')
    expect(layout).toHaveLength(60)
    expect(keymap.layers).toHaveLength(4)
    expect(keymap.sensorBindings?.slice(0, 3).every(row => row?.length === 2)).toBe(true)
    expect(keymap.conditionalLayers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ ifLayers: [1, 2], thenLayer: 3 })
      ])
    )
  })

  it('loads Planck as a 48-key ortholinear unibody', async () => {
    const { layout, keymap } = await loadDemo('planck')
    expect(layout).toHaveLength(48)
    expect(keymap.layers).toHaveLength(3)
    expect(keymap.sensorBindings).toBeUndefined()
  })

  it('loads nice!60 as a 61-key wireless unibody', async () => {
    const { layout, keymap } = await loadDemo('nice60')
    expect(layout).toHaveLength(61)
    expect(keymap.layers).toHaveLength(2)
    expect(keymap.combos?.length).toBeGreaterThanOrEqual(4)
  })

  it('groups PNCATEHO combos into a chord dictionary of finger cores', async () => {
    const { layout, keymap } = await loadDemo('pncateho')
    expect(shouldOfferComboDictionary(layout, keymap.combos)).toBe(true)
    const families = comboDictionaryFamilies(layout, keymap.combos ?? [])
    expect(families.length).toBe(80)
    expect(families.every(family => family.core.length >= 1)).toBe(true)
    expect(families.some(family => family.variants.length >= 4)).toBe(true)
    const index = comboDictionaryIndexModel(layout, keymap.combos ?? [])
    expect(index.hits.get('b')?.base?.positions.length).toBeGreaterThan(0)
    expect(index.hits.get('b')?.shift?.positions.length).toBeGreaterThan(0)
    expect(index.hits.get('e')?.base?.positions.length).toBeGreaterThan(0)
    expect(index.hits.get('f5')?.base?.positions.length).toBeGreaterThan(0)
    expect(index.other.some(item => item.label.includes('bootloader'))).toBe(true)
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
