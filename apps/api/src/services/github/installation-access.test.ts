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
      repoInstallationMap: { 'acme/lark': 1 }
    })
    const session = sessionWithToken()

    await expect(
      assertInstallationAccess(
        { oauth_access_token: 'user-token' },
        '1',
        'acme/lark',
        session
      )
    ).resolves.toBeUndefined()

    expect(session.installationAccess?.repoInstallationMap).toEqual({ 'acme/lark': 1 })
    expect(installations.fetchInstallationRepos).toHaveBeenCalledTimes(1)

    await assertInstallationAccess(
      { oauth_access_token: 'user-token' },
      '1',
      'acme/lark',
      session
    )
    expect(installations.fetchInstallationRepos).toHaveBeenCalledTimes(1)
  })

  it('rejects a foreign installation id', async () => {
    vi.mocked(installations.fetchInstallationRepos).mockResolvedValue({
      installations: [{ id: 1 }],
      repositories: [{ full_name: 'acme/lark' }],
      repoInstallationMap: { 'acme/lark': 1 }
    })
    const session = sessionWithToken()

    await expect(
      assertInstallationAccess(
        { oauth_access_token: 'user-token' },
        '999',
        'acme/lark',
        session
      )
    ).rejects.toBeInstanceOf(InstallationAccessError)
  })

  it('rejects a repository that is not in the user map', async () => {
    vi.mocked(installations.fetchInstallationRepos).mockResolvedValue({
      installations: [{ id: 1 }],
      repositories: [{ full_name: 'acme/lark' }],
      repoInstallationMap: { 'acme/lark': 1 }
    })
    const session = sessionWithToken()

    await expect(
      assertInstallationAccess(
        { oauth_access_token: 'user-token' },
        '1',
        'acme/other',
        session
      )
    ).rejects.toBeInstanceOf(InstallationAccessError)
  })

  it('refreshes the cache after the ACL TTL', async () => {
    vi.useFakeTimers()
    vi.mocked(installations.fetchInstallationRepos).mockResolvedValue({
      installations: [{ id: 1 }],
      repositories: [{ full_name: 'acme/lark' }],
      repoInstallationMap: { 'acme/lark': 1 }
    })
    const session = sessionWithToken()

    await assertInstallationAccess(
      { oauth_access_token: 'user-token' },
      '1',
      'acme/lark',
      session
    )
    vi.advanceTimersByTime(INSTALLATION_ACCESS_TTL_MS + 1)
    await assertInstallationAccess(
      { oauth_access_token: 'user-token' },
      '1',
      'acme/lark',
      session
    )
    expect(installations.fetchInstallationRepos).toHaveBeenCalledTimes(2)
  })
})
