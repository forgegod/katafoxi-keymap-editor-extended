/**
 * Origin-local, opt-in handle association store for the browser filesystem source.
 *
 * Session-only by default: an accepted selection is remembered in memory for the
 * current session. A handle payload reaches IndexedDB only after an explicit
 * **remember** opt-in, in its own origin-local database, separate from the
 * transferable firmware draft store (`keymap-editor-drafts`).
 *
 * This module is deliberately narrow: it associates an opaque filesystem document
 * id with the live File System Access handle(s) that identify it. It reads and
 * writes no `.keymap`, calls no `queryPermission`/`requestPermission` and never
 * touches draft/recovery rows, so restore can never prompt, read disk or adopt a
 * baseline. The editor controller owns permission and byte validation.
 *
 * Identity is resolved only by a fresh `isSameEntry` proof among retained
 * in-memory or stored firmware files only. Equal names, sizes or bytes never
 * match. A lost, unrevivable or uncloneable handle yields a new opaque document
 * id while the previous association (and any firmware recovery keyed by it)
 * stays in place, so disconnected work remains reachable.
 */

import { idbRequest, openDb, txDone } from './idb'

/** Minimal structural FileSystemHandle surface; the adapter's richer types satisfy it. */
export interface FilesystemHandleLike {
  isSameEntry(other: unknown): Promise<boolean>
}

/** One accepted selection: the firmware file plus optional route context. */
export interface FilesystemHandlesPayload {
  file: FilesystemHandleLike
  /** Directory grant used for discovery, when the file was chosen/derived there. */
  directory?: FilesystemHandleLike
  /** Read-only geometry handle associated with this session. */
  geometry?: FilesystemHandleLike
}

export type IdentityResolution = {
  documentId: string
  /** True when an equivalent retained or stored handle proved the id. */
  reused: boolean
}

export type AcceptResult = {
  remembered: boolean
  /** Present when an opt-in persist failed; the session stays usable regardless. */
  warning?: string
}

export const FILESYSTEM_HANDLES_DB_NAME = 'keymap-editor-filesystem-handles'
export const FILESYSTEM_HANDLES_STORE_NAME = 'handles'
const DB_VERSION = 1
const SCHEMA_VERSION = 1

const DOCUMENT_ID_PATTERN =
  /^fs:1:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

/** Opaque, versioned document id for one filesystem document. */
export function createFilesystemDocumentId(): string {
  return `fs:1:${crypto.randomUUID()}`
}

export function isFilesystemDocumentId(value: unknown): value is string {
  return typeof value === 'string' && DOCUMENT_ID_PATTERN.test(value)
}

type StoredHandleRecord = {
  /** Primary key: the filesystem document id. */
  id: string
  version: number
  /** Structured-cloneable handle payload; opaque here. */
  handles: unknown
  updatedAt: number
}

export type FilesystemHandlesOptions = {
  /** Overrides the database name; tests use an isolated database. */
  dbName?: string
  /**
   * Reattach callable behavior to a structured-clone-decoded handle. Native
   * browsers restore real `FileSystemHandle`s, so the default returns a value
   * that already has a callable `isSameEntry` and otherwise reports `null` — a
   * non-revived clone is treated as a lost handle, never as identity proof.
   */
  reviveHandle?: (stored: unknown) => FilesystemHandleLike | null
}

function isHandleLike(value: unknown): value is FilesystemHandleLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as FilesystemHandleLike).isSameEntry === 'function'
  )
}


function openHandlesDb(name: string): Promise<IDBDatabase> {
  return openDb({
    name,
    version: DB_VERSION,
    upgrade(db) {
      if (!db.objectStoreNames.contains(FILESYSTEM_HANDLES_STORE_NAME)) {
        db.createObjectStore(FILESYSTEM_HANDLES_STORE_NAME, { keyPath: 'id' })
      }
    }
  })
}

/** Fresh irreversible-looking proof; never falls back to name/size/bytes. */
async function sameEntry(fresh: FilesystemHandleLike, other: unknown): Promise<boolean> {
  const candidate = other as FilesystemHandleLike | null
  try {
    if (isHandleLike(fresh)) return (await fresh.isSameEntry(candidate)) === true
    if (isHandleLike(candidate)) return (await candidate.isSameEntry(fresh)) === true
  } catch {
    return false
  }
  return false
}

export class FilesystemHandles {
  readonly #dbName: string
  readonly #revive: (stored: unknown) => FilesystemHandleLike | null
  readonly #memory = new Map<string, FilesystemHandlesPayload>()

  constructor(options: FilesystemHandlesOptions = {}) {
    this.#dbName = options.dbName ?? FILESYSTEM_HANDLES_DB_NAME
    this.#revive = options.reviveHandle ?? (stored => (isHandleLike(stored) ? stored : null))
  }

  /**
   * Resolve a freshly obtained handle to a document id. Reuses the id of an
   * equivalent retained in-memory or stored firmware file handle;
   * otherwise mints a new opaque id. Never prompts and never reads a file.
   */
  async identify(handle: FilesystemHandleLike): Promise<IdentityResolution> {
    if (!isHandleLike(handle)) {
      throw new Error('A file handle with isSameEntry is required to identify a filesystem document')
    }
    for (const [documentId, payload] of this.#memory) {
      if (await this.#matches(handle, payload)) return { documentId, reused: true }
    }
    const db = await openHandlesDb(this.#dbName)
    try {
      const records = await idbRequest<StoredHandleRecord[]>(
        db.transaction(FILESYSTEM_HANDLES_STORE_NAME, 'readonly').objectStore(FILESYSTEM_HANDLES_STORE_NAME).getAll()
      )
      for (const record of records) {
        const payload = this.#reviveRecord(record)
        if (payload && (await this.#matches(handle, payload))) {
          return { documentId: record.id, reused: true }
        }
      }
    } finally {
      db.close()
    }
    return { documentId: createFilesystemDocumentId(), reused: false }
  }

  /**
   * Accept a selection for a document id. The association is always retained in
   * memory for this session; it is persisted only when `remember` is true. A
   * persistence failure (uncloneable handle, quota or private mode) leaves the
   * session usable and reports a warning instead of throwing.
   */
  async accept(
    documentId: string,
    handles: FilesystemHandlesPayload,
    remember = false
  ): Promise<AcceptResult> {
    if (!isFilesystemDocumentId(documentId)) {
      throw new Error('Invalid filesystem document id')
    }
    if (!isHandleLike(handles?.file)) {
      throw new Error('An accepted filesystem selection requires a file handle with isSameEntry')
    }
    const payload: FilesystemHandlesPayload = { file: handles.file }
    if (handles.directory) payload.directory = handles.directory
    if (handles.geometry) payload.geometry = handles.geometry
    this.#memory.set(documentId, payload)

    if (!remember) return { remembered: false }

    const record: StoredHandleRecord = {
      id: documentId,
      version: SCHEMA_VERSION,
      handles: payload,
      updatedAt: Date.now()
    }
    try {
      const db = await openHandlesDb(this.#dbName)
      try {
        const tx = db.transaction(FILESYSTEM_HANDLES_STORE_NAME, 'readwrite')
        await idbRequest(tx.objectStore(FILESYSTEM_HANDLES_STORE_NAME).put(record))
        await txDone(tx)
      } finally {
        db.close()
      }
      return { remembered: true }
    } catch {
      return {
        remembered: false,
        warning: 'This file could not be remembered in this browser; it stays available for this session only.'
      }
    }
  }

  /**
   * Read back a remembered or session-only association. Returns `null` when the
   * id is unknown or the stored handle cannot be revived (a lost handle is not a
   * match). The stored record is never deleted here. No permission prompt, no
   * disk read.
   */
  async restore(documentId: string): Promise<FilesystemHandlesPayload | null> {
    if (!isFilesystemDocumentId(documentId)) return null
    const memory = this.#memory.get(documentId)
    if (memory) return memory
    const db = await openHandlesDb(this.#dbName)
    try {
      const record = await idbRequest<StoredHandleRecord | undefined>(
        db.transaction(FILESYSTEM_HANDLES_STORE_NAME, 'readonly').objectStore(FILESYSTEM_HANDLES_STORE_NAME).get(documentId)
      )
      return record ? this.#reviveRecord(record) : null
    } finally {
      db.close()
    }
  }

  /**
   * Drop the handle association for a document id (memory and, when persisted,
   * the stored record). This touches only this handles database: firmware drafts,
   * verified baselines and pending recovery keyed by the same document id remain.
   * It does not revoke any browser/OS permission.
   */
  async forget(documentId: string): Promise<void> {
    this.#memory.delete(documentId)
    if (!isFilesystemDocumentId(documentId)) return
    const db = await openHandlesDb(this.#dbName)
    try {
      const tx = db.transaction(FILESYSTEM_HANDLES_STORE_NAME, 'readwrite')
      await idbRequest(tx.objectStore(FILESYSTEM_HANDLES_STORE_NAME).delete(documentId))
      await txDone(tx)
    } finally {
      db.close()
    }
  }

  async #matches(handle: FilesystemHandleLike, payload: FilesystemHandlesPayload): Promise<boolean> {
    return sameEntry(handle, payload.file)
  }

  #reviveRecord(record: StoredHandleRecord | undefined): FilesystemHandlesPayload | null {
    if (!record || record.version !== SCHEMA_VERSION || !isFilesystemDocumentId(record.id)) return null
    const handles = record?.handles
    if (typeof handles !== 'object' || handles === null) return null
    const source = handles as Record<string, unknown>
    const file = this.#revive(source.file)
    if (!file) return null
    const payload: FilesystemHandlesPayload = { file }
    for (const slot of ['directory', 'geometry'] as const) {
      const raw = source[slot]
      if (raw === undefined) continue
      const revived = this.#revive(raw)
      if (!revived) return null
      payload[slot] = revived
    }
    return payload
  }
}
