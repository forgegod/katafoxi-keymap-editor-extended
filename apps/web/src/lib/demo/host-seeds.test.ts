import { describe, expect, it } from 'vitest'
import { hostLayout } from '@keymap-editor/keymap-core'
import {
  DEMO_LARK_EN_ID,
  DEMO_LARK_RU_ID,
  demoHostLayoutTable,
  demoHostSeeds
} from './host-seeds'
import { loadDemo } from './catalog'

describe('demo host seeds', () => {
  it('attaches Lark EN+RU fixtures only to the Lark demo', () => {
    expect(demoHostSeeds('corne')).toEqual([])
    const seeds = demoHostSeeds('lark')
    expect(seeds.map(seed => seed.id)).toEqual([DEMO_LARK_EN_ID, DEMO_LARK_RU_ID])
    expect(loadDemo('lark').hostSeeds).toEqual(seeds)
  })

  it('parses Lark host tables with Cyrillic on Q', () => {
    const ru = demoHostSeeds('lark').find(seed => seed.language === 'ru')
    expect(ru).toBeTruthy()
    const table = demoHostLayoutTable(ru!)
    expect(table.id).toBe(DEMO_LARK_RU_ID)
    expect(table.byZmk.get('Q')?.glyphs[0]).toMatch(/й/i)
    expect(hostLayout(DEMO_LARK_EN_ID)).toBeUndefined()
  })
})
