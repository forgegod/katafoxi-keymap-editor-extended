import type { ParsedKeymap } from '@keymap-editor/keymap-core'
import { formatKeymapSaveWarnings } from '../keymap-save-warnings.js'
import { writeClipboardOriginalSource } from '../clipboard/session.js'
import { extractErrorMessages } from './helpers'
import { cloneParsedKeymap } from './keymap-clone'
import type { EditorState } from './state.svelte'
import type { GithubMeta } from './types'

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
 * After successful publish + successful reload: replace baseline and draft
 * from re-read keymap, then apply save-response warnings.
 * Clears IndexedDB draft only here (not on reload failure).
 */
export function applyPublished(this: EditorState, reloaded: ParsedKeymap, saveMeta?: unknown) {
  const baseline = cloneParsedKeymap(reloaded)
  this.baselineKeymap = baseline
  this.draftKeymap = cloneParsedKeymap(baseline)
  this.clearHistory()
  const warnings = formatKeymapSaveWarnings(
    saveMeta && typeof saveMeta === 'object'
      ? (saveMeta as { warnings?: unknown }).warnings
      : undefined
  )
  this.saveNotice =
    warnings.length > 0 ? { kind: 'warning', messages: warnings } : null
  void this.clearPersistedDraft()
}

/** After Copy .keymap: sync baseline; the export sheet carries user-facing notes. */
export function applyClipboardCopied(this: EditorState, reloaded: ParsedKeymap, _saveMeta?: unknown) {
  const baseline = cloneParsedKeymap(reloaded)
  this.baselineKeymap = baseline
  this.draftKeymap = cloneParsedKeymap(baseline)
  this.clearHistory()
  this.saveNotice = null
  const identity = this.currentDraftIdentity()
  if (identity && this.clipboardOriginalSource) {
    writeClipboardOriginalSource(identity, this.clipboardOriginalSource)
  }
  void this.clearPersistedDraft()
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

