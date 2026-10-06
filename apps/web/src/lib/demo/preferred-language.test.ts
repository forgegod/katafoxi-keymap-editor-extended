import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { editor } from '../editor.svelte.js'
import { clearHostLayoutStore } from '../host-layout-store'
import { loadDemo } from './catalog'

describe('preferred demo host language', () => {
  beforeEach(async () => {
    editor.resetForTests()
    await clearHostLayoutStore()
    await editor.restoreHostProfiles()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('adds Russian on a fresh Corne demo when the browser prefers ru', async () => {
    vi.stubGlobal('navigator', {
      language: 'ru-RU',
      languages: ['ru-RU', 'en-US']
    })
    const bundle = await loadDemo('corne')
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
    expect(editor.isHostDirty).toBe(false)
  })

  it('leaves English-only when the browser has no addable locale', async () => {
    vi.stubGlobal('navigator', {
      language: 'en-US',
      languages: ['en-US', 'ja-JP']
    })
    const bundle = await loadDemo('corne')
    await editor.selectKeyboard({
      source: 'demo',
      layout: bundle.layout,
      keymap: bundle.keymap,
      demoHost: bundle.hostSeeds
    })

    expect(editor.hostLegend.columns.map(column => column.language)).toEqual(['en'])
  })

  it('keeps a persisted bilingual legend instead of swapping to another preferred language', async () => {
    vi.stubGlobal('navigator', {
      language: 'ru-RU',
      languages: ['ru-RU']
    })
    const bundle = await loadDemo('corne')
    await editor.selectKeyboard({
      source: 'demo',
      layout: bundle.layout,
      keymap: bundle.keymap,
      demoHost: bundle.hostSeeds
    })

    vi.stubGlobal('navigator', {
      language: 'de-DE',
      languages: ['de-DE']
    })
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
  })
})
