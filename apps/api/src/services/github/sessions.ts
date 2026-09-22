import crypto from 'node:crypto'

const SESSION_TTL_MS = 24 * 60 * 60 * 1000
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000

export type Session = {
  login: string
  oauthAccessToken: string
  expiresAt: number
}

const sessions = new Map<string, Session>()
const oauthStates = new Map<string, { expiresAt: number }>()

function pruneExpired<T extends { expiresAt: number }>(map: Map<string, T>) {
  const now = Date.now()
  for (const [key, value] of map) {
    if (value.expiresAt <= now) map.delete(key)
  }
}

export function createSession(input: {
  login: string
  oauthAccessToken: string
}): string {
  pruneExpired(sessions)
  const id = crypto.randomBytes(32).toString('base64url')
  sessions.set(id, {
    login: input.login,
    oauthAccessToken: input.oauthAccessToken,
    expiresAt: Date.now() + SESSION_TTL_MS
  })
  return id
}

export function getSession(id: string): Session | undefined {
  pruneExpired(sessions)
  const session = sessions.get(id)
  if (!session) return undefined
  if (session.expiresAt <= Date.now()) {
    sessions.delete(id)
    return undefined
  }
  return session
}

export function touchSession(id: string): Session | undefined {
  const session = getSession(id)
  if (!session) return undefined
  session.expiresAt = Date.now() + SESSION_TTL_MS
  return session
}

export function deleteSession(id: string): void {
  sessions.delete(id)
}

export function createOauthState(): string {
  pruneExpired(oauthStates)
  const state = crypto.randomBytes(32).toString('base64url')
  oauthStates.set(state, { expiresAt: Date.now() + OAUTH_STATE_TTL_MS })
  return state
}

/** Single-use: removes state whether or not it was still valid. */
export function consumeOauthState(state: string): boolean {
  pruneExpired(oauthStates)
  const entry = oauthStates.get(state)
  oauthStates.delete(state)
  if (!entry) return false
  return entry.expiresAt > Date.now()
}
