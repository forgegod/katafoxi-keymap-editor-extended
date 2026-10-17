import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildFilesystemKeymap, parseDtsKeymap, parseKeyBinding, parseKeymap } from '@keymap-editor/keymap-core'
import { editor } from './editor.svelte'
import { loadStoredDraft, saveStoredDraft } from './draft-storage'
import * as draftStorage from './draft-storage'
import { saveFilesystemKeymap } from './filesystem-save'
import * as filesystemSave from './filesystem-save'
import type { FilesystemAccessEnv, FilesystemDirectoryHandleLike, FilesystemFileHandleLike } from './filesystem-access'
import type { FilesystemBaseline } from './draft-storage'

const source = '/* untouched */\n#include <behaviors.dtsi>\n/ { keymap { compatible = "zmk,keymap"; base { bindings = <&kp A>; }; }; };\n'
const bytes = (text: string) => Array.from(new TextEncoder().encode(text))
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}

async function fixture(options: { directory?: boolean; geometry?: boolean } = {}) {
  const disk = { bytes: bytes(source) }
  const read = vi.fn(async () => {
    const snapshot = [...disk.bytes]
    return { name: 'a.keymap', size: snapshot.length, lastModified: 0, arrayBuffer: async () => new Uint8Array(snapshot).buffer }
  })
  const accepted: FilesystemFileHandleLike = {
    kind: 'file', name: 'a.keymap', getFile: read,
    isSameEntry: async other => other === accepted || other === picked,
    createWritable: vi.fn(async () => { throw new Error('Never write the accepted/discovery handle') })
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
  const geometryDisk = { bytes: bytes('{"layouts":{"LAYOUT":{"layout":[{"x":0,"y":0}]}}}') }
  const geometry: FilesystemFileHandleLike = { ...accepted, name: 'a.json', isSameEntry: async other => other === geometry, getFile: vi.fn(async () => ({
    name: 'a.json', size: geometryDisk.bytes.length, lastModified: 0,
    arrayBuffer: async () => new Uint8Array(geometryDisk.bytes).buffer
  })) }
  const directory: FilesystemDirectoryHandleLike = { kind: 'directory', name: 'config', entries: async function* () {},
    getFileHandle: vi.fn(async (name: string) => name === 'a.keymap' ? accepted : geometry),
    createWritable: vi.fn(async () => { throw new Error('Never write directory') }) }
  const baseline: FilesystemBaseline = { bytes: bytes(source), source, keymap: parseKeymap(parseDtsKeymap(source)), layout: [{ x: 0, y: 0, row: 0, col: 0 }],
    route: options.directory ? { kind: 'directory', entryName: 'a.keymap' } : { kind: 'file' },
    ...(options.geometry ? { geometry: { name: 'a.json', bytes: [...geometryDisk.bytes] } } : {}) }
  const documentId = `fs:1:${crypto.randomUUID()}`
  await editor.selectKeyboard({ source: 'filesystem', filesystem: { documentId, baseline } })
  const draft = structuredClone(baseline.keymap)
  draft.layers[0][0] = parseKeyBinding('&kp B')
  editor.updateKeymap(draft)
  return { disk, read, accepted, picked, stream, env, baseline, draft, directory, geometry, geometryDisk,
    handles: { documentId, file: accepted, ...(options.directory ? { directory } : {}), ...(options.geometry ? { geometry } : {}) } }
}

afterEach(async () => { await editor._draftWrites; editor.resetForTests(); vi.restoreAllMocks() })

describe('filesystem one-file save domain', () => {
  it('exposes Grant access only for the same prepared draft after a prompt outcome', async () => {
    const f = await fixture()
    expect(filesystemSave.canGrantFilesystemSaveAccess).toBeTypeOf('function')
    expect(filesystemSave.canGrantFilesystemSaveAccess(editor)).toBe(false)
    vi.mocked(f.picked.queryPermission!).mockResolvedValue('prompt')
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(false)
    expect(filesystemSave.canGrantFilesystemSaveAccess(editor)).toBe(true)
    expect(f.picked.requestPermission).not.toHaveBeenCalled()
    editor.renameLayer(0, 'New draft')
    expect(filesystemSave.canGrantFilesystemSaveAccess(editor)).toBe(false)
    expect(await filesystemSave.grantFilesystemSaveAccess(editor)).toBe(false)
    expect(f.picked.requestPermission).not.toHaveBeenCalled()
  })
  it.each(['retained', 'storage-failure'] as const)('keeps committed preparation retirement authoritative with newer work: %s', async followUp => {
    const f = await fixture()
    f.env.showOpenFilePicker = vi.fn(async () => { throw new DOMException('cancel', 'AbortError') })
    const save = draftStorage.saveStoredDraft
    let retired = false
    let newer: typeof f.draft
    let layer: ReturnType<typeof editor._storedLayerOperation>
    const persistence = vi.spyOn(draftStorage, 'saveStoredDraft').mockImplementation(async (...args) => {
      if (retired && followUp === 'storage-failure') throw new Error('quota after retirement')
      await save(...args)
      if (!retired && !args[5]?.attempt) {
        retired = true
        editor.renameLayer(0, 'Newer local alias')
        newer = structuredClone(editor.draftKeymap!)
        layer = editor._storedLayerOperation()
      }
    })
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(false)
    expect(retired).toBe(true)
    expect(editor.filesystemRecovery!.attempt).toBeUndefined()
    expect(editor.hasPendingFirmwareRecovery).toBe(false)
    expect(editor.draftKeymap).toEqual(newer!)
    expect(editor._storedLayerOperation()).toEqual(layer!)
    expect(editor.isDirty).toBe(true)
    expect(f.picked.createWritable).not.toHaveBeenCalled()
    if (followUp === 'storage-failure') {
      expect(editor.saveNotice?.messages.join(' ')).toMatch(/newer edits.*memory/i)
      expect(await editor.retainWorkForTransition()).toBe(false)
    }
    persistence.mockRestore()
    expect(await editor.flushFilesystemDraft()).toBe(true)
    const row = (await loadStoredDraft(editor.currentDraftIdentity()!))!
    expect(row.filesystem!.attempt).toBeUndefined()
    expect(row.draftKeymap).toEqual(newer!)
    expect(row.layerOperation).toEqual(layer!)
    editor.resetForTests()
    await editor.selectKeyboard({ source: 'filesystem', filesystem: { documentId: f.handles.documentId, baseline: f.baseline } })
    expect(await editor.restoreFilesystemDraft()).toBe(true)
    expect(editor.draftKeymap).toEqual(newer!)
    expect(editor._storedLayerOperation()).toEqual(layer!)
    expect(editor.hasPendingFirmwareRecovery).toBe(false)
    f.env.showOpenFilePicker = vi.fn(async () => [f.picked])
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(true)
  })
  it('does not invent pending recovery when reconciliation has no retained attempt', async () => {
    const f = await fixture()
    expect(await filesystemSave.reconcileFilesystemSave(editor, f.env, f.handles, () => true)).toBe(false)
    expect(editor.hasPendingFirmwareRecovery).toBe(false)
    expect(f.env.showOpenFilePicker).not.toHaveBeenCalled()
  })
  it('keeps interrupted preparation pending when intended-byte confirmation is declined in the original session', async () => {
    const f = await fixture()
    const attempt = editor.captureFilesystemSave()
    await editor.retainFilesystemAttempt(attempt)
    f.disk.bytes = [...attempt.bytes]
    const row = await loadStoredDraft(editor.currentDraftIdentity()!)
    expect(await filesystemSave.reconcileFilesystemSave(editor, f.env, f.handles, () => false)).toBe(false)
    expect(editor.hasPendingFirmwareRecovery).toBe(true)
    expect(await loadStoredDraft(editor.currentDraftIdentity()!)).toEqual(row)
    expect(f.picked.createWritable).not.toHaveBeenCalled()
  })
  it.each(['prepared', 'write-possible', 'legacy'] as const)('reconciles intended bytes from a restored %s attempt under the new session fence', async stage => {
    const f = await fixture({ directory: true, geometry: true })
    editor.addLayer()
    let attempt = editor.captureFilesystemSave()
    await editor.retainFilesystemAttempt(attempt)
    if (stage === 'write-possible') attempt = (await editor.markFilesystemWritePossible(attempt))!
    editor.renameLayer(1, 'unsent name')
    await editor.retainFilesystemFailure(attempt)
    const identity = editor.currentDraftIdentity()!
    if (stage === 'legacy') {
      const row = (await loadStoredDraft(identity))!
      const recovery = structuredClone(row.filesystem!)
      delete recovery.attempt!.version
      delete recovery.attempt!.stage
      await saveStoredDraft(identity, row.draftKeymap, row.layerOperation, undefined, { expected: row, isCurrent: () => true }, recovery)
    }
    f.disk.bytes = [...attempt.bytes]
    editor.resetForTests()
    await editor.selectKeyboard({ source: 'filesystem', filesystem: { documentId: f.handles.documentId, baseline: f.baseline } })
    await editor.restoreFilesystemDraft()
    expect(editor._selectGeneration).not.toBe(attempt.session)
    const confirm = vi.fn(() => true)
    expect(await filesystemSave.reconcileFilesystemSave(editor, f.env, f.handles, confirm)).toBe(true)
    expect(confirm.mock.calls).toHaveLength(1)
    expect(editor.draftKeymap!.layer_names![1]).toBe('unsent name')
    expect(editor.baselineKeymap!.layer_names![1]).toBe('Layer #1')
    expect(editor.hasPendingFirmwareRecovery).toBe(false)
    expect(editor.isDirty).toBe(true)
    expect(f.picked.createWritable).not.toHaveBeenCalled()
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(true)
    expect(f.env.showOpenFilePicker).toHaveBeenCalledTimes(2)
  })
  it('refuses concurrent reconciliation and leaves another stored attempt untouched during pre-stream cleanup', async () => {
    const f = await fixture()
    let competing: Awaited<ReturnType<typeof loadStoredDraft>>
    vi.mocked(f.picked.queryPermission!).mockImplementationOnce(async () => {
      const identity = editor.currentDraftIdentity()!
      const row = (await loadStoredDraft(identity))!
      const recovery = structuredClone(row.filesystem!)
      recovery.attempt!.id = 'other-attempt'
      await saveStoredDraft(identity, row.draftKeymap, row.layerOperation, undefined, { expected: row, isCurrent: () => true }, recovery)
      competing = await loadStoredDraft(identity)
      return 'denied'
    })
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(false)
    expect(editor.hasPendingFirmwareRecovery).toBe(true)
    expect(await loadStoredDraft(editor.currentDraftIdentity()!)).toEqual(competing!)
    const pick = deferred<FilesystemFileHandleLike[]>()
    f.env.showOpenFilePicker = vi.fn(() => pick.promise)
    const reconciling = filesystemSave.reconcileFilesystemSave(editor, f.env, f.handles, () => true)
    expect(await filesystemSave.reconcileFilesystemSave(editor, f.env, f.handles, () => true)).toBe(false)
    expect(f.env.showOpenFilePicker).toHaveBeenCalledTimes(1)
    pick.resolve([f.picked])
    expect(await reconciling).toBe(false)
    expect(await loadStoredDraft(editor.currentDraftIdentity()!)).toEqual(competing!)
    expect(f.picked.createWritable).not.toHaveBeenCalled()
  })
  it('refuses invalid captured layer metadata before opening any stream', async () => {
    const f = await fixture()
    editor.addLayer()
    editor.layerOperationSnapshot = { ...editor.layerOperationSnapshot!, ids: ['duplicate', 'duplicate'] }
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(false)
    expect(f.picked.createWritable).not.toHaveBeenCalled()
    expect(editor.filesystemRecovery!.baseline).toEqual(f.baseline)
  })
  it.each(['code', 'bytes', 'sent', 'baseline', 'layer', 'stage'] as const)('refuses a malformed retained %s rather than adopting its intended bytes', async field => {
    const f = await fixture()
    const attempt = editor.captureFilesystemSave()
    await editor.retainFilesystemAttempt(attempt)
    const identity = editor.currentDraftIdentity()!
    const row = (await loadStoredDraft(identity))!
    const recovery = structuredClone(row.filesystem!)
    const malformed = recovery.attempt!
    if (field === 'code') { malformed.code = source.replace('&kp A', '&kp Z'); malformed.bytes = bytes(malformed.code) }
    if (field === 'bytes') malformed.bytes = [...f.baseline.bytes]
    if (field === 'sent') malformed.sent.layers[0][0] = parseKeyBinding('&kp Z')
    if (field === 'baseline') malformed.baseline.geometry = { name: 'unproved.json', bytes: [] }
    if (field === 'layer') malformed.layer!.snapshot.ids = []
    if (field === 'stage') Object.assign(malformed, { version: 9, stage: 'future' })
    await saveStoredDraft(identity, row.draftKeymap, row.layerOperation, undefined, { expected: row, isCurrent: () => true }, recovery)
    f.disk.bytes = [...malformed.bytes]
    editor.resetForTests()
    await editor.selectKeyboard({ source: 'filesystem', filesystem: { documentId: f.handles.documentId, baseline: f.baseline } })
    await editor.restoreFilesystemDraft()
    const retained = await loadStoredDraft(identity)
    expect(await filesystemSave.reconcileFilesystemSave(editor, f.env, f.handles, () => true)).toBe(false)
    expect(await loadStoredDraft(identity)).toEqual(retained)
    expect(editor.hasPendingFirmwareRecovery).toBe(true)
    expect(f.picked.createWritable).not.toHaveBeenCalled()
  })
  it.each(['original', 'intended'] as const)('keeps the %s attempt on reconciliation transaction failure', async diskState => {
    const f = await fixture()
    const attempt = editor.captureFilesystemSave()
    await editor.retainFilesystemAttempt(attempt)
    if (diskState === 'intended') f.disk.bytes = [...attempt.bytes]
    const row = await loadStoredDraft(editor.currentDraftIdentity()!)
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => { throw new Error('quota at put') })
    expect(await filesystemSave.reconcileFilesystemSave(editor, f.env, f.handles, () => true)).toBe(false)
    expect(await loadStoredDraft(editor.currentDraftIdentity()!)).toEqual(row)
    expect(editor.hasPendingFirmwareRecovery).toBe(true)
    expect(f.picked.createWritable).not.toHaveBeenCalled()
  })
  it.each(['cancel', 'denied', 'preflight'] as const)('recovers a failed real pre-stream retirement after %s through reload and reconciliation', async failure => {
    const f = await fixture()
    const picker = f.env.showOpenFilePicker
    if (failure === 'cancel') f.env.showOpenFilePicker = async () => { throw new DOMException('cancel', 'AbortError') }
    if (failure === 'denied') vi.mocked(f.picked.queryPermission!).mockResolvedValue('denied')
    if (failure === 'preflight') f.disk.bytes.push(32)
    const save = draftStorage.saveStoredDraft
    vi.spyOn(draftStorage, 'saveStoredDraft').mockImplementation(async (...args) => {
      if (!args[5]?.attempt) throw new Error('cleanup storage failure')
      return save(...args)
    })
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(false)
    const identity = editor.currentDraftIdentity()!
    const row = await loadStoredDraft(identity)
    expect(row!.filesystem!.attempt).toMatchObject({ version: 1, stage: 'prepared' })
    expect(editor.hasPendingFirmwareRecovery).toBe(true)
    await editor.flushPendingPersist()
    expect(await loadStoredDraft(identity)).toEqual(row)
    vi.restoreAllMocks()
    f.env.showOpenFilePicker = picker
    vi.mocked(f.picked.queryPermission!).mockResolvedValue('granted')
    f.disk.bytes = [...f.baseline.bytes]
    editor.resetForTests()
    await editor.selectKeyboard({ source: 'filesystem', filesystem: { documentId: f.handles.documentId, baseline: f.baseline } })
    await editor.restoreFilesystemDraft()
    expect(await filesystemSave.reconcileFilesystemSave(editor, f.env, f.handles, () => true)).toBe(true)
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(true)
  })
  it('keeps the durable possible-write/invocation gap unresolved until explicit reconciliation', async () => {
    const f = await fixture()
    const mark = editor.markFilesystemWritePossible.bind(editor)
    vi.spyOn(editor, 'markFilesystemWritePossible').mockImplementationOnce(async attempt => {
      const marked = await mark(attempt)
      editor.resetForTests()
      return marked
    })
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(false)
    expect(f.picked.createWritable).not.toHaveBeenCalled()
    await editor.selectKeyboard({ source: 'filesystem', filesystem: { documentId: f.handles.documentId, baseline: f.baseline } })
    expect(editor.filesystemRecovery!.attempt!.stage).toBe('write-possible')
    await editor.restoreFilesystemDraft()
    expect(editor.hasPendingFirmwareRecovery).toBe(true)
    expect(await filesystemSave.reconcileFilesystemSave(editor, f.env, f.handles, () => true)).toBe(true)
    expect(editor.hasPendingFirmwareRecovery).toBe(false)
  })
  it('confirms equal original/intended bytes without crediting the failed call', async () => {
    const f = await fixture()
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(true)
    editor.renameLayer(0, 'Browser alias')
    const attempt = editor.captureFilesystemSave()
    expect(attempt.bytes).toEqual(attempt.baseline.bytes)
    await editor.retainFilesystemAttempt(attempt)
    const confirm = vi.fn(() => true)
    expect(await filesystemSave.reconcileFilesystemSave(editor, f.env, f.handles, confirm)).toBe(true)
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(editor.isDirty).toBe(false)
    expect(editor.filesystemVerifiedSave).toBe(false)
    expect(editor.saveNotice?.messages.join(' ')).toContain('verified current bytes without writing')
    expect(f.picked.createWritable).toHaveBeenCalledTimes(1)
  })
  describe.each([false, true])('explicit no-write reconciliation (directory=%s)', directory => {
    it.each(['third-bytes', 'unreadable', 'wrong-file', 'geometry-changed', 'geometry-missing', 'geometry-unreadable', 'cancel', 'decline', 'storage', 'competing-attempt', 'stale-draft', 'stale-session'] as const)('protects intended-byte recovery on %s', async failure => {
      const f = await fixture({ directory, geometry: true })
      const attempt = editor.captureFilesystemSave()
      expect(await editor.retainFilesystemAttempt(attempt)).toBe(true)
      f.disk.bytes = [...attempt.bytes]
      editor.resetForTests()
      await editor.selectKeyboard({ source: 'filesystem', filesystem: { documentId: f.handles.documentId, baseline: f.baseline } })
      await editor.restoreFilesystemDraft()
      const identity = editor.currentDraftIdentity()!
      let row = (await loadStoredDraft(identity))!
      if (failure === 'third-bytes') f.disk.bytes.push(32)
      if (failure === 'unreadable') f.picked.getFile = async () => { throw new Error('read failed') }
      if (failure === 'wrong-file') f.picked.isSameEntry = async () => false
      if (failure === 'geometry-changed') f.geometryDisk.bytes.push(32)
      if (failure === 'geometry-missing') delete f.handles.geometry
      if (failure === 'geometry-unreadable') f.geometry.getFile = async () => { throw new Error('geometry vanished') }
      if (failure === 'cancel') f.env.showOpenFilePicker = async () => { throw new DOMException('cancel', 'AbortError') }
      const confirm = async () => {
        if (failure === 'decline') return false
        if (failure === 'storage') vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(() => { throw new Error('quota') })
        if (failure === 'stale-draft') editor.draftKeymap = { ...f.draft, layer_names: ['concurrent'] }
        if (failure === 'stale-session') { editor.resetForTests(); editor.saving = true }
        if (failure === 'competing-attempt') {
          const competing = structuredClone(row.filesystem!)
          competing.attempt!.id = 'competing-attempt'
          await saveStoredDraft(identity, row.draftKeymap, row.layerOperation, undefined, { expected: row, isCurrent: () => true }, competing)
          row = (await loadStoredDraft(identity))!
        }
        return true
      }
      expect(await filesystemSave.reconcileFilesystemSave(editor, f.env, f.handles, confirm)).toBe(false)
      vi.restoreAllMocks()
      expect(await loadStoredDraft(identity)).toEqual(row)
      expect(f.picked.createWritable).not.toHaveBeenCalled()
      expect(f.picked.requestPermission).not.toHaveBeenCalled()
      if (failure === 'stale-session') expect(editor.saving).toBe(true)
      else expect(editor.hasPendingFirmwareRecovery).toBe(true)
    })
    it.each(['original', 'intended'] as const)('preserves declined recovery with a clean visible model while reconciling %s', async diskState => {
      const f = await fixture({ directory })
      const attempt = editor.captureFilesystemSave()
      expect(await editor.retainFilesystemAttempt(attempt)).toBe(true)
      const newer = structuredClone(f.draft)
      newer.layer_names = ['newer name']
      editor.updateKeymap(newer)
      expect(await editor.retainFilesystemFailure(attempt)).toBe(true)
      if (diskState === 'intended') f.disk.bytes = [...attempt.bytes]
      editor.resetForTests()
      await editor.selectKeyboard({ source: 'filesystem', filesystem: { documentId: f.handles.documentId, baseline: f.baseline } })
      expect(editor.isDirty).toBe(false)
      expect(await filesystemSave.reconcileFilesystemSave(editor, f.env, f.handles, () => true)).toBe(true)
      expect(editor.hasPendingFirmwareRecovery).toBe(true)
      expect(editor.isDirty).toBe(false)
      await editor.flushPendingPersist()
      const row = (await loadStoredDraft(editor.currentDraftIdentity()!))!
      expect(row.draftKeymap).toEqual(newer)
      expect(row.filesystem!.attempt).toBeUndefined()
      expect(await editor.restoreFilesystemDraft()).toBe(true)
      expect(editor.draftKeymap).toEqual(newer)
      expect(editor.hasPendingFirmwareRecovery).toBe(false)
      expect(f.picked.createWritable).not.toHaveBeenCalled()
    })
    it.each(['prepared', 'write-possible', 'legacy'] as const)('retires original bytes after reload/Restore of %s and requires fresh Save access', async stage => {
      const f = await fixture({ directory, geometry: true })
      let attempt = editor.captureFilesystemSave()
      expect(await editor.retainFilesystemAttempt(attempt)).toBe(true)
      if (stage === 'write-possible') attempt = (await editor.markFilesystemWritePossible(attempt))!
      if (stage === 'legacy') {
        const row = (await loadStoredDraft(editor.currentDraftIdentity()!))!
        delete row.filesystem!.attempt!.stage
        delete row.filesystem!.attempt!.version
        await saveStoredDraft(editor.currentDraftIdentity()!, row.draftKeymap, row.layerOperation, undefined,
          { expected: editor._filesystemRow, isCurrent: () => true }, row.filesystem)
      }
      editor.resetForTests()
      await editor.selectKeyboard({ source: 'filesystem', filesystem: { documentId: f.handles.documentId, baseline: f.baseline } })
      expect(await editor.restoreFilesystemDraft()).toBe(true)
      expect(editor.hasPendingFirmwareRecovery).toBe(true)
      expect(() => editor.captureFilesystemSave()).toThrow()
      expect(filesystemSave.reconcileFilesystemSave).toBeTypeOf('function')
      const confirm = vi.fn(() => true)
      expect(await filesystemSave.reconcileFilesystemSave(editor, f.env, f.handles, confirm)).toBe(true)
      expect(confirm).not.toHaveBeenCalled()
      expect(editor.filesystemRecovery!.baseline).toEqual(f.baseline)
      expect(editor.filesystemRecovery!.attempt).toBeUndefined()
      expect(editor.draftKeymap).toEqual(f.draft)
      expect(editor.hasPendingFirmwareRecovery).toBe(false)
      expect(f.picked.createWritable).not.toHaveBeenCalled()
      expect(f.picked.requestPermission).not.toHaveBeenCalled()
      expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(true)
      expect(f.env.showOpenFilePicker).toHaveBeenCalledTimes(2)
    })
    it('confirms intended bytes after close-after-write failure, retaining newer aliases and history without rewrite', async () => {
      const f = await fixture({ directory, geometry: true })
      editor.addLayer()
      const sent = structuredClone(editor.draftKeymap!)
      f.stream.close.mockImplementation(async () => {
        f.disk.bytes = Array.from(f.stream.write.mock.calls[0][0])
        editor.renameLayer(1, 'Newer alias')
        throw new Error('close failed after byte replacement')
      })
      expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(false)
      const attempt = editor.filesystemRecovery!.attempt!
      const history = editor.undoStack
      const confirm = vi.fn(() => true)
      expect(filesystemSave.reconcileFilesystemSave).toBeTypeOf('function')
      expect(await filesystemSave.reconcileFilesystemSave(editor, f.env, f.handles, confirm)).toBe(true)
      expect(confirm).toHaveBeenCalledTimes(1)
      expect(editor.baselineKeymap!.layer_names).toEqual(sent.layer_names)
      expect(editor.draftKeymap!.layer_names![1]).toBe('Newer alias')
      expect(editor.undoStack).toBe(history)
      expect(editor.isDirty).toBe(true)
      expect(editor.saveNotice?.messages.join(' ')).toMatch(/reconciled|verified current bytes/i)
      expect(editor.saveNotice?.messages.join(' ')).not.toContain('Firmware saved')
      expect(f.picked.createWritable).toHaveBeenCalledTimes(1)
      const row = (await loadStoredDraft(editor.currentDraftIdentity()!))!
      expect(row.filesystem!.baseline.keymap).toEqual(parseKeymap(parseDtsKeymap(attempt.code, attempt.sent)))
      expect(row.filesystem!.attempt).toBeUndefined()
      editor.resetForTests()
      await editor.selectKeyboard({ source: 'filesystem', filesystem: { documentId: f.handles.documentId, baseline: f.baseline } })
      expect(await editor.restoreFilesystemDraft()).toBe(true)
      expect(editor.draftKeymap!.layer_names![1]).toBe('Newer alias')
      expect(editor.isDirty).toBe(true)
    })
  })
  it('refuses stale directory entry proof during reconciliation', async () => {
    const f = await fixture({ directory: true, geometry: true })
    const attempt = editor.captureFilesystemSave()
    await editor.retainFilesystemAttempt(attempt)
    f.disk.bytes = [...attempt.bytes]
    const row = await loadStoredDraft(editor.currentDraftIdentity()!)
    expect(await filesystemSave.reconcileFilesystemSave(editor, f.env, f.handles, () => {
      vi.mocked(f.directory.getFileHandle!).mockResolvedValue({ ...f.accepted, isSameEntry: async () => false })
      return true
    })).toBe(false)
    expect(await loadStoredDraft(editor.currentDraftIdentity()!)).toEqual(row)
    expect(f.picked.createWritable).not.toHaveBeenCalled()
  })
  it.each(['original', 'intended'] as const)('preserves edits arriving during the %s reconciliation transaction', async diskState => {
    const f = await fixture()
    const attempt = editor.captureFilesystemSave()
    await editor.retainFilesystemAttempt(attempt)
    if (diskState === 'intended') f.disk.bytes = [...attempt.bytes]
    const newer = structuredClone(f.draft)
    newer.layer_names = ['concurrent']
    const put = IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(function (this: IDBObjectStore, value, key) {
      const request = put.call(this, value, key)
      editor.updateKeymap(newer)
      return request
    })
    expect(await filesystemSave.reconcileFilesystemSave(editor, f.env, f.handles, () => true)).toBe(true)
    expect(editor.draftKeymap).toEqual(newer)
    expect(editor.filesystemRecovery!.attempt).toBeUndefined()
    expect((await loadStoredDraft(editor.currentDraftIdentity()!))!.draftKeymap).toEqual(newer)
    expect(editor.hasPendingFirmwareRecovery).toBe(false)
    expect(editor.isDirty).toBe(true)
    expect(f.picked.createWritable).not.toHaveBeenCalled()
  })
  it.each(['false', 'throw'] as const)('keeps pending protection when pre-stream cleanup returns %s', async failure => {
    const f = await fixture()
    f.env.showOpenFilePicker = vi.fn(async () => { throw new DOMException('cancel', 'AbortError') })
    const cleanup = vi.spyOn(editor, 'retainFilesystemFailure')
    if (failure === 'false') cleanup.mockResolvedValue(false)
    else cleanup.mockRejectedValue(new Error('storage unavailable'))
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(false)
    expect((await loadStoredDraft(editor.currentDraftIdentity()!))?.filesystem?.attempt).toBeDefined()
    expect(editor.hasPendingFirmwareRecovery).toBe(true)
    expect(editor.saveNotice?.messages.join(' ')).toMatch(/recovery cleanup/i)
    expect(editor.saveNotice?.messages.join(' ')).not.toContain('draft remains editable')
    expect(f.picked.createWritable).not.toHaveBeenCalled()
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(false)
  })
  it('commits a versioned write-possible stage before stream invocation', async () => {
    const f = await fixture()
    vi.mocked(f.picked.createWritable!).mockImplementation(async () => {
      const attempt = (await loadStoredDraft(editor.currentDraftIdentity()!))!.filesystem!.attempt!
      expect(attempt).toMatchObject({ version: 1, stage: 'write-possible' })
      return f.stream
    })
    expect(editor.captureFilesystemSave()).toMatchObject({ version: 1, stage: 'prepared' })
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(true)
  })
  it.each(['add', 'rename', 'collision'] as const)('keeps a source-canonical receipt and browser layer metadata after %s, reopen and second Save', async operation => {
    const f = await fixture()
    if (operation === 'collision') {
      editor.resetForTests()
      f.baseline.source = source.replace('base {', 'layer_1 {')
      f.baseline.bytes = bytes(f.baseline.source)
      f.baseline.keymap = parseKeymap(parseDtsKeymap(f.baseline.source))
      f.disk.bytes = [...f.baseline.bytes]
      f.handles.documentId = `fs:1:${crypto.randomUUID()}`
      await editor.selectKeyboard({ source: 'filesystem', filesystem: { documentId: f.handles.documentId, baseline: f.baseline } })
    }
    if (operation === 'rename') editor.renameLayer(0, 'My base')
    else editor.addLayer()
    const names = [...editor.draftKeymap!.layer_names!]
    const ids = [...editor.layerOperationSnapshot!.ids]
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(true)
    const row = (await loadStoredDraft(editor.currentDraftIdentity()!))!
    expect(row.filesystem!.baseline.keymap).toEqual(parseKeymap(parseDtsKeymap(row.filesystem!.baseline.source, row.filesystem!.baseline.keymap)))
    expect(editor.draftKeymap!.layer_names).toEqual(names)
    expect(editor.isDirty).toBe(false)
    editor.undo()
    expect(editor.isDirty).toBe(true)
    editor.redo()
    expect(editor.isDirty).toBe(false)
    editor.resetForTests()
    await editor.selectKeyboard({ source: 'filesystem', filesystem: { documentId: f.handles.documentId, baseline: f.baseline } })
    expect(editor.hasPendingFirmwareRecovery).toBe(false)
    expect(editor.draftKeymap!.layer_names).toEqual(names)
    expect(editor.layerOperationSnapshot!.ids).toEqual(ids)
    const next = structuredClone(editor.draftKeymap!)
    next.layers[0][0] = parseKeyBinding('&kp C')
    editor.updateKeymap(next)
    await editor.flushPendingPersist()
    editor.resetForTests()
    await editor.selectKeyboard({ source: 'filesystem', filesystem: { documentId: f.handles.documentId, baseline: f.baseline } })
    expect(await editor.restoreFilesystemDraft()).toBe(true)
    expect(editor.layerOperationSnapshot!.ids).toEqual(ids)
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(true)
    expect(editor.filesystemRecovery!.baseline.source).toContain('/* untouched */')
    expect(editor.draftKeymap!.layer_names).toEqual(names)
    expect(editor.isDirty).toBe(false)
  })
  it.each(['cancel', 'denied', 'serialization', 'external-change'] as const)('keeps a pre-stream %s editable and retryable', async failure => {
    const f = await fixture()
    const picker = f.env.showOpenFilePicker
    if (failure === 'cancel') f.env.showOpenFilePicker = async () => { throw new DOMException('cancelled', 'AbortError') }
    if (failure === 'denied') vi.mocked(f.picked.queryPermission!).mockResolvedValue('denied')
    if (failure === 'serialization') editor.updateKeymap({ ...f.draft, layers: [[...f.draft.layers[0], parseKeyBinding('&kp C')]] })
    if (failure === 'external-change') f.disk.bytes.push(32)
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(false)
    expect(f.picked.createWritable).not.toHaveBeenCalled()
    expect(editor.hasPendingFirmwareRecovery).toBe(false)
    expect(editor.saveNotice?.messages.join(' ')).not.toMatch(/not verified|may have changed/)
    const row = await loadStoredDraft(editor.currentDraftIdentity()!)
    expect(row?.filesystem?.attempt).toBeUndefined()
    expect(row?.draftKeymap).toEqual(editor.draftKeymap)
    f.env.showOpenFilePicker = picker
    vi.mocked(f.picked.queryPermission!).mockResolvedValue('granted')
    f.disk.bytes = [...f.baseline.bytes]
    editor.updateKeymap(f.draft)
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(true)
  })
  it('retains a serialization-refused draft without any picker or file write', async () => {
    const f = await fixture()
    const invalid = structuredClone(f.draft)
    invalid.layers[0].push(parseKeyBinding('&kp C'))
    editor.updateKeymap(invalid)
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(false)
    expect(f.env.showOpenFilePicker).not.toHaveBeenCalled()
    expect(f.picked.createWritable).not.toHaveBeenCalled()
    expect((await loadStoredDraft(editor.currentDraftIdentity()!))?.draftKeymap).toEqual(invalid)
    expect(editor.filesystemRecovery?.baseline).toEqual(f.baseline)
  })
  it.each(['changed-bytes', 'directory-replaced', 'denied', 'stale-session'] as const)('fails closed after explicit grant: %s', async failure => {
    const f = await fixture({ directory: true, geometry: true })
    vi.mocked(f.picked.queryPermission!).mockResolvedValue('prompt')
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(false)
    vi.mocked(f.picked.requestPermission!).mockImplementation(async () => {
      vi.mocked(f.picked.queryPermission!).mockResolvedValue('granted')
      if (failure === 'changed-bytes') f.disk.bytes.push(32)
      if (failure === 'directory-replaced') vi.mocked(f.directory.getFileHandle!).mockResolvedValue({ ...f.accepted, isSameEntry: async () => false })
      return failure === 'denied' ? 'denied' : 'granted'
    })
    if (failure === 'stale-session') editor.resetForTests()
    expect(await filesystemSave.grantFilesystemSaveAccess(editor)).toBe(false)
    expect(f.picked.createWritable).not.toHaveBeenCalled()
    expect(f.picked.requestPermission).toHaveBeenCalledTimes(failure === 'stale-session' ? 0 : 1)
    expect(await filesystemSave.grantFilesystemSaveAccess(editor)).toBe(false)
  })
  it('refuses a replaced directory geometry entry even while its old handle remains readable', async () => {
    const f = await fixture({ directory: true, geometry: true })
    vi.mocked(f.directory.getFileHandle!).mockImplementation(async name => name === 'a.keymap' ? f.accepted : { ...f.geometry, isSameEntry: async () => false })
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(false)
    expect(f.picked.createWritable).not.toHaveBeenCalled()
  })
  it('continues a prompt only from a separate explicit grant action and repeats preflight', async () => {
    const f = await fixture()
    vi.mocked(f.picked.queryPermission!).mockResolvedValue('prompt')
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(false)
    expect(f.picked.requestPermission).not.toHaveBeenCalled()
    expect(f.picked.createWritable).not.toHaveBeenCalled()
    vi.mocked(f.picked.requestPermission!).mockImplementation(async () => {
      vi.mocked(f.picked.queryPermission!).mockResolvedValue('granted')
      return 'granted'
    })
    expect(filesystemSave.grantFilesystemSaveAccess).toBeTypeOf('function')
    const continuation = filesystemSave.grantFilesystemSaveAccess(editor)
    // Permission is invoked synchronously, not after a storage/identity await.
    expect(f.picked.requestPermission).toHaveBeenCalledTimes(1)
    expect(await continuation).toBe(true)
    expect(f.env.showOpenFilePicker).toHaveBeenCalledTimes(1)
    expect(editor.filesystemVerifiedSave).toBe(true)
    expect(await filesystemSave.grantFilesystemSaveAccess(editor)).toBe(false)
  })
  it('retains newer edits with the uncertain attempt after close failure', async () => {
    const f = await fixture()
    const next = structuredClone(f.draft)
    next.layers[0][0] = parseKeyBinding('&kp C')
    f.stream.close.mockImplementation(async () => {
      editor.updateKeymap(next)
      throw new Error('close failed')
    })
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(false)
    const row = await loadStoredDraft(editor.currentDraftIdentity()!)
    expect(row?.draftKeymap).toEqual(next)
    expect(row?.filesystem?.attempt?.sent).toEqual(f.draft)
    expect(row?.filesystem?.baseline).toEqual(f.baseline)
    expect(await editor.discardDraft()).toBe(true)
    await editor.flushPendingPersist()
    const discarded = (await loadStoredDraft(editor.currentDraftIdentity()!))!
    expect(discarded.filesystem).toEqual(row!.filesystem)
    expect(discarded.draftKeymap).toEqual(f.baseline.keymap)
    expect(discarded.layerOperation).toEqual(editor._storedLayerOperation())
    expect(editor.hasPendingFirmwareRecovery).toBe(true)
  })
  it('performs a second fresh picked save after reopening the verified baseline', async () => {
    const f = await fixture({ directory: true, geometry: true })
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(true)
    const first = editor.filesystemRecovery!.baseline.source
    editor.resetForTests()
    await editor.selectKeyboard({ source: 'filesystem', filesystem: { documentId: f.handles.documentId, baseline: f.baseline } })
    const next = JSON.parse(JSON.stringify(editor.draftKeymap!))
    next.layers[0][0] = parseKeyBinding('&kp C')
    editor.updateKeymap(next)
    const expected = buildFilesystemKeymap({ keymap: next, layout: f.baseline.layout, originalSource: first }).code
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(true)
    expect(f.env.showOpenFilePicker).toHaveBeenCalledTimes(2)
    expect(f.disk.bytes).toEqual(bytes(expected))
    expect(editor.filesystemRecovery?.baseline.source).toBe(expected)
    expect(f.geometry.createWritable).not.toHaveBeenCalled()
    expect(f.directory.createWritable).not.toHaveBeenCalled()
  })
  it('leaves host-only/clean firmware without a save attempt or false pending recovery', async () => {
    const f = await fixture()
    await editor.discardDraft()
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(false)
    expect(editor.hasPendingFirmwareRecovery).toBe(false)
    expect(f.env.showOpenFilePicker).not.toHaveBeenCalled()
  })
  it.each([{ outputs: ['a.keymap', 'b.keymap'] }, { sidecar: 'a.json' }, { host: 'host.json' }])('refuses extra write context %j before target I/O', async extra => {
    const f = await fixture()
    expect(await saveFilesystemKeymap(editor, f.env, { ...f.handles, ...extra })).toBe(false)
    expect(f.env.showOpenFilePicker).not.toHaveBeenCalled()
    expect(f.picked.createWritable).not.toHaveBeenCalled()
  })
  it.each(['cancel', 'wrong-file', 'prompt', 'denied', 'identity-error', 'read-error', 'retention-error'] as const)('preserves firmware on %s without automatic prompts or streams', async failure => {
    const f = await fixture()
    if (failure === 'cancel') f.env.showOpenFilePicker = vi.fn(async () => { throw new DOMException('cancelled', 'AbortError') })
    if (failure === 'wrong-file') f.picked.isSameEntry = async () => false
    if (failure === 'identity-error') f.picked.isSameEntry = async () => { throw new Error('lost handle') }
    if (failure === 'prompt' || failure === 'denied') vi.mocked(f.picked.queryPermission!).mockResolvedValue(failure)
    if (failure === 'read-error') f.picked.getFile = async () => { throw new Error('file vanished') }
    if (failure === 'retention-error') vi.spyOn(editor, 'retainFilesystemAttempt').mockResolvedValue(false)
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(false)
    expect(f.picked.createWritable).not.toHaveBeenCalled()
    expect(f.picked.requestPermission).not.toHaveBeenCalled()
    expect(editor.draftKeymap).toEqual(f.draft)
    expect(editor.filesystemRecovery?.baseline).toEqual(f.baseline)
    expect(editor.hasPendingFirmwareRecovery).toBe(false)
  })
  it('rechecks the retained row before opening a stream', async () => {
    const f = await fixture()
    let competitor: Awaited<ReturnType<typeof loadStoredDraft>>
    vi.mocked(f.picked.queryPermission!).mockImplementationOnce(async () => {
      const identity = editor.currentDraftIdentity()!
      const row = (await loadStoredDraft(identity))!
      const other = structuredClone(f.draft)
      other.layers[0][0] = parseKeyBinding('&kp Z')
      await saveStoredDraft(identity, other, undefined, undefined, { expected: row, isCurrent: () => true }, row.filesystem)
      competitor = await loadStoredDraft(identity)
      return 'granted'
    })
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(false)
    expect(f.picked.createWritable).not.toHaveBeenCalled()
    expect(await loadStoredDraft(editor.currentDraftIdentity()!)).toEqual(competitor!)
  })
  it('does not miss a byte change made during the final permission query', async () => {
    const f = await fixture()
    vi.mocked(f.picked.queryPermission!).mockResolvedValueOnce('granted').mockImplementationOnce(async () => {
      f.disk.bytes.push(32)
      return 'granted'
    })
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(false)
    expect(f.picked.createWritable).not.toHaveBeenCalled()
  })
  it('checks the session again after asynchronous stream creation before write', async () => {
    const f = await fixture()
    vi.mocked(f.picked.createWritable!).mockImplementation(async () => {
      editor.resetForTests()
      editor.saving = true
      return f.stream
    })
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(false)
    expect(f.stream.write).not.toHaveBeenCalled()
    expect(f.stream.abort).toHaveBeenCalledTimes(1)
    expect(editor.saving).toBe(true)
  })
  it('refuses stale captured edits after permission preparation', async () => {
    const f = await fixture()
    vi.mocked(f.picked.queryPermission!).mockImplementationOnce(async () => {
      const next = structuredClone(f.draft)
      next.layers[0][0] = parseKeyBinding('&kp C')
      editor.updateKeymap(next)
      return 'granted'
    })
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(false)
    expect(f.picked.createWritable).not.toHaveBeenCalled()
    expect(editor.draftKeymap?.layers[0][0].params[0].value).toBe('C')
    expect(editor.filesystemRecovery?.baseline).toEqual(f.baseline)
  })
  it('blocks competing saves, transitions and Discard until close/readback settle; preserves newer edits', async () => {
    const f = await fixture()
    const closing = deferred<void>()
    const release = deferred<void>()
    f.stream.close.mockImplementation(async () => {
      closing.resolve()
      await release.promise
      f.disk.bytes = Array.from(f.stream.write.mock.calls[0][0])
    })
    const writing = saveFilesystemKeymap(editor, f.env, f.handles)
    await closing.promise
    try {
      expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(false)
      expect(f.env.showOpenFilePicker).toHaveBeenCalledTimes(1)
      await editor.selectKeyboard({ source: 'demo', keymap: f.baseline.keymap, layout: f.baseline.layout })
      expect(editor.source).toBe('filesystem')
      expect(await editor.discardDraft()).toBe(false)
      expect(editor.filesystemVerifiedSave).toBe(false)
      const next = structuredClone(f.draft)
      next.layers[0][0] = parseKeyBinding('&kp C')
      editor.updateKeymap(next)
      await editor.flushPendingPersist()
    } finally { release.resolve() }
    expect(await writing).toBe(true)
    expect(editor.baselineKeymap?.layers[0][0].params[0].value).toBe('B')
    expect(editor.draftKeymap?.layers[0][0].params[0].value).toBe('C')
    expect(editor.isDirty).toBe(true)
  })
  it.each(['create', 'write', 'close-before', 'close-after', 'readback', 'mismatch', 'receipt'] as const)('retains recovery without baseline acceptance on %s failure', async failure => {
    const f = await fixture()
    const fail = async () => { throw new Error('synthetic failure') }
    if (failure === 'create') f.picked.createWritable = vi.fn(fail)
    if (failure === 'write') f.stream.write.mockImplementation(fail)
    if (failure === 'close-before') f.stream.close.mockImplementation(fail)
    if (['close-after', 'readback', 'mismatch'].includes(failure)) f.stream.close.mockImplementation(async () => {
      f.disk.bytes = Array.from(f.stream.write.mock.calls[0][0])
      if (failure === 'close-after') throw new Error('close failed after replacement')
      if (failure === 'readback') f.picked.getFile = fail
      if (failure === 'mismatch') f.disk.bytes.push(32)
    })
    if (failure === 'receipt') vi.spyOn(editor, 'acceptFilesystemReceipt').mockResolvedValue(false)
    f.stream.abort.mockImplementation(fail)
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(false)
    expect(editor.filesystemRecovery?.baseline).toEqual(f.baseline)
    expect(editor.draftKeymap).toEqual(f.draft)
    expect(editor.hasPendingFirmwareRecovery).toBe(true)
    expect(editor.filesystemVerifiedSave).toBe(false)
    expect(editor.saveNotice?.messages.join(' ')).toContain('Save not verified; file may have changed')
    const row = await loadStoredDraft(editor.currentDraftIdentity()!)
    expect(row?.filesystem?.attempt?.sent).toEqual(f.draft)
    expect(await editor.discardDraft()).toBe(true)
    await editor.flushPendingPersist()
    const discarded = (await loadStoredDraft(editor.currentDraftIdentity()!))!
    expect(discarded.filesystem).toEqual(row!.filesystem)
    expect(discarded.draftKeymap).toEqual(f.baseline.keymap)
    expect(discarded.layerOperation).toEqual(editor._storedLayerOperation())
    expect(editor.hasPendingFirmwareRecovery).toBe(true)
  })
  it.each(['missing', 'changed', 'unreadable'] as const)('refuses a %s captured geometry dependency', async failure => {
    const f = await fixture({ geometry: true })
    if (failure === 'missing') delete f.handles.geometry
    if (failure === 'changed') f.geometryDisk.bytes.push(32)
    if (failure === 'unreadable') f.geometry.getFile = async () => { throw new Error('missing geometry') }
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(false)
    expect(f.picked.createWritable).not.toHaveBeenCalled()
    expect(editor.filesystemRecovery?.baseline).toEqual(f.baseline)
    expect((await loadStoredDraft(editor.currentDraftIdentity()!))?.draftKeymap).toEqual(f.draft)
    expect((await loadStoredDraft(editor.currentDraftIdentity()!))?.filesystem?.attempt).toBeUndefined()
  })
  it.each(['missing-context', 'pre-stream', 'readback'] as const)('requires exact directory identity at %s', async failure => {
    const f = await fixture({ directory: true })
    if (failure === 'missing-context') delete f.handles.directory
    const lookup = vi.mocked(f.directory.getFileHandle!)
    if (failure === 'pre-stream') lookup.mockResolvedValueOnce(f.accepted).mockResolvedValue({ ...f.accepted, isSameEntry: async () => false })
    if (failure === 'readback') f.stream.close.mockImplementation(async () => {
      f.disk.bytes = Array.from(vi.mocked(f.stream.write).mock.calls[0][0])
      lookup.mockResolvedValue({ ...f.accepted, isSameEntry: async () => false })
    })
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(false)
    expect(f.picked.createWritable).toHaveBeenCalledTimes(failure === 'readback' ? 1 : 0)
    expect(f.directory.createWritable).not.toHaveBeenCalled()
    expect(f.accepted.createWritable).not.toHaveBeenCalled()
    expect(editor.filesystemRecovery?.baseline).toEqual(f.baseline)
    expect(editor.hasPendingFirmwareRecovery).toBe(failure === 'readback')
  })
  it('revalidates permission after recovery and preflight instead of trusting the first grant', async () => {
    const f = await fixture()
    vi.mocked(f.picked.queryPermission!).mockResolvedValueOnce('granted').mockResolvedValue('denied')
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(false)
    expect(f.picked.createWritable).not.toHaveBeenCalled()
    expect(f.picked.requestPermission).not.toHaveBeenCalled()
  })
  it.each(['/* untouched */', '&kp A', '\n'])('blocks complete-byte external changes to %j despite unchanged size/time', async token => {
    const f = await fixture()
    f.disk.bytes = bytes(source.replace(token, token === '\n' ? ' ' : token.replace(/./, 'X')))
    expect(f.disk.bytes.length).toBe(f.baseline.bytes.length)
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(false)
    expect(f.picked.createWritable).not.toHaveBeenCalled()
    expect(editor.filesystemRecovery?.baseline).toEqual(f.baseline)
    expect(editor.draftKeymap).toEqual(f.draft)
    expect(editor.hasPendingFirmwareRecovery).toBe(false)
    expect(editor.saveNotice?.messages.join(' ')).toContain('preflight')
    expect((await loadStoredDraft(editor.currentDraftIdentity()!))?.draftKeymap).toEqual(f.draft)
    expect((await loadStoredDraft(editor.currentDraftIdentity()!))?.filesystem?.attempt).toBeUndefined()
  })
  it('writes only the fresh picked handle, closes and reads back before accepting a core-spliced baseline', async () => {
    const f = await fixture()
    const expected = buildFilesystemKeymap({ keymap: f.draft, layout: f.baseline.layout, originalSource: source }).code
    const publish = vi.spyOn(editor, 'applyPublished')
    const host = vi.spyOn(editor, 'acceptHostRepoBaseline')
    expect(await saveFilesystemKeymap(editor, f.env, f.handles)).toBe(true)
    expect(f.env.showOpenFilePicker).toHaveBeenCalledTimes(1)
    expect(f.accepted.createWritable).not.toHaveBeenCalled()
    expect(f.picked.requestPermission).not.toHaveBeenCalled()
    expect(f.picked.createWritable).toHaveBeenCalledTimes(1)
    expect(f.stream.write).toHaveBeenCalledWith(new Uint8Array(bytes(expected)))
    expect(f.stream.close).toHaveBeenCalledTimes(1)
    expect(f.disk.bytes).toEqual(bytes(expected))
    expect(editor.filesystemRecovery?.baseline.source).toBe(expected)
    expect(editor.filesystemVerifiedSave).toBe(true)
    expect(editor.isDirty).toBe(false)
    expect((await loadStoredDraft(editor.currentDraftIdentity()!))?.filesystem?.attempt).toBeUndefined()
    expect(publish).not.toHaveBeenCalled()
    expect(host).not.toHaveBeenCalled()
    expect(editor.statusText).toContain('Firmware saved; host files not written')
    expect(editor.saving).toBe(false)
  })
})
