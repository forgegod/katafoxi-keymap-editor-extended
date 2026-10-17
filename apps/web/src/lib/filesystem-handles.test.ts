import { beforeEach, describe, expect, it } from 'vitest'
import { parseKeymap } from '@keymap-editor/keymap-core'
import { buildDraftIdentity, loadStoredDraft, saveStoredDraft } from './draft-storage'
import {
  FilesystemHandles,
  createFilesystemDocumentId,
  isFilesystemDocumentId,
  type FilesystemHandleLike
} from './filesystem-handles'

/**
 * Structured-clone handle double. Methods live on the prototype, so an instance
 * stays IndexedDB-cloneable; `fake-indexeddb` returns a plain `{ entryId, name }`
 * after a round trip, exactly like an environment that does not revive a native
 * FileSystemHandle. Tests that need the restored association to keep working
 * inject a `reviveHandle`; the default revive is exercised on purpose to prove
 * this module never pretends native browser cloning is available here.
 */
class HandleDouble implements FilesystemHandleLike {
  static isSameEntryCalls = 0
  static permissionCalls = 0
  static fileReads = 0

  constructor(
    readonly entryId: string,
    readonly name: string
  ) {}

  async isSameEntry(other: unknown): Promise<boolean> {
    HandleDouble.isSameEntryCalls += 1
    const candidate = other as { entryId?: string } | null
    return candidate != null && candidate.entryId === this.entryId
  }

  async queryPermission(): Promise<string> {
    HandleDouble.permissionCalls += 1
    return 'granted'
  }

  async requestPermission(): Promise<string> {
    HandleDouble.permissionCalls += 1
    return 'granted'
  }

  async getFile(): Promise<{ name: string; arrayBuffer(): Promise<ArrayBuffer> }> {
    HandleDouble.fileReads += 1
    return { name: this.name, arrayBuffer: async () => new ArrayBuffer(0) }
  }
}

const reviveHandle = (stored: unknown): FilesystemHandleLike | null => {
  const value = stored as { entryId?: unknown; name?: unknown } | null
  if (value == null || typeof value.entryId !== 'string') return null
  return new HandleDouble(value.entryId, typeof value.name === 'string' ? value.name : '')
}

let dbName: string

beforeEach(() => {
  dbName = `test-handles-${crypto.randomUUID()}`
  HandleDouble.isSameEntryCalls = 0
  HandleDouble.permissionCalls = 0
  HandleDouble.fileReads = 0
})

describe('filesystem document ids', () => {
  it('mints opaque versioned ids and rejects anything else', () => {
    const id = createFilesystemDocumentId()
    expect(id).toMatch(/^fs:1:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(isFilesystemDocumentId(id)).toBe(true)
    expect(isFilesystemDocumentId('same.keymap')).toBe(false)
    expect(isFilesystemDocumentId('fs:1:not-a-uuid')).toBe(false)
  })
})

describe('identity resolution', () => {
  it('reuses a retained equivalent handle and never matches on name or bytes', async () => {
    const handles = new FilesystemHandles({ dbName })
    const file = new HandleDouble('entry-a', 'a.keymap')
    const first = await handles.identify(file)
    expect(first.reused).toBe(false)
    await handles.accept(first.documentId, { file })

    const alias = await handles.identify(new HandleDouble('entry-a', 'renamed.keymap'))
    expect(alias).toEqual({ documentId: first.documentId, reused: true })

    const twin = await handles.identify(new HandleDouble('entry-b', 'a.keymap'))
    expect(twin.reused).toBe(false)
    expect(twin.documentId).not.toBe(first.documentId)
  })

  it('matches only the firmware file, never directory or geometry aliases', async () => {
    const handles = new FilesystemHandles({ dbName })
    const documentId = createFilesystemDocumentId()
    await handles.accept(documentId, {
      file: new HandleDouble('entry-file', 'a.keymap'),
      directory: new HandleDouble('entry-config', 'config'),
      geometry: new HandleDouble('entry-geometry', 'a.json')
    })
    expect(await handles.identify(new HandleDouble('entry-file', 'a.keymap'))).toEqual({
      documentId,
      reused: true
    })
    expect((await handles.identify(new HandleDouble('entry-config', 'config'))).reused).toBe(false)
    expect((await handles.identify(new HandleDouble('entry-geometry', 'a.json'))).reused).toBe(false)
    expect(await handles.identify(new HandleDouble('entry-other', 'config'))).toEqual({
      documentId: expect.any(String),
      reused: false
    })
  })

  it('refuses to identify or accept without a usable file handle', async () => {
    const handles = new FilesystemHandles({ dbName })
    await expect(handles.identify({} as never)).rejects.toThrow(/isSameEntry/)
    await expect(
      handles.accept(createFilesystemDocumentId(), { file: {} as never })
    ).rejects.toThrow(/isSameEntry/)
    await expect(
      handles.accept('same.keymap', { file: new HandleDouble('entry-a', 'a.keymap') })
    ).rejects.toThrow(/document id/)
  })
})

describe('opt-in remembering', () => {
  it.each(['directory', 'geometry'] as const)('refuses partial restore when required %s context is lost', async slot => {
    const handles = new FilesystemHandles({ dbName, reviveHandle })
    const documentId = createFilesystemDocumentId()
    await handles.accept(documentId, {
      file: new HandleDouble('entry-file', 'a.keymap'),
      [slot]: new HandleDouble('lost', slot)
    }, true)
    const partial = new FilesystemHandles({ dbName, reviveHandle: stored =>
      (stored as { entryId: string }).entryId === 'lost' ? null : reviveHandle(stored) })
    expect(await partial.restore(documentId)).toBeNull()
    expect((await partial.identify(new HandleDouble('entry-file', 'a.keymap'))).reused).toBe(false)
    expect(await new FilesystemHandles({ dbName, reviveHandle }).restore(documentId)).not.toBeNull()
  })
  it('keeps a selection session-only by default', async () => {
    const handles = new FilesystemHandles({ dbName, reviveHandle })
    const documentId = createFilesystemDocumentId()
    expect(await handles.accept(documentId, { file: new HandleDouble('entry-a', 'a.keymap') })).toEqual({
      remembered: false
    })
    expect(await handles.restore(documentId)).not.toBeNull()
    expect(await new FilesystemHandles({ dbName, reviveHandle }).restore(documentId)).toBeNull()
  })

  it('round-trips a remembered selection across instances without prompting or reading disk', async () => {
    const handles = new FilesystemHandles({ dbName, reviveHandle })
    const documentId = createFilesystemDocumentId()
    expect(
      await handles.accept(
        documentId,
        {
          file: new HandleDouble('entry-a', 'a.keymap'),
          directory: new HandleDouble('entry-config', 'config')
        },
        true
      )
    ).toEqual({ remembered: true })

    const reloaded = new FilesystemHandles({ dbName, reviveHandle })
    const restored = await reloaded.restore(documentId)
    expect(restored?.file).toBeInstanceOf(HandleDouble)
    expect(restored?.directory).toBeInstanceOf(HandleDouble)
    expect(await reloaded.identify(new HandleDouble('entry-a', 'a.keymap'))).toEqual({
      documentId,
      reused: true
    })
    expect(HandleDouble.permissionCalls).toBe(0)
    expect(HandleDouble.fileReads).toBe(0)
  })

  it('warns and keeps the session usable when a handle cannot be cloned', async () => {
    const handles = new FilesystemHandles({ dbName, reviveHandle })
    const documentId = createFilesystemDocumentId()
    const uncloneable = {
      kind: 'file',
      name: 'a.keymap',
      isSameEntry: async () => true
    } as unknown as FilesystemHandleLike
    const result = await handles.accept(documentId, { file: uncloneable }, true)
    expect(result.remembered).toBe(false)
    expect(result.warning).toBeTruthy()
    expect(await handles.restore(documentId)).not.toBeNull()
    expect(await new FilesystemHandles({ dbName, reviveHandle }).restore(documentId)).toBeNull()
  })

  it('treats an unrevived stored handle as lost, keeps the stored record and mints a new id', async () => {
    const handles = new FilesystemHandles({ dbName, reviveHandle })
    const documentId = createFilesystemDocumentId()
    await handles.accept(documentId, { file: new HandleDouble('entry-a', 'a.keymap') }, true)

    // No revive hook: the clone loses `isSameEntry`, like fake-indexeddb today.
    const withoutRevive = new FilesystemHandles({ dbName })
    expect(await withoutRevive.restore(documentId)).toBeNull()
    const resolution = await withoutRevive.identify(new HandleDouble('entry-a', 'a.keymap'))
    expect(resolution.reused).toBe(false)
    expect(resolution.documentId).not.toBe(documentId)

    // The old association survived for a reviving reader (recovery is not deleted).
    expect(await new FilesystemHandles({ dbName, reviveHandle }).restore(documentId)).not.toBeNull()
  })
})

describe('forget', () => {
  it('removes only the handle association, never the firmware draft', async () => {
    const handles = new FilesystemHandles({ dbName, reviveHandle })
    const documentId = createFilesystemDocumentId()
    await handles.accept(documentId, { file: new HandleDouble('entry-a', 'a.keymap') }, true)

    const identity = buildDraftIdentity({ source: 'filesystem', filesystemDocumentId: documentId })!
    const keymap = parseKeymap({
      keyboard: 'same',
      layer_names: ['base'],
      layers: [['&kp A']]
    })
    const recovery = {
      version: 1 as const,
      baseline: { route: { kind: 'file' as const }, bytes: [65], source: 'A', keymap, layout: [{ x: 0, y: 0, row: 0, col: 0 }] }
    }
    await saveStoredDraft(identity, keymap, undefined, undefined, { expected: null, isCurrent: () => true }, recovery)

    await handles.forget(documentId)
    expect(await handles.restore(documentId)).toBeNull()
    expect(await new FilesystemHandles({ dbName, reviveHandle }).restore(documentId)).toBeNull()
    expect((await loadStoredDraft(identity))?.filesystem).toEqual(recovery)
  })

  it('is a no-op for an id that was never associated', async () => {
    const handles = new FilesystemHandles({ dbName, reviveHandle })
    await expect(handles.forget(createFilesystemDocumentId())).resolves.toBeUndefined()
  })
})
