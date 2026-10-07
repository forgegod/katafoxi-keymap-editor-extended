import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  consumeOauthState,
  createOauthState,
  createSession,
  deleteSession,
  getSession,
  OAUTH_STATE_TTL_MS,
  oauthTokenNeedsRefresh,
  resetMapCapsForTests,
  SESSION_ABSOLUTE_TTL_MS,
  sessionMapSizeForTests,
  setMapCapsForTests,
  touchSession,
  updateSessionOauthTokens
} from './sessions.js'

const SESSION_TTL_MS = 24 * 60 * 60 * 1000
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

  it('touchSession cannot extend past the absolute 7-day max', () => {
    const id = trackSession(
      createSession({ login: 'carol', oauthAccessToken: 'tok-c' })
    )

    // Slide for just under 7 days, refreshing before each 24h idle expiry.
    const stepMs = 23 * HOUR_MS
    const steps = Math.floor(SESSION_ABSOLUTE_TTL_MS / stepMs)
    for (let i = 0; i < steps; i++) {
      vi.advanceTimersByTime(stepMs)
      expect(touchSession(id)?.login).toBe('carol')
    }
    const remaining = SESSION_ABSOLUTE_TTL_MS - steps * stepMs
    vi.advanceTimersByTime(remaining - 1)
    expect(touchSession(id)?.login).toBe('carol')

    vi.advanceTimersByTime(2)
    expect(touchSession(id)).toBeUndefined()
    expect(getSession(id)).toBeUndefined()
  })

  it('tracks oauth token expiry and refresh needs', () => {
    const id = trackSession(
      createSession({
        login: 'dave',
        oauthAccessToken: 'tok-d',
        oauthRefreshToken: 'refresh-d',
        expiresInSec: 1
      })
    )
    const session = getSession(id)
    expect(session).toBeDefined()
    expect(oauthTokenNeedsRefresh(session!)).toBe(true)

    updateSessionOauthTokens(id, {
      oauthAccessToken: 'tok-d2',
      oauthRefreshToken: 'refresh-d2',
      expiresInSec: 3600
    })
    expect(getSession(id)?.oauthAccessToken).toBe('tok-d2')
    expect(oauthTokenNeedsRefresh(getSession(id)!)).toBe(false)
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

  it('does not invalidate an earlier HMAC state after 3000 later creates', () => {
    const first = trackOauthState(createOauthState())
    for (let i = 0; i < 3000; i++) createOauthState()
    expect(consumeOauthState(first)).toBe(true)
  })

  it('rejects a tampered HMAC oauth state', () => {
    const state = trackOauthState(createOauthState())
    const last = state[state.length - 1]
    const tampered = state.slice(0, -1) + (last === 'a' ? 'b' : 'a')
    expect(consumeOauthState(tampered)).toBe(false)
    expect(consumeOauthState(state)).toBe(true)
  })
})
