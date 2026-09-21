import {
  generateKeymap,
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

async function fetchKeymap(
  installationToken: string,
  repository: string,
  branch?: string
) {
  try {
    const { data: keymap } = await fetchFile(
      installationToken,
      repository,
      'config/keymap.json',
      { raw: true, branch }
    )
    return keymap
  } catch (err) {
    if (err instanceof MissingRepoFile) {
      return {
        keyboard: 'unknown',
        keymap: 'unknown',
        layout: 'unknown',
        layer_names: ['default'],
        layers: [[]] as string[][]
      }
    }
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
  const { data: info } = await fetchFile(
    installationToken,
    repository,
    'config/info.json',
    { raw: true, branch }
  )
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
    file => file.name.toLowerCase().endsWith('.keymap')
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
  const generatedKeymap = generateKeymap(layout, keymap, template)
  const originalCodeKeymap = await findCodeKeymap(installationToken, repository, branch)

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
          content: generatedKeymap.code
        },
        {
          path: 'config/keymap.json',
          mode: MODE_FILE,
          type: 'blob',
          content: generatedKeymap.json
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
}
