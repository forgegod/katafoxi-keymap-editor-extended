import {
  buildKeymapCode,
  isPrimaryKeymapJson,
  isUserKeymapFilename,
  parseDtsKeymap,
  type LayoutKey,
  type ParsedKeymap
} from '@keymap-editor/keymap-core'
import * as api from './api.js'
import * as auth from './auth.js'

const MODE_FILE = '100644'

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

async function fetchKeymapFromDts(
  installationToken: string,
  repository: string,
  branch?: string
) {
  const originalCodeKeymap = await findCodeKeymap(installationToken, repository, branch)
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

  return fetchKeymapFromDts(installationToken, repository, branch)
}

export async function fetchKeyboardFiles(
  installationId: string,
  repository: string,
  branch?: string
) {
  const { data } = await auth.createInstallationToken(installationId)
  const installationToken = (data as { token: string }).token
  const { data: infoRaw } = await fetchFile(
    installationToken,
    repository,
    'config/info.json',
    { raw: true, branch }
  )
  const info = parseJsonBody(infoRaw)
  const keymap = await fetchKeymap(installationToken, repository, branch)
  const originalCodeKeymap = await findCodeKeymap(installationToken, repository, branch)
  return { info, keymap, originalCodeKeymap }
}

export async function findCodeKeymap(
  installationToken: string,
  repository: string,
  branch?: string
) {
  const { data: directory } = await fetchFile(installationToken, repository, 'config', {
    branch
  })
  const originalCodeKeymap = (directory as Array<{ name: string; path: string }>).find(
    file => isUserKeymapFilename(file.name)
  )
  if (!originalCodeKeymap) {
    throw new MissingRepoFile('config/*.keymap')
  }
  return originalCodeKeymap
}

async function findCodeKeymapTemplate(
  installationToken: string,
  repository: string,
  branch?: string
) {
  const { data: directory } = await fetchFile(installationToken, repository, 'config', {
    branch
  })
  const template = (directory as Array<{ name: string; path: string }>).find(file =>
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

export async function commitChanges(
  installationId: string,
  repository: string,
  branch: string,
  layout: LayoutKey[],
  keymap: ParsedKeymap
) {
  const { data } = await auth.createInstallationToken(installationId)
  const installationToken = (data as { token: string }).token
  const template = await findCodeKeymapTemplate(installationToken, repository, branch)
  const originalCodeKeymap = await findCodeKeymap(installationToken, repository, branch)
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

  const { data: treeData } = await api.request({
    url: `/repos/${repository}/git/trees`,
    method: 'POST',
    token: installationToken,
    data: {
      base_tree: commit.tree.sha,
      tree: [
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
