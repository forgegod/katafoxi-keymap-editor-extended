import fs from 'node:fs'
import jwt from 'jsonwebtoken'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { config } from '../../config.js'
import * as api from './api.js'
import {
  appOrigin,
  appTokenTimestamps,
  clearInstallationTokenCache,
  createInstallationToken,
  createOauthDeniedUrl,
  isTrustedAppOrigin,
  mintInstallationToken,
  parseOauthTokenPayload
} from './auth.js'

describe('appTokenTimestamps', () => {
  it('issues the token a minute early and keeps exp inside an 8 minute window', () => {
    const now = 1_700_000_000
    expect(appTokenTimestamps(now)).toEqual({
      iat: now - 60,
      exp: now + 8 * 60
    })
  })
})

describe('parseOauthTokenPayload', () => {
  it('accepts a token response with refresh metadata', () => {
    expect(
      parseOauthTokenPayload({
        access_token: 'tok',
        refresh_token: 'ref',
        expires_in: 1
      })
    ).toEqual({
      accessToken: 'tok',
      refreshToken: 'ref',
      expiresInSec: 1
    })
  })

  it('rejects GitHub error bodies and non-string access tokens', () => {
    expect(parseOauthTokenPayload({ error: 'bad_verification_code' })).toBeNull()
    expect(parseOauthTokenPayload({ access_token: 123 })).toBeNull()
    expect(parseOauthTokenPayload({})).toBeNull()
  })
})

describe('createOauthDeniedUrl', () => {
  it('adds login=denied to APP_BASE_URL', () => {
    const url = new URL(createOauthDeniedUrl())
    expect(url.origin + url.pathname).toBe(new URL(config.APP_BASE_URL).origin + new URL(config.APP_BASE_URL).pathname)
    expect(url.searchParams.get('login')).toBe('denied')
  })
})

describe('isTrustedAppOrigin', () => {
  const expected = appOrigin()

  function fakeContext(headers: Record<string, string | undefined>) {
    return {
      req: {
        header: (name: string) => headers[name] ?? headers[name.toLowerCase()]
      }
    } as Parameters<typeof isTrustedAppOrigin>[0]
  }

  it('matches Origin against APP_BASE_URL', () => {
    expect(isTrustedAppOrigin(fakeContext({ Origin: expected }))).toBe(true)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(isTrustedAppOrigin(fakeContext({ Origin: 'https://evil.example' }))).toBe(false)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('https://evil.example')
    )
    warn.mockRestore()
  })

  it('falls back to Referer when Origin is absent', () => {
    expect(isTrustedAppOrigin(fakeContext({ Referer: `${expected}/path` }))).toBe(true)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(isTrustedAppOrigin(fakeContext({ Referer: 'https://evil.example/x' }))).toBe(false)
    warn.mockRestore()
  })

  it('rejects when both Origin and Referer are missing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(isTrustedAppOrigin(fakeContext({}))).toBe(false)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining(`expected ${expected}`)
    )
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('received (none)'))
    warn.mockRestore()
  })

  it('uses the same origin as config.APP_BASE_URL', () => {
    expect(expected).toBe(new URL(config.APP_BASE_URL).origin)
  })
})

describe('createInstallationToken', () => {
  afterEach(() => {
    clearInstallationTokenCache()
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  function stubMint() {
    vi.spyOn(fs, 'readFileSync').mockReturnValue('test-pem')
    vi.spyOn(jwt, 'sign').mockImplementation(() => 'app-jwt')
    return vi.spyOn(api, 'request').mockResolvedValue({
      data: {
        token: 'install-token',
        expires_at: '2026-06-01T13:00:00.000Z'
      },
      headers: {},
      status: 201
    })
  }

  it('mints once for two calls on the same installation until expires_at minus 5 minutes', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T12:00:00.000Z'))
    const request = stubMint()

    await createInstallationToken('1', { repository: 'acme/lark' })
    await createInstallationToken('1', { repository: 'acme/lark' })
    expect(request).toHaveBeenCalledTimes(1)
    if (!config.GITHUB_APP_PRIVATE_KEY) {
      expect(fs.readFileSync).toHaveBeenCalledTimes(1)
    }
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/app/installations/1/access_tokens',
        method: 'POST',
        token: 'app-jwt',
        data: {
          repositories: ['lark'],
          permissions: {
            contents: 'write',
            metadata: 'read',
            actions: 'read'
          }
        }
      })
    )

    vi.setSystemTime(new Date('2026-06-01T12:54:59.000Z'))
    await createInstallationToken('1', { repository: 'acme/lark' })
    expect(request).toHaveBeenCalledTimes(1)

    vi.setSystemTime(new Date('2026-06-01T12:55:00.000Z'))
    await createInstallationToken('1', { repository: 'acme/lark' })
    expect(request).toHaveBeenCalledTimes(2)
  })

  it('mints separately per installation', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-01T12:00:00.000Z'))
    const request = stubMint()

    await createInstallationToken('1', { repository: 'acme/lark' })
    await createInstallationToken('2', { repository: 'acme/lark' })
    expect(request).toHaveBeenCalledTimes(2)
  })
})

describe('mintInstallationToken', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('posts an unscoped token when the repository is omitted', async () => {
    vi.spyOn(fs, 'readFileSync').mockReturnValue('test-pem')
    vi.spyOn(jwt, 'sign').mockImplementation(() => 'app-jwt')
    const request = vi.spyOn(api, 'request').mockResolvedValue({
      data: { token: 'install-token' },
      headers: {},
      status: 201
    })

    await mintInstallationToken('9')
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/app/installations/9/access_tokens',
        data: undefined
      })
    )
  })
})
