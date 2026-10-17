import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildFilesystemKeymap, parseDtsKeymap, parseKeyBinding, parseKeymap } from '@keymap-editor/keymap-core'
import { editor } from './editor.svelte'
import { loadStoredDraft, saveStoredDraft } from './draft-storage'
import { saveFilesystemKeymap } from './filesystem-save'
import type { FilesystemAccessEnv, FilesystemFileHandleLike } from './filesystem-access'
import type { FilesystemBaseline } from './draft-storage'

const baseSource = '/* untouched */\n#include <behaviors.dtsi>\n/ { keymap { compatible = "zmk,keymap"; base { bindings = <&kp A>; }; }; };\n'
const bytes = (text: string) => Array.from(new TextEncoder().encode(text))
const layout = [{ x: 0, y: 0, row: 0, col: 0 }]

/** A freshly validated disk read the caller proved identifies the accepted file. */
function changedBaseline(marker: string): FilesystemBaseline {
  const text = baseSource.replace('/* untouched */', `/* ${marker} */`)
  return { bytes: bytes(text), source: text, keymap: parseKeymap(parseDtsKeymap(text)), layout: [...layout], route: { kind: 'file' } }
}

async function fixture(options: { edit?: boolean } = {}) {
  const disk = { bytes: bytes(baseSource) }
  const read = vi.fn(async () => {
    const snapshot = [...disk.bytes]
    return { name: 'a.keymap', size: snapshot.length, lastModified: 0, arrayBuffer: async () => new Uint8Array(snapshot).buffer }
  })
  const accepted: FilesystemFileHandleLike = {
    kind: 'file', name: 'a.keymap', getFile: read,
    isSameEntry: async other => other === accepted || other === picked,
    createWritable: vi.fn(async () => { throw new Error('Never write the accepted handle') })
  }
  let staged: number[] = []
  const stream = {
    write: vi.fn(async (data: Uint8Array) => { staged = Array.from(data) }),
    close: vi.fn(async () => { disk.bytes = staged }),
    abort: vi.fn(async () => {})
  }
  const picked: FilesystemFileHandleLike = {
    ...accepted,
    queryPermission: vi.fn(async () => 'granted' as const),
    requestPermission: vi.fn(async () => 'granted' as const),
    createWritable: vi.fn(async () => stream)
  }
  const env: FilesystemAccessEnv = { isSecureContext: true, showOpenFilePicker: vi.fn(async () => [picked]) }
  const baseline: FilesystemBaseline = { bytes: bytes(baseSource), source: baseSource, keymap: parseKeymap(parseDtsKeymap(baseSource)), layout: [...layout], route: { kind: 'file' } }
  const documentId = `fs:1:${crypto.randomUUID()}`
  await editor.selectKeyboard({ source: 'filesystem', filesystem: { documentId, baseline } })
  const draft = structuredClone(baseline.keymap)
  draft.layers[0][0] = parseKeyBinding('&kp B')
  if (options.edit !== false) editor.updateKeymap(draft)
  return { disk, accepted, picked, stream, env, baseline, draft, documentId, handles: { documentId, file: accepted } }
}

afterEach(async () => { await editor._draftWrites; editor.resetForTests(); vi.restoreAllMocks() })

describe('filesystem guarded reload/adoption', () => {
  it('adopts changed geometry even when firmware bytes are unchanged', async () => {
    const f = await fixture({ edit: false })
    const geometry = '{"layouts":{"LAYOUT":{"layout":[{"x":2,"y":0}]}}}'
    const changed = { ...f.baseline, layout: [{ x: 2, y: 0, row: 0, col: 0 }], geometry: { name: 'info.json', bytes: bytes(geometry) } }
    expect(await editor.reloadFilesystemKeyboard(changed, editor.captureFilesystemReload())).toBe(true)
    expect(editor.filesystemRecovery!.baseline).toEqual(changed)
    expect(editor.layout).toEqual(changed.layout)
  })

  it('checks stored recovery even for an unchanged clean reload', async () => {
    const f = await fixture({ edit: false })
    const context = editor.captureFilesystemReload()
    const identity = editor.currentDraftIdentity()!
    const row = (await loadStoredDraft(identity))!
    await saveStoredDraft(identity, f.draft, undefined, undefined, { expected: row, isCurrent: () => true }, row.filesystem)
    expect(await editor.reloadFilesystemKeyboard(f.baseline, context)).toBe(false)
    expect((await loadStoredDraft(identity))!.draftKeymap).toEqual(f.draft)
  })

  it('preserves history and aliases on a clean unchanged reload', async () => {
    const f = await fixture()
    editor.undo()
    expect(editor.isDirty).toBe(false)
    const undo = editor.undoStack
    const redo = editor.redoStack
    const context = editor.captureFilesystemReload()
    expect(await editor.reloadFilesystemKeyboard(f.baseline, context)).toBe(true)
    expect(editor.undoStack).toBe(undo)
    expect(editor.redoStack).toBe(redo)
    expect(editor.baselineKeymap).toEqual(f.baseline.keymap)
    expect(editor.draftKeymap).toEqual(f.baseline.keymap)
    expect(editor.filesystemRecovery!.baseline.source).toBe(f.baseline.source)
  })

  it('refuses an ordinary reload while firmware work is dirty', async () => {
    const f = await fixture()
    const changed = changedBaseline('CHANGED')
    const context = editor.captureFilesystemReload()
    expect(await editor.reloadFilesystemKeyboard(changed, context)).toBe(false)
    expect(editor.draftKeymap).toEqual(f.draft)
    expect(editor.baselineKeymap).toEqual(f.baseline.keymap)
    expect(editor.filesystemRecovery!.baseline).toEqual(f.baseline)
    expect(editor.isDirty).toBe(true)
    expect(editor.filesystemDocumentId).toBe(f.documentId)
  })

  it('refuses an ordinary reload while a save attempt is pending', async () => {
    const f = await fixture()
    const attempt = editor.captureFilesystemSave()
    await editor.retainFilesystemAttempt(attempt)
    expect(editor.filesystemRecovery!.attempt).toBeDefined()
    const identity = editor.currentDraftIdentity()!
    const row = await loadStoredDraft(identity)
    const changed = changedBaseline('CHANGED')
    const context = editor.captureFilesystemReload()
    expect(await editor.reloadFilesystemKeyboard(changed, context)).toBe(false)
    expect(editor.filesystemRecovery!.attempt).toBeDefined()
    expect(editor.filesystemRecovery!.baseline).toEqual(f.baseline)
    expect(await loadStoredDraft(identity)).toEqual(row)
  })

  it('adopts a clean externally changed file through the staged replacement', async () => {
    const f = await fixture({ edit: false })
    expect(editor.isDirty).toBe(false)
    const changed = changedBaseline('CLEANCHG')
    const context = editor.captureFilesystemReload()
    expect(await editor.reloadFilesystemKeyboard(changed, context)).toBe(true)
    expect(editor.filesystemRecovery!.baseline.source).toBe(changed.source)
    expect(editor.baselineKeymap).toEqual(changed.keymap)
    expect(editor.draftKeymap).toEqual(changed.keymap)
    expect(editor.isDirty).toBe(false)
    expect(editor.hasPendingFirmwareRecovery).toBe(false)
    editor.resetForTests()
    await editor.selectKeyboard({ source: 'filesystem', filesystem: { documentId: f.documentId, baseline: f.baseline } })
    expect(editor.filesystemRecovery!.baseline.source).toBe(changed.source)
  })

  it('replaces the baseline on confirmed discard-and-reload and splices the second Save against it', async () => {
    const f = await fixture()
    const changed = changedBaseline('EXTERNAL')
    f.disk.bytes = [...changed.bytes]
    const context = editor.captureFilesystemReload()
    expect(await editor.reloadFilesystemKeyboard(changed, context, true)).toBe(true)
    expect(editor.filesystemRecovery!.baseline.source).toBe(changed.source)
    expect(editor.baselineKeymap).toEqual(changed.keymap)
    expect(editor.draftKeymap).toEqual(changed.keymap)
    expect(editor.isDirty).toBe(false)
    expect(editor.undoStack).toEqual([])
    expect(editor.hasPendingFirmwareRecovery).toBe(false)
    editor.resetForTests()
    await editor.selectKeyboard({ source: 'filesystem', filesystem: { documentId: f.documentId, baseline: f.baseline } })
    expect(editor.filesystemRecovery!.baseline.source).toBe(changed.source)
    const next = structuredClone(editor.draftKeymap!)
    next.layers[0][0] = parseKeyBinding('&kp C')
    editor.updateKeymap(next)
    const expected = buildFilesystemKeymap({ keymap: next, layout: changed.layout, originalSource: changed.source }).code
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(true)
    expect(f.disk.bytes).toEqual(bytes(expected))
    expect(expected).toContain('/* EXTERNAL */')
  })

  it.each(['session', 'draft', 'competing', 'storage'] as const)('refuses a stale or failed reload: %s', async failure => {
    const f = await fixture()
    const changed = changedBaseline('CHANGED2')
    const context = editor.captureFilesystemReload()
    const identity = editor.currentDraftIdentity()!
    let row = (await loadStoredDraft(identity))!
    if (failure === 'session') editor.resetForTests()
    if (failure === 'draft') editor.renameLayer(0, 'concurrent')
    if (failure === 'competing') {
      await saveStoredDraft(identity, row.draftKeymap, row.layerOperation, undefined, { expected: row, isCurrent: () => true }, { version: 1, baseline: changedBaseline('COMPETE') })
      row = (await loadStoredDraft(identity))!
    }
    if (failure === 'storage') vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(() => { throw new Error('quota') })
    expect(await editor.reloadFilesystemKeyboard(changed, context, true)).toBe(false)
    vi.restoreAllMocks()
    if (failure === 'session') {
      expect(editor.source).toBeNull()
      expect(editor.draftKeymap).toBeNull()
    } else {
      expect(editor.filesystemRecovery!.baseline).toEqual(f.baseline)
      expect(editor.isDirty).toBe(true)
    }
    expect(await loadStoredDraft(identity)).toEqual(row)
  })

  it('preserves edits arriving during the reload transaction without a source or history mismatch', async () => {
    const f = await fixture()
    const changed = changedBaseline('RACE')
    const context = editor.captureFilesystemReload()
    const newer = structuredClone(f.draft)
    newer.layer_names = ['newer alias']
    const put = IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(function (this: IDBObjectStore, value: unknown, key?: IDBValidKey) {
      const request = put.call(this, value as never, key)
      editor.updateKeymap(newer)
      return request
    })
    expect(await editor.reloadFilesystemKeyboard(changed, context, true)).toBe(false)
    expect(editor.baselineKeymap).toEqual(f.baseline.keymap)
    expect(editor.draftKeymap).toEqual(newer)
    expect(editor.filesystemRecovery!.baseline.source).toBe(f.baseline.source)
    expect(editor.isDirty).toBe(true)
    expect(editor.undoStack).not.toEqual([])
    const row = (await loadStoredDraft(editor.currentDraftIdentity()!))!
    expect(row).toEqual(context.row)
    expect(await editor.flushFilesystemDraft()).toBe(true)
    expect((await loadStoredDraft(editor.currentDraftIdentity()!))!.draftKeymap).toEqual(newer)
  })
})
