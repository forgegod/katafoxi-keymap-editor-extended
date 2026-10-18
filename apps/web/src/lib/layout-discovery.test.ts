import { beforeEach, describe, expect, it } from 'vitest'
import { buildLayoutCatalog, inferRectangularLayout, parseDtsKeymap, parseKeymap } from '@keymap-editor/keymap-core'
import { EditorState } from './editor/state.svelte'
import { captureLayoutDocument, previewLayout, acceptLayout, exportLayout } from './layout-discovery'

const code = '/ { keymap { compatible = "zmk,keymap"; base { bindings = <&kp A &kp B>; }; }; };'
const entry = {
  id: 'toy', board: 'synthetic', revision: '1', stockIncludes: [],
  metadata: '/ { t: transform { compatible = "zmk,matrix-transform"; rows = <2>; columns = <1>; map = <RC(1,0) RC(0,0)>; }; };',
  attribution: { url: 'https://example.invalid/synthetic', commit: 'a'.repeat(40), license: 'MIT', notice: 'Synthetic test', path: 'toy.dtsi' }
}
let editor: EditorState
beforeEach(() => {
  editor = new EditorState()
  editor.source = 'clipboard'
  editor.clipboardOriginalSource = code
  editor.layoutDiscoveryInput = { code, explicit: false }
  editor.draftKeymap = parseKeymap(parseDtsKeymap(code))
  editor.baselineKeymap = editor.draftKeymap
  editor.layout = inferRectangularLayout(2)
  editor.baselineLayout = inferRectangularLayout(2)
})

describe('layout discovery interaction transaction', () => {
  it('refuses stale GitHub source proof after publish or branch carry', () => {
    editor.source = 'github'
    editor.githubMeta = { repository: 'example/config', branch: 'main', keymapPath: 'config/toy.keymap', headSha: 'new' }
    editor.layoutDiscoveryInput = { code, explicit: false, sourceId: JSON.stringify(['example/config', 'main', 'config/toy.keymap']), sourceRevision: 'old' }
    expect(() => captureLayoutDocument(editor)).toThrow(/reload/i)
  })

  it.each(['explicit', 'missing', 'dirty', 'pending', 'draft'] as const)('refuses %s input without changing the document', reason => {
    if (reason === 'explicit') editor.layoutDiscoveryInput = { code, explicit: true }
    if (reason === 'missing') editor.layoutDiscoveryInput = { code: null, explicit: false }
    if (reason === 'dirty') editor.draftKeymap = parseKeymap(parseDtsKeymap(code.replace('&kp A', '&kp Z')))
    if (reason === 'pending') editor.hasPendingFirmwareRecovery = true
    if (reason === 'draft') editor.registerLayerOperationGuard(() => 'key')
    const before = JSON.stringify(editor.layout)
    expect(() => captureLayoutDocument(editor)).toThrow()
    expect(JSON.stringify(editor.layout)).toBe(before)
  })

  it('refuses stale acceptance and export after a source, layout or draft change', async () => {
    const document = captureLayoutDocument(editor)
    const catalog = await buildLayoutCatalog('test', [entry])
    const preview = previewLayout(document, catalog, 'toy')
    editor._selectGeneration++
    expect(() => acceptLayout(editor, document, preview, true)).toThrow(/changed/i)
    expect(() => exportLayout(editor, document, preview)).toThrow(/changed/i)
    expect(editor.layout).toEqual(inferRectangularLayout(2))
  })

  it('previews without mutation; export is separate and acceptance preserves firmware/history', async () => {
    const document = captureLayoutDocument(editor)
    const catalog = await buildLayoutCatalog('test', [entry])
    const before = JSON.stringify({ layout: editor.layout, keymap: editor.draftKeymap, undo: editor.undoStack })
    const preview = previewLayout(document, catalog, 'toy')
    expect(preview.status).toBe('candidate')
    expect(JSON.stringify({ layout: editor.layout, keymap: editor.draftKeymap, undo: editor.undoStack })).toBe(before)
    const exported = exportLayout(editor, document, preview)
    expect(JSON.parse(exported).layouts.default.layout.map((key: { y: number }) => key.y)).toEqual([1, 0])
    expect(JSON.stringify({ layout: editor.layout, keymap: editor.draftKeymap, undo: editor.undoStack })).toBe(before)
    expect(() => acceptLayout(editor, document, preview, false)).toThrow(/acknowledge/i)
    acceptLayout(editor, document, preview, true)
    expect(editor.layout?.map(key => key.y)).toEqual([1, 0])
    expect(editor.baselineLayout).toEqual(inferRectangularLayout(2))
    expect(editor.draftKeymap).toBe(document.keymap)
    expect(editor.undoStack).toEqual([])
    expect(editor.isDirty).toBe(false)
  })
})
