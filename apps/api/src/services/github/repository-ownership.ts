import {
  isRepositoryKeymapPath, REPOSITORY_KEYMAP_MODE_PATH,
  type RepositoryKeymapMode
} from '@keymap-editor/keymap-core'
import * as api from './api.js'

export class RepositorySelectionError extends Error {
  errors: string[]
  constructor(message: string) {
    super(message)
    this.name = 'RepositorySelectionError'
    this.errors = [message]
  }
}

export type TreeEntry = { path: string; type: string; mode: string }
export type ConfigDirEntry = { name: string; path: string; type?: string }
export const regularBlob = (entry: TreeEntry) => entry.type === 'blob' && ['100644', '100755'].includes(entry.mode)
export type Inventory = { entries: Map<string, TreeEntry>; listing: ConfigDirEntry[]; candidates: ConfigDirEntry[] }

export async function repositoryInventory(token: string, repository: string, treeSha: string, listing: ConfigDirEntry[]): Promise<Inventory> {
  const { data } = await api.request({ url: api.githubApiPath('repos', repository, 'git', 'trees', treeSha), token, params: { recursive: '1' } })
  const result = data as { truncated?: boolean; tree?: TreeEntry[] }
  if (result?.truncated !== false || !Array.isArray(result.tree) || !Array.isArray(listing)) {
    throw new RepositorySelectionError('Repository inventory is incomplete; ownership mode is unknown')
  }
  const entries = new Map<string, TreeEntry>()
  for (const entry of result.tree) {
    if (typeof entry.path !== 'string' || entries.has(entry.path) || typeof entry.type !== 'string' || typeof entry.mode !== 'string') {
      throw new RepositorySelectionError('Invalid repository tree inventory')
    }
    entries.set(entry.path, entry)
  }
  const direct = result.tree.filter(entry => /^config\/[^/]+$/.test(entry.path))
  if (direct.length !== listing.length || new Set(listing.map(entry => entry.path)).size !== listing.length || listing.some(entry =>
    entry.path !== `config/${entry.name}` || !entries.has(entry.path)
  )) throw new RepositorySelectionError('Config inventory disagrees with the pinned tree')
  const candidates = listing.filter(entry => isRepositoryKeymapPath(entry.path) && regularBlob(entries.get(entry.path)!) && (entry.type === undefined || entry.type === 'file'))
    .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  return { entries, listing, candidates }
}

export function requireRegularPath(inventory: Inventory, filePath: string) {
  for (const [entryPath, entry] of inventory.entries) {
    if ((entryPath === filePath && !regularBlob(entry)) || (filePath.startsWith(`${entryPath}/`) && entry.type !== 'tree')) {
      throw new RepositorySelectionError(`Unsafe repository file ownership: ${filePath}`)
    }
  }
}

export async function ownershipMode(token: string, repository: string, ref: string, inventory: Inventory, expectedMode?: RepositoryKeymapMode): Promise<RepositoryKeymapMode> {
  const marker = inventory.entries.get(REPOSITORY_KEYMAP_MODE_PATH)
  if (marker) {
    requireRegularPath(inventory, REPOSITORY_KEYMAP_MODE_PATH)
    const { data } = await api.request({ url: api.githubApiPath('repos', repository, 'contents', REPOSITORY_KEYMAP_MODE_PATH), token, params: { ref }, headers: { Accept: 'application/vnd.github.v3.raw' } })
    let value: unknown
    try { value = typeof data === 'string' ? JSON.parse(data) : data } catch { /* unknown mode */ }
    const record = value as Record<string, unknown> | undefined
    if (!record || record.version !== 1 || record.mode !== 'scoped' || Object.keys(record).length !== 2) {
      throw new RepositorySelectionError('Invalid scoped mode marker; ownership mode is unknown')
    }
    return 'scoped'
  }
  const scopedEvidence = [...inventory.entries.keys()].some(p => /^config\/[^/]+\.keymap\.json$/i.test(p) || p === 'host_keymap/keymaps' || p.startsWith('host_keymap/keymaps/'))
  if (scopedEvidence || expectedMode === 'scoped') {
    throw new RepositorySelectionError('Missing scoped mode marker; ownership mode is unknown')
  }
  return inventory.candidates.length === 1 ? 'legacy' : 'scoped-new'
}
