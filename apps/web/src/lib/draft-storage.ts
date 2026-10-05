/**
 * IndexedDB persistence for unpublished editor drafts.
 * Separate from GitHub picker localStorage and auth cookies.
 */

import type { ParsedKeymap } from '@keymap-editor/keymap-core'

import { idbRequest, openDb, txDone } from './idb'

export const DRAFT_SCHEMA_VERSION = 1

const DB_NAME = 'keymap-editor-drafts'
const STORE_NAME = 'drafts'
const DB_VERSION = 1

export type DraftIdentity = {
  schemaVersion: number
  source: string
  repo?: string
  branch?: string
  keyboard?: string
}

export type StoredDraft = DraftIdentity & {
  /** Primary key = {@link draftIdentityKey}. */
  id: string
  draftKeymap: ParsedKeymap
  updatedAt: number
}

export type DraftIdentityInput = {
  source: string | null | undefined
  repo?: string | null
  branch?: string | null
  keyboard?: string | null
}

/** Strict identity string; all fields that exist must match for restore. */
export function draftIdentityKey(identity: DraftIdentity): string {
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
  const identity: DraftIdentity = {
    schemaVersion: DRAFT_SCHEMA_VERSION,
    source: input.source
  }
  if (input.repo) identity.repo = input.repo
  if (input.branch) identity.branch = input.branch
  if (input.keyboard) identity.keyboard = input.keyboard
  return identity
}

export function draftIdentitiesMatch(
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
  draftKeymap: ParsedKeymap
): Promise<void> {
  const record: StoredDraft = {
    ...identity,
    id: draftIdentityKey(identity),
    draftKeymap,
    updatedAt: Date.now()
  }

  const db = await openDraftDb()
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    await idbRequest(store.put(record))
    await txDone(tx)
  } finally {
    db.close()
  }
}

export async function deleteStoredDraft(
  identity: DraftIdentity
): Promise<void> {
  const db = await openDraftDb()
  try {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    await idbRequest(store.delete(draftIdentityKey(identity)))
    await txDone(tx)
  } finally {
    db.close()
  }
}
