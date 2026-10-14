import path from 'node:path'
import {
  buildKeymapCode,
  encodeHostKeymapSnapshot,
  HOST_KEYMAP_SNAPSHOT_PATH,
  isRepositoryKeymapPath,
  isOwnedHostSnapshotCompatible,
  validateInfoJson,
  pickInfoLayout,
  repositoryKeymapPaths,
  REPOSITORY_KEYMAP_MODE_PATH,
  REPOSITORY_KEYMAP_MODE_CONTENT,
  type RepositoryKeymapMode,
  type RepositoryKeymapSelection,
  isPrimaryKeymapJson,
  matchingInfoJsonFilename,
  parseDtsKeymap,
  parseHostKeymapSnapshot,
  type HostKeymapDeliverableFile,
  type HostKeymapSnapshot,
  type LayoutKey,
  type ParsedKeymap
} from '@keymap-editor/keymap-core'
import * as api from './api.js'
import * as auth from './auth.js'
import { RepositorySelectionError, repositoryInventory, ownershipMode, requireRegularPath, regularBlob, type Inventory } from './repository-ownership.js'
export { RepositorySelectionError } from './repository-ownership.js'

const MODE_FILE = '100644'
const HOST_KEYMAP_LINUX_PREFIX = 'host_keymap/linux/'
const HOST_KEYMAP_WINDOWS_PREFIX = 'host_keymap/windows/'

/**
 * True when a commit blob path is a safe host_keymap deliverable or snapshot.
 * Rejects traversal (`..`), absolute paths, and anything outside the allowlist.
 */
export function isAllowedHostKeymapPath(filePath: string): boolean {
  if (typeof filePath !== 'string' || !filePath) return false
  if (/[\\%\x00-\x1f\x7f]/.test(filePath) || path.posix.normalize(filePath) !== filePath) return false
  if (filePath.includes('\0')) return false
  if (filePath.startsWith('/') || path.win32.isAbsolute(filePath)) return false
  if (filePath.split(/[/\\]/).includes('..')) return false

  const normalized = path.posix.normalize(filePath)
  if (normalized.startsWith('/') || normalized === '..' || normalized.startsWith('../')) {
    return false
  }
  if (normalized.split('/').includes('..')) return false

  if (normalized === HOST_KEYMAP_SNAPSHOT_PATH) return true

  for (const prefix of [HOST_KEYMAP_LINUX_PREFIX, HOST_KEYMAP_WINDOWS_PREFIX]) {
    if (!normalized.startsWith(prefix)) continue
    const rest = normalized.slice(prefix.length)
    if (rest && !rest.includes('/') && rest !== '.' && rest !== '..') return true
  }
  return false
}

export const HOST_DELIVERABLE_MAX_FILES = 32

export function collectHostDeliverables(
  files: HostKeymapDeliverableFile[] | null | undefined
): { files: HostKeymapDeliverableFile[]; warnings: string[] } {
  const selected: HostKeymapDeliverableFile[] = []
  const warnings: string[] = []
  if (!Array.isArray(files)) return { files: selected, warnings }

  const seen = new Set<string>()
  for (const file of files) {
    if (!file?.path || typeof file.content !== 'string') {
      warnings.push('Skipped host deliverable with missing path or content')
      continue
    }
    const normalized = path.posix.normalize(file.path)
    if (normalized === HOST_KEYMAP_SNAPSHOT_PATH) {
      warnings.push(`Skipped host deliverable ${normalized}`)
      continue
    }
    if (!isAllowedHostKeymapPath(file.path)) {
      warnings.push(`Skipped host deliverable ${file.path}`)
      continue
    }
    if (seen.has(normalized)) {
      warnings.push(`Skipped duplicate host deliverable ${normalized}`)
      continue
    }
    if (selected.length >= HOST_DELIVERABLE_MAX_FILES) {
      warnings.push(
        `Skipped host deliverable ${normalized} (limit ${HOST_DELIVERABLE_MAX_FILES})`
      )
      continue
    }
    seen.add(normalized)
    selected.push({ path: normalized, content: file.content })
  }
  return { files: selected, warnings }
}

interface ConfigDirEntry {
  name: string
  path: string
  type?: string
}

type ConfigDirListing = ReadonlyArray<ConfigDirEntry>

export const BRANCH_CHANGED_NOTICE = 'Branch changed on GitHub — reload'

export class MissingRepoFile extends Error {
  path: string
  errors: string[]

  constructor(filePath: string) {
    super()
    this.name = 'MissingRepoFile'
    this.path = filePath
    this.errors = [`Missing file ${filePath}`]
  }
}

export class StaleRepoBase extends Error {
  errors: string[]

  constructor() {
    super(BRANCH_CHANGED_NOTICE)
    this.name = 'StaleRepoBase'
    this.errors = [BRANCH_CHANGED_NOTICE]
  }
}

type HeadCommit = { sha: string; treeSha: string }

async function resolveHeadCommit(
  installationToken: string,
  repository: string,
  branch?: string
): Promise<HeadCommit> {
  let ref = branch
  if (!ref) {
    const { data: repo } = await api.request({
      url: api.githubApiPath('repos', repository),
      token: installationToken
    })
    ref = (repo as { default_branch?: string }).default_branch
    if (!ref) throw new Error('Repository has no default branch')
  }
  const { data } = await api.request({
    url: api.githubApiPath('repos', repository, 'commits', ref),
    token: installationToken
  })
  const commit = data as { sha?: string; commit?: { tree?: { sha?: string } } }
  if (!commit.sha || !commit.commit?.tree?.sha) {
    throw new Error('Could not resolve repository head')
  }
  return { sha: commit.sha, treeSha: commit.commit.tree.sha }
}

async function fetchFile(
  installationToken: string,
  repository: string,
  filePath: string,
  options: { raw?: boolean; ref?: string | null } = {}
) {
  const { raw = false, ref = null } = options
  const url = api.githubApiPath('repos', repository, 'contents', filePath)
  const params: Record<string, string> = {}
  if (ref) params.ref = ref

  const headers: Record<string, string> = {
    Accept: raw ? 'application/vnd.github.v3.raw' : 'application/json'
  }

  try {
    return await api.request({ url, headers, params, token: installationToken })
  } catch (err) {
    const e = err as { response?: { status: number } }
    if (e.response?.status === 404) {
      throw new MissingRepoFile(filePath)
    }
    throw err
  }
}

function parseJsonBody(data: unknown): unknown {
  if (typeof data === 'string') {
    return JSON.parse(data)
  }
  return data
}

export async function listConfigDir(
  token: string,
  repository: string,
  ref?: string
): Promise<ConfigDirEntry[]> {
  const { data: directory } = await fetchFile(token, repository, 'config', {
    ref
  })
  return directory as ConfigDirEntry[]
}

export function findCodeKeymap(listing: ConfigDirListing): ConfigDirEntry {
  const candidates = listing.filter(file => isRepositoryKeymapPath(file.path) && file.path === `config/${file.name}` && (file.type === undefined || file.type === 'file'))
  if (candidates.length > 1) throw new RepositorySelectionError('Select a keymap file')
  const originalCodeKeymap = candidates[0]
  if (!originalCodeKeymap) {
    throw new MissingRepoFile('config/*.keymap')
  }
  return originalCodeKeymap
}

function selectedKeymap(inventory: Inventory, selected?: string): ConfigDirEntry {
  if (selected === undefined) return findCodeKeymap(inventory.candidates)
  if (!isRepositoryKeymapPath(selected)) throw new RepositorySelectionError('Invalid selected keymap path')
  const entry = inventory.candidates.find(entry => entry.path === selected)
  if (!entry) throw new MissingRepoFile(selected)
  return entry
}

async function findCodeKeymapTemplate(
  listing: ConfigDirListing,
  installationToken: string,
  repository: string,
  ref: string,
  selected: string,
  mode: RepositoryKeymapMode,
  inventory: Inventory
) {
  const templates = listing.filter(file => file.name.toLowerCase().endsWith('.keymap.template'))
  let template = templates.find(file => file.path === `${selected}.template`)
  if (!template && mode === 'legacy') {
    if (templates.length > 1) throw new RepositorySelectionError('Multiple unmatched templates; cannot choose safely')
    template = templates[0]
  }
  if (template) {
    requireRegularPath(inventory, template.path)
    const { data: content } = await fetchFile(
      installationToken,
      repository,
      template.path,
      { ref, raw: true }
    )
    return content as string
  }
}

async function fetchKeymapFromDts(
  installationToken: string,
  repository: string,
  originalCodeKeymap: ConfigDirEntry,
  ref?: string
) {
  const { data: source } = await fetchFile(
    installationToken,
    repository,
    originalCodeKeymap.path,
    { raw: true, ref }
  )
  const text = typeof source === 'string' ? source : String(source)
  const keymapName = originalCodeKeymap.name.replace(/\.keymap$/i, '')
  return parseDtsKeymap(text, {
    keyboard: 'unknown',
    keymap: keymapName,
    layout: 'LAYOUT'
  })
}

async function fetchKeymap(
  installationToken: string,
  repository: string,
  originalCodeKeymap: ConfigDirEntry,
  ref?: string,
  jsonPath = 'config/keymap.json',
  cachedPrimary?: unknown
) {
  try {
    const data = cachedPrimary === undefined ? (await fetchFile(installationToken, repository, jsonPath, {
      raw: true,
      ref
    })).data : cachedPrimary
    try {
      const parsed = parseJsonBody(data)
      if (isPrimaryKeymapJson(parsed)) {
        const record =
          parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
        // Older keymap.json files omit holdTaps and sensorBindings. Read them
        // from the .keymap once; a later save records the arrays and skips this.
        const needsHoldTaps =
          record != null && !Object.prototype.hasOwnProperty.call(record, 'holdTaps')
        const needsSensors =
          record != null && !Object.prototype.hasOwnProperty.call(record, 'sensorBindings')
        if (needsHoldTaps || needsSensors) {
          try {
            const fromDts = await fetchKeymapFromDts(
              installationToken,
              repository,
              originalCodeKeymap,
              ref
            )
            return {
              ...record,
              ...(needsHoldTaps ? { holdTaps: fromDts.holdTaps ?? [] } : {}),
              ...(needsSensors ? { sensorBindings: fromDts.sensorBindings ?? [] } : {})
            }
          } catch {
            // JSON layers still load when the .keymap cannot be read.
          }
        }
        return parsed
      }
    } catch {
      /* unparsable or invalid — fall through to .keymap */
    }
  } catch (err) {
    if (!(err instanceof MissingRepoFile)) {
      throw err
    }
  }

  return fetchKeymapFromDts(installationToken, repository, originalCodeKeymap, ref)
}

async function fetchHostKeymapSnapshot(
  installationToken: string,
  repository: string,
  ref?: string,
  snapshotPath = HOST_KEYMAP_SNAPSHOT_PATH,
  mustExist = false
): Promise<{ hostSnapshot: HostKeymapSnapshot | null; hostSnapshotError?: 'invalid' | 'unsupported_version' | 'incompatible' }> {
  try {
    const { data } = await fetchFile(
      installationToken,
      repository,
      snapshotPath,
      { raw: true, ref }
    )
    const result = parseHostKeymapSnapshot(
      typeof data === 'string' ? data : parseJsonBody(data)
    )
    if (result.ok) return isOwnedHostSnapshotCompatible(result.snapshot)
      ? { hostSnapshot: result.snapshot }
      : { hostSnapshot: null, hostSnapshotError: 'incompatible' }
    return { hostSnapshot: null, hostSnapshotError: result.error === 'unsupported_version' ? 'unsupported_version' : 'invalid' }
  } catch (err) {
    if (err instanceof MissingRepoFile && !mustExist) return { hostSnapshot: null }
    throw err
  }
}

function matchingInfoPath(keymap: ConfigDirEntry): string | null {
  const filename = matchingInfoJsonFilename(keymap.name)
  return filename ? path.posix.join(path.posix.dirname(keymap.path), filename) : null
}

async function fetchInfoJson(
  installationToken: string,
  repository: string,
  originalCodeKeymap: ConfigDirEntry,
  ref?: string,
  mode: RepositoryKeymapMode = 'legacy'
): Promise<unknown | null> {
  if (mode === 'legacy') try {
    const { data: infoRaw } = await fetchFile(
      installationToken,
      repository,
      'config/info.json',
      { raw: true, ref }
    )
    return parseJsonBody(infoRaw)
  } catch (err) {
    if (!(err instanceof MissingRepoFile)) throw err
  }

  const fallbackPath = matchingInfoPath(originalCodeKeymap)
  if (!fallbackPath) return null

  try {
    const { data: infoRaw } = await fetchFile(
      installationToken,
      repository,
      fallbackPath,
      { raw: true, ref }
    )
    return parseJsonBody(infoRaw)
  } catch (err) {
    if (err instanceof MissingRepoFile) return null
    throw err
  }
}

export async function fetchKeyboardFiles(
  installationId: string,
  repository: string,
  branch?: string,
  selection: RepositoryKeymapSelection = {}
) {
  const { data } = await auth.createInstallationToken(installationId, { repository })
  const installationToken = (data as { token: string }).token
  const head = await resolveHeadCommit(installationToken, repository, branch)
  const ref = head.sha
  const listing = await listConfigDir(installationToken, repository, ref)
  const inventory = await repositoryInventory(installationToken, repository, head.treeSha, listing)
  const originalCodeKeymap = selectedKeymap(inventory, selection.keymapPath)
  const mode = await ownershipMode(installationToken, repository, ref, inventory, selection.expectedMode)
  const paths = repositoryKeymapPaths(originalCodeKeymap.path, mode)
  requireRegularPath(inventory, paths.firmwareJson)
  const json = await readFirmwareJson(installationToken, repository, paths.firmwareJson, ref)
  const jsonChoiceRequired = mode !== 'legacy' && !json && inventory.entries.has('config/keymap.json')
  const useLegacy = jsonChoiceRequired && selection.jsonSource === 'legacy'
  if (useLegacy) {
    requireRegularPath(inventory, 'config/keymap.json')
    if (!await readFirmwareJson(installationToken, repository, 'config/keymap.json', ref)) throw new RepositorySelectionError('Legacy firmware JSON is invalid')
  }
  const host = await ownedHostSnapshot(installationToken, repository, ref, inventory, paths.snapshot, mode)
  validateGeometryPaths(inventory, originalCodeKeymap, mode)
  const [info, keymap] = await Promise.all([
    fetchInfoJson(installationToken, repository, originalCodeKeymap, ref, mode),
    fetchKeymap(installationToken, repository, originalCodeKeymap, ref, useLegacy ? 'config/keymap.json' : paths.firmwareJson, useLegacy ? undefined : json)
  ])
  return { info, keymap, ...host, headSha: head.sha, keymapPath: originalCodeKeymap.path, ownershipMode: mode, jsonSource: useLegacy || (json && mode === 'legacy') ? 'legacy' : json ? 'owned' : 'dts', jsonChoiceRequired }
}

async function readFirmwareJson(token: string, repository: string, filePath: string, ref: string) {
  try {
    const { data } = await fetchFile(token, repository, filePath, { raw: true, ref })
    try {
      const parsed = parseJsonBody(data)
      return isPrimaryKeymapJson(parsed) ? parsed : null
    } catch { return null }
  } catch (err) {
    if (err instanceof MissingRepoFile) return null
    throw err
  }
}

async function ownedHostSnapshot(token: string, repository: string, ref: string, inventory: Inventory, snapshotPath: string, mode: RepositoryKeymapMode) {
  try { requireRegularPath(inventory, snapshotPath) } catch { return { hostSnapshot: null, hostSnapshotError: 'incompatible' as const } }
  const owned = inventory.entries.get(snapshotPath)
  if (owned && !regularBlob(owned)) return { hostSnapshot: null, hostSnapshotError: 'incompatible' as const }
  if (!owned && mode !== 'legacy' && inventory.entries.has(HOST_KEYMAP_SNAPSHOT_PATH)) {
    return { hostSnapshot: null, hostSnapshotError: 'incompatible' as const }
  }
  return fetchHostKeymapSnapshot(token, repository, ref, snapshotPath, !!owned)
}

function validateGeometryPaths(inventory: Inventory, selected: ConfigDirEntry, mode: RepositoryKeymapMode) {
  if (mode === 'legacy') requireRegularPath(inventory, 'config/info.json')
  const matching = matchingInfoPath(selected)
  if (matching) requireRegularPath(inventory, matching)
}

export async function fetchKeymapInventory(installationId: string, repository: string, branch?: string) {
  const { data } = await auth.createInstallationToken(installationId, { repository })
  const token = (data as { token: string }).token
  const head = await resolveHeadCommit(token, repository, branch)
  const listing = await listConfigDir(token, repository, head.sha)
  const inventory = await repositoryInventory(token, repository, head.treeSha, listing)
  return { candidates: inventory.candidates.map(({ name, path }) => ({ name, path })), headSha: head.sha }
}

export async function commitChanges(
  installationId: string,
  repository: string,
  branch: string,
  layout: LayoutKey[],
  keymap: ParsedKeymap,
  hostSnapshot?: HostKeymapSnapshot | null,
  hostDeliverables?: HostKeymapDeliverableFile[] | null,
  baseSha?: string | null,
  selection: RepositoryKeymapSelection = {}
) {
  const { data } = await auth.createInstallationToken(installationId, { repository })
  const installationToken = (data as { token: string }).token
  const head = await resolveHeadCommit(installationToken, repository, branch)
  if (typeof baseSha !== 'string' || !baseSha || baseSha !== head.sha) {
    throw new StaleRepoBase()
  }
  const ref = head.sha
  const listing = await listConfigDir(installationToken, repository, ref)
  const inventory = await repositoryInventory(installationToken, repository, head.treeSha, listing)
  const originalCodeKeymap = selectedKeymap(inventory, selection.keymapPath)
  const mode = await ownershipMode(installationToken, repository, ref, inventory, selection.expectedMode)
  const paths = repositoryKeymapPaths(originalCodeKeymap.path, mode)
  requireRegularPath(inventory, paths.firmwareJson)
  if (mode !== 'legacy' && inventory.entries.has('config/keymap.json') && !await readFirmwareJson(installationToken, repository, paths.firmwareJson, ref)) {
    const choice = selection.jsonChoice
    if (!choice || choice.repository !== repository || choice.branch !== branch || choice.keymapPath !== originalCodeKeymap.path || choice.headSha !== ref || !['dts', 'legacy'].includes(choice.input)) {
      throw new RepositorySelectionError('Explicit per-file firmware JSON choice required at this revision')
    }
    if (choice.input === 'legacy') {
      requireRegularPath(inventory, 'config/keymap.json')
      if (!await readFirmwareJson(installationToken, repository, 'config/keymap.json', ref)) throw new RepositorySelectionError('Legacy firmware JSON is invalid')
    } else {
      await fetchKeymapFromDts(installationToken, repository, originalCodeKeymap, ref)
    }
  }
  const remoteHost = await ownedHostSnapshot(installationToken, repository, ref, inventory, paths.snapshot, mode)
  validateGeometryPaths(inventory, originalCodeKeymap, mode)
  const info = await fetchInfoJson(installationToken, repository, originalCodeKeymap, ref, mode)
  if (info != null) {
    validateInfoJson(info)
    if (pickInfoLayout(info).layout.length !== layout.length) throw new RepositorySelectionError('Selected geometry and submitted layout key count differ')
  }
  const [template, originalSourceResult] = await Promise.all([
    findCodeKeymapTemplate(listing, installationToken, repository, ref, originalCodeKeymap.path, mode, inventory),
    fetchFile(installationToken, repository, originalCodeKeymap.path, {
      raw: true,
      ref
    })
  ])
  const originalSourceRaw = originalSourceResult.data
  const originalSource =
    typeof originalSourceRaw === 'string' ? originalSourceRaw : String(originalSourceRaw)

  const built = buildKeymapCode(layout, keymap, { template, originalSource })
  const sha = head.sha
  const treeSha = head.treeSha

  const tree: Array<{ path: string; mode: string; type: string; content: string }> = [
    {
      path: originalCodeKeymap.path,
      mode: MODE_FILE,
      type: 'blob',
      content: built.code
    },
    {
      path: paths.firmwareJson,
      mode: MODE_FILE,
      type: 'blob',
      content: built.json
    }
  ]
  if (mode === 'scoped-new') tree.push({ path: REPOSITORY_KEYMAP_MODE_PATH, mode: MODE_FILE, type: 'blob', content: REPOSITORY_KEYMAP_MODE_CONTENT })
  const deliverable = collectHostDeliverables(hostDeliverables)
  if (hostSnapshot && !remoteHost.hostSnapshotError) {
    const parsed = parseHostKeymapSnapshot(hostSnapshot)
    if (!parsed.ok || !isOwnedHostSnapshotCompatible(parsed.snapshot)) throw new RepositorySelectionError('Invalid or unresolved submitted host snapshot')
    requireRegularPath(inventory, paths.snapshot)
    tree.push({
      path: paths.snapshot,
      mode: MODE_FILE,
      type: 'blob',
      content: encodeHostKeymapSnapshot(parsed.snapshot)
    })
    for (const file of deliverable.files) {
      const filePath = `${paths.hostRoot}${file.path.slice('host_keymap/'.length)}`
      requireRegularPath(inventory, filePath)
      tree.push({
        path: filePath,
        mode: MODE_FILE,
        type: 'blob',
        content: file.content
      })
    }
  }

  const { data: treeData } = await api.request({
    url: api.githubApiPath('repos', repository, 'git', 'trees'),
    method: 'POST',
    token: installationToken,
    data: {
      base_tree: treeSha,
      tree
    }
  })
  const newTreeSha = (treeData as { sha: string }).sha

  const { data: newCommit } = await api.request({
    url: api.githubApiPath('repos', repository, 'git', 'commits'),
    method: 'POST',
    token: installationToken,
    data: {
      tree: newTreeSha,
      message: 'Updated keymap',
      parents: [sha]
    }
  })
  const newSha = (newCommit as { sha: string }).sha

  await api.request({
    url: api.githubApiPath('repos', repository, 'git', 'refs', 'heads', branch),
    method: 'PATCH',
    token: installationToken,
    data: { sha: newSha }
  })

  return {
    mode: built.mode,
    warnings: [...built.warnings, ...deliverable.warnings],
    hostWritesOmitted: !!remoteHost.hostSnapshotError,
    ...(remoteHost.hostSnapshotError ? { hostSnapshotError: remoteHost.hostSnapshotError } : {})
  }
}
