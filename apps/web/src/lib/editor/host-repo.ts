import {
  buildHostKeymapDeliverableFiles,
  buildHostKeymapSnapshot,
  encodeHostKeymapSnapshot,
  hostLayout,
  hostLayoutFromKeymapSnapshotKeys,
  hostLayoutMeta,
  parseHostKeymapSnapshot,
  standardHostLegendView,
  cloneHostLegendView,
  cloneHostLayoutTable,
  unregisterHostLayout,
  type HostKeymapDeliverableFile,
  type HostKeymapSnapshot,
  type HostLayout
} from '@keymap-editor/keymap-core'
import type { HostSnapshotLoadError } from './types'
import {
  deleteUserHostLayout,
  sanitizeHostLegendView,
  saveUserHostLayout,
  loadGithubHostCache,
  saveGithubHostCache,
  discardGithubHostRecovery,
  isGithubHostLayoutOwnedBy,
  UNKNOWN_HOST_LAYOUT_NOTE,
  type GithubHostCache,
  type HostLanguageId,
  type UserHostLayoutRecord
} from '../host-layout-store'
import { KEYMAP_SAVE_WARNING_MESSAGES } from '../keymap-save-warnings.js'
import type { EditorState } from './state.svelte'
import { draftIdentityKey } from '../draft-storage'
import type { GithubKeyboardSelection } from './types'

function liveHostLayouts(state: EditorState) {
  return state.userLayouts.flatMap(meta => {
    const layout = hostLayout(meta.id)
    if (!layout) return []
    return [
      {
        id: meta.id,
        name: meta.name,
        language: meta.language,
        origin: meta.origin,
        layout
      }
    ]
  })
}

/**
 * Record whether the GitHub snapshot could not be applied so Commit can
 * avoid overwriting a newer `host_keymap/snapshot.json`.
 */
export function noteHostSnapshotLoad(
  this: EditorState,
  error: HostSnapshotLoadError | null | undefined
) {
  this._omitHostKeymapSnapshotOnCommit = !!error
  this._hostSnapshotLoadError = error ?? null
}

/** Re-show the actual omission reason after a firmware-only Commit. */
export function retainHostSnapshotOmitWarning(this: EditorState) {
  if (!this._omitHostKeymapSnapshotOnCommit) return
  const code = this._hostSnapshotLoadError === 'unsupported_version'
    ? 'host_snapshot_unsupported_version'
    : this._hostSnapshotLoadError === 'invalid' ? 'host_snapshot_invalid' : 'host_snapshot_incompatible'
  const message = this.hasLocalHostRecovery
    ? `${KEYMAP_SAVE_WARNING_MESSAGES[code]} Host edits are browser-local and unpublishable to GitHub; Commit cannot save them.`
    : KEYMAP_SAVE_WARNING_MESSAGES[code]
  const prev = this.saveNotice
  if (prev?.kind === 'error') return
  const messages = prev?.messages.includes(message)
    ? prev.messages
    : [...(prev?.messages ?? []), message]
  this.saveNotice = { kind: 'warning', messages, links: prev?.links }
}

/**
 * Live host snapshot for GitHub Commit. Null when the repo snapshot is a
 * newer schema this editor must not overwrite.
 */
export function buildCurrentHostKeymapSnapshot(this: EditorState): HostKeymapSnapshot | null {
  void this.hostLayoutRevision
  void this.hostLegend
  if (this._omitHostKeymapSnapshotOnCommit) return null
  return JSON.parse(this._encodeLiveHostSnapshot()) as HostKeymapSnapshot
}

/**
 * Linux xkb + Windows `.klc` sources for the same Commit as the host snapshot.
 * Empty when every column is still a system layout, or when the repo snapshot
 * must be left untouched.
 */
export function buildCurrentHostKeymapDeliverables(this: EditorState): HostKeymapDeliverableFile[] {
  void this.hostLayoutRevision
  void this.hostLegend
  if (this._omitHostKeymapSnapshotOnCommit) return []
  const layoutsById = new Map<
    string,
    {
      id: string
      name: string
      language: HostLanguageId
      layout: HostLayout
      user: boolean
    }
  >()
  for (const column of this.hostLegend.columns) {
    if (layoutsById.has(column.layoutId)) continue
    const table = hostLayout(column.layoutId)
    if (!table) continue
    const user = this.userLayouts.find(item => item.id === column.layoutId)
    layoutsById.set(column.layoutId, {
      id: column.layoutId,
      name: user?.name ?? hostLayoutMeta(column.layoutId)?.name ?? column.language,
      language: column.language,
      layout: table,
      user: Boolean(user)
    })
  }
  return buildHostKeymapDeliverableFiles(this.hostLegend, layoutsById)
}

export function _encodeLiveHostSnapshot(this: EditorState): string {
  void this.hostLayoutRevision
  void this.hostLegend
  const snapshot = buildHostKeymapSnapshot(this.hostLegend, liveHostLayouts(this))
  return encodeHostKeymapSnapshot(remapSnapshot(snapshot, id => this._githubHostLayoutWireIds.get(id) ?? id))
}

function remapSnapshot(snapshot: HostKeymapSnapshot, mapId: (id: string) => string): HostKeymapSnapshot {
  return { ...snapshot,
    view: { ...snapshot.view, columns: snapshot.view.columns.map(column => ({ ...column, layoutId: mapId(column.layoutId) })) },
    layouts: snapshot.layouts.map(layout => ({ ...layout, id: mapId(layout.id), origin: layout.origin.from === 'copy' ? { ...layout.origin, layoutId: mapId(layout.origin.layoutId) } : layout.origin })) }
}

/**
 * After a successful Commit, set the repo tip to the snapshot that was sent.
 * Pass the encoding captured at write time so mid-flight host edits stay dirty.
 */
export function acceptHostRepoBaseline(this: EditorState, encoded?: string) {
  if (this._omitHostKeymapSnapshotOnCommit) return
  this._hostLocalOriginEncoded = null
  this._hostRepoBaselineEncoded =
    encoded !== undefined ? encoded : this._encodeLiveHostSnapshot()
  this._hostRepoBaselineSha = this.githubMeta?.headSha ?? null
  void this._persistGithubHostCache()
}

/** Capture before queueing: a later source switch cannot redirect this write. */
export function _persistGithubHostCache(this: EditorState): Promise<void> {
  const identity = this.currentDraftIdentity()
  if (this.source !== 'github' || !identity?.keymapPath || this.hostRecoveryBusy || this._loadingGithubHost === this._selectGeneration) return Promise.resolve()
  const key = draftIdentityKey(identity)
  const cache = { baselineEncoded: this._hostRepoBaselineEncoded, baselineSha: this._hostRepoBaselineSha, workingEncoded: this._encodeLiveHostSnapshot(), headSha: this.githubMeta?.headSha ?? '', ...(this._hostLocalOriginEncoded ? { originEncoded: this._hostLocalOriginEncoded } : {}) }
  const generation = this._selectGeneration
  const epoch = this._hostCacheEpoch
  const working = { view: cloneHostLegendView(this.hostLegend), assemblies: this.hostAssemblies.map(item => ({ id: item.id, view: cloneHostLegendView(item.view) })), layouts: this.userLayouts.flatMap(meta => {
    const layout = hostLayout(meta.id)
    return layout && isGithubHostLayoutOwnedBy(meta.id, key) ? [{ ...meta, origin: { ...meta.origin }, layout: cloneHostLayoutTable(layout, meta.id) }] : []
  }) }
  const write = this._hostCacheWrites.then(async () => {
    if (epoch !== this._hostCacheEpoch) return
    const revision = await saveGithubHostCache(key, cache, this._hostCacheRevisions.get(key) ?? 0, () => epoch === this._hostCacheEpoch, working)
    this._hostCacheRevisions.set(key, revision)
  })
  this._hostCacheWrites = write.catch(() => {
    if (generation === this._selectGeneration) this._noteHostLayoutSaveFailed()
  })
  return this._hostCacheWrites
}

export async function _loadGithubHostCache(this: EditorState, event: GithubKeyboardSelection, selectToken: number, prepared?: { cached: GithubHostCache | null }) {
  const identity = this.currentDraftIdentity()
  if (!identity?.keymapPath) return false
  await this._hostCacheWrites
  const key = draftIdentityKey(identity)
  const cached = prepared ? prepared.cached : await loadGithubHostCache(key)
  if (selectToken !== this._selectGeneration) return true
  this._hostCacheRevisions.set(key, cached?.revision ?? 0)
  const standard = encodeHostKeymapSnapshot(buildHostKeymapSnapshot(standardHostLegendView(), []))
  const pending = cached && cached.workingEncoded !== (cached.originEncoded ?? cached.baselineEncoded ?? standard)
  this._hostLocalOriginEncoded = null
  this._loadingGithubHost = selectToken
  try {
    if (cached && (pending || !event.hostSnapshot)) {
      const parsed = parseHostKeymapSnapshot(cached.workingEncoded)
      if (!parsed.ok) throw new Error('Invalid host recovery')
      await this._applyHostKeymapSnapshot(parsed.snapshot, selectToken)
      if (selectToken !== this._selectGeneration) return true
      this._hostRepoBaselineEncoded = cached.baselineEncoded
      this._hostLocalOriginEncoded = cached.originEncoded ?? null
      this._hostRepoBaselineSha = cached.baselineSha
      if (pending && this.githubMeta) this.githubMeta = { ...this.githubMeta, headSha: cached.headSha }
    } else if (event.hostSnapshot) {
      await this._applyHostKeymapSnapshot(event.hostSnapshot, selectToken)
      if (selectToken !== this._selectGeneration) return true
      this._hostRepoBaselineSha = event.github.headSha ?? null
    } else {
      this._hostRepoBaselineEncoded = null
      this._hostRepoBaselineSha = null
      this.hostLegend = standardHostLegendView()
      await this._restoreHostAssemblies(selectToken)
    }
    if (selectToken !== this._selectGeneration) return true
    this.noteHostSnapshotLoad(event.hostSnapshotError)
  } finally {
    if (this._loadingGithubHost === selectToken) this._loadingGithubHost = null
  }
  if (selectToken === this._selectGeneration) await this._persistGithubHostCache()
  return true
}

/**
 * Apply a GitHub `host_keymap/snapshot.json`: register layouts, set the
 * legend, mirror into IndexedDB, and set the repo host baseline.
 * Buffer first, then mutate/persist only while `selectToken` is still current
 * so a superseded select cannot leave a partial layout set on disk.
 */
export async function _applyHostKeymapSnapshot(this: EditorState, 
  snapshot: HostKeymapSnapshot,
  selectToken: number
): Promise<void> {
  if (selectToken !== this._selectGeneration) return
  this._omitHostKeymapSnapshotOnCommit = false
  this._githubHostLayoutWireIds = new Map()
  const identity = this.currentDraftIdentity()
  if (identity?.keymapPath && this.source === 'github') {
    const key = draftIdentityKey(identity)
    const localIds = new Map(snapshot.layouts.map(layout => [layout.id, `user:github:${encodeURIComponent(JSON.stringify([key, layout.id]))}`]))
    this._githubHostLayoutWireIds = new Map([...localIds].map(([wire, local]) => [local, wire]))
    snapshot = remapSnapshot(snapshot, id => localIds.get(id) ?? id)
  }
  const records: UserHostLayoutRecord[] = snapshot.layouts.map(item => ({
    id: item.id,
    name: item.name,
    language: item.language,
    origin: item.origin,
    updatedAt: Date.now(),
    layout: hostLayoutFromKeymapSnapshotKeys(item.id, item.keys)
  }))
  if (selectToken !== this._selectGeneration) return

  for (const record of records) {
    if (selectToken !== this._selectGeneration) return
    this._registerUserLayout(record)
    const listedItem = {
      id: record.id,
      name: record.name,
      language: record.language,
      origin: record.origin,
      updatedAt: record.updatedAt
    }
    this.userLayouts = this.userLayouts.some(entry => entry.id === record.id)
      ? this.userLayouts.map(entry => (entry.id === record.id ? listedItem : entry))
      : [...this.userLayouts, listedItem]
  }

  const { view, replaced } = sanitizeHostLegendView(snapshot.view)
  const writtenIds: string[] = []
  try {
    for (const record of records) {
      if (selectToken !== this._selectGeneration) {
        await this._rollbackUserHostLayoutWrites(writtenIds)
        return
      }
      if (!identity?.keymapPath) {
        await saveUserHostLayout(record)
        writtenIds.push(record.id)
      }
    }
  } catch {
    this._noteHostLayoutSaveFailed()
  }
  if (selectToken !== this._selectGeneration) {
    await this._rollbackUserHostLayoutWrites(writtenIds)
    return
  }

  this.hostLegend = view
  if (replaced.length > 0) this.hostProfileNote = UNKNOWN_HOST_LAYOUT_NOTE
  await this._persistHostLegend()
  if (selectToken !== this._selectGeneration) return
  this._hostRepoBaselineEncoded = this._encodeLiveHostSnapshot()
  this.markHostDelivered()
  await this._restoreHostAssemblies(selectToken)
}

/** Standalone host-only consent. Firmware persistence is deliberately not involved. */
export async function discardLocalHostEdits(this: EditorState): Promise<boolean> {
  const identity = this.currentDraftIdentity()
  const meta = this.githubMeta
  if (this.source !== 'github' || !identity?.keymapPath || !meta || !this._omitHostKeymapSnapshotOnCommit || !this.hasLocalHostRecovery || this.hostRecoveryBusy || this.saving) return false
  const key = draftIdentityKey(identity)
  const generation = this._selectGeneration
  const host = this._encodeLiveHostSnapshot()
  const assemblies = JSON.stringify(this.hostAssemblies)
  const current = () => generation === this._selectGeneration && this._encodeLiveHostSnapshot() === host && JSON.stringify(this.hostAssemblies) === assemblies
  await this._hostCacheWrites
  if (!current()) return false
  const revision = this._hostCacheRevisions.get(key) ?? 0
  if (!window.confirm(`Discard local host edits for ${meta.repository} · ${meta.branch} · ${meta.keymapPath}?\n\nThese edits are browser-local and unpublishable to GitHub; Commit cannot save them. Removes this identity's host working view, private edited layouts, remembered assemblies and host recovery. Resets to system English (not an OS installation).\n\nFirmware drafts, history and remote files are unchanged. Other identities and global host profiles are preserved. Firmware must be safely retained separately before switching.\n\nThis cannot be undone.`)) return false
  if (!current()) return false
  this.hostRecoveryBusy = true
  this._hostCacheEpoch += 1
  try {
    const next = await discardGithubHostRecovery(key, revision, current)
    this._hostCacheRevisions.set(key, next)
    // The transaction has committed: reconcile this identity even if stale host
    // memory changed while awaiting its receipt. Never persist that memory back.
    if (generation !== this._selectGeneration) return false
    for (const layout of this.userLayouts) {
      if (isGithubHostLayoutOwnedBy(layout.id, key)) unregisterHostLayout(layout.id)
    }
    this.userLayouts = this.userLayouts.filter(layout => !isGithubHostLayoutOwnedBy(layout.id, key))
    this._githubHostLayoutWireIds.clear()
    this.hostLegend = standardHostLegendView()
    this.hostAssemblies = []
    this._hostLocalOriginEncoded = this._encodeLiveHostSnapshot()
    this.hostLayoutRevision += 1
    this.endHostEditSession()
    this.legendHover = null
    this.hostProfilePrompt = null
    this.hostProfileNote = null
    this.hostDeliveredFingerprint = ''
    this.saveNotice = { kind: 'warning', messages: ['Local host edits discarded. System English is active; firmware and remote host files are unchanged. Host snapshot and install-file writes are disabled.'] }
    return true
  } catch {
    if (generation === this._selectGeneration) this.saveNotice = { kind: 'error', messages: ['Could not discard local host edits safely. Recovery was retained; retry after resolving storage or another-session changes.'] }
    return false
  } finally {
    if (generation === this._selectGeneration) this.hostRecoveryBusy = false
  }
}

/** Drop IDB rows written by an aborted select batch. */
export async function _rollbackUserHostLayoutWrites(this: EditorState, ids: string[]): Promise<void> {
  for (const id of ids) {
    try {
      await deleteUserHostLayout(id)
    } catch {
      /* ignore */
    }
  }
}
