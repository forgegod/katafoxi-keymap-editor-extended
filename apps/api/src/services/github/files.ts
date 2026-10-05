import {
  buildKeymapCode,
  encodeHostKeymapSnapshot,
  HOST_KEYMAP_SNAPSHOT_PATH,
  isPrimaryKeymapJson,
  isUserKeymapFilename,
  parseDtsKeymap,
  parseHostKeymapSnapshot,
  type HostKeymapDeliverableFile,
  type HostKeymapSnapshot,
  type LayoutKey,
  type ParsedKeymap
} from '@keymap-editor/keymap-core'
import * as api from './api.js'
import * as auth from './auth.js'

const MODE_FILE = '100644'

export interface ConfigDirEntry {
  name: string
  path: string
}

export type ConfigDirListing = ReadonlyArray<ConfigDirEntry>

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

async function fetchFile(
  installationToken: string,
  repository: string,
  filePath: string,
  options: { raw?: boolean; branch?: string | null } = {}
) {
  const { raw = false, branch = null } = options
  const url = `/repos/${repository}/contents/${filePath}`
  const params: Record<string, string> = {}
  if (branch) params.ref = branch

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
  branch?: string
): Promise<ConfigDirEntry[]> {
  const { data: directory } = await fetchFile(token, repository, 'config', {
    branch
  })
  return directory as ConfigDirEntry[]
}

export function findCodeKeymap(listing: ConfigDirListing): ConfigDirEntry {
  const originalCodeKeymap = listing.find(file => isUserKeymapFilename(file.name))
  if (!originalCodeKeymap) {
    throw new MissingRepoFile('config/*.keymap')
  }
  return originalCodeKeymap
}

async function findCodeKeymapTemplate(
  listing: ConfigDirListing,
  installationToken: string,
  repository: string,
  branch?: string
) {
  const template = listing.find(file =>
    file.name.toLowerCase().endsWith('.keymap.template')
  )
  if (template) {
    const { data: content } = await fetchFile(
      installationToken,
      repository,
      template.path,
      { branch, raw: true }
    )
    return content as string
  }
}

async function fetchKeymapFromDts(
  installationToken: string,
  repository: string,
  originalCodeKeymap: ConfigDirEntry,
  branch?: string
) {
  const { data: source } = await fetchFile(
    installationToken,
    repository,
    originalCodeKeymap.path,
    { raw: true, branch }
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
  branch?: string
) {
  try {
    const { data } = await fetchFile(installationToken, repository, 'config/keymap.json', {
      raw: true,
      branch
    })
    try {
      const parsed = parseJsonBody(data)
      if (isPrimaryKeymapJson(parsed)) {
        const record =
          parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
        // Older keymap.json files have no holdTaps field. Read the nodes from
        // the .keymap once; a later save records the array and skips this fetch.
        if (record && !Object.prototype.hasOwnProperty.call(record, 'holdTaps')) {
          try {
            const fromDts = await fetchKeymapFromDts(
              installationToken,
              repository,
              originalCodeKeymap,
              branch
            )
            return { ...record, holdTaps: fromDts.holdTaps ?? [] }
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

  return fetchKeymapFromDts(installationToken, repository, originalCodeKeymap, branch)
}

async function fetchHostKeymapSnapshot(
  installationToken: string,
  repository: string,
  branch?: string
): Promise<HostKeymapSnapshot | null> {
  try {
    const { data } = await fetchFile(
      installationToken,
      repository,
      HOST_KEYMAP_SNAPSHOT_PATH,
      { raw: true, branch }
    )
    const parsed = parseHostKeymapSnapshot(
      typeof data === 'string' ? data : parseJsonBody(data)
    )
    return parsed
  } catch (err) {
    if (err instanceof MissingRepoFile) return null
    throw err
  }
}

async function fetchInfoJson(
  installationToken: string,
  repository: string,
  branch?: string
): Promise<unknown | null> {
  try {
    const { data: infoRaw } = await fetchFile(
      installationToken,
      repository,
      'config/info.json',
      { raw: true, branch }
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
  branch?: string
) {
  const { data } = await auth.createInstallationToken(installationId)
  const installationToken = (data as { token: string }).token
  const info = await fetchInfoJson(installationToken, repository, branch)
  const listing = await listConfigDir(installationToken, repository, branch)
  const originalCodeKeymap = findCodeKeymap(listing)
  const keymap = await fetchKeymap(
    installationToken,
    repository,
    originalCodeKeymap,
    branch
  )
  const hostSnapshot = await fetchHostKeymapSnapshot(
    installationToken,
    repository,
    branch
  )
  return { info, keymap, originalCodeKeymap, hostSnapshot }
}

export async function commitChanges(
  installationId: string,
  repository: string,
  branch: string,
  layout: LayoutKey[],
  keymap: ParsedKeymap,
  hostSnapshot?: HostKeymapSnapshot | null,
  hostDeliverables?: HostKeymapDeliverableFile[] | null
) {
  const { data } = await auth.createInstallationToken(installationId)
  const installationToken = (data as { token: string }).token
  const listing = await listConfigDir(installationToken, repository, branch)
  const template = await findCodeKeymapTemplate(
    listing,
    installationToken,
    repository,
    branch
  )
  const originalCodeKeymap = findCodeKeymap(listing)
  const { data: originalSourceRaw } = await fetchFile(
    installationToken,
    repository,
    originalCodeKeymap.path,
    { raw: true, branch }
  )
  const originalSource =
    typeof originalSourceRaw === 'string' ? originalSourceRaw : String(originalSourceRaw)

  const built = buildKeymapCode(layout, keymap, { template, originalSource })

  const { data: commitData } = await api.request({
    url: `/repos/${repository}/commits/${branch}`,
    token: installationToken
  })
  const { sha, commit } = commitData as {
    sha: string
    commit: { tree: { sha: string } }
  }

  const tree: Array<{ path: string; mode: string; type: string; content: string }> = [
    {
      path: originalCodeKeymap.path,
      mode: MODE_FILE,
      type: 'blob',
      content: built.code
    },
    {
      path: 'config/keymap.json',
      mode: MODE_FILE,
      type: 'blob',
      content: built.json
    }
  ]
  if (hostSnapshot) {
    tree.push({
      path: HOST_KEYMAP_SNAPSHOT_PATH,
      mode: MODE_FILE,
      type: 'blob',
      content: encodeHostKeymapSnapshot(hostSnapshot)
    })
    for (const file of hostDeliverables ?? []) {
      if (!file?.path || typeof file.content !== 'string') continue
      if (!file.path.startsWith('host_keymap/')) continue
      tree.push({
        path: file.path,
        mode: MODE_FILE,
        type: 'blob',
        content: file.content
      })
    }
  }

  const { data: treeData } = await api.request({
    url: `/repos/${repository}/git/trees`,
    method: 'POST',
    token: installationToken,
    data: {
      base_tree: commit.tree.sha,
      tree
    }
  })
  const newTreeSha = (treeData as { sha: string }).sha

  const { data: newCommit } = await api.request({
    url: `/repos/${repository}/git/commits`,
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
    url: `/repos/${repository}/git/refs/heads/${branch}`,
    method: 'PATCH',
    token: installationToken,
    data: { sha: newSha }
  })

  return { mode: built.mode, warnings: built.warnings }
}
