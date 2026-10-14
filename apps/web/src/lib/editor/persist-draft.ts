import {
  assertLayerKeyCounts,
  diffKeymaps,
  type LayoutKey,
  type ParsedKeymap
} from '@keymap-editor/keymap-core'
import {
  buildDraftIdentity,
  deleteStoredDraft,
  draftIdentityKey,
  loadStoredDraft,
  saveStoredDraft,
  type DraftIdentity,
  type StoredDraft
} from '../draft-storage'
import { adoptHoldTaps, adoptSensorBindings, cloneParsedKeymap, cloneLayout } from './keymap-clone'
import { PERSIST_DEBOUNCE_MS } from './types'
import type { EditorState } from './state.svelte'
import { cloneLayerSnapshot, layerBaselineFingerprint, type StoredLayerOperationState } from './layer-operation-state'

const MISMATCHED_DRAFT_NOTICE =
  'The unpublished draft in this browser does not match the current keyboard layout. It was not restored.'

const MISMATCHED_DRAFT_CONFIRM =
  'An unpublished draft was saved in this browser, but it no longer matches this keyboard layout. Discard it?\n\nOK = Discard · Cancel = Keep stored'

function isParsedKeymapShape(value: unknown): value is ParsedKeymap {
  if (!value || typeof value !== 'object') return false
  const layers = (value as { layers?: unknown }).layers
  if (!Array.isArray(layers)) return false
  return layers.every(layer => Array.isArray(layer))
}

function draftMatchesLayout(
  layout: LayoutKey[] | null,
  draft: unknown
): draft is ParsedKeymap {
  if (!isParsedKeymapShape(draft)) return false
  if (!layout) return true
  try {
    assertLayerKeyCounts(
      layout,
      draft.layers.map(layer => layer.map(() => ''))
    )
    return true
  } catch {
    return false
  }
}

/** Identity for the currently loaded editor document (strict restore key). */
export function currentDraftIdentity(this: EditorState): DraftIdentity | null {
  return buildDraftIdentity({
    source: this.source,
    repo: this.githubMeta?.repository,
    branch: this.githubMeta?.branch,
    keymapPath: this.githubMeta?.keymapPath,
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

/** Cancel the debounce and write now (tab hide, GitHub login redirect). */
export function flushPendingPersist(this: EditorState) {
  const token = this._persistGeneration
  this._cancelPersistTimer()
  return this._flushPersist(token)
}

export async function _flushPersist(this: EditorState, token: number) {
  if (token !== this._persistGeneration) return
  if (this.hasPendingFirmwareRecovery) return
  const identity = this.currentDraftIdentity()
  if (!identity || !this.draftKeymap) return
  if (identity.keymapPath) {
    const key = draftIdentityKey(identity)
    const draft = cloneParsedKeymap(this.draftKeymap)
    const layer = this._storedLayerOperation()
    const dirty = this.isDirty
    const baseline = this.baselineKeymap && this.baselineLayout && this.githubMeta?.headSha
      ? { headSha: this.githubMeta.headSha, keymap: cloneParsedKeymap(this.baselineKeymap), layout: cloneLayout(this.baselineLayout)! }
      : undefined
    const write = this._draftWrites.then(async () => {
      if (token !== this._persistGeneration) return
      if (!this._githubDraftRows.has(key)) throw new Error('Firmware recovery has not been read')
      const guard = {
        expected: this._githubDraftRows.get(key)!,
        isCurrent: () => token === this._persistGeneration,
        accepted: (row: StoredDraft | null) => { this._githubDraftRows.set(key, row) }
      }
      if (dirty) await saveStoredDraft(identity, draft, layer, baseline, guard)
      else await deleteStoredDraft(identity, guard)
    })
    this._draftWrites = write.catch(() => {
      if (token === this._persistGeneration) this.saveNotice = { kind: 'error', messages: ['Could not retain firmware recovery safely. Another session or unavailable storage may have changed it.'] }
    })
    await this._draftWrites
    return
  }
  try {
    if (!this.isDirty) {
      await deleteStoredDraft(identity)
      return
    }
    if (token !== this._persistGeneration) return
    await saveStoredDraft(identity, cloneParsedKeymap(this.draftKeymap), this._storedLayerOperation(),
      identity.keymapPath && this.baselineKeymap && this.baselineLayout && this.githubMeta?.headSha
        ? { headSha: this.githubMeta.headSha, keymap: cloneParsedKeymap(this.baselineKeymap), layout: cloneLayout(this.baselineLayout)! }
        : undefined)
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
  if (identity.keymapPath) {
    await this._flushPersist(this._persistGeneration)
    return
  }
  try {
    await deleteStoredDraft(identity)
  } catch {
    /* ignore */
  }
}

export async function _maybeRestorePersistedDraft(this: EditorState, selectToken: number, prepared?: { stored: StoredDraft | null }) {
  if (!this.baselineKeymap || !this.draftKeymap) return
  const identity = this.currentDraftIdentity()
  if (!identity) return
  const identityKey = draftIdentityKey(identity)

  let stored
  try {
    stored = prepared ? prepared.stored : await loadStoredDraft(identity)
  } catch {
    return
  }
  if (selectToken !== this._selectGeneration) return
  if (!this._draftIdentityMatches(identityKey)) return
  if (identity.keymapPath) this._githubDraftRows.set(identityKey, stored)
  if (!stored) return

  if (this.source === 'github' && identity.keymapPath) {
    const base = stored.githubBaseline
    if (!base || !base.headSha || !Array.isArray(base.layout) || !draftMatchesLayout(base.layout, base.keymap) || !draftMatchesLayout(base.layout, stored.draftKeymap)) {
      this.hasPendingFirmwareRecovery = true
      this.saveNotice = { kind: 'error', messages: ['Stored GitHub draft provenance is invalid; the recovery row was retained.'] }
      return
    }
    this.baselineKeymap = cloneParsedKeymap(base.keymap)
    this.baselineLayout = cloneLayout(base.layout)
    this.layout = cloneLayout(base.layout)
    this.draftKeymap = cloneParsedKeymap(base.keymap)
    if (this.githubMeta) this.githubMeta = { ...this.githubMeta, headSha: base.headSha }
  }

  try {
    if (!draftMatchesLayout(this.layout, stored.draftKeymap) ||
      (stored.layerOperation && !validStoredLayerOperation.call(this, stored.layerOperation, stored.draftKeymap))) {
      await offerDiscardMismatchedDraft.call(
        this,
        identity,
        identityKey,
        selectToken
      )
      return
    }

    // Stale clean record — drop without prompting.
    if (diffKeymaps(this.baselineKeymap, stored.draftKeymap).length === 0 && !stored.layerOperation) {
      this._handledDraftIdentityKey = identityKey
      try {
        await deleteStoredDraft(identity, identity.keymapPath ? {
          expected: stored,
          isCurrent: () => selectToken === this._selectGeneration,
          accepted: row => { this._githubDraftRows.set(identityKey, row) }
        } : undefined)
      } catch {
        /* ignore */
      }
      return
    }
  } catch {
    await offerDiscardMismatchedDraft.call(
      this,
      identity,
      identityKey,
      selectToken
    )
    return
  }

  // Re-check identity around the blocking prompt so a superseded select cannot
  // show or apply a Restore/Discard decision for the wrong keyboard.
  if (selectToken !== this._selectGeneration) return
  if (!this._draftIdentityMatches(identityKey)) return

  const restore = window.confirm(
    this.source === 'github'
      ? 'An unpublished draft was saved in this browser. Restore it?\n\nOK = Restore · Cancel = Keep stored'
      : 'An unpublished draft was saved in this browser. Restore it?\n\nOK = Restore · Cancel = Discard'
  )
  if (selectToken !== this._selectGeneration) return
  if (!this._draftIdentityMatches(identityKey)) return

  this._handledDraftIdentityKey = identityKey

  if (restore) {
    this.draftKeymap = adoptSensorBindings(
      adoptHoldTaps(cloneParsedKeymap(stored.draftKeymap), this.baselineKeymap),
      this.baselineKeymap
    )
    if (stored.layerOperation) {
      this.layerOperationSnapshot = cloneLayerSnapshot(stored.layerOperation.snapshot)
      this._baselineLayerIds = [...stored.layerOperation.baselineIds]
      this.layerView = { ...stored.layerOperation.view, shown: [...stored.layerOperation.view.shown] }
      if (this.source === 'clipboard') this.clipboardOriginalSource = stored.layerOperation.snapshot.source
    }
    this.clearHistory()
  } else if (this.source === 'github') {
    this.hasPendingFirmwareRecovery = true
  } else {
    try {
      await deleteStoredDraft(identity)
    } catch {
      /* ignore */
    }
  }
}

async function offerDiscardMismatchedDraft(
  this: EditorState,
  identity: DraftIdentity,
  identityKey: string,
  selectToken: number
) {
  if (selectToken !== this._selectGeneration) return
  if (!this._draftIdentityMatches(identityKey)) return

  this.saveNotice = {
    kind: 'warning',
    messages: [MISMATCHED_DRAFT_NOTICE]
  }

  if (identity.keymapPath) {
    this.hasPendingFirmwareRecovery = true
    return
  }

  const discard = window.confirm(MISMATCHED_DRAFT_CONFIRM)
  if (selectToken !== this._selectGeneration) return
  if (!this._draftIdentityMatches(identityKey)) return

  this._handledDraftIdentityKey = identityKey
  if (!discard) return
  try {
    await deleteStoredDraft(identity)
  } catch {
    /* ignore */
  }
}

/** True when the open draft identity still matches `identityKey`. */
export function _draftIdentityMatches(this: EditorState, identityKey: string): boolean {
  const current = this.currentDraftIdentity()
  return current != null && draftIdentityKey(current) === identityKey
}

export function _storedLayerOperation(this: EditorState): StoredLayerOperationState | undefined {
  if (!this.baselineKeymap || !this.layerOperationSnapshot?.identityAware) return undefined
  return {
    version: 1,
    baselineFingerprint: layerBaselineFingerprint(this.baselineKeymap),
    baselineSource: this._baselineClipboardSource,
    baselineIds: [...this._baselineLayerIds],
    snapshot: cloneLayerSnapshot(this.layerOperationSnapshot),
    view: { ...this.layerView, shown: [...this.layerView.shown] }
  }
}

function validStoredLayerOperation(this: EditorState, state: StoredLayerOperationState, draft: ParsedKeymap): boolean {
  const idsValid = (ids: unknown, count: number): ids is string[] =>
    Array.isArray(ids) && ids.length === count && ids.every(id => typeof id === 'string') && new Set(ids).size === count
  return state.version === 1 && this.baselineKeymap !== null &&
    state.baselineFingerprint === layerBaselineFingerprint(this.baselineKeymap) &&
    state.baselineSource === this._baselineClipboardSource &&
    idsValid(state.baselineIds, this.baselineKeymap.layers.length) &&
    state.snapshot?.identityAware === true && idsValid(state.snapshot.ids, draft.layers.length) &&
    (state.snapshot.source === null || typeof state.snapshot.source === 'string') &&
    draftMatchesLayout(this.layout, state.snapshot.sourceModel) &&
    Array.isArray(state.view?.shown) && state.view.shown.every(index => Number.isInteger(index) && index >= 0) &&
    typeof state.view.layer0Raw === 'boolean'
}

