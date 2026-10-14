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
}

export type StoredDraft = DraftIdentity & {
  /** Primary key = {@link draftIdentityKey}. */
  id: string
  draftKeymap: ParsedKeymap
  layerOperation?: StoredLayerOperationState
  updatedAt: number
  githubBaseline?: { headSha: string; keymap: ParsedKeymap; layout: LayoutKey[] }
}

export type DraftWriteGuard = {
  expected: StoredDraft | null
  isCurrent: () => boolean
  accepted?: (record: StoredDraft | null) => void
}

export type DraftIdentityInput = {
  source: string | null | undefined
  repo?: string | null
  branch?: string | null
  keyboard?: string | null
  keymapPath?: string | null
}

/** Strict identity string; all fields that exist must match for restore. */
export function draftIdentityKey(identity: DraftIdentity): string {
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

export async function saveStoredDraft(
  identity: DraftIdentity,
  draftKeymap: ParsedKeymap,
  layerOperation?: StoredLayerOperationState,
  githubBaseline?: StoredDraft['githubBaseline'],
  guard?: DraftWriteGuard
): Promise<void> {
  const record: StoredDraft = {
    ...identity,
    id: draftIdentityKey(identity),
    draftKeymap,
    ...(layerOperation ? { layerOperation } : {}),
    ...(githubBaseline ? { githubBaseline } : {}),
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
