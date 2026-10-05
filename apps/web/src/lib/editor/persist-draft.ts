import { diffKeymaps } from '@keymap-editor/keymap-core'
import {
  buildDraftIdentity,
  deleteStoredDraft,
  draftIdentityKey,
  loadStoredDraft,
  saveStoredDraft,
  type DraftIdentity
} from '../draft-storage'
import { adoptHoldTaps, adoptSensorBindings, cloneParsedKeymap } from './keymap-clone'
import { PERSIST_DEBOUNCE_MS } from './types'
import type { EditorState } from './state.svelte'

/** Identity for the currently loaded editor document (strict restore key). */
export function currentDraftIdentity(this: EditorState): DraftIdentity | null {
  return buildDraftIdentity({
    source: this.source,
    repo: this.githubMeta?.repository,
    branch: this.githubMeta?.branch,
    keyboard:
      this.draftKeymap?.keyboard ?? this.baselineKeymap?.keyboard ?? null
  })
}

export function _cancelPersistTimer(this: EditorState) {
  if (this._persistTimer != null) {
    clearTimeout(this._persistTimer)
    this._persistTimer = null
  }
}

/** Debounced write of dirty draft; deletes IDB record when draft is clean. */
export function schedulePersist(this: EditorState) {
  const token = this._persistGeneration
  this._cancelPersistTimer()
  this._persistTimer = setTimeout(() => {
    this._persistTimer = null
    void this._flushPersist(token)
  }, PERSIST_DEBOUNCE_MS)
}

export async function _flushPersist(this: EditorState, token: number) {
  if (token !== this._persistGeneration) return
  const identity = this.currentDraftIdentity()
  if (!identity || !this.draftKeymap) return
  try {
    if (!this.isDirty) {
      await deleteStoredDraft(identity)
      return
    }
    if (token !== this._persistGeneration) return
    await saveStoredDraft(identity, cloneParsedKeymap(this.draftKeymap))
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('Failed to persist draft to IndexedDB', err)
    }
    this.saveNotice = {
      kind: 'error',
      messages: [
        'Could not save your draft locally. Changes may be lost if you close this tab.'
      ]
    }
  }
}

/** Drop persisted draft for current identity; cancels pending writes. */
export async function clearPersistedDraft(this: EditorState) {
  this._persistGeneration += 1
  this._cancelPersistTimer()
  this._handledDraftIdentityKey = null
  const identity = this.currentDraftIdentity()
  if (!identity) return
  try {
    await deleteStoredDraft(identity)
  } catch {
    /* ignore */
  }
}

export async function _maybeRestorePersistedDraft(this: EditorState, selectToken: number) {
  if (!this.baselineKeymap || !this.draftKeymap) return
  const identity = this.currentDraftIdentity()
  if (!identity) return
  const identityKey = draftIdentityKey(identity)

  let stored
  try {
    stored = await loadStoredDraft(identity)
  } catch {
    return
  }
  if (selectToken !== this._selectGeneration) return
  if (!this._draftIdentityMatches(identityKey)) return
  if (!stored) return

  // Stale clean record — drop without prompting.
  if (diffKeymaps(this.baselineKeymap, stored.draftKeymap).length === 0) {
    this._handledDraftIdentityKey = identityKey
    try {
      await deleteStoredDraft(identity)
    } catch {
      /* ignore */
    }
    return
  }

  // Re-check identity around the blocking prompt so a superseded select cannot
  // show or apply a Restore/Discard decision for the wrong keyboard.
  if (selectToken !== this._selectGeneration) return
  if (!this._draftIdentityMatches(identityKey)) return

  const restore = window.confirm(
    'An unpublished draft was saved in this browser. Restore it?\n\nOK = Restore · Cancel = Discard'
  )
  if (selectToken !== this._selectGeneration) return
  if (!this._draftIdentityMatches(identityKey)) return

  this._handledDraftIdentityKey = identityKey

  if (restore) {
    this.draftKeymap = adoptSensorBindings(
      adoptHoldTaps(cloneParsedKeymap(stored.draftKeymap), this.baselineKeymap),
      this.baselineKeymap
    )
    this.clearHistory()
  } else {
    try {
      await deleteStoredDraft(identity)
    } catch {
      /* ignore */
    }
  }
}

/** True when the open draft identity still matches `identityKey`. */
export function _draftIdentityMatches(this: EditorState, identityKey: string): boolean {
  const current = this.currentDraftIdentity()
  return current != null && draftIdentityKey(current) === identityKey
}

