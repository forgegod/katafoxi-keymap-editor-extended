import { diffKeymaps } from '@keymap-editor/keymap-core'
import {
  readClipboardOriginalSource,
  writeClipboardOriginalSource
} from '../clipboard/session.js'
import {
  buildDraftIdentity,
  deleteStoredDraft,
  draftIdentityKey,
  saveStoredDraft,
  type DraftIdentity
} from '../draft-storage'
import {
  hostAssembliesSettingId,
  hostLegendSettingId,
  saveHostAssemblies,
  saveHostLegendView
} from '../host-layout-store'
import { formatKeymapSaveWarningNotices } from '../keymap-save-warnings.js'
import { adoptHoldTaps, adoptSensorBindings, cloneLayout, cloneParsedKeymap } from './keymap-clone'
import type { EditorState } from './state.svelte'
import type { GithubKeyboardSelection, KeyboardSelection } from './types'

export async function selectKeyboard(this: EditorState, event: KeyboardSelection) {
  const selectToken = ++this._selectGeneration
  this._publishGeneration += 1
  this._persistGeneration += 1
  this._cancelPersistTimer()
  this.endHostEditSession()
  this.legendHover = null

  const githubMeta = event.source === 'github' ? event.github : undefined
  const upcomingIdentity = buildDraftIdentity({
    source: event.source,
    repo: githubMeta?.repository,
    branch: githubMeta?.branch,
    keyboard: event.keymap?.keyboard ?? null
  })
  const upcomingKey = upcomingIdentity
    ? draftIdentityKey(upcomingIdentity)
    : null

  if (
    event.source === 'github' &&
    event.preserveSession &&
    (await this._preserveGithubSession(event, upcomingIdentity, upcomingKey, selectToken))
  ) {
    return
  }

  const alreadyHandled =
    upcomingKey != null && upcomingKey === this._handledDraftIdentityKey
  const sameBaseline =
    this.baselineKeymap != null &&
    event.keymap != null &&
    diffKeymaps(this.baselineKeymap, event.keymap).length === 0
  const keepLiveDraft =
    event.source !== 'clipboard' &&
    alreadyHandled &&
    this.draftKeymap != null &&
    this.isDirty &&
    sameBaseline

  this.source = event.source
  this.githubMeta = githubMeta ?? null
  if (event.source !== 'github') {
    this._hostRepoBaselineEncoded = null
  }
  if (event.source === 'clipboard' && upcomingIdentity) {
    const pasted = event.clipboardOriginalSource ?? null
    this.clipboardOriginalSource =
      pasted ?? readClipboardOriginalSource(upcomingIdentity)
    if (pasted) writeClipboardOriginalSource(upcomingIdentity, pasted)
  } else {
    this.clipboardOriginalSource = null
  }
  this.layout = event.layout ?? null
  this.baselineLayout = cloneLayout(event.layout)
  this.schemeMode = false
  this.comboMode = false
  this.activeComboId = null
  this.comboNotice = null
  const km = event.keymap ?? null
  if (!km) {
    this.baselineKeymap = null
    this.draftKeymap = null
    this.clearHistory()
  } else {
    const baseline = cloneParsedKeymap(km)
    this.baselineKeymap = baseline
    if (!keepLiveDraft) {
      this.draftKeymap = cloneParsedKeymap(baseline)
      this.clearHistory()
    } else if (this.draftKeymap) {
      const adopted = adoptSensorBindings(
        adoptHoldTaps(this.draftKeymap, baseline),
        baseline
      )
      if (adopted !== this.draftKeymap) this.draftKeymap = adopted
    }
  }
  this.saveNotice = null
  const loadNotices = formatKeymapSaveWarningNotices(event.warnings)
  if (loadNotices.length > 0) {
    const links = loadNotices.flatMap(notice => (notice.link ? [notice.link] : []))
    this.saveNotice = {
      kind: 'warning',
      messages: loadNotices.map(notice => notice.message),
      links: links.length > 0 ? links : undefined
    }
  }

  if (!alreadyHandled) {
    const hostSnapshot =
      event.source === 'github' ? event.hostSnapshot : undefined
    if (hostSnapshot) {
      await this._applyHostKeymapSnapshot(hostSnapshot, selectToken)
    } else {
      if (event.source === 'github') this._hostRepoBaselineEncoded = null
      await this._restoreHostLegend(selectToken)
    }
  }
  if (selectToken !== this._selectGeneration) return
  if (alreadyHandled) return
  if (event.source === 'demo' && event.demoHost?.length) {
    await this._seedDemoHostLayouts(event.demoHost, selectToken)
    if (selectToken !== this._selectGeneration) return
  }
  if (event.source === 'demo') {
    await this._maybeAddPreferredDemoLanguage(selectToken)
    if (selectToken !== this._selectGeneration) return
  }
  await this._maybeRestorePersistedDraft(selectToken)
}

/**
 * Retarget the open GitHub repo to another branch without dropping the live
 * draft or Host legend (Create branch ≈ `git checkout -b`).
 */
export async function _preserveGithubSession(this: EditorState, 
  event: GithubKeyboardSelection,
  upcomingIdentity: DraftIdentity | null,
  upcomingKey: string | null,
  selectToken: number
): Promise<boolean> {
  const github = event.github
  const km = event.keymap
  if (!github || !km || !this.draftKeymap || !this.baselineKeymap) return false
  if (this.source !== 'github') return false
  if (
    this.githubMeta &&
    this.githubMeta.repository !== github.repository
  ) {
    return false
  }

  const previousIdentity = this.currentDraftIdentity()
  this.source = 'github'
  this.githubMeta = github
  if (event.layout) {
    this.layout = event.layout
    this.baselineLayout = cloneLayout(event.layout)
  }
  this.baselineKeymap = cloneParsedKeymap(km)
  const adopted = adoptSensorBindings(
    adoptHoldTaps(this.draftKeymap, this.baselineKeymap),
    this.baselineKeymap
  )
  if (adopted !== this.draftKeymap) this.draftKeymap = adopted
  this.schemeMode = false
  this.comboMode = false
  this.activeComboId = null
  this.comboNotice = null
  this.saveNotice = null
  this.clipboardOriginalSource = null
  if (upcomingKey) this._handledDraftIdentityKey = upcomingKey

  await this._migrateSessionIdentity(previousIdentity, upcomingIdentity)
  if (selectToken !== this._selectGeneration) return true
  this.schedulePersist()
  return true
}

/** Move draft + Host legend/assemblies IDB rows to the new identity key. */
export async function _migrateSessionIdentity(this: EditorState, 
  previous: DraftIdentity | null,
  next: DraftIdentity | null
): Promise<void> {
  if (!next) return
  const nextKey = draftIdentityKey(next)
  const prevKey = previous ? draftIdentityKey(previous) : null
  if (prevKey === nextKey) {
    await this._persistHostLegend()
    await this._persistHostAssemblies()
    return
  }

  try {
    if (this.draftKeymap && this.isDirty) {
      await saveStoredDraft(next, cloneParsedKeymap(this.draftKeymap))
    }
    if (previous) await deleteStoredDraft(previous)
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('Failed to migrate draft in IndexedDB', err)
    }
    this.saveNotice = {
      kind: 'error',
      messages: [
        'Could not save your draft locally. Changes may be lost if you close this tab.'
      ]
    }
  }

  try {
    await saveHostLegendView(this.hostLegend, hostLegendSettingId(nextKey))
    await saveHostAssemblies(
      hostAssembliesSettingId(nextKey),
      this.hostAssemblies
    )
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('Failed to migrate host settings in IndexedDB', err)
    }
    this.saveNotice = {
      kind: 'error',
      messages: [
        'Could not save your draft locally. Changes may be lost if you close this tab.'
      ]
    }
  }
}

