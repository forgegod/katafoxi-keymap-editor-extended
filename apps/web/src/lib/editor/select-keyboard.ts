import { buildHostKeymapSnapshot, diffKeymaps, encodeHostKeymapSnapshot, standardHostLegendView } from '@keymap-editor/keymap-core'
import {
  readClipboardOriginalSource,
  writeClipboardOriginalSource
} from '../clipboard/session.js'
import {
  buildDraftIdentity,
  deleteStoredDraft,
  draftIdentityKey,
  saveStoredDraft,
  loadStoredDraft,
  type DraftIdentity,
  type StoredDraft
} from '../draft-storage'
import {
  hostAssembliesSettingId,
  hostLegendSettingId,
  saveHostAssemblies,
  saveHostLegendView,
  loadGithubHostCache,
  saveGithubHostCache,
  type GithubHostCache
} from '../host-layout-store'
import { formatKeymapSaveWarningNotices } from '../keymap-save-warnings.js'
import { adoptHoldTaps, adoptSensorBindings, cloneLayout, cloneParsedKeymap } from './keymap-clone'
import type { EditorState } from './state.svelte'
import type { GithubKeyboardSelection, KeyboardSelection } from './types'
import { initialLayerSnapshot } from './layer-operation-state'

/** Verify retention before releasing an identity. Storage is not publication. */
export async function retainWorkForTransition(this: EditorState): Promise<boolean> {
  // Selected GitHub recovery must not change the legacy source contracts.
  if (this.source !== 'github' || !this.githubMeta?.keymapPath) return true
  if (this.hostRecoveryBusy) return false
  if (this.source === 'github' && this._omitHostKeymapSnapshotOnCommit && this.hasLocalHostRecovery) {
    this.saveNotice = { kind: 'warning', messages: ['Host edits are browser-local and unpublishable to GitHub. Commit cannot save them. Use Discard local host edits to resolve host recovery before switching; firmware is protected separately. Reload preserves your work.'] }
    return false
  }
  const identity = this.currentDraftIdentity()
  if (!identity) return true
  const generation = this._selectGeneration
  const document = this.draftKeymap
  const draft = this.draftKeymap && cloneParsedKeymap(this.draftKeymap)
  const layer = this._storedLayerOperation()
  const host = this._encodeLiveHostSnapshot()
  const dirty = this.isDirty
  const pending = this.hasPendingFirmwareRecovery
  const baseline = () => this.baselineKeymap && this.baselineLayout && this.githubMeta?.headSha
    ? { headSha: this.githubMeta.headSha, keymap: cloneParsedKeymap(this.baselineKeymap), layout: cloneLayout(this.baselineLayout)! }
    : undefined
  const baselineBefore = JSON.stringify(baseline())
  const revision = (row: Pick<StoredDraft, 'draftKeymap' | 'layerOperation' | 'githubBaseline'> | null | undefined) => row
    ? JSON.stringify({ draftKeymap: row.draftKeymap, layerOperation: row.layerOperation, githubBaseline: row.githubBaseline })
    : null
  // Pending recovery is not the live baseline document. Capture the row we
  // actually read/declined, including provenance, before any asynchronous work.
  const expected = pending
    ? revision(this._githubDraftRows.get(draftIdentityKey(identity)))
    : draft && revision({ draftKeymap: draft, layerOperation: layer, githubBaseline: baseline() })
  const current = () => generation === this._selectGeneration && this.draftKeymap === document && this.hasPendingFirmwareRecovery === pending && JSON.stringify(baseline()) === baselineBefore && JSON.stringify(this._storedLayerOperation()) === JSON.stringify(layer) && this._encodeLiveHostSnapshot() === host
  try {
    if (dirty || pending) {
      await this._draftWrites
      let row = await loadStoredDraft(identity)
      if (!pending && revision(row) !== expected) {
        await this.flushPendingPersist()
        row = await loadStoredDraft(identity)
      }
      if (!expected || revision(row) !== expected) throw new Error('Firmware retention could not be verified')
    }
    if (this.source === 'github' && identity.keymapPath && this.hasLocalHostRecovery) {
      await this._persistGithubHostCache()
      const row = await loadGithubHostCache(draftIdentityKey(identity))
      if (row?.workingEncoded !== host || row.baselineEncoded !== this._hostRepoBaselineEncoded || row.headSha !== this.githubMeta?.headSha) throw new Error('Host retention could not be verified')
      if ((dirty || pending) && revision(await loadStoredDraft(identity)) !== expected) throw new Error('Firmware recovery changed during host retention')
    }
    if (!current()) throw new Error('Work changed while retaining recovery; retry')
    return true
  } catch {
    if (generation === this._selectGeneration) this.saveNotice = { kind: 'error', messages: ['Could not verify local recovery. The current selection and unpublished work were retained.'] }
    return false
  }
}

export async function selectKeyboard(this: EditorState, event: KeyboardSelection) {
  const transition = ++this._transitionGeneration
  const githubMeta = event.source === 'github' ? event.github : undefined
  const upcomingIdentity = buildDraftIdentity({
    source: event.source,
    repo: githubMeta?.repository,
    branch: githubMeta?.branch,
    keymapPath: githubMeta?.keymapPath,
    keyboard: event.keymap?.keyboard ?? null
  })
  const upcomingKey = upcomingIdentity
    ? draftIdentityKey(upcomingIdentity)
    : null

  const currentIdentity = this.currentDraftIdentity()
  const sameGithubIdentity = event.source === 'github' && this.source === 'github' && currentIdentity != null && upcomingKey === draftIdentityKey(currentIdentity)
  // Browsing source cards remounts the picker. An unchanged automatic load is
  // not Reload and must not erase a clean document's undo/redo history.
  if (sameGithubIdentity && event.source === 'github' && event.github.keymapPath &&
      !event.userInitiated && !event.preserveSession && event.github.headSha &&
      event.github.headSha === this.githubMeta?.headSha &&
      (event.hostSnapshotError ?? null) === this._hostSnapshotLoadError &&
      this.baselineKeymap && event.keymap && diffKeymaps(this.baselineKeymap, event.keymap).length === 0 &&
      JSON.stringify(this.baselineLayout) === JSON.stringify(event.layout) &&
      (!event.hostSnapshot || encodeHostKeymapSnapshot(event.hostSnapshot) === this._hostRepoBaselineEncoded)) return
  if (sameGithubIdentity && (this.isDirty || this.hasLocalHostRecovery || this.hasPendingFirmwareRecovery)) {
    if (event.github.headSha !== this.githubMeta?.headSha) {
      this.saveNotice = { kind: 'warning', messages: ['Remote revision changed. Your unpublished firmware and host work and original publish base were retained.'] }
    }
    this.schedulePersist()
    return
  }

  if (currentIdentity && upcomingKey !== draftIdentityKey(currentIdentity) && !(event.source === 'github' && event.preserveSession)) {
    if (!await this.retainWorkForTransition() || transition !== this._transitionGeneration) return
  }
  if (this.hostRecoveryBusy) return
  const selectToken = ++this._selectGeneration
  this._publishGeneration += 1
  this.saving = false
  this._persistGeneration += 1
  this._cancelPersistTimer()
  this.endHostEditSession()
  this.legendHover = null

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

  // Read destination recovery before changing the active identity. A storage
  // error is not evidence that the destination is clean.
  let preparedHost: { cached: GithubHostCache | null } | undefined
  let preparedDraft: { stored: StoredDraft | null } | undefined
  if (event.source === 'github' && upcomingIdentity?.keymapPath && !alreadyHandled) {
    try {
      await this._hostCacheWrites
      await this._draftWrites
      preparedHost = { cached: await loadGithubHostCache(upcomingKey!) }
      preparedDraft = { stored: await loadStoredDraft(upcomingIdentity) }
    } catch {
      if (selectToken === this._selectGeneration) this.saveNotice = { kind: 'error', messages: ['Could not read destination recovery. The current selection was retained.'] }
      return
    }
    if (selectToken !== this._selectGeneration) return
  }

  this.hasPendingFirmwareRecovery = false
  this.source = event.source
  this.githubMeta = githubMeta ?? null
  this.noteHostSnapshotLoad(event.source === 'github' ? event.hostSnapshotError : null)
  if (event.source !== 'github') {
    this._hostRepoBaselineEncoded = null
    this._hostLocalOriginEncoded = null
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
  if (!keepLiveDraft) {
    this.layerOperationSnapshot = km ? initialLayerSnapshot(km, this.clipboardOriginalSource) : null
    this._baselineLayerIds = [...(this.layerOperationSnapshot?.ids ?? [])]
    this._baselineClipboardSource = this.clipboardOriginalSource
  }
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

  if (!alreadyHandled && !(sameGithubIdentity && event.source === 'github' && event.hostSnapshotError)) {
    const restoredGithubCache = event.source === 'github' && await this._loadGithubHostCache(event, selectToken, preparedHost)
    if (selectToken !== this._selectGeneration) return
    const hostSnapshot =
      event.source === 'github' ? event.hostSnapshot : undefined
    if (restoredGithubCache) {
      // The identity-scoped cache already applied the origin and working state.
    } else if (hostSnapshot) {
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
  await this._maybeRestorePersistedDraft(selectToken, preparedDraft)
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
  if (this.githubMeta?.keymapPath && github.keymapPath === this.githubMeta.keymapPath && upcomingIdentity && upcomingKey) {
    return preserveSelectedGithubSession.call(this, event, upcomingIdentity, upcomingKey, selectToken)
  }
  if ((this.githubMeta?.keymapPath || github.keymapPath) && this.githubMeta?.keymapPath !== github.keymapPath) {
    this.saveNotice = { kind: 'error', messages: ['Cannot carry drafts into a different keymap file.'] }
    return true
  }
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

/** Selected-file branch carry copies and verifies; it never retires the source. */
async function preserveSelectedGithubSession(this: EditorState, event: GithubKeyboardSelection, next: DraftIdentity, nextKey: string, token: number): Promise<boolean> {
  const previous = this.currentDraftIdentity()!
  const fail = (message: string) => {
    if (token === this._selectGeneration) this.saveNotice = { kind: 'error', messages: [message] }
    return true
  }
  if (event.github.repository !== this.githubMeta?.repository || !event.keymap || !this.baselineKeymap || !this.draftKeymap || !event.layout || !event.github.headSha || this.hasPendingFirmwareRecovery || diffKeymaps(event.keymap, this.baselineKeymap).length || JSON.stringify(event.layout) !== JSON.stringify(this.baselineLayout)) return fail('Cannot carry drafts: the selected file or copied baseline differs.')
  if (this._omitHostKeymapSnapshotOnCommit && this.hasLocalHostRecovery) return fail('Browser-local host recovery must be resolved before carrying firmware to another branch.')
  const carryHost = !this._omitHostKeymapSnapshotOnCommit
  if (carryHost && (event.hostSnapshotError || (this._hostRepoBaselineEncoded !== null && (!event.hostSnapshot || encodeHostKeymapSnapshot(event.hostSnapshot) !== this._hostRepoBaselineEncoded)))) return fail('Cannot carry host work: the copied host baseline differs.')
  const draft = cloneParsedKeymap(this.draftKeymap)
  const layer = this._storedLayerOperation()
  const host = this._encodeLiveHostSnapshot()
  const originalBase = { headSha: this.githubMeta!.headSha!, keymap: cloneParsedKeymap(this.baselineKeymap), layout: cloneLayout(this.baselineLayout)! }
  const current = () => token === this._selectGeneration &&
    this.draftKeymap !== null && diffKeymaps(this.draftKeymap, draft).length === 0 &&
    JSON.stringify(this._storedLayerOperation()) === JSON.stringify(layer) &&
    this._encodeLiveHostSnapshot() === host
  let destinationHost: GithubHostCache | null
  let copiedDraft: StoredDraft | null = null
  try {
    await this._hostCacheWrites
    await this._draftWrites
    if (!current()) return fail('Work changed while preparing branch carry; retry with the current revision.')
    destinationHost = await loadGithubHostCache(nextKey)
    const standard = encodeHostKeymapSnapshot(buildHostKeymapSnapshot(standardHostLegendView(), []))
    if (destinationHost && (carryHost || destinationHost.workingEncoded !== (destinationHost.baselineEncoded ?? standard))) throw new Error('Destination already has host recovery; load it separately')
    const destination = await loadStoredDraft(next)
    if (destination) throw new Error('Destination already has firmware recovery')
    if (!current()) return fail('Work changed while preparing branch carry; retry with the current revision.')
    if (this.isDirty) {
      const previousRow = await loadStoredDraft(previous)
      if (!previousRow || diffKeymaps(previousRow.draftKeymap, draft).length || JSON.stringify(previousRow.layerOperation) !== JSON.stringify(layer)) {
        // Never replace a different stored revision on behalf of branch carry.
        if (previousRow) throw new Error('Original firmware recovery differs; retain it before carrying')
        await saveStoredDraft(previous, draft, layer, originalBase, { expected: null, isCurrent: current })
      }
      const retained = await loadStoredDraft(previous)
      if (!retained || diffKeymaps(retained.draftKeymap, draft).length || JSON.stringify(retained.layerOperation) !== JSON.stringify(layer)) throw new Error('Original draft could not be verified')
      await saveStoredDraft(next, draft, layer, { headSha: event.github.headSha, keymap: cloneParsedKeymap(event.keymap), layout: cloneLayout(event.layout)! }, { expected: null, isCurrent: current })
      const copied = await loadStoredDraft(next)
      if (!copied || diffKeymaps(copied.draftKeymap, draft).length || JSON.stringify(copied.layerOperation) !== JSON.stringify(layer)) throw new Error('Destination draft could not be verified')
      copiedDraft = copied
    }
    if (!current()) return fail('Work changed while preparing branch carry; retry with the current revision.')
    const remoteOrigin = event.hostSnapshot ? encodeHostKeymapSnapshot(event.hostSnapshot) : null
    const copiedHost = carryHost
      ? { baselineEncoded: this._hostRepoBaselineEncoded, baselineSha: this._hostRepoBaselineEncoded ? event.github.headSha : null, workingEncoded: host, headSha: event.github.headSha }
      : { baselineEncoded: destinationHost?.baselineEncoded ?? remoteOrigin, baselineSha: destinationHost?.baselineSha ?? (remoteOrigin ? event.github.headSha : null), workingEncoded: destinationHost?.workingEncoded ?? remoteOrigin ?? standard, headSha: event.github.headSha }
    const revision = await saveGithubHostCache(nextKey, copiedHost, destinationHost?.revision ?? 0, current)
    destinationHost = await loadGithubHostCache(nextKey)
    if (!destinationHost || JSON.stringify(destinationHost) !== JSON.stringify({ id: `github-host:${nextKey}`, ...copiedHost, revision })) throw new Error('Destination host recovery could not be verified')
    if (!current()) return fail('Work changed while preparing branch carry; retry with the current revision.')
  } catch (error) { return fail(error instanceof Error ? error.message : 'Could not retain branch recovery') }
  this.githubMeta = event.github
  this.baselineKeymap = cloneParsedKeymap(event.keymap)
  this.layout = cloneLayout(event.layout)
  this.baselineLayout = cloneLayout(event.layout)
  this._handledDraftIdentityKey = nextKey
  this._githubDraftRows.set(nextKey, copiedDraft)
  await this._loadGithubHostCache(event, token, { cached: destinationHost })
  if (token !== this._selectGeneration) return true
  this.saveNotice = null
  this.schedulePersist()
  return true
}

/** Legacy unselected sessions retain their existing branch migration contract. */
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

