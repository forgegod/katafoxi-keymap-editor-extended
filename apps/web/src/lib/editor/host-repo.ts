import {
  buildHostKeymapDeliverableFiles,
  buildHostKeymapSnapshot,
  encodeHostKeymapSnapshot,
  hostLayout,
  hostLayoutFromKeymapSnapshotKeys,
  hostLayoutMeta,
  type HostKeymapDeliverableFile,
  type HostKeymapSnapshot,
  type HostLayout
} from '@keymap-editor/keymap-core'
import {
  deleteUserHostLayout,
  sanitizeHostLegendView,
  saveUserHostLayout,
  UNKNOWN_HOST_LAYOUT_NOTE,
  type HostLanguageId,
  type UserHostLayoutRecord
} from '../host-layout-store'
import type { EditorState } from './state.svelte'

/**
 * Live host snapshot text for the open legend + referenced user layouts.
 * Used for GitHub Commit and dirty comparison against the repo baseline.
 */
export function buildCurrentHostKeymapSnapshot(this: EditorState): HostKeymapSnapshot {
  void this.hostLayoutRevision
  void this.hostLegend
  const layouts = this.userLayouts.flatMap(meta => {
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
  return buildHostKeymapSnapshot(this.hostLegend, layouts)
}

/**
 * Linux xkb + Windows `.klc` sources for the same Commit as the host snapshot.
 * Empty when every column is still a system layout.
 */
export function buildCurrentHostKeymapDeliverables(this: EditorState): HostKeymapDeliverableFile[] {
  void this.hostLayoutRevision
  void this.hostLegend
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
  return encodeHostKeymapSnapshot(this.buildCurrentHostKeymapSnapshot())
}

/**
 * After a successful Commit, set the repo tip to the snapshot that was sent.
 * Pass the encoding captured at write time so mid-flight host edits stay dirty.
 */
export function acceptHostRepoBaseline(this: EditorState, encoded?: string) {
  this._hostRepoBaselineEncoded =
    encoded !== undefined ? encoded : this._encodeLiveHostSnapshot()
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
  for (const record of records) {
    if (selectToken !== this._selectGeneration) {
      await this._rollbackUserHostLayoutWrites(writtenIds)
      return
    }
    await saveUserHostLayout(record)
    writtenIds.push(record.id)
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

