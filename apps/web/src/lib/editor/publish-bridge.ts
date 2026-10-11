import { diffKeymaps, type ParsedKeymap } from '@keymap-editor/keymap-core'
import { formatKeymapSaveWarnings } from '../keymap-save-warnings.js'
import { writeClipboardOriginalSource } from '../clipboard/session.js'
import { extractErrorMessages } from './helpers'
import { cloneLayout, cloneParsedKeymap } from './keymap-clone'
import type { EditorState } from './state.svelte'
import type { GithubMeta } from './types'
import { cloneLayerSnapshot, initialLayerSnapshot } from './layer-operation-state'

/** Bind an asynchronous copy receipt to its exact source/identity snapshot. */
export function captureLayerOperationSnapshot(this: EditorState, sentDraft: ParsedKeymap): boolean {
  if (!this.layerOperationSnapshot) return false
  this._layerHistory.set(sentDraft, cloneLayerSnapshot(this.layerOperationSnapshot))
  return this.layerOperationSnapshot.identityAware
}

export function beginPublish(this: EditorState): number {
  this._publishGeneration += 1
  return this._publishGeneration
}

/**
 * True when a reload result still matches the publish that started it
 * (same generation, source, and GitHub identity).
 */
export function isPublishCurrent(this: EditorState, 
  token: number,
  source: string | null,
  github: GithubMeta | null
): boolean {
  if (token !== this._publishGeneration) return false
  if (this.source !== source) return false
  if (source === 'github') {
    if (!this.githubMeta || !github) return false
    if (
      this.githubMeta.repository !== github.repository ||
      this.githubMeta.branch !== github.branch
    ) {
      return false
    }
  }
  return true
}

/** ZMK draft and/or host snapshot need a GitHub Commit. */
export function isPublishDirty(this: EditorState): boolean {
  return this.isDirty || this.isHostRepoDirty
}

/**
 * After successful publish + successful reload: replace baseline from the
 * re-read keymap. Replace the live draft only when it still matches what
 * was sent; in-flight edits stay dirty and keep their IndexedDB row.
 */
export function applyPublished(
  this: EditorState,
  reloaded: ParsedKeymap,
  saveMeta?: unknown,
  sentDraft?: ParsedKeymap | null
) {
  const liveLayer = this.layerOperationSnapshot
  const publishedLayer = (sentDraft ? this._layerHistory.get(sentDraft) : liveLayer) ?? initialLayerSnapshot(reloaded, this.clipboardOriginalSource)
  this._baselineLayerIds = [...publishedLayer.ids]
  this._baselineClipboardSource = this.source === 'clipboard' ? this.clipboardOriginalSource : null
  this.baselineKeymap = cloneParsedKeymap(reloaded)
  if (this.layout) this.baselineLayout = cloneLayout(this.layout)
  const draftUnchanged =
    !sentDraft ||
    !this.draftKeymap ||
    (diffKeymaps(sentDraft, this.draftKeymap).length === 0 &&
      (!liveLayer || JSON.stringify(liveLayer.ids) === JSON.stringify(publishedLayer.ids)))
  if (draftUnchanged) {
    this.draftKeymap = cloneParsedKeymap(this.baselineKeymap)
    this.layerOperationSnapshot = {
      ...cloneLayerSnapshot(publishedLayer),
      source: this._baselineClipboardSource,
      sourceModel: cloneParsedKeymap(reloaded)
    }
    this.clearHistory()
    void this.clearPersistedDraft()
  } else {
    if (liveLayer && JSON.stringify(liveLayer.ids) === JSON.stringify(publishedLayer.ids)) {
      this.layerOperationSnapshot = {
        ...cloneLayerSnapshot(liveLayer),
        source: this._baselineClipboardSource,
        sourceModel: cloneParsedKeymap(reloaded)
      }
    } else if (liveLayer && this.source === 'clipboard') {
      this.clipboardOriginalSource = liveLayer.source
    }
    this.schedulePersist()
  }
  const warnings = formatKeymapSaveWarnings(
    saveMeta && typeof saveMeta === 'object'
      ? (saveMeta as { warnings?: unknown }).warnings
      : undefined
  )
  this.saveNotice =
    warnings.length > 0 ? { kind: 'warning', messages: warnings } : null
}

/** Accept the copied baseline without losing newer edits; warnings stay in the sheet. */
export function applyClipboardCopied(
  this: EditorState,
  reloaded: ParsedKeymap,
  _saveMeta?: unknown,
  sentDraft?: ParsedKeymap
) {
  applyPublished.call(this, reloaded, undefined, sentDraft)
  this.saveNotice = null
  const identity = this.currentDraftIdentity()
  if (identity && this._baselineClipboardSource) {
    writeClipboardOriginalSource(identity, this._baselineClipboardSource)
  }
}

/** Publish (POST/commit) succeeded but reload failed — keep draft dirty. */
export function applyReloadFailure(this: EditorState, source: string | null = this.source) {
  const where =
    source === 'github'
      ? 'repository'
      : source === 'clipboard'
        ? 'clipboard'
        : 'disk'
  this.saveNotice = {
    kind: 'error',
    messages: [
      `Write succeeded, but reloading from ${where} failed. Draft is still dirty and may differ from the published files.`
    ]
  }
}

export function applySaveFailure(this: EditorState, data: unknown) {
  this.saveNotice = { kind: 'error', messages: extractErrorMessages(data) }
}

