import { describe, expect, it } from 'vitest'
import { assertLocalDevAdapterAllowed, originFromBaseUrl } from './config.js'

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

describe('originFromBaseUrl', () => {
  it('returns the origin of a valid APP_BASE_URL', () => {
    expect(originFromBaseUrl('https://editor.example/app')).toBe('https://editor.example')
    expect(originFromBaseUrl('not a url')).toBe('http://localhost:5173')
  })
})
