import { describe, expect, it } from 'vitest'
import { assertLocalDevAdapterAllowed, originFromBaseUrl, parseDotEnvText } from './config.js'

describe('assertLocalDevAdapterAllowed', () => {
  it('refuses to start when ENABLE_LOCAL is true and NODE_ENV is production', () => {
    expect(() => assertLocalDevAdapterAllowed(true, 'production')).toThrow(
      /ENABLE_LOCAL cannot be enabled when NODE_ENV is production/
    )
  })

  it('allows ENABLE_LOCAL outside production', () => {
    expect(() => assertLocalDevAdapterAllowed(true, 'development')).not.toThrow()
    expect(() => assertLocalDevAdapterAllowed(true, 'test')).not.toThrow()
    expect(() => assertLocalDevAdapterAllowed(true, undefined)).not.toThrow()
  })

  it('allows production when ENABLE_LOCAL is false', () => {
    expect(() => assertLocalDevAdapterAllowed(false, 'production')).not.toThrow()
  })
})

describe('parseDotEnvText', () => {
  it('keeps literal \\n in a quoted GITHUB_APP_PRIVATE_KEY', () => {
    const parsed = parseDotEnvText(
      'GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\\nMIIE\\n-----END RSA PRIVATE KEY-----\\n"\n'
    )
    expect(parsed.GITHUB_APP_PRIVATE_KEY).toBe(
      '-----BEGIN RSA PRIVATE KEY-----\\nMIIE\\n-----END RSA PRIVATE KEY-----\\n'
    )
  })

  it('does not join a real multiline PEM onto GITHUB_APP_PRIVATE_KEY', () => {
    const parsed = parseDotEnvText(`GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----
MIIE
-----END RSA PRIVATE KEY-----"
ENABLE_GITHUB=true
`)
    expect(parsed.GITHUB_APP_PRIVATE_KEY).toBe('"-----BEGIN RSA PRIVATE KEY-----')
    expect(parsed.ENABLE_GITHUB).toBe('true')
  })
})

describe('originFromBaseUrl', () => {
  it('returns the origin of a valid APP_BASE_URL', () => {
    expect(originFromBaseUrl('https://editor.example/app')).toBe('https://editor.example')
    expect(originFromBaseUrl('not a url')).toBe('http://127.0.0.1:5173')
  })
})
