import crypto from 'node:crypto'

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000
export const SESSION_COOKIE_MAX_AGE_SEC = Math.floor(SESSION_TTL_MS / 1000)
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000

const DEFAULT_SESSION_MAP_MAX = 10_000
const DEFAULT_OAUTH_STATE_MAP_MAX = 2_000
const PRUNE_INTERVAL_MS = 5 * 60 * 1000

/** Cached per-repo ACL for the signed-in user and this App installation. */
export type InstallationRepoAccess = {
  installationId: number
  push: boolean
}

export type InstallationAccessCache = {
  repos: Record<string, InstallationRepoAccess>
  expiresAt: number
}

export type Session = {
  login: string
  oauthAccessToken: string
  expiresAt: number
  installationAccess?: InstallationAccessCache
}

const sessions = new Map<string, Session>()
const oauthStates = new Map<string, { expiresAt: number }>()

let sessionMapMax = DEFAULT_SESSION_MAP_MAX
let oauthStateMapMax = DEFAULT_OAUTH_STATE_MAP_MAX
let pruneTimer: ReturnType<typeof setInterval> | undefined

function pruneExpired<T extends { expiresAt: number }>(map: Map<string, T>) {
  const now = Date.now()
  for (const [key, value] of map) {
    if (value.expiresAt <= now) map.delete(key)
  }
}

function evictOldestIfOverCap<T extends { expiresAt: number }>(map: Map<string, T>, max: number) {
  while (map.size > max) {
    let oldestKey: string | undefined
    let oldestExp = Infinity
    for (const [key, value] of map) {
      if (value.expiresAt < oldestExp) {
        oldestExp = value.expiresAt
        oldestKey = key
      }
    }
    if (oldestKey === undefined) break
    map.delete(oldestKey)
  }
}

export function startSessionPruneTimer(): void {
  if (pruneTimer) return
  pruneTimer = setInterval(() => {
    pruneExpired(sessions)
    pruneExpired(oauthStates)
  }, PRUNE_INTERVAL_MS)
  pruneTimer.unref?.()
}

export function stopSessionPruneTimer(): void {
  if (!pruneTimer) return
  clearInterval(pruneTimer)
  pruneTimer = undefined
}

/** Test-only: lower map caps so eviction can be asserted without thousands of entries. */
export function setMapCapsForTests(caps: { sessions?: number; oauthStates?: number }): void {
  if (caps.sessions != null) sessionMapMax = caps.sessions
  if (caps.oauthStates != null) oauthStateMapMax = caps.oauthStates
}

export function resetMapCapsForTests(): void {
  sessionMapMax = DEFAULT_SESSION_MAP_MAX
  oauthStateMapMax = DEFAULT_OAUTH_STATE_MAP_MAX
}

export function sessionMapSizeForTests(): number {
  return sessions.size
}

export function oauthStateMapSizeForTests(): number {
  return oauthStates.size
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
  evictOldestIfOverCap(sessions, sessionMapMax)
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
  evictOldestIfOverCap(oauthStates, oauthStateMapMax)
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
