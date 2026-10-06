import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  assertInstallationAccess,
  InstallationAccessError,
  INSTALLATION_ACCESS_TTL_MS
} from './installation-access.js'
import * as installations from './installations.js'
import { createSession, deleteSession, getSession } from './sessions.js'

const createdSids: string[] = []

function sessionWithToken() {
  const sid = createSession({ login: 'octocat', oauthAccessToken: 'user-token' })
  createdSids.push(sid)
  return getSession(sid)!
}

beforeEach(() => {
  vi.spyOn(installations, 'fetchInstallationRepos')
})

afterEach(() => {
  for (const sid of createdSids.splice(0)) deleteSession(sid)
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('assertInstallationAccess', () => {
  it('allows a repository mapped to the installation and caches the map', async () => {
    vi.mocked(installations.fetchInstallationRepos).mockResolvedValue({
      installations: [{ id: 1 }],
      repositories: [{ full_name: 'acme/lark' }],
      repoInstallationMap: { 'acme/lark': 1 },
      repoAccess: { 'acme/lark': { installationId: 1, push: true } }
    })
    const session = sessionWithToken()

    await expect(assertInstallationAccess(session, '1', 'acme/lark')).resolves.toBeUndefined()

    expect(session.installationAccess?.repos).toEqual({
      'acme/lark': { installationId: 1, push: true }
    })
    expect(installations.fetchInstallationRepos).toHaveBeenCalledTimes(1)

    await assertInstallationAccess(session, '1', 'acme/lark')
    expect(installations.fetchInstallationRepos).toHaveBeenCalledTimes(1)
  })

  it('rejects a non-numeric installation id', async () => {
    vi.mocked(installations.fetchInstallationRepos).mockResolvedValue({
      installations: [{ id: 1 }],
      repositories: [{ full_name: 'acme/lark' }],
      repoInstallationMap: { 'acme/lark': 1 },
      repoAccess: { 'acme/lark': { installationId: 1, push: true } }
    })
    const session = sessionWithToken()

    await expect(assertInstallationAccess(session, '1e2', 'acme/lark')).rejects.toBeInstanceOf(
      InstallationAccessError
    )
    expect(installations.fetchInstallationRepos).not.toHaveBeenCalled()
  })

  it('rejects a foreign installation id', async () => {
    vi.mocked(installations.fetchInstallationRepos).mockResolvedValue({
      installations: [{ id: 1 }],
      repositories: [{ full_name: 'acme/lark' }],
      repoInstallationMap: { 'acme/lark': 1 },
      repoAccess: { 'acme/lark': { installationId: 1, push: true } }
    })
    const session = sessionWithToken()

    await expect(assertInstallationAccess(session, '999', 'acme/lark')).rejects.toBeInstanceOf(
      InstallationAccessError
    )
  })

  it('rejects a repository that is not in the user map', async () => {
    vi.mocked(installations.fetchInstallationRepos).mockResolvedValue({
      installations: [{ id: 1 }],
      repositories: [{ full_name: 'acme/lark' }],
      repoInstallationMap: { 'acme/lark': 1 },
      repoAccess: { 'acme/lark': { installationId: 1, push: true } }
    })
    const session = sessionWithToken()

    await expect(assertInstallationAccess(session, '1', 'acme/other')).rejects.toBeInstanceOf(
      InstallationAccessError
    )
  })

  it('refreshes the cache after the ACL TTL', async () => {
    vi.useFakeTimers()
    vi.mocked(installations.fetchInstallationRepos).mockResolvedValue({
      installations: [{ id: 1 }],
      repositories: [{ full_name: 'acme/lark' }],
      repoInstallationMap: { 'acme/lark': 1 },
      repoAccess: { 'acme/lark': { installationId: 1, push: true } }
    })
    const session = sessionWithToken()

    await assertInstallationAccess(session, '1', 'acme/lark')
    vi.advanceTimersByTime(INSTALLATION_ACCESS_TTL_MS + 1)
    await assertInstallationAccess(session, '1', 'acme/lark')
    expect(installations.fetchInstallationRepos).toHaveBeenCalledTimes(2)
  })

  it('rejects writes when the user lacks push on the repository', async () => {
    vi.mocked(installations.fetchInstallationRepos).mockResolvedValue({
      installations: [{ id: 1 }],
      repositories: [{ full_name: 'acme/a' }],
      repoInstallationMap: { 'acme/a': 1 },
      repoAccess: { 'acme/a': { installationId: 1, push: false } }
    })
    const session = sessionWithToken()

    await expect(assertInstallationAccess(session, '1', 'acme/a')).resolves.toBeUndefined()
    await expect(
      assertInstallationAccess(session, '1', 'acme/a', { requirePush: true })
    ).rejects.toBeInstanceOf(InstallationAccessError)
  })
})
