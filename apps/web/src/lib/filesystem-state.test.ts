import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseKeymap } from '@keymap-editor/keymap-core'
import { editor } from './editor.svelte'
import { needsUnpublishedLeaveWarning } from './editor/leave-warning'
import { buildDraftIdentity, deleteStoredDraft, draftIdentityKey, loadStoredDraft, saveStoredDraft } from './draft-storage'
import * as draftStorage from './draft-storage'

const km = (code = 'A') => parseKeymap({ keyboard: 'same', layer_names: ['base'], layers: [[`&kp ${code}`]] })
const id = () => `fs:1:${crypto.randomUUID()}`
const base = () => {
  const source = '#include <behaviors.dtsi>\n/ { keymap { compatible = "zmk,keymap"; base { bindings = <&kp A>; }; }; };\n'
  return { route: { kind: 'file' as const }, bytes: Array.from(new TextEncoder().encode(source)), source, keymap: km(), layout: [{ x: 0, y: 0, row: 0, col: 0 }] }
}
afterEach(() => { editor.resetForTests(); vi.restoreAllMocks() })

describe('filesystem document identity and recovery', () => {
  describe.each([false, true])('transactional Discard with retained attempt=%s', pending => {
    it.each(['abort', 'competing-row'] as const)('preserves live work and history when baseline persistence fails: %s', async failure => {
      await editor.selectKeyboard({ source: 'filesystem', filesystem: { documentId: id(), baseline: base() } })
      editor.updateKeymap(km('B'))
      editor.renameLayer(0, 'Working alias')
      if (pending) expect(await editor.retainFilesystemAttempt(editor.captureFilesystemSave())).toBe(true)
      else expect(await editor.flushFilesystemDraft()).toBe(true)
      editor.hasPendingFirmwareRecovery = pending
      const identity = editor.currentDraftIdentity()!
      let stored = (await loadStoredDraft(identity))!
      const draft = editor.draftKeymap
      const layout = editor.layout
      const history = editor.undoStack
      const redo = editor.redoStack
      const layer = editor._storedLayerOperation()
      if (failure === 'competing-row') {
        await saveStoredDraft(identity, km('Z'), stored.layerOperation, undefined, { expected: stored, isCurrent: () => true }, stored.filesystem)
        stored = (await loadStoredDraft(identity))!
      } else {
        const put = IDBObjectStore.prototype.put
        vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(function (this: IDBObjectStore, value, key) {
          expect(editor.draftKeymap).toBe(draft)
          expect(editor.undoStack).toBe(history)
          const request = put.call(this, value, key)
          this.transaction.abort()
          return request
        })
      }
      expect(await editor.discardDraft()).toBe(false)
      expect(editor.draftKeymap).toBe(draft)
      expect(editor.layout).toBe(layout)
      expect(editor.undoStack).toBe(history)
      expect(editor.redoStack).toBe(redo)
      expect(editor._storedLayerOperation()).toEqual(layer)
      expect(editor.hasPendingFirmwareRecovery).toBe(pending)
      expect(editor.isDirty).toBe(true)
      expect(editor.saving).toBe(false)
      expect(await loadStoredDraft(identity)).toEqual(stored)
    })
    it('persists the baseline revert before clearing live history and keeps attempt provenance', async () => {
      const selection = { source: 'filesystem' as const, filesystem: { documentId: id(), baseline: base() } }
      await editor.selectKeyboard(selection)
      editor.updateKeymap(km('B'))
      editor.renameLayer(0, 'Working alias')
      if (pending) expect(await editor.retainFilesystemAttempt(editor.captureFilesystemSave())).toBe(true)
      else expect(await editor.flushFilesystemDraft()).toBe(true)
      editor.hasPendingFirmwareRecovery = pending
      const identity = editor.currentDraftIdentity()!
      const recovery = structuredClone(editor.filesystemRecovery!)
      const draft = editor.draftKeymap
      const history = editor.undoStack
      const save = draftStorage.saveStoredDraft
      const persisted = vi.spyOn(draftStorage, 'saveStoredDraft').mockImplementationOnce(async (...args) => {
        expect(editor.draftKeymap).toBe(draft)
        expect(editor.undoStack).toBe(history)
        expect(args[1]).toEqual(km())
        expect(args[5]).toEqual(recovery)
        await save(...args)
      })
      expect(await editor.discardDraft()).toBe(true)
      expect(persisted).toHaveBeenCalledTimes(1)
      expect(editor.draftKeymap).toEqual(km())
      expect(editor.undoStack).toEqual([])
      expect(editor.isDirty).toBe(false)
      expect(editor.hasPendingFirmwareRecovery).toBe(pending)
      await editor.flushPendingPersist()
      const row = (await loadStoredDraft(identity))!
      expect(row.draftKeymap).toEqual(km())
      expect(row.layerOperation).toEqual(editor._storedLayerOperation())
      expect(row.filesystem).toEqual(recovery)
      editor.resetForTests()
      await editor.selectKeyboard(selection)
      expect(await editor.restoreFilesystemDraft()).toBe(true)
      expect(editor.draftKeymap).toEqual(km())
      expect(editor.isDirty).toBe(false)
      expect(editor.hasPendingFirmwareRecovery).toBe(pending)
    })
  })
  it.each(['before-put', 'after-put', 'after-put-storage-failure'] as const)('does not discard newer work arriving %s', async boundary => {
    await editor.selectKeyboard({ source: 'filesystem', filesystem: { documentId: id(), baseline: base() } })
    editor.updateKeymap(km('B'))
    expect(await editor.flushFilesystemDraft()).toBe(true)
    const identity = editor.currentDraftIdentity()!
    let history: typeof editor.undoStack
    const edit = () => {
      editor.renameLayer(0, 'Newer alias')
      history = editor.undoStack
    }
    if (boundary === 'before-put') {
      const save = draftStorage.saveStoredDraft
      vi.spyOn(draftStorage, 'saveStoredDraft').mockImplementationOnce(async (...args) => { edit(); await save(...args) })
    } else {
      const put = IDBObjectStore.prototype.put
      vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(function (this: IDBObjectStore, value, key) {
        const request = put.call(this, value, key)
        edit()
        if (boundary === 'after-put-storage-failure') vi.spyOn(draftStorage, 'saveStoredDraft').mockRejectedValue(new Error('quota'))
        return request
      })
    }
    expect(await editor.discardDraft()).toBe(false)
    expect(editor.draftKeymap!.layer_names).toEqual(['Newer alias'])
    expect(editor.draftKeymap!.layers).toEqual(km('B').layers)
    expect(editor.undoStack).toBe(history!)
    expect(editor.isDirty).toBe(true)
    expect(editor.saving).toBe(false)
    if (boundary === 'after-put-storage-failure') expect(editor.saveNotice?.messages.join(' ')).toMatch(/newer edits.*memory/i)
    vi.restoreAllMocks()
    expect(await editor.flushFilesystemDraft()).toBe(true)
    const row = (await loadStoredDraft(identity))!
    expect(row.draftKeymap).toEqual(editor.draftKeymap)
    expect(row.layerOperation).toEqual(editor._storedLayerOperation())
  })
  it.each(['metadata', 'session', 'storage'] as const)('refuses pending transfer when %s changes during row verification', async boundary => {
    await editor.selectKeyboard({ source: 'filesystem', filesystem: { documentId: id(), baseline: base() } })
    editor.updateKeymap(km('B'))
    expect(await editor.retainFilesystemAttempt(editor.captureFilesystemSave())).toBe(true)
    editor.hasPendingFirmwareRecovery = true
    const identity = editor.currentDraftIdentity()!
    const stored = (await loadStoredDraft(identity))!
    const read = draftStorage.loadStoredDraft
    vi.spyOn(draftStorage, 'loadStoredDraft').mockImplementationOnce(async (...args) => {
      const row = await read(...args)
      if (boundary === 'metadata') editor.layerView = { ...editor.layerView, layer0Raw: true }
      if (boundary === 'session') editor._selectGeneration += 1
      if (boundary === 'storage') throw new Error('storage unavailable')
      return row
    })
    await editor.selectKeyboard({ source: 'demo', keymap: km(), layout: base().layout })
    expect(editor.source).toBe('filesystem')
    expect(editor.hasPendingFirmwareRecovery).toBe(true)
    expect(await loadStoredDraft(identity)).toEqual(stored)
  })
  it.each(['matching', 'newer', 'storage-failure', 'competing-row'] as const)('transfers pending dirty recovery only with exact guarded retention: %s', async scenario => {
    const selection = { source: 'filesystem' as const, filesystem: { documentId: id(), baseline: base() } }
    await editor.selectKeyboard(selection)
    editor.updateKeymap(km('B'))
    const attempt = editor.captureFilesystemSave()
    expect(await editor.retainFilesystemAttempt(attempt)).toBe(true)
    if (scenario !== 'matching') editor.renameLayer(0, 'Newer alias')
    editor.hasPendingFirmwareRecovery = true
    const identity = editor.currentDraftIdentity()!
    const draft = structuredClone(editor.draftKeymap!)
    const layer = editor._storedLayerOperation()
    const history = editor.undoStack
    let stored = (await loadStoredDraft(identity))!
    if (scenario === 'competing-row') {
      await saveStoredDraft(identity, km('Z'), stored.layerOperation, undefined, { expected: stored, isCurrent: () => true }, stored.filesystem)
      stored = (await loadStoredDraft(identity))!
    }
    const write = vi.spyOn(draftStorage, 'saveStoredDraft')
    if (scenario === 'matching' || scenario === 'storage-failure') write.mockRejectedValue(new Error('storage unavailable'))
    await editor.selectKeyboard({ source: 'demo', keymap: km(), layout: base().layout })
    if (scenario === 'matching' || scenario === 'newer') {
      expect(editor.source).toBe('demo')
      if (scenario === 'matching') expect(write).not.toHaveBeenCalled()
      const row = (await loadStoredDraft(identity))!
      expect(row.draftKeymap).toEqual(draft)
      expect(row.layerOperation).toEqual(layer)
      expect(row.filesystem).toEqual(stored.filesystem)
      expect(row.filesystem!.attempt).toEqual(attempt)
      write.mockRestore()
      await editor.selectKeyboard(selection)
      expect(await editor.restoreFilesystemDraft()).toBe(true)
      expect(editor.draftKeymap).toEqual(draft)
      expect(editor._storedLayerOperation()).toEqual(layer)
      expect(editor.hasPendingFirmwareRecovery).toBe(true)
    } else {
      expect(editor.source).toBe('filesystem')
      expect(editor.draftKeymap).toEqual(draft)
      expect(editor.undoStack).toBe(history)
      expect(editor.hasPendingFirmwareRecovery).toBe(true)
      expect(await loadStoredDraft(identity)).toEqual(stored)
    }
  })
  it.each(['names-only', 'binding-mismatch', 'storage-failure', 'competing-row'] as const)('narrowly repairs legacy receipt names: %s', async scenario => {
    const selection = { source: 'filesystem' as const, filesystem: { documentId: id(), baseline: base() } }
    await editor.selectKeyboard(selection)
    editor.renameLayer(0, 'Local alias')
    const attempt = editor.captureFilesystemSave()
    expect(await editor.retainFilesystemAttempt(attempt)).toBe(true)
    const identity = editor.currentDraftIdentity()!
    const original = (await loadStoredDraft(identity))!
    const recovery = structuredClone(original.filesystem!)
    recovery.baseline.keymap.layer_names = ['Old alias']
    if (scenario === 'binding-mismatch') recovery.baseline.keymap = { ...km('Z'), layer_names: ['Old alias'] }
    await saveStoredDraft(identity, original.draftKeymap, original.layerOperation, undefined, { expected: original, isCurrent: () => true }, recovery)
    let retained = (await loadStoredDraft(identity))!
    editor.resetForTests()
    if (scenario === 'storage-failure') vi.spyOn(draftStorage, 'saveStoredDraft').mockRejectedValueOnce(new Error('quota'))
    if (scenario === 'competing-row') {
      const save = draftStorage.saveStoredDraft
      vi.spyOn(draftStorage, 'saveStoredDraft').mockImplementationOnce(async (...args) => {
        await save(identity, km('X'), retained.layerOperation, undefined, { expected: retained, isCurrent: () => true }, retained.filesystem)
        retained = (await loadStoredDraft(identity))!
        await save(...args)
      })
    }
    if (scenario === 'names-only') {
      await editor.selectKeyboard(selection)
      const repaired = (await loadStoredDraft(identity))!
      expect(repaired.filesystem!.baseline).toEqual(base())
      expect(repaired.filesystem!.display?.layerNames).toEqual(['Old alias'])
      expect(repaired.filesystem!.attempt).toEqual(attempt)
      expect(repaired.layerOperation).toEqual(original.layerOperation)
      expect(repaired.draftKeymap).toEqual(original.draftKeymap)
      expect(editor.baselineKeymap!.layer_names).toEqual(['Old alias'])
      expect(await editor.restoreFilesystemDraft()).toBe(true)
      expect(editor.draftKeymap!.layer_names).toEqual(['Local alias'])
      expect(editor.hasPendingFirmwareRecovery).toBe(true)
    } else {
      await expect(editor.selectKeyboard(selection)).rejects.toThrow()
      expect(await loadStoredDraft(identity)).toEqual(retained)
      expect(editor.source).toBeNull()
    }
  })
  it('retains edits arriving during the receipt follow-up recovery transaction', async () => {
    await editor.selectKeyboard({ source: 'filesystem', filesystem: { documentId: id(), baseline: base() } })
    editor.updateKeymap(km('B'))
    const attempt = editor.captureFilesystemSave()
    expect(await editor.retainFilesystemAttempt(attempt)).toBe(true)
    const put = IDBObjectStore.prototype.put
    let writes = 0
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      const request = put.call(this, value, key)
      writes += 1
      if (writes <= 2) editor.updateKeymap(km(writes === 1 ? 'C' : 'D'))
      return request
    })
    expect(await editor.acceptFilesystemReceipt(attempt, attempt.bytes)).toBe(true)
    expect(editor.draftKeymap).toEqual(km('D'))
    expect((await loadStoredDraft(editor.currentDraftIdentity()!))?.draftKeymap).toEqual(km('D'))
    expect(editor.hasPendingFirmwareRecovery).toBe(false)
    editor.updateKeymap(km('E'))
    expect(await editor.flushFilesystemDraft()).toBe(true)
    expect((await loadStoredDraft(editor.currentDraftIdentity()!))?.draftKeymap).toEqual(km('E'))
  })
  it.each(['{', 'null', '{}', '{"layouts":{}}', '{"layouts":{"LAYOUT":{"layout":[{"x":"bad","y":0}]}}}', 'invalid-utf8', 'invalid-byte'])('rejects supplied geometry %s before selecting or storing it', async text => {
    const documentId = id()
    const bytes = text === 'invalid-utf8' ? [255] : text === 'invalid-byte' ? [256] : Array.from(new TextEncoder().encode(text))
    const baseline = { ...base(), geometry: { name: 'a.json', bytes } }
    await expect(editor.selectKeyboard({ source: 'filesystem', filesystem: { documentId, baseline } })).rejects.toThrow()
    expect(editor.source).toBeNull()
    expect(await loadStoredDraft(buildDraftIdentity({ source: 'filesystem', filesystemDocumentId: documentId })!)).toBeNull()
  })
  it.each(['selection', 'stored'] as const)('rejects a same-sized model that disagrees with original source at %s', async origin => {
    await editor.selectKeyboard({ source: 'demo', keymap: km('C'), layout: base().layout })
    const draft = editor.draftKeymap
    const history = editor.undoStack
    const documentId = id()
    const baseline = { ...base(), keymap: km('B') }
    const identity = buildDraftIdentity({ source: 'filesystem', filesystemDocumentId: documentId })!
    if (origin === 'stored') await saveStoredDraft(identity, km('B'), undefined, undefined, { expected: null, isCurrent: () => true }, { version: 1, baseline })
    const row = await loadStoredDraft(identity)
    await expect(editor.selectKeyboard({ source: 'filesystem', filesystem: { documentId, baseline: origin === 'stored' ? base() : baseline } })).rejects.toThrow(/baseline|source/i)
    expect(editor.source).toBe('demo')
    expect(editor.draftKeymap).toBe(draft)
    expect(editor.undoStack).toBe(history)
    expect(await loadStoredDraft(identity)).toEqual(row)
  })
  it.each(['deleted', 'replaced', 'unavailable'] as const)('does not claim memory-only failure retention when storage is %s', async failure => {
    await editor.selectKeyboard({ source: 'filesystem', filesystem: { documentId: id(), baseline: base() } })
    editor.updateKeymap(km('B'))
    const attempt = editor.captureFilesystemSave()
    expect(await editor.retainFilesystemAttempt(attempt)).toBe(true)
    const identity = editor.currentDraftIdentity()!
    const row = (await loadStoredDraft(identity))!
    if (failure === 'deleted') await deleteStoredDraft(identity, { expected: row, isCurrent: () => true })
    if (failure === 'replaced') await saveStoredDraft(identity, km('Z'), undefined, undefined, { expected: row, isCurrent: () => true }, row.filesystem)
    const stored = await loadStoredDraft(identity)
    if (failure === 'unavailable') vi.spyOn(IDBDatabase.prototype, 'transaction').mockImplementation(() => { throw new Error('storage unavailable') })
    expect(await editor.retainFilesystemFailure(attempt)).toBe(false)
    vi.restoreAllMocks()
    expect(await loadStoredDraft(identity)).toEqual(stored)
    expect(editor.draftKeymap).toEqual(km('B'))
    expect(editor.filesystemRecovery?.attempt).toEqual(attempt)
  })
  it.each(['put', 'committed'] as const)('accepts a committed receipt while preserving edits at %s', async boundary => {
    const selection = { source: 'filesystem' as const, filesystem: { documentId: id(), baseline: base() } }
    await editor.selectKeyboard(selection)
    editor.updateKeymap(km('B'))
    const attempt = editor.captureFilesystemSave()
    expect(await editor.retainFilesystemAttempt(attempt)).toBe(true)
    const identity = editor.currentDraftIdentity()!
    if (boundary === 'put') {
      const put = IDBObjectStore.prototype.put
      vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(function (this: IDBObjectStore, value, key) {
        const request = put.call(this, value, key)
        editor.updateKeymap(km('C'))
        return request
      })
    } else {
      const save = draftStorage.saveStoredDraft
      vi.spyOn(draftStorage, 'saveStoredDraft').mockImplementationOnce(async (...args) => {
        await save(...args)
        editor.updateKeymap(km('C'))
      })
    }
    expect(await editor.acceptFilesystemReceipt(attempt, attempt.bytes)).toBe(true)
    expect(editor.filesystemRecovery?.attempt).toBeUndefined()
    expect(editor.filesystemRecovery?.baseline.source).toBe(attempt.code)
    expect(editor.baselineKeymap?.layers[0][0].params[0].value).toBe('B')
    expect(editor.draftKeymap).toEqual(km('C'))
    expect(editor.isDirty).toBe(true)
    expect(editor.hasPendingFirmwareRecovery).toBe(false)
    const row = await loadStoredDraft(identity)
    expect(row?.draftKeymap).toEqual(km('C'))
    expect(row?.filesystem).toEqual(editor.filesystemRecovery)
    editor.resetForTests()
    await editor.selectKeyboard(selection)
    await editor.restoreFilesystemDraft()
    expect(editor.draftKeymap).toEqual(km('C'))
  })
  it('never clears unresolved-attempt protection through explicit draft restore', async () => {
    await editor.selectKeyboard({ source: 'filesystem', filesystem: { documentId: id(), baseline: base() } })
    editor.updateKeymap(km('B'))
    await editor.retainFilesystemAttempt(editor.captureFilesystemSave())
    await editor.discardDraft()
    expect(await editor.restoreFilesystemDraft()).toBe(true)
    expect(editor.hasPendingFirmwareRecovery).toBe(true)
    expect(() => editor.captureFilesystemSave()).toThrow()
    editor.updateKeymap(km('C'))
    expect(editor.saveNotice?.messages.join(' ')).toContain('Reconcile save')
    expect(editor.saveNotice?.messages.join(' ')).toContain('Restore only restores the draft')
  })
  it.each([undefined, { kind: 'directory' }, { kind: 'directory', entryName: '../a.keymap' }])('refuses absent or unsafe route provenance %j', async route => {
    const baseline = { ...base(), route } as never
    await expect(editor.selectKeyboard({ source: 'filesystem', filesystem: { documentId: id(), baseline } })).rejects.toThrow(/route|entry/)
    expect(editor.source).toBeNull()
  })
  it('protects retained attempts after discard/reopen even with a clean visible model', async () => {
    const selection = { source: 'filesystem' as const, filesystem: { documentId: id(), baseline: base() } }
    await editor.selectKeyboard(selection)
    editor.updateKeymap(km('B'))
    const attempt = editor.captureFilesystemSave()
    expect(await editor.retainFilesystemAttempt(attempt)).toBe(true)
    const retained = await loadStoredDraft(editor.currentDraftIdentity()!)
    expect(await editor.discardDraft()).toBe(true)
    const discarded = (await loadStoredDraft(editor.currentDraftIdentity()!))!
    expect(discarded.filesystem).toEqual(retained!.filesystem)
    expect(discarded.draftKeymap).toEqual(km())
    expect(discarded.layerOperation).toEqual(editor._storedLayerOperation())
    expect(editor.hasPendingFirmwareRecovery).toBe(true)
    expect(needsUnpublishedLeaveWarning(editor)).toBe(true)
    const identity = editor.currentDraftIdentity()!
    expect(editor.isDirty).toBe(false)
    await editor.flushPendingPersist()
    expect(await loadStoredDraft(identity)).toEqual(discarded)
    expect((await loadStoredDraft(identity))?.filesystem?.attempt).toEqual(attempt)
    editor.resetForTests()
    await editor.selectKeyboard(selection)
    expect(editor.hasPendingFirmwareRecovery).toBe(true)
    await editor.flushPendingPersist()
    expect((await loadStoredDraft(identity))?.filesystem?.attempt).toEqual(attempt)
    expect(await loadStoredDraft(identity)).toEqual(discarded)
  })
  it('accepts only a retained firmware receipt and uses its separate source for a second save after restore', async () => {
    const selection = { source: 'filesystem' as const, filesystem: { documentId: id(), baseline: base() } }
    await editor.selectKeyboard(selection)
    editor.updateKeymap(km('B'))
    const publish = vi.spyOn(editor, 'applyPublished')
    const host = vi.spyOn(editor, 'acceptHostRepoBaseline')
    const captured = editor.captureFilesystemSave()
    await expect(editor.acceptFilesystemReceipt(captured, captured.bytes)).resolves.toBe(false)
    expect(await editor.retainFilesystemAttempt(captured)).toBe(true)
    editor.updateKeymap(km('C'))
    expect(await editor.acceptFilesystemReceipt(captured, captured.bytes)).toBe(true)
    expect(editor.baselineKeymap?.layers[0][0].params[0].value).toBe('B')
    expect(editor.draftKeymap).toEqual(km('C'))
    expect(editor.isDirty).toBe(true)
    expect(publish).not.toHaveBeenCalled()
    expect(host).not.toHaveBeenCalled()
    const stored = await loadStoredDraft(editor.currentDraftIdentity()!)
    expect(stored?.filesystem?.baseline.source).toBe(captured.code)
    expect(stored?.filesystem?.attempt).toBeUndefined()
    editor.resetForTests()
    await editor.selectKeyboard(selection)
    await editor.restoreFilesystemDraft()
    const second = editor.captureFilesystemSave()
    expect(second.baseline.source).toBe(captured.code)
    expect(second.code).toContain('#include <behaviors.dtsi>')
    expect(second.code).toContain('&kp C')
  })
  it('captures filesystem storage payload before yielding instead of persisting later caller mutations', async () => {
    const identity = buildDraftIdentity({ source: 'filesystem', filesystemDocumentId: id() })!
    const filesystem = { version: 1 as const, baseline: base() }
    const expected = structuredClone(filesystem)
    const writing = saveStoredDraft(identity, km(), undefined, undefined, { expected: null, isCurrent: () => true }, filesystem)
    filesystem.baseline.bytes[0] = 0
    filesystem.baseline.source = 'mutated'
    await writing
    expect((await loadStoredDraft(identity))?.filesystem).toEqual(expected)
  })
  it('refuses invalid persisted provenance and preserves live work on same-identity selection', async () => {
    const selection = { source: 'filesystem' as const, filesystem: { documentId: id(), baseline: base() } }
    await editor.selectKeyboard(selection)
    editor.updateKeymap(km('B'))
    const history = editor.undoStack
    await editor.selectKeyboard(selection)
    expect(editor.draftKeymap).toEqual(km('B'))
    expect(editor.undoStack).toBe(history)
    const before = editor.currentDraftIdentity()
    await expect(editor.selectKeyboard({ source: 'filesystem', filesystem: { documentId: id(), baseline: { ...base(), source: '' } } })).rejects.toThrow(/source|baseline/i)
    expect(editor.currentDraftIdentity()).toEqual(before)
  })
  it('keeps declined recovery on clean flush, discard and source switch; restores only explicitly', async () => {
    const selection = { source: 'filesystem' as const, filesystem: { documentId: id(), baseline: base() } }
    await editor.selectKeyboard(selection)
    editor.updateKeymap(km('B'))
    await editor.flushPendingPersist()
    const identity = editor.currentDraftIdentity()!
    const retained = await loadStoredDraft(identity)
    editor.resetForTests()
    const prompt = vi.spyOn(window, 'confirm')
    await editor.selectKeyboard(selection)
    expect(prompt).not.toHaveBeenCalled()
    expect(editor.hasPendingFirmwareRecovery).toBe(true)
    expect(editor.draftKeymap).toEqual(km())
    await editor.flushPendingPersist()
    await editor.discardDraft()
    expect(await loadStoredDraft(identity)).toEqual(retained)
    expect(needsUnpublishedLeaveWarning(editor)).toBe(true)
    await editor.selectKeyboard({ source: 'demo', keymap: km(), layout: selection.filesystem.baseline.layout })
    expect(editor.source).toBe('demo')
    await editor.selectKeyboard(selection)
    expect(await loadStoredDraft(identity)).toEqual(retained)
    expect(await editor.restoreFilesystemDraft()).toBe(true)
    expect(editor.draftKeymap).toEqual(km('B'))
    expect(editor.hasPendingFirmwareRecovery).toBe(false)
    expect(editor.isDirty).toBe(true)
  })
  it('selects without publication hooks and retains clean original source through flush and discard', async () => {
    editor.resetForTests()
    const documentId = id()
    const baseline = base()
    const hostHook = vi.spyOn(editor, 'noteHostSnapshotLoad')
    await editor.selectKeyboard({ source: 'filesystem', filesystem: { documentId, baseline } })
    expect(editor.currentDraftIdentity()?.filesystemDocumentId).toBe(documentId)
    expect(editor.draftKeymap).toEqual(km())
    expect(hostHook).not.toHaveBeenCalled()
    expect(editor.statusText).toContain('Firmware loaded; host files not written')
    await editor.flushPendingPersist()
    const identity = editor.currentDraftIdentity()!
    expect((await loadStoredDraft(identity))?.filesystem?.baseline).toEqual(baseline)
    editor.updateKeymap(km('B'))
    expect(needsUnpublishedLeaveWarning(editor)).toBe(true)
    await editor.flushPendingPersist()
    expect(await editor.discardDraft()).toBe(true)
    expect(editor.draftKeymap).toEqual(km())
    expect(needsUnpublishedLeaveWarning(editor)).toBe(false)
    expect((await loadStoredDraft(identity))?.filesystem?.baseline).toEqual(baseline)
  })
  it('retains a separate verified original source in guarded actual storage, without layer metadata', async () => {
    const a = buildDraftIdentity({ source: 'filesystem', filesystemDocumentId: id() })!
    const b = buildDraftIdentity({ source: 'filesystem', filesystemDocumentId: id() })!
    const filesystem = { version: 1 as const, baseline: { route: { kind: 'file' as const }, bytes: [65], source: 'A', keymap: km(), layout: [{ x: 0, y: 0, row: 0, col: 0 }] } }
    await expect(saveStoredDraft(a, km('B'), undefined, undefined, { expected: null, isCurrent: () => true }, filesystem)).resolves.toBeUndefined()
    const row = (await loadStoredDraft(a))!
    expect(row.filesystem).toEqual(filesystem)
    expect(row.layerOperation).toBeUndefined()
    expect(await loadStoredDraft(b)).toBeNull()
    await expect(saveStoredDraft(a, km('C'), undefined, undefined, { expected: null, isCurrent: () => true }, filesystem)).rejects.toThrow(/changed/)
    await expect(saveStoredDraft(a, km('C'))).rejects.toThrow(/filesystem/i)
    await expect(deleteStoredDraft(a)).rejects.toThrow(/filesystem/i)
    expect(await loadStoredDraft(a)).toEqual(row)
    await deleteStoredDraft(a, { expected: row, isCurrent: () => true })
  })
  it('keys actual stored drafts by a dedicated versioned opaque ID, never keyboard or filename', async () => {
    const a = buildDraftIdentity({ source: 'filesystem', filesystemDocumentId: id(), keyboard: 'same' })!
    const b = buildDraftIdentity({ source: 'filesystem', filesystemDocumentId: id(), keyboard: 'same' })!
    expect(a.schemaVersion).toBe(3)
    expect(draftIdentityKey(a)).not.toBe(draftIdentityKey(b))
    expect(buildDraftIdentity({ source: 'filesystem', keyboard: 'same' })).toBeNull()
    expect(buildDraftIdentity({ source: 'filesystem', filesystemDocumentId: 'same.keymap' })).toBeNull()
    expect(draftIdentityKey(buildDraftIdentity({ ...a, keyboard: 'renamed' })!)).toBe(draftIdentityKey(a))
  })
})
