import { describe, expect, it } from 'vitest'
import {
  appOrigin,
  appTokenTimestamps,
  createOauthDeniedUrl,
  isTrustedAppOrigin,
  parseOauthTokenPayload
} from './auth.js'
import { config } from '../../config.js'

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
    expect(isTrustedAppOrigin(fakeContext({ Origin: 'https://evil.example' }))).toBe(false)
  })

  it('falls back to Referer when Origin is absent', () => {
    expect(isTrustedAppOrigin(fakeContext({ Referer: `${expected}/path` }))).toBe(true)
    expect(isTrustedAppOrigin(fakeContext({ Referer: 'https://evil.example/x' }))).toBe(false)
  })

  it('rejects when both Origin and Referer are missing', () => {
    expect(isTrustedAppOrigin(fakeContext({}))).toBe(false)
  })

  it('uses the same origin as config.APP_BASE_URL', () => {
    expect(expected).toBe(new URL(config.APP_BASE_URL).origin)
  })
})
