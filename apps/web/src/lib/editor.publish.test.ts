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

  it('discardDraft resets to baseline without needing undo history', async () => {
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

    editor.clearHistory()
    expect(editor.canUndo).toBe(false)
    expect(editor.isDirty).toBe(true)

    await expect(editor.discardDraft()).resolves.toBe(true)
    expect(editor.isDirty).toBe(false)
    expect(editor.draftKeymap!.layers[0][0].params[0].value).toBe('A')
    expect(editor.canUndo).toBe(false)
    expect(await loadStoredDraft(identity)).toBeNull()
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

  it('keeps file hold-tap timings when a draft saved without them is restored', async () => {
    const identity = buildDraftIdentity({ source: 'local', keyboard: 'lark' })!
    await saveStoredDraft(identity, km('Z'))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    const loaded = km('A')
    loaded.holdTaps = [
      { code: '&mt', override: true, tappingTermMs: 300, flavor: 'tap-preferred' }
    ]

    await editor.selectKeyboard({
      source: 'local',
      layout: [{ x: 0, y: 0, row: 0, col: 0 }],
      keymap: loaded
    })

    expect(editor.draftKeymap!.layers[0][0].params[0].value).toBe('Z')
    expect(editor.draftKeymap!.holdTaps).toEqual(loaded.holdTaps)
    expect(editor.baselineKeymap!.holdTaps).toEqual(loaded.holdTaps)

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

  it('races two selectKeyboard calls so the later generation wins', async () => {
    const larkIdentity = buildDraftIdentity({ source: 'local', keyboard: 'lark' })!
    await saveStoredDraft(larkIdentity, km('Z'))

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)

    const first = editor.selectKeyboard({
      source: 'local',
      layout: [{ x: 0, y: 0, row: 0, col: 0 }],
      keymap: km('A')
    })
    await editor.selectKeyboard({
      source: 'local',
      layout: [{ x: 0, y: 0, row: 0, col: 0 }],
      keymap: km('A', 'other')
    })
    await first

    expect(confirm).not.toHaveBeenCalled()
    expect(editor.draftKeymap!.keyboard).toBe('other')
    expect(editor.draftKeymap!.layers[0][0].params[0].value).toBe('A')
    expect(editor.isDirty).toBe(false)

    confirm.mockRestore()
  })

  it('keeps live dirty edits when reselecting the same keyboard', async () => {
    const identity = buildDraftIdentity({ source: 'local', keyboard: 'lark' })!
    await saveStoredDraft(identity, km('Z'))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)

    const selection = {
      source: 'local',
      layout: [{ x: 0, y: 0, row: 0, col: 0 }],
      keymap: km('A')
    }

    await editor.selectKeyboard(selection)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(editor.draftKeymap!.layers[0][0].params[0].value).toBe('Z')

    editor.updateKeymap(km('M'))
    expect(editor.isDirty).toBe(true)

    await editor.selectKeyboard(selection)

    expect(confirm).toHaveBeenCalledTimes(1)
    expect(editor.draftKeymap!.layers[0][0].params[0].value).toBe('M')
    expect(editor.isDirty).toBe(true)

    confirm.mockRestore()
  })

  it('deletes a stale clean IDB record without prompting', async () => {
    const identity = buildDraftIdentity({ source: 'local', keyboard: 'lark' })!
    await saveStoredDraft(identity, km('A'))
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)

    await editor.selectKeyboard({
      source: 'local',
      layout: [{ x: 0, y: 0, row: 0, col: 0 }],
      keymap: km('A')
    })

    expect(confirm).not.toHaveBeenCalled()
    expect(editor.draftKeymap!.layers[0][0].params[0].value).toBe('A')
    expect(editor.isDirty).toBe(false)
    expect(await loadStoredDraft(identity)).toBeNull()

    confirm.mockRestore()
  })

  it('clears redo when a new edit follows undo', async () => {
    await editor.selectKeyboard({
      source: 'local',
      layout: [{ x: 0, y: 0, row: 0, col: 0 }],
      keymap: km('A')
    })
    editor.updateKeymap(km('M'))
    editor.undo()
    expect(editor.canRedo).toBe(true)

    editor.updateKeymap(km('X'))
    expect(editor.canRedo).toBe(false)
    expect(editor.draftKeymap!.layers[0][0].params[0].value).toBe('X')
  })

  it('caps undo history at 50 steps', async () => {
    await editor.selectKeyboard({
      source: 'local',
      layout: [{ x: 0, y: 0, row: 0, col: 0 }],
      keymap: km('BASE')
    })

    for (let i = 1; i <= 51; i++) {
      editor.updateKeymap(km(`E${i}`))
    }

    for (let i = 0; i < 50; i++) {
      editor.undo()
    }

    expect(editor.draftKeymap!.layers[0][0].params[0].value).toBe('E1')
    expect(editor.canUndo).toBe(false)
  })

  it('surfaces clipboard load warnings in saveNotice', async () => {
    await editor.selectKeyboard({
      source: 'clipboard',
      layout: [{ x: 0, y: 0, row: 0, col: 0 }],
      keymap: km('A', 'clipboard'),
      clipboardOriginalSource: 'bindings = <&kp A>;',
      warnings: ['clipboard_inferred_layout', 'clipboard_json_no_export_source']
    })

    expect(editor.saveNotice?.kind).toBe('warning')
    expect(editor.saveNotice?.messages).toEqual([
      'No info.json — using a flat rectangular board from the binding count. Paste info.json for the real layout.',
      'Loaded from keymap.json only — Copy .keymap will use the default ZMK template unless you also paste a .keymap under “Export source”.'
    ])
    expect(editor.saveNotice?.links).toEqual([
      {
        href: 'https://shield-wizard.genteure.com/',
        label: 'Create a physical layout in Shield Wizard'
      }
    ])
  })

  it('surfaces github inferred-layout warnings in saveNotice', async () => {
    await editor.selectKeyboard({
      source: 'github',
      github: { repository: 'acme/lark', branch: 'main' },
      layout: [{ x: 0, y: 0, row: 0, col: 0 }],
      keymap: km('A', 'lark'),
      warnings: ['github_inferred_layout']
    })

    expect(editor.saveNotice?.kind).toBe('warning')
    expect(editor.saveNotice?.messages[0]).toMatch(/No config\/info\.json/)
    expect(editor.saveNotice?.links?.[0]?.label).toMatch(/Shield Wizard/)
  })

  it('clears saveNotice on applyClipboardCopied so the export sheet owns notes', async () => {
    await editor.selectKeyboard({
      source: 'clipboard',
      layout: [{ x: 0, y: 0, row: 0, col: 0 }],
      keymap: km('A', 'clipboard'),
      warnings: ['clipboard_inferred_layout']
    })
    expect(editor.saveNotice?.kind).toBe('warning')

    editor.updateKeymap(km('B', 'clipboard'))
    editor.applyClipboardCopied(km('B', 'clipboard'), {
      warnings: ['generated_default_template']
    })
    expect(editor.saveNotice).toBeNull()
    expect(editor.isDirty).toBe(false)
  })

  it('keeps dirty draft and Host languages when preserveSession retargets the branch', async () => {
    const { addHostLanguage } = await import('@keymap-editor/keymap-core')
    const mainId = buildDraftIdentity({
      source: 'github',
      repo: 'acme/lark',
      branch: 'main',
      keyboard: 'lark'
    })!
    const topicId = buildDraftIdentity({
      source: 'github',
      repo: 'acme/lark',
      branch: 'topic',
      keyboard: 'lark'
    })!
    await deleteStoredDraft(mainId)
    await deleteStoredDraft(topicId)

    await editor.selectKeyboard({
      source: 'github',
      github: { repository: 'acme/lark', branch: 'main' },
      layout: [{ x: 0, y: 0, row: 0, col: 0 }],
      keymap: km('A')
    })
    editor.updateKeymap(km('Z'))
    editor.hostLegend = addHostLanguage(editor.hostLegend, 'ru')
    expect(editor.isDirty).toBe(true)
    expect(editor.hostLegend.columns.map(c => c.language)).toEqual(['en', 'ru'])

    await editor.selectKeyboard({
      source: 'github',
      github: { repository: 'acme/lark', branch: 'topic' },
      layout: [{ x: 0, y: 0, row: 0, col: 0 }],
      keymap: km('A'),
      preserveSession: true
    })

    expect(editor.githubMeta).toEqual({ repository: 'acme/lark', branch: 'topic' })
    expect(editor.isDirty).toBe(true)
    expect(editor.draftKeymap?.layers[0][0]).toEqual({
      value: '&kp',
      params: [{ value: 'Z', params: [] }]
    })
    expect(editor.hostLegend.columns.map(c => c.language)).toEqual(['en', 'ru'])

    await deleteStoredDraft(mainId)
    await deleteStoredDraft(topicId)
  })
})
