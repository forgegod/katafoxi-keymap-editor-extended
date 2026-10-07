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
  beforeEach(() => {
    editor.resetForTests()
    sessionStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    editor.resetForTests()
    sessionStorage.clear()
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

  it('still opens the sheet and clears the draft when writeText rejects', async () => {
    await pasteFixture()
    editor.updateKeymap(setKey(editor.draftKeymap!, 0, 'ESC'))
    const writeText = vi.fn(async () => {
      throw new Error('clipboard denied')
    })

    const sheet = await copyClipboardKeymap(editor, { writeText })

    expect(sheet?.copied).toBe(false)
    expect(sheet?.code).toContain('&kp ESC')
    expect(editor.isDirty).toBe(false)
    expect(editor.saving).toBe(false)
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
