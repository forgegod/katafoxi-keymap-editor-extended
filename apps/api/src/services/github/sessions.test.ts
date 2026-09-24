import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  consumeOauthState,
  createOauthState,
  createSession,
  deleteSession,
  getSession,
  touchSession
} from './sessions.js'

const SESSION_TTL_MS = 24 * 60 * 60 * 1000
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

const createdSessionIds: string[] = []

function trackSession(id: string): string {
  createdSessionIds.push(id)
  return id
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  for (const id of createdSessionIds.splice(0)) {
    deleteSession(id)
  }
  vi.useRealTimers()
})

describe('sessions', () => {
  it('getSession returns undefined after the session TTL', () => {
    const id = trackSession(
      createSession({ login: 'alice', oauthAccessToken: 'tok-a' })
    )

    expect(getSession(id)?.login).toBe('alice')

    vi.advanceTimersByTime(SESSION_TTL_MS + 1)

    expect(getSession(id)).toBeUndefined()
    deleteSession(id)
  })

  it('touchSession extends expiry', () => {
    const id = trackSession(
      createSession({ login: 'bob', oauthAccessToken: 'tok-b' })
    )

    vi.advanceTimersByTime(23 * HOUR_MS)
    expect(touchSession(id)?.login).toBe('bob')

    vi.advanceTimersByTime(23 * HOUR_MS)
    expect(getSession(id)?.login).toBe('bob')

    vi.advanceTimersByTime(2 * HOUR_MS)
    expect(getSession(id)).toBeUndefined()
    deleteSession(id)
  })
})

describe('oauth state', () => {
  it('consumeOauthState is single-use', () => {
    const state = createOauthState()

    expect(consumeOauthState(state)).toBe(true)
    expect(consumeOauthState(state)).toBe(false)
  })

  it('expired oauth state is rejected and removed', () => {
    const expired = createOauthState()

    vi.advanceTimersByTime(OAUTH_STATE_TTL_MS + 1)

    expect(consumeOauthState(expired)).toBe(false)
    expect(consumeOauthState(expired)).toBe(false)

    const fresh = createOauthState()
    expect(consumeOauthState(fresh)).toBe(true)
  })
})
