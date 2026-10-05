import { beforeEach, describe, expect, it } from 'vitest'
import {
  addHostLanguage,
  removeHostLanguage,
  type ParsedKeymap
} from '@keymap-editor/keymap-core'
import { editor } from './editor.svelte.js'

function km(code: string, keyboard = 'board-a'): ParsedKeymap {
  return {
    keyboard,
    layer_names: ['default'],
    layers: [[{ value: '&kp', params: [{ value: code, params: [] }] }]]
  }
}

const layout = [{ x: 0, y: 0, row: 0, col: 0 }]

describe('editor host-edit session clear', () => {
  beforeEach(() => {
    editor.resetForTests()
  })

  it('closes host-edit session when selecting another keyboard', async () => {
    await editor.selectKeyboard({
      source: 'local',
      layout,
      keymap: km('A', 'board-a')
    })
    editor.beginHostEditSession(0, 0, 'A')
    editor.legendHover = { kind: 'layer', layer: 0 }
    expect(editor.hostEditSession).toEqual({ keyIndex: 0, layer: 0 })
    expect(editor.hostSymbolCatalogOpen).toBe(true)
    expect(editor.hostSymbolEditTarget).not.toBeNull()
    expect(editor.legendHover).not.toBeNull()

    await editor.selectKeyboard({
      source: 'local',
      layout,
      keymap: km('B', 'board-b')
    })

    expect(editor.hostEditSession).toBeNull()
    expect(editor.hostSymbolEditTarget).toBeNull()
    expect(editor.hostSymbolCatalogOpen).toBe(false)
    expect(editor.legendHover).toBeNull()
  })

  it('closes host-edit session on clearLoadedKeymap (logout)', async () => {
    await editor.selectKeyboard({
      source: 'local',
      layout,
      keymap: km('A')
    })
    editor.beginHostEditSession(0, 0, 'A')
    editor.legendHover = { kind: 'altGr' }
    expect(editor.hostEditSession).not.toBeNull()

    editor.clearLoadedKeymap()

    expect(editor.hostEditSession).toBeNull()
    expect(editor.hostSymbolEditTarget).toBeNull()
    expect(editor.hostSymbolCatalogOpen).toBe(false)
    expect(editor.legendHover).toBeNull()
    expect(editor.draftKeymap).toBeNull()
  })
})

describe('editor multilangView host-legend invariant', () => {
  beforeEach(() => {
    editor.resetForTests()
  })

  it('clears multilangView when host columns drop below three', () => {
    editor.hostLegend = addHostLanguage(addHostLanguage(editor.hostLegend, 'ru'), 'uk')
    editor.multilangView = true
    expect(editor.multilangViewOn).toBe(true)

    editor.hostLegend = removeHostLanguage(editor.hostLegend, 'uk')
    expect(editor.hostLegend.columns).toHaveLength(2)
    expect(editor.multilangView).toBe(false)
    expect(editor.multilangViewOn).toBe(false)
  })
})
