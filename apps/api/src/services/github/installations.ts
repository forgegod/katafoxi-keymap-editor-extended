import LinkHeader from 'http-link-header'
import * as api from './api.js'
import type { InstallationRepoAccess } from './sessions.js'

type GithubInstallation = { id: number; suspended_at?: string }
type GithubRepository = {
  full_name: string
  permissions?: { push?: boolean }
}

const GITHUB_API_ORIGIN = 'https://api.github.com'
const GITHUB_LIST_PER_PAGE = 100
const GITHUB_MAX_LIST_PAGES = 10

/** Follow GitHub `Link: rel=next` only when it stays on api.github.com. */
function githubApiNextUrl(linkHeader: unknown): string | undefined {
  const raw = typeof linkHeader === 'string' ? linkHeader : ''
  const uri = LinkHeader.parse(raw).get('rel', 'next')?.[0]?.uri
  if (!uri) return undefined
  try {
    const next = new URL(uri, GITHUB_API_ORIGIN)
    if (next.protocol !== 'https:' || next.hostname !== 'api.github.com') return undefined
    return next.href
  } catch {
    return undefined
  }
}

async function collectPaged<T>(
  userToken: string,
  firstUrl: string,
  itemsFrom: (data: unknown) => T[]
): Promise<T[]> {
  const items: T[] = []
  let url: string | undefined = firstUrl
  let pages = 0
  while (url && pages < GITHUB_MAX_LIST_PAGES) {
    pages += 1
    const res = await api.request({ url, token: userToken })
    items.push(...itemsFrom(res.data))
    url = githubApiNextUrl(res.headers.link)
  }
  return items
}

export async function fetchInstallations(userToken: string) {
  const installations = await collectPaged<GithubInstallation>(
    userToken,
    `/user/installations?per_page=${GITHUB_LIST_PER_PAGE}`,
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
      `/user/installations/${installation.id}/repositories?per_page=${GITHUB_LIST_PER_PAGE}`,
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
    /[\s~^:?*\[\\%]/.test(branch) ||
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

const COMMIT_SHA = /^[0-9a-f]{40}$/i

/** Branch name, or a full 40-character commit SHA. */
export function assertCommitish(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new BranchNameError('Choose a branch to copy')
  if (COMMIT_SHA.test(trimmed)) return trimmed
  return assertBranchName(trimmed)
}

export async function createBranch(
  installationToken: string,
  repo: string,
  name: string,
  from: string
): Promise<{ name: string }> {
  const branch = assertBranchName(name)
  const source = assertCommitish(from)

  const { data } = await api.request({
    url: api.githubApiPath('repos', repo, 'commits', source),
    token: installationToken
  })
  const sha = (data as { sha?: unknown }).sha
  if (typeof sha !== 'string' || !sha) {
    throw new BranchNameError('Could not read the source branch')
  }

  await api.request({
    url: api.githubApiPath('repos', repo, 'git', 'refs'),
    method: 'POST',
    token: installationToken,
    data: { ref: `refs/heads/${branch}`, sha }
  })
  return { name: branch }
}

export async function fetchRepoBranches(installationToken: string, repo: string) {
  const branches: unknown[] = []
  let url: string | undefined = `${api.githubApiPath('repos', repo, 'branches')}?per_page=${GITHUB_LIST_PER_PAGE}`
  let pages = 0
  while (url && pages < GITHUB_MAX_LIST_PAGES) {
    pages += 1
    const res = await api.request({ url, token: installationToken })
    branches.push(...(res.data as unknown[]))
    url = githubApiNextUrl(res.headers.link)
  }
  return branches
}
