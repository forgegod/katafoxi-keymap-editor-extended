/**
 * IndexedDB persistence for unpublished editor drafts.
 * Separate from GitHub picker localStorage and auth cookies.
 */

import { isRepositoryKeymapPath, type ParsedKeymap, type LayoutKey } from '@keymap-editor/keymap-core'
import type { StoredLayerOperationState } from './editor/layer-operation-state'

import { idbRequest, openDb, txDone } from './idb'

const DRAFT_SCHEMA_VERSION = 1

const DB_NAME = 'keymap-editor-drafts'
const STORE_NAME = 'drafts'
const DB_VERSION = 1

export type DraftIdentity = {
  schemaVersion: number
  source: string
  repo?: string
  branch?: string
  keyboard?: string
  keymapPath?: string
  filesystemDocumentId?: string
}

/** Transferable firmware recovery only; browser handles live in a separate DB. */
export type FilesystemBaseline = {
  route: { kind: 'file' } | { kind: 'directory'; entryName: string }
  bytes: number[]
  source: string
  keymap: ParsedKeymap
  layout: LayoutKey[]
  geometry?: { name: string; bytes: number[] }
}

export type FilesystemRecovery = {
  version: 1
  baseline: FilesystemBaseline
  /** Baseline presentation only; never changes the source-derived firmware. */
  display?: { version: 1; layerNames?: string[]; layerIds: string[] }
  attempt?: FilesystemAttempt
}

export type FilesystemAttempt = {
  /** Absent on legacy journals: always treat those as unresolved. */
  version?: 1
  stage?: 'prepared' | 'write-possible'
  id: string
  documentId: string
  session: number
  baseline: FilesystemBaseline
  sent: ParsedKeymap
  layout: LayoutKey[]
  layer?: StoredLayerOperationState
  code: string
  bytes: number[]
}

export type StoredDraft = DraftIdentity & {
  /** Primary key = {@link draftIdentityKey}. */
  id: string
  draftKeymap: ParsedKeymap
  layerOperation?: StoredLayerOperationState
  updatedAt: number
  githubBaseline?: { headSha: string; keymap: ParsedKeymap; layout: LayoutKey[] }
  filesystem?: FilesystemRecovery
}

export type DraftWriteGuard = {
  expected: StoredDraft | null
  isCurrent: () => boolean
  /** Destructive adoption may abort if consent expires while put is pending. */
  verifyAfterPut?: boolean
  accepted?: (record: StoredDraft | null) => void
}

export type DraftIdentityInput = {
  source: string | null | undefined
  repo?: string | null
  branch?: string | null
  keyboard?: string | null
  keymapPath?: string | null
  filesystemDocumentId?: string | null
}

/** Strict identity string; all fields that exist must match for restore. */
export function draftIdentityKey(identity: DraftIdentity): string {
  if (identity.source === 'filesystem') {
    if (identity.schemaVersion !== 3 || !validFilesystemId(identity.filesystemDocumentId)) throw new Error('Invalid filesystem identity')
    return ['3', 'filesystem', identity.filesystemDocumentId].join('\0')
  }
  if (identity.source === 'github' && identity.schemaVersion === 2) {
    return ['2', 'github', identity.repo ?? '', identity.branch ?? '', identity.keymapPath ?? ''].join('\0')
  }
  return [
    String(identity.schemaVersion),
    identity.source,
    identity.repo ?? '',
    identity.branch ?? '',
    identity.keyboard ?? ''
  ].join('\0')
}

export function buildDraftIdentity(
  input: DraftIdentityInput
): DraftIdentity | null {
  if (!input.source) return null
  if (input.source === 'filesystem') {
    return validFilesystemId(input.filesystemDocumentId)
      ? { schemaVersion: 3, source: 'filesystem', filesystemDocumentId: input.filesystemDocumentId }
      : null
  }
  if (input.source === 'github' && input.keymapPath != null && !isRepositoryKeymapPath(input.keymapPath)) return null
  const identity: DraftIdentity = {
    schemaVersion: input.source === 'github' && input.keymapPath ? 2 : DRAFT_SCHEMA_VERSION,
    source: input.source
  }
  if (input.repo) identity.repo = input.repo
  if (input.branch) identity.branch = input.branch
  if (input.keyboard) identity.keyboard = input.keyboard
  if (input.source === 'github' && input.keymapPath) identity.keymapPath = input.keymapPath
  return identity
}

function validFilesystemId(value: unknown): value is string {
  return typeof value === 'string' && /^fs:1:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
}

function draftIdentitiesMatch(
  a: DraftIdentity,
  b: DraftIdentity
): boolean {
  return draftIdentityKey(a) === draftIdentityKey(b)
}

function openDraftDb(): Promise<IDBDatabase> {
  return openDb({
    name: DB_NAME,
    version: DB_VERSION,
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
  })
}

export async function loadStoredDraft(
  identity: DraftIdentity
): Promise<StoredDraft | null> {
  const db = await openDraftDb()
  try {
    const tx = db.transaction(STORE_NAME, 'readonly')
    const store = tx.objectStore(STORE_NAME)
    const row = await idbRequest<StoredDraft | undefined>(
      store.get(draftIdentityKey(identity))
    )
    if (!row) return null
    if (!draftIdentitiesMatch(row, identity)) return null
    return row
  } finally {
    db.close()
  }
}

/** Browser-only recovery inventory; listing never restores a draft or a handle. */
export async function listStoredFilesystemDrafts(): Promise<StoredDraft[]> {
  const db = await openDraftDb()
  try {
    const rows = await idbRequest<StoredDraft[]>(
      db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll()
    )
    return rows.filter(row => row.source === 'filesystem' && row.schemaVersion === 3 &&
      validFilesystemId(row.filesystemDocumentId) && row.id === draftIdentityKey(row) && row.filesystem?.version === 1)
      .sort((a, b) => b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  } finally {
    db.close()
  }
}

export async function saveStoredDraft(
  identity: DraftIdentity,
  draftKeymap: ParsedKeymap,
  layerOperation?: StoredLayerOperationState,
  githubBaseline?: StoredDraft['githubBaseline'],
  guard?: DraftWriteGuard,
  filesystem?: FilesystemRecovery
): Promise<void> {
  if (identity.source === 'filesystem' && (!guard || !filesystem)) throw new Error('Filesystem recovery requires a verified baseline and revision guard')
  if (identity.source === 'filesystem') {
    // Capture before opening IndexedDB: callers may continue editing while it yields.
    draftKeymap = JSON.parse(JSON.stringify(draftKeymap))
    layerOperation = layerOperation && JSON.parse(JSON.stringify(layerOperation))
    filesystem = JSON.parse(JSON.stringify(filesystem))
    guard = { ...guard!, expected: JSON.parse(JSON.stringify(guard!.expected)) }
  }
  const record: StoredDraft = {
    ...identity,
    id: draftIdentityKey(identity),
    draftKeymap,
    ...(layerOperation ? { layerOperation } : {}),
    ...(githubBaseline ? { githubBaseline } : {}),
    ...(filesystem ? { filesystem } : {}),
    updatedAt: Date.now()
  }

  const db = await openDraftDb()
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    if (guard) {
      const previous = await idbRequest<StoredDraft | undefined>(store.get(record.id))
      if (!guard.isCurrent() || JSON.stringify(previous ?? null) !== JSON.stringify(guard.expected)) {
        await txDone(tx)
        throw new Error('Firmware recovery changed in another session')
      }
    }
    await idbRequest(store.put(record))
    if (guard?.verifyAfterPut && !guard.isCurrent()) {
      tx.abort()
      await txDone(tx)
      throw new Error('Firmware reload consent changed during persistence')
    }
    await txDone(tx)
    guard?.accepted?.(record)
  } finally {
    db.close()
  }
}

export async function deleteStoredDraft(
  identity: DraftIdentity,
  guard?: DraftWriteGuard
): Promise<void> {
  if (identity.source === 'filesystem' && !guard) throw new Error('Filesystem recovery deletion requires a revision guard')
  const db = await openDraftDb()
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    if (guard) {
      const previous = await idbRequest<StoredDraft | undefined>(store.get(draftIdentityKey(identity)))
      if (!guard.isCurrent() || JSON.stringify(previous ?? null) !== JSON.stringify(guard.expected)) {
        await txDone(tx)
        throw new Error('Firmware recovery changed in another session')
      }
    }
    await idbRequest(store.delete(draftIdentityKey(identity)))
    await txDone(tx)
    guard?.accepted?.(null)
  } finally {
    db.close()
  }
}
