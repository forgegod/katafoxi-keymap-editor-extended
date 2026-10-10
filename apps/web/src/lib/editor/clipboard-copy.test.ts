import {
  cloneParsedKeymap,
  KeymapValidationError,
  type ParsedKeymap
} from '@keymap-editor/keymap-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadClipboardBundle } from '../clipboard/load.js'
import * as clipboardExport from '../clipboard/export.js'
import { readClipboardOriginalSource } from '../clipboard/session.js'
import * as session from '../clipboard/session.js'
import * as draftStorage from '../draft-storage'
import { editor } from '../editor.svelte.js'
import { copyClipboardKeymap } from './clipboard-copy'

/** Minimal pasted .keymap: includes stay in the preamble; two keys to edit. */
const PASTED_SOURCE = `#include <behaviors.dtsi>
#include <dt-bindings/zmk/keys.h>

/ {
    keymap {
        compatible = "zmk,keymap";

        default_layer {
            bindings = <
                &kp A &kp B
            >;
        };
    };
};
`

function preamble(source: string): string {
  const index = source.indexOf('keymap {')
  if (index < 0) throw new Error('fixture has no keymap block')
  return source.slice(0, index)
}

function setKey(draft: ParsedKeymap, index: number, code: string): ParsedKeymap {
  const next = cloneParsedKeymap(draft)
  next.layers[0][index] = {
    value: '&kp',
    params: [{ value: code, params: [] }]
  }
  return next
}

async function pasteFixture() {
  const bundle = loadClipboardBundle('', PASTED_SOURCE)
  await editor.selectKeyboard({
    source: 'clipboard',
    layout: bundle.layout,
    keymap: bundle.keymap,
    clipboardOriginalSource: bundle.originalSource,
    clipboardInferredLayout: bundle.inferredLayout,
    warnings: bundle.warnings
  })
  return bundle
}

describe('copyClipboardKeymap', () => {
  const identity = draftStorage.buildDraftIdentity({ source: 'clipboard', keyboard: 'clipboard' })!

  beforeEach(async () => {
    editor.resetForTests()
    sessionStorage.clear()
    await draftStorage.deleteStoredDraft(identity)
  })

  afterEach(async () => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    editor.resetForTests()
    sessionStorage.clear()
    await draftStorage.deleteStoredDraft(identity)
  })

  it('splices the edit into the pasted preamble and stores the copy as the new original', async () => {
    await pasteFixture()
    editor.updateKeymap(setKey(editor.draftKeymap!, 0, 'ESC'))
    expect(editor.isDirty).toBe(true)

    const writeText = vi.fn(async (_text: string) => {})
    const writeSource = vi.spyOn(session, 'writeClipboardOriginalSource')
    writeSource.mockClear()

    const sheet = await copyClipboardKeymap(editor, { writeText })

    expect(sheet).toBeDefined()
    expect(writeText).toHaveBeenCalledTimes(1)
    const code = writeText.mock.calls[0][0]
    expect(preamble(code)).toBe(preamble(PASTED_SOURCE))
    expect(code).toContain('&kp ESC')
    expect(code).not.toContain('&kp A')
    expect(editor.isDirty).toBe(false)
    expect(editor.clipboardOriginalSource).toBe(code)
    const identity = editor.currentDraftIdentity()
    expect(identity).toBeTruthy()
    expect(writeSource).toHaveBeenCalledWith(identity, code)
    expect(readClipboardOriginalSource(identity!)).toBe(code)
  })

  it('splices a second Copy onto the first Copy output, not the original paste', async () => {
    await pasteFixture()
    editor.updateKeymap(setKey(editor.draftKeymap!, 0, 'ESC'))
    const firstWrite = vi.fn(async (_text: string) => {})
    const first = await copyClipboardKeymap(editor, { writeText: firstWrite })
    expect(first?.code).toBeTruthy()
    expect(editor.clipboardOriginalSource).toBe(first!.code)

    const exportSpy = vi.spyOn(clipboardExport, 'buildClipboardExport')
    editor.updateKeymap(setKey(editor.draftKeymap!, 1, 'TAB'))
    const secondWrite = vi.fn(async (_text: string) => {})
    const second = await copyClipboardKeymap(editor, { writeText: secondWrite })

    expect(exportSpy.mock.calls[0][2]).toBe(first!.code)
    expect(exportSpy.mock.calls[0][2]).not.toBe(PASTED_SOURCE.trim())
    expect(second?.code).toContain('&kp ESC')
    expect(second?.code).toContain('&kp TAB')
    expect(second?.code).not.toContain('&kp B')
    expect(preamble(second!.code)).toBe(preamble(first!.code))
  })

  it('keeps the firmware draft dirty when writeText rejects', async () => {
    await pasteFixture()
    editor.updateKeymap(setKey(editor.draftKeymap!, 0, 'ESC'))
    const writeText = vi.fn(async () => {
      throw new Error('clipboard denied')
    })

    const sheet = await copyClipboardKeymap(editor, { writeText })

    expect(sheet?.copied).toBe(false)
    expect(sheet?.code).toContain('&kp ESC')
    expect(editor.isDirty).toBe(true)
    expect(editor.clipboardOriginalSource).toContain('&kp A')
    expect(editor.saving).toBe(false)
  })

  it('keeps edits made while the clipboard write is pending', async () => {
    await pasteFixture()
    editor.updateKeymap(setKey(editor.draftKeymap!, 0, 'ESC'))
    let finishWrite!: () => void
    const writeText = vi.fn(() => new Promise<void>(resolve => {
      finishWrite = resolve
    }))
    const copying = copyClipboardKeymap(editor, { writeText })
    editor.updateKeymap(setKey(editor.draftKeymap!, 1, 'TAB'))
    finishWrite()

    const sheet = await copying
    expect(sheet?.copied).toBe(true)
    expect(sheet?.code).toContain('&kp ESC')
    expect(sheet?.code).not.toContain('&kp TAB')
    expect(editor.baselineKeymap!.layers[0][1].params[0].value).toBe('B')
    expect(editor.draftKeymap!.layers[0][1].params[0].value).toBe('TAB')
    expect(editor.isDirty).toBe(true)
    await editor.flushPendingPersist()
    const stored = await draftStorage.loadStoredDraft(editor.currentDraftIdentity()!)
    expect(stored?.draftKeymap.layers[0][1].params[0].value).toBe('TAB')
  })

  it('keeps an undo made during copy dirty against the actual copied baseline', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    await pasteFixture()
    editor.updateKeymap(setKey(editor.draftKeymap!, 0, 'ESC'))
    let finishWrite!: () => void
    const copying = copyClipboardKeymap(editor, {
      writeText: () => new Promise<void>(resolve => { finishWrite = resolve })
    })
    editor.undo()
    expect(editor.isDirty).toBe(false)
    await vi.advanceTimersByTimeAsync(500)
    finishWrite()
    await copying
    expect(editor.draftKeymap!.layers[0][0].params[0].value).toBe('A')
    expect(editor.baselineKeymap!.layers[0][0].params[0].value).toBe('ESC')
    expect(editor.isDirty).toBe(true)
    await vi.advanceTimersByTimeAsync(500)
    const stored = await draftStorage.loadStoredDraft(editor.currentDraftIdentity()!)
    expect(stored?.draftKeymap.layers[0][0].params[0].value).toBe('A')
  })

  it.each(['local', 'clipboard', 'logout'] as const)(
    'ignores a clipboard completion after switching to %s',
    async destination => {
      const bundle = await pasteFixture()
      editor.updateKeymap(setKey(editor.draftKeymap!, 0, 'ESC'))
      let finishWrite!: () => void
      const copying = copyClipboardKeymap(editor, {
        writeText: () => new Promise<void>(resolve => { finishWrite = resolve })
      })
      if (destination === 'logout') {
        editor.clearLoadedKeymap()
      } else {
        await editor.selectKeyboard({
          source: destination,
          layout: bundle.layout,
          keymap: bundle.keymap,
          ...(destination === 'clipboard'
            ? { clipboardOriginalSource: bundle.originalSource }
            : {})
        })
        editor.updateKeymap(setKey(editor.draftKeymap!, 1, 'TAB'))
      }
      const baseline = editor.baselineKeymap
      const draft = editor.draftKeymap
      const original = editor.clipboardOriginalSource
      const notice = editor.saveNotice
      finishWrite()

      expect(await copying).toBeUndefined()
      expect(editor.baselineKeymap).toBe(baseline)
      expect(editor.draftKeymap).toBe(draft)
      expect(editor.clipboardOriginalSource).toBe(original)
      expect(editor.saveNotice).toBe(notice)
      expect(editor.saving).toBe(false)
    }
  )

  it('accepts only the exported snapshot after a successful sheet retry', async () => {
    await pasteFixture()
    editor.updateKeymap(setKey(editor.draftKeymap!, 0, 'ESC'))
    const sheet = await copyClipboardKeymap(editor, {
      writeText: async () => { throw new Error('clipboard denied') }
    })
    expect(sheet?.copied).toBe(false)
    editor.updateKeymap(setKey(editor.draftKeymap!, 1, 'TAB'))
    sheet!.onCopied()
    expect(editor.baselineKeymap!.layers[0][0].params[0].value).toBe('ESC')
    expect(editor.baselineKeymap!.layers[0][1].params[0].value).toBe('B')
    expect(editor.draftKeymap!.layers[0][1].params[0].value).toBe('TAB')
    expect(editor.isDirty).toBe(true)
  })

  it('ignores a sheet retry baseline after the same clipboard identity is re-pasted', async () => {
    await pasteFixture()
    editor.updateKeymap(setKey(editor.draftKeymap!, 0, 'ESC'))
    const sheet = await copyClipboardKeymap(editor, {
      writeText: async () => { throw new Error('clipboard denied') }
    })
    await pasteFixture()
    const baseline = editor.baselineKeymap
    const original = editor.clipboardOriginalSource
    sheet!.onCopied()
    expect(editor.baselineKeymap).toBe(baseline)
    expect(editor.clipboardOriginalSource).toBe(original)
    expect(editor.isDirty).toBe(false)
  })

  it('validates the generated export before writing or changing the original source', async () => {
    await pasteFixture()
    editor.updateKeymap(setKey(editor.draftKeymap!, 0, 'ESC'))
    const original = editor.clipboardOriginalSource
    const baseline = editor.baselineKeymap
    vi.spyOn(clipboardExport, 'buildClipboardExport').mockReturnValue({
      code: 'not a keymap', mode: 'splice', warnings: []
    })
    const writeText = vi.fn(async () => {})
    expect(await copyClipboardKeymap(editor, { writeText })).toBeUndefined()
    expect(writeText).not.toHaveBeenCalled()
    expect(editor.clipboardOriginalSource).toBe(original)
    expect(readClipboardOriginalSource(editor.currentDraftIdentity()!)).toBe(original)
    expect(editor.baselineKeymap).toBe(baseline)
    expect(editor.isDirty).toBe(true)
    expect(editor.saveNotice?.kind).toBe('error')
    expect(editor.saving).toBe(false)
  })

  it('does not release a newer copy lock after an old session completes', async () => {
    await pasteFixture()
    editor.updateKeymap(setKey(editor.draftKeymap!, 0, 'ESC'))
    let finishOld!: () => void
    const oldCopy = copyClipboardKeymap(editor, {
      writeText: () => new Promise<void>(resolve => { finishOld = resolve })
    })
    await pasteFixture()
    editor.updateKeymap(setKey(editor.draftKeymap!, 1, 'TAB'))
    let finishNew!: () => void
    const newCopy = copyClipboardKeymap(editor, {
      writeText: () => new Promise<void>(resolve => { finishNew = resolve })
    })
    finishOld()
    expect(await oldCopy).toBeUndefined()
    const savingWhileNewCopyPending = editor.saving
    finishNew()
    expect((await newCopy)?.copied).toBe(true)
    expect(savingWhileNewCopyPending).toBe(true)
    expect(editor.saving).toBe(false)
    expect(editor.isDirty).toBe(false)
  })

  it('surfaces KeymapValidationError on the save notice and clears saving', async () => {
    await pasteFixture()
    editor.updateKeymap(setKey(editor.draftKeymap!, 0, 'ESC'))
    vi.spyOn(clipboardExport, 'buildClipboardExport').mockImplementation(() => {
      throw new KeymapValidationError(['no keymap block'])
    })
    const writeText = vi.fn(async (_text: string) => {})

    const sheet = await copyClipboardKeymap(editor, { writeText })

    expect(sheet).toBeUndefined()
    expect(writeText).not.toHaveBeenCalled()
    expect(editor.saveNotice).toEqual({
      kind: 'error',
      messages: ['no keymap block']
    })
    expect(editor.saving).toBe(false)
    expect(editor.isDirty).toBe(true)
  })

  it('does nothing when a copy is already in flight', async () => {
    await pasteFixture()
    editor.updateKeymap(setKey(editor.draftKeymap!, 0, 'ESC'))
    editor.saving = true
    const writeText = vi.fn(async (_text: string) => {})

    const sheet = await copyClipboardKeymap(editor, { writeText })

    expect(sheet).toBeUndefined()
    expect(writeText).not.toHaveBeenCalled()
    expect(editor.saving).toBe(true)
    expect(editor.isDirty).toBe(true)
  })
})
