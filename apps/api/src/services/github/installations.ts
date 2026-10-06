import LinkHeader from 'http-link-header'
import * as api from './api.js'
import type { InstallationRepoAccess } from './sessions.js'

type GithubInstallation = { id: number; suspended_at?: string }
type GithubRepository = {
  full_name: string
  permissions?: { push?: boolean }
}

async function collectPaged<T>(
  userToken: string,
  firstUrl: string,
  itemsFrom: (data: unknown) => T[]
): Promise<T[]> {
  const items: T[] = []
  let url: string | undefined = firstUrl
  while (url) {
    const res = await api.request({ url, token: userToken })
    items.push(...itemsFrom(res.data))
    const paging = LinkHeader.parse((res.headers.link as string) || '')
    url = paging.get('rel', 'next')?.[0]?.uri
  }
  return items
}

export async function fetchInstallations(userToken: string) {
  const installations = await collectPaged<GithubInstallation>(
    userToken,
    '/user/installations?per_page=100',
    data => (data as { installations: GithubInstallation[] }).installations
  )
  return installations.filter(installation => !installation.suspended_at)
}

export async function fetchInstallationRepos(userToken: string) {
  const repositories: GithubRepository[] = []
  const installations = await fetchInstallations(userToken)
  const repoAccess: Record<string, InstallationRepoAccess> = {}

  for (const installation of installations) {
    const pageRepos = await collectPaged<GithubRepository>(
      userToken,
      `/user/installations/${installation.id}/repositories?per_page=100`,
      data => (data as { repositories: GithubRepository[] }).repositories
    )
    repositories.push(...pageRepos)
    for (const repo of pageRepos) {
      repoAccess[repo.full_name] = {
        installationId: installation.id,
        push: repo.permissions?.push === true
      }
    }
  }

  const repoInstallationMap = Object.fromEntries(
    Object.entries(repoAccess).map(([name, access]) => [name, access.installationId])
  )

  return { installations, repositories, repoInstallationMap, repoAccess }
}

export class BranchNameError extends Error {
  readonly errors: string[]

  constructor(message: string) {
    super(message)
    this.name = 'BranchNameError'
    this.errors = [message]
  }
}

export class RepositoryNameError extends Error {
  readonly errors: string[]

  constructor(message: string) {
    super(message)
    this.name = 'RepositoryNameError'
    this.errors = [message]
  }
}

/** GitHub `owner/repo` full name. Throws when the shape is not safe to put in a URL. */
export function assertRepositoryName(name: string): string {
  const repository = name.trim()
  if (!repository) throw new RepositoryNameError('Enter a repository')
  const parts = repository.split('/')
  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new RepositoryNameError('Repository must be owner/repo')
  }
  for (const part of parts) {
    if (part === '.' || part === '..' || !/^[A-Za-z0-9._-]+$/.test(part)) {
      throw new RepositoryNameError('Repository name is invalid')
    }
  }
  return repository
}

/** Git ref name, trimmed. Throws when Git would reject the branch. */
export function assertBranchName(name: string): string {
  const branch = name.trim()
  if (!branch) throw new BranchNameError('Enter a branch name')
  if (branch.length > 200) throw new BranchNameError('Branch name is too long')
  if (
    /[\s~^:?*\[\\]/.test(branch) ||
    branch.includes('..') ||
    branch.includes('@{') ||
    branch.includes('//') ||
    branch.startsWith('/') ||
    branch.startsWith('.') ||
    branch.startsWith('-') ||
    branch.endsWith('/') ||
    branch.endsWith('.') ||
    branch.endsWith('.lock')
  ) {
    throw new BranchNameError('Branch name contains characters Git does not allow')
  }
  return branch
}

export async function createBranch(
  installationToken: string,
  repo: string,
  name: string,
  from: string
): Promise<{ name: string }> {
  const branch = assertBranchName(name)
  const source = from.trim()
  if (!source) throw new BranchNameError('Choose a branch to copy')

  const { data } = await api.request({
    url: `/repos/${repo}/commits/${source}`,
    token: installationToken
  })
  const sha = (data as { sha?: unknown }).sha
  if (typeof sha !== 'string' || !sha) {
    throw new BranchNameError('Could not read the source branch')
  }

  await api.request({
    url: `/repos/${repo}/git/refs`,
    method: 'POST',
    token: installationToken,
    data: { ref: `refs/heads/${branch}`, sha }
  })
  return { name: branch }
}

export async function fetchRepoBranches(installationToken: string, repo: string) {
  const branches: unknown[] = []
  let url: string | undefined = `/repos/${repo}/branches`
  while (url) {
    const res = await api.request({ url, token: installationToken })
    const paging = LinkHeader.parse((res.headers.link as string) || '')
    branches.push(...(res.data as unknown[]))
    url = paging.get('rel', 'next')?.[0]?.uri
  }
  return branches
}
