import { describe, expect, it } from 'vitest'
import { appOrigin, appTokenTimestamps, isTrustedAppOrigin } from './auth.js'
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
