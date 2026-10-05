import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  consumeOauthState,
  createOauthState,
  createSession,
  deleteSession,
  getSession,
  oauthStateMapSizeForTests,
  resetMapCapsForTests,
  sessionMapSizeForTests,
  setMapCapsForTests,
  touchSession
} from './sessions.js'

const SESSION_TTL_MS = 24 * 60 * 60 * 1000
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000
const HOUR_MS = 60 * 60 * 1000

const createdSessionIds: string[] = []
const createdOauthStates: string[] = []

function trackSession(id: string): string {
  createdSessionIds.push(id)
  return id
}

function trackOauthState(state: string): string {
  createdOauthStates.push(state)
  return state
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  for (const id of createdSessionIds.splice(0)) {
    deleteSession(id)
  }
  for (const state of createdOauthStates.splice(0)) {
    consumeOauthState(state)
  }
  resetMapCapsForTests()
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

  it('evicts the oldest session when over the map cap', () => {
    setMapCapsForTests({ sessions: 2 })

    const first = trackSession(
      createSession({ login: 'first', oauthAccessToken: 't1' })
    )
    vi.advanceTimersByTime(1000)
    const second = trackSession(
      createSession({ login: 'second', oauthAccessToken: 't2' })
    )
    vi.advanceTimersByTime(1000)
    const third = trackSession(
      createSession({ login: 'third', oauthAccessToken: 't3' })
    )

    expect(sessionMapSizeForTests()).toBe(2)
    expect(getSession(first)).toBeUndefined()
    expect(getSession(second)?.login).toBe('second')
    expect(getSession(third)?.login).toBe('third')
  })

  it('evicts the earliest-expiring session after a sliding touch', () => {
    setMapCapsForTests({ sessions: 2 })

    const first = trackSession(
      createSession({ login: 'first', oauthAccessToken: 't1' })
    )
    vi.advanceTimersByTime(1000)
    const second = trackSession(
      createSession({ login: 'second', oauthAccessToken: 't2' })
    )

    vi.advanceTimersByTime(1000)
    touchSession(first)
    const third = trackSession(
      createSession({ login: 'third', oauthAccessToken: 't3' })
    )

    expect(sessionMapSizeForTests()).toBe(2)
    expect(getSession(second)).toBeUndefined()
    expect(getSession(first)?.login).toBe('first')
    expect(getSession(third)?.login).toBe('third')
  })
})

describe('oauth state', () => {
  it('consumeOauthState is single-use', () => {
    const state = trackOauthState(createOauthState())

    expect(consumeOauthState(state)).toBe(true)
    expect(consumeOauthState(state)).toBe(false)
  })

  it('expired oauth state is rejected and removed', () => {
    const expired = trackOauthState(createOauthState())

    vi.advanceTimersByTime(OAUTH_STATE_TTL_MS + 1)

    expect(consumeOauthState(expired)).toBe(false)
    expect(consumeOauthState(expired)).toBe(false)

    const fresh = trackOauthState(createOauthState())
    expect(consumeOauthState(fresh)).toBe(true)
  })

  it('evicts the oldest oauth state when over the map cap', () => {
    setMapCapsForTests({ oauthStates: 2 })

    const first = trackOauthState(createOauthState())
    vi.advanceTimersByTime(1000)
    const second = trackOauthState(createOauthState())
    vi.advanceTimersByTime(1000)
    const third = trackOauthState(createOauthState())

    expect(oauthStateMapSizeForTests()).toBe(2)
    expect(consumeOauthState(first)).toBe(false)
    expect(consumeOauthState(second)).toBe(true)
    expect(consumeOauthState(third)).toBe(true)
  })
})
