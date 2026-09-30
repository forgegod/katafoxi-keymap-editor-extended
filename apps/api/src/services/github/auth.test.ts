import { describe, expect, it } from 'vitest'
import { appTokenTimestamps } from './auth.js'

describe('appTokenTimestamps', () => {
  it('issues the token a minute early and keeps exp inside an 8 minute window', () => {
    const now = 1_700_000_000
    expect(appTokenTimestamps(now)).toEqual({
      iat: now - 60,
      exp: now + 8 * 60
    })
  })
})
