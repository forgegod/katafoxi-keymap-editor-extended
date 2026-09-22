import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ParsedKeymap } from '@keymap-editor/keymap-core'
import {
  buildDraftIdentity,
  deleteStoredDraft,
  loadStoredDraft,
  saveStoredDraft
} from './draft-storage'
import { editor } from './editor.svelte.js'

function km(code: string, keyboard = 'lark'): ParsedKeymap {
  return {
    keyboard,
    layer_names: ['default'],
    layers: [[{ value: '&kp', params: [{ value: code, params: [] }] }]]
  }
}

describe('editor publish / draft persistence', () => {
  beforeEach(async () => {
    editor.resetForTests()
    const identity = buildDraftIdentity({ source: 'local', keyboard: 'lark' })
    if (identity) await deleteStoredDraft(identity)
  })

  afterEach(() => {
    vi.useRealTimers()
    editor.resetForTests()
  })

  it('tracks dirty vs baseline and clears on applyPublished', async () => {
    await editor.selectKeyboard({
      source: 'local',
      layout: [{ x: 0, y: 0, row: 0, col: 0 }],
      keymap: km('A')
    })
    expect(editor.isDirty).toBe(false)
    expect(editor.statusText).toBe('Up to date with disk')

    editor.updateKeymap(km('M'))
    expect(editor.isDirty).toBe(true)
    expect(editor.statusText).toMatch(/^Draft/)

    editor.applyPublished(km('M'), { warnings: ['macros_expanded'] })
    expect(editor.isDirty).toBe(false)
    expect(editor.statusText).toBe('Up to date with disk')
    expect(editor.saveNotice?.kind).toBe('warning')
    expect(editor.saveNotice?.messages[0]).toMatch(/Macros were expanded/)
  })

  it('keeps dirty draft when reload fails after write', async () => {
    await editor.selectKeyboard({
      source: 'local',
      layout: [{ x: 0, y: 0, row: 0, col: 0 }],
      keymap: km('A')
    })
    editor.updateKeymap(km('M'))
    expect(editor.isDirty).toBe(true)

    editor.applyReloadFailure('local')
    expect(editor.isDirty).toBe(true)
    expect(editor.draftKeymap!.layers[0][0].params[0].value).toBe('M')
    expect(editor.saveNotice?.kind).toBe('error')
    expect(editor.saveNotice?.messages[0]).toMatch(/reloading from disk failed/)
  })

  it('undo restores previous draft step', async () => {
    await editor.selectKeyboard({
      source: 'local',
      layout: [{ x: 0, y: 0, row: 0, col: 0 }],
      keymap: km('A')
    })
    editor.updateKeymap(km('M'))
    expect(editor.canUndo).toBe(true)
    editor.undo()
    expect(editor.draftKeymap!.layers[0][0].params[0].value).toBe('A')
    expect(editor.isDirty).toBe(false)
    editor.redo()
    expect(editor.draftKeymap!.layers[0][0].params[0].value).toBe('M')
  })

  it('persists dirty draft to IndexedDB and offers restore', async () => {
    const identity = buildDraftIdentity({ source: 'local', keyboard: 'lark' })!
    await saveStoredDraft(identity, km('Z'))

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)

    await editor.selectKeyboard({
      source: 'local',
      layout: [{ x: 0, y: 0, row: 0, col: 0 }],
      keymap: km('A')
    })

    expect(confirm).toHaveBeenCalled()
    expect(editor.draftKeymap!.layers[0][0].params[0].value).toBe('Z')
    expect(editor.baselineKeymap!.layers[0][0].params[0].value).toBe('A')
    expect(editor.isDirty).toBe(true)

    confirm.mockRestore()
  })

  it('discards stored draft when confirm is cancelled', async () => {
    const identity = buildDraftIdentity({ source: 'local', keyboard: 'lark' })!
    await saveStoredDraft(identity, km('Z'))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)

    await editor.selectKeyboard({
      source: 'local',
      layout: [{ x: 0, y: 0, row: 0, col: 0 }],
      keymap: km('A')
    })

    expect(editor.draftKeymap!.layers[0][0].params[0].value).toBe('A')
    expect(editor.isDirty).toBe(false)
    expect(await loadStoredDraft(identity)).toBeNull()

    confirm.mockRestore()
  })

  it('clears IndexedDB draft only after successful applyPublished', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    await editor.selectKeyboard({
      source: 'local',
      layout: [{ x: 0, y: 0, row: 0, col: 0 }],
      keymap: km('A')
    })
    editor.updateKeymap(km('M'))
    await vi.advanceTimersByTimeAsync(500)

    const identity = buildDraftIdentity({ source: 'local', keyboard: 'lark' })!
    expect(await loadStoredDraft(identity)).not.toBeNull()

    editor.applyReloadFailure('local')
    expect(await loadStoredDraft(identity)).not.toBeNull()

    editor.applyPublished(km('M'))
    await vi.waitFor(async () => {
      expect(await loadStoredDraft(identity)).toBeNull()
    })
    expect(editor.isDirty).toBe(false)
  })
})
