import { primarySystemLayoutId } from '@keymap-editor/keymap-core'
import { beforeEach, describe, expect, it } from 'vitest'

import { editor } from '../editor.svelte.js'
import { clearHostLayoutStore } from '../host-layout-store'
import { loadDemo } from './catalog'
import { DEMO_LARK_EN_ID, DEMO_LARK_RU_ID } from './host-seeds'

describe('Lark demo host seed', () => {
  beforeEach(async () => {
    editor.resetForTests()
    await clearHostLayoutStore()
    await editor.restoreHostProfiles()
  })

  it('opens English and Russian Lark host layouts on first demo load', async () => {
    const bundle = loadDemo('lark')
    await editor.selectKeyboard({
      source: 'demo',
      layout: bundle.layout,
      keymap: bundle.keymap,
      demoHost: bundle.hostSeeds
    })

    expect(editor.hostLegend.columns.map(column => column.language)).toEqual([
      'en',
      'ru'
    ])
    expect(editor.hostLegend.open).toBe('ru')
    expect(editor.activeProfileId('en')).toBe(DEMO_LARK_EN_ID)
    expect(editor.activeProfileId('ru')).toBe(DEMO_LARK_RU_ID)
    expect(editor.hostLegend.keycap).toEqual(['en', 'ru'])
    expect(
      editor.profilesForLanguage('en').find(profile => profile.id === DEMO_LARK_EN_ID)?.name
    ).toBe('en2')
    expect(
      editor.profilesForLanguage('ru').find(profile => profile.id === DEMO_LARK_RU_ID)?.name
    ).toBe('ru2')
    expect(editor.isHostDirty).toBe(false)
  })

  it('does not overwrite a customized legend', async () => {
    const bundle = loadDemo('lark')
    await editor.selectKeyboard({
      source: 'demo',
      layout: bundle.layout,
      keymap: bundle.keymap,
      demoHost: bundle.hostSeeds
    })
    editor.hostLegend = {
      columns: [
        {
          language: 'en',
          layoutId: primarySystemLayoutId('en')!,
          visible: true,
          altGr: true,
          altGrShift: true
        }
      ],
      open: null
    }

    await editor.selectKeyboard({
      source: 'demo',
      layout: bundle.layout,
      keymap: bundle.keymap,
      demoHost: bundle.hostSeeds
    })

    // Restored from IDB after first seed — bilingual stays.
    expect(editor.hostLegend.columns.map(column => column.language)).toEqual([
      'en',
      'ru'
    ])
  })
})
