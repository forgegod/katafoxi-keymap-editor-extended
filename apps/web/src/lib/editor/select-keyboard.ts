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

/** Capture values as well as object identity before yielding to storage. */
function captureSourceRevision(state: EditorState): () => boolean {
  const document = state.draftKeymap
  const encode = () => JSON.stringify({
    identity: state.currentDraftIdentity(), source: state.source, github: state.githubMeta,
    document: state.draftKeymap, layout: state.layout,
    baseline: state.baselineKeymap, baselineLayout: state.baselineLayout,
    sourceText: state.clipboardOriginalSource, baselineSource: state._baselineClipboardSource,
    layer: state.layerOperationSnapshot, baselineIds: state._baselineLayerIds, view: state.layerView,
    pending: state.hasPendingFirmwareRecovery,
    host: state._encodeLiveHostSnapshot(), hostBaseline: state._hostRepoBaselineEncoded,
    hostOrigin: state._hostLocalOriginEncoded, hostSha: state._hostRepoBaselineSha,
    assemblies: state.hostAssemblies, omitted: state._omitHostKeymapSnapshotOnCommit,
    hostError: state._hostSnapshotLoadError, hostBusy: state.hostRecoveryBusy
  })
  const before = encode()
  return () => state.draftKeymap === document && encode() === before
}

function refuseHostRecoveryTransition(state: EditorState): boolean {
  if (state.source !== 'github' || !state.githubMeta?.keymapPath) return false
  if (state.hostRecoveryBusy) return true
  if (!state._omitHostKeymapSnapshotOnCommit || !state.hasLocalHostRecovery) return false
  state.saveNotice = { kind: 'warning', messages: ['Host edits are browser-local and unpublishable to GitHub. Commit cannot save them. Use Discard local host edits to resolve host recovery before switching; firmware is protected separately. Reload preserves your work.'] }
  return true
}

/** Verify retention before releasing an identity. Storage is not publication. */
export async function retainWorkForTransition(this: EditorState): Promise<boolean> {
  if (this.source !== 'github') {
    if (!this.isDirty) return true
    const identity = this.currentDraftIdentity()
    const generation = this._selectGeneration
    const current = captureSourceRevision(this)
    const expected = JSON.stringify({ draft: this.draftKeymap && cloneParsedKeymap(this.draftKeymap), layer: this._storedLayerOperation() })
    try {
      if (!identity) throw new Error('No source identity')
      if (await this.flushPendingPersist() === false) throw new Error('Firmware persistence refused')
      const stored = await loadStoredDraft(identity)
      if (!current() || !stored || JSON.stringify({ draft: stored.draftKeymap, layer: stored.layerOperation }) !== expected) throw new Error('Firmware retention could not be verified')
      return true
    } catch {
      if (generation === this._selectGeneration) this.saveNotice = { kind: 'error', messages: ['Could not verify local recovery. The current selection and unpublished work were retained.'] }
      return false
    }
  }
  // Legacy unselected GitHub sessions keep their existing contract.
  if (!this.githubMeta?.keymapPath) return true
  if (refuseHostRecoveryTransition(this)) return false
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
    // The declined row protects a different revision. Persistence deliberately
    // cannot replace it, so it is not proof that newer live edits are retained.
    if (pending && dirty) throw new Error('Live firmware differs from pending recovery')
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

  const sourceUnchanged = captureSourceRevision(this)
  if (currentIdentity && upcomingKey !== draftIdentityKey(currentIdentity) && !(event.source === 'github' && event.preserveSession)) {
    if (!await this.retainWorkForTransition() || transition !== this._transitionGeneration) return
  }
  if (this.hostRecoveryBusy) return
  const selectToken = ++this._selectGeneration
  // Supersede the old hydration lock even if this selection returns early.
  this._firmwareRecoveryLoading = false
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
  // A handled firmware recovery does not mean this identity's host tables are
  // still live: leaving the owner unregisters its private layouts.
  const restoreHost = !alreadyHandled || (event.source === 'github' && !sameGithubIdentity)
  // The handled marker suppresses repeated prompts, not rehydration after leaving.
  const restoreFirmware = !alreadyHandled || (event.source === 'github' && !!githubMeta?.keymapPath && !sameGithubIdentity)
  const sameBaseline =
    this.baselineKeymap != null &&
    event.keymap != null &&
    diffKeymaps(this.baselineKeymap, event.keymap).length === 0
  const keepLiveDraft =
    event.source !== 'clipboard' &&
    (!githubMeta?.keymapPath || sameGithubIdentity) &&
    alreadyHandled &&
    this.draftKeymap != null &&
    this.isDirty &&
    sameBaseline

  // Read destination recovery before changing the active identity. A storage
  // error is not evidence that the destination is clean.
  let preparedHost: { cached: GithubHostCache | null } | undefined
  let preparedDraft: { stored: StoredDraft | null } | undefined
  if (event.source === 'github' && upcomingIdentity?.keymapPath && restoreHost) {
    try {
      await this._hostCacheWrites
      await this._draftWrites
      preparedHost = { cached: await loadGithubHostCache(upcomingKey!) }
      if (restoreFirmware) preparedDraft = { stored: await loadStoredDraft(upcomingIdentity) }
    } catch {
      if (selectToken === this._selectGeneration) this.saveNotice = { kind: 'error', messages: ['Could not read destination recovery. The current selection was retained.'] }
      return
    }
    if (selectToken !== this._selectGeneration) return
  }

  // Destination reads can yield to edits after the source retention check.
  if (refuseHostRecoveryTransition(this)) return
  if (!sourceUnchanged()) {
    this.saveNotice = { kind: 'error', messages: ['Work changed while reading destination recovery. The current selection and unpublished work were retained; retry the switch.'] }
    return
  }
  if (this.source === 'github' && this.githubMeta?.keymapPath && this.hasPendingFirmwareRecovery && this.isDirty) {
    this.saveNotice = { kind: 'error', messages: ['Could not verify local recovery. The current selection and unpublished work were retained.'] }
    return
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
  this._dropUnavailableHostLayouts()
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

  // Do not accept firmware edits until hydration and the recovery decision end.
  this._firmwareRecoveryLoading = event.source === 'github' && !!githubMeta?.keymapPath && !!event.keymap && restoreFirmware
  try {
    if (restoreHost && !(sameGithubIdentity && event.source === 'github' && event.hostSnapshotError)) {
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
    if (!restoreFirmware) return
    if (event.source === 'demo' && event.demoHost?.length) {
      await this._seedDemoHostLayouts(event.demoHost, selectToken)
      if (selectToken !== this._selectGeneration) return
    }
    if (event.source === 'demo') {
      await this._maybeAddPreferredDemoLanguage(selectToken)
      if (selectToken !== this._selectGeneration) return
    }
    const hydratedHead = this.githubMeta?.headSha
    await this._maybeRestorePersistedDraft(selectToken, preparedDraft)
    // Firmware recovery may restore an older publish base after host hydration
    // persisted the fetched head. Keep retention's cache and live base coherent.
    if (selectToken === this._selectGeneration && event.source === 'github' &&
        githubMeta?.keymapPath && this.githubMeta?.headSha !== hydratedHead) {
      await this._persistGithubHostCache()
    }
  } finally {
    if (selectToken === this._selectGeneration) this._firmwareRecoveryLoading = false
  }
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
  this._dropUnavailableHostLayouts()
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
  const sourceUnchanged = captureSourceRevision(this)
  const current = () => token === this._selectGeneration && sourceUnchanged()
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
  this._dropUnavailableHostLayouts()
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

