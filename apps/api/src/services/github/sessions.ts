import crypto from 'node:crypto'
import { config } from '../../config.js'

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000
export const SESSION_ABSOLUTE_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const SESSION_COOKIE_MAX_AGE_SEC = Math.floor(SESSION_TTL_MS / 1000)
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000

/** Refresh the GitHub user token this long before `tokenExpiresAt`. */
export const TOKEN_REFRESH_SKEW_MS = 60 * 1000

const DEFAULT_SESSION_MAP_MAX = 10_000
const PRUNE_INTERVAL_MS = 5 * 60 * 1000
const DEV_OAUTH_STATE_HMAC_KEY = Buffer.from('dev-oauth-state-hmac-key')

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
  oauthRefreshToken: string | null
  /** When the GitHub access token expires; null if GitHub omitted `expires_in`. */
  tokenExpiresAt: number | null
  /** Sliding idle expiry (capped by absoluteExpiresAt). */
  expiresAt: number
  /** Hard session end; touch cannot extend past this. */
  absoluteExpiresAt: number
  installationAccess?: InstallationAccessCache
}

const sessions = new Map<string, Session>()
/** Nonces of HMAC OAuth states that have already been consumed (replay guard). */
const consumedOauthNonces = new Map<string, { expiresAt: number }>()

let sessionMapMax = DEFAULT_SESSION_MAP_MAX
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

function isSessionAlive(session: Session, now = Date.now()): boolean {
  return session.expiresAt > now && session.absoluteExpiresAt > now
}

function oauthHmacKey(): Buffer {
  const secret = config.GITHUB_CLIENT_SECRET
  return secret ? Buffer.from(secret) : DEV_OAUTH_STATE_HMAC_KEY
}

function signOauthPayload(payload: string): string {
  return crypto.createHmac('sha256', oauthHmacKey()).update(payload).digest('base64url')
}

function hmacEqual(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  if (a.length !== b.length) return false
  return crypto.timingSafeEqual(a, b)
}

function parseSignedOauthState(state: string): { nonce: string; expiresAt: number } | undefined {
  const lastDot = state.lastIndexOf('.')
  if (lastDot <= 0) return undefined
  const payload = state.slice(0, lastDot)
  const mac = state.slice(lastDot + 1)
  if (!mac || !hmacEqual(mac, signOauthPayload(payload))) return undefined
  const sep = payload.indexOf('.')
  if (sep <= 0) return undefined
  const nonce = payload.slice(0, sep)
  const expiresAt = Number(payload.slice(sep + 1))
  if (!nonce || !Number.isFinite(expiresAt)) return undefined
  return { nonce, expiresAt }
}

export function startSessionPruneTimer(): void {
  if (pruneTimer) return
  pruneTimer = setInterval(() => {
    pruneExpired(sessions)
    pruneExpired(consumedOauthNonces)
    const now = Date.now()
    for (const [key, session] of sessions) {
      if (!isSessionAlive(session, now)) sessions.delete(key)
    }
  }, PRUNE_INTERVAL_MS)
  pruneTimer.unref?.()
}

/** Test-only: lower map caps so eviction can be asserted without thousands of entries. */
export function setMapCapsForTests(caps: { sessions?: number }): void {
  if (caps.sessions != null) sessionMapMax = caps.sessions
}

export function resetMapCapsForTests(): void {
  sessionMapMax = DEFAULT_SESSION_MAP_MAX
}

export function sessionMapSizeForTests(): number {
  return sessions.size
}

export function createSession(input: {
  login: string
  oauthAccessToken: string
  oauthRefreshToken?: string | null
  expiresInSec?: number | null
}): string {
  pruneExpired(sessions)
  const id = crypto.randomBytes(32).toString('base64url')
  const now = Date.now()
  const absoluteExpiresAt = now + SESSION_ABSOLUTE_TTL_MS
  const expiresInSec = input.expiresInSec
  sessions.set(id, {
    login: input.login,
    oauthAccessToken: input.oauthAccessToken,
    oauthRefreshToken: input.oauthRefreshToken ?? null,
    tokenExpiresAt:
      typeof expiresInSec === 'number' && Number.isFinite(expiresInSec)
        ? now + expiresInSec * 1000
        : null,
    expiresAt: Math.min(now + SESSION_TTL_MS, absoluteExpiresAt),
    absoluteExpiresAt
  })
  evictOldestIfOverCap(sessions, sessionMapMax)
  return id
}

export function getSession(id: string): Session | undefined {
  const session = sessions.get(id)
  if (!session) return undefined
  if (!isSessionAlive(session)) {
    sessions.delete(id)
    return undefined
  }
  return session
}

export function touchSession(id: string): Session | undefined {
  const session = getSession(id)
  if (!session) return undefined
  const now = Date.now()
  session.expiresAt = Math.min(now + SESSION_TTL_MS, session.absoluteExpiresAt)
  return session
}

export function updateSessionOauthTokens(
  id: string,
  tokens: {
    oauthAccessToken: string
    oauthRefreshToken?: string | null
    expiresInSec?: number | null
  }
): Session | undefined {
  const session = getSession(id)
  if (!session) return undefined
  const now = Date.now()
  session.oauthAccessToken = tokens.oauthAccessToken
  if (tokens.oauthRefreshToken !== undefined) {
    session.oauthRefreshToken = tokens.oauthRefreshToken
  }
  const expiresInSec = tokens.expiresInSec
  session.tokenExpiresAt =
    typeof expiresInSec === 'number' && Number.isFinite(expiresInSec)
      ? now + expiresInSec * 1000
      : null
  return session
}

/** True when the access token is missing an expiry or is still fresh past the skew window. */
export function oauthTokenNeedsRefresh(session: Session, now = Date.now()): boolean {
  if (session.tokenExpiresAt == null) return false
  return session.tokenExpiresAt - TOKEN_REFRESH_SKEW_MS <= now
}

export function deleteSession(id: string): void {
  sessions.delete(id)
}

/** HMAC-signed nonce+expiry. Pending logins are not stored in a capped map. */
export function createOauthState(): string {
  const nonce = crypto.randomBytes(16).toString('base64url')
  const payload = `${nonce}.${Date.now() + OAUTH_STATE_TTL_MS}`
  return `${payload}.${signOauthPayload(payload)}`
}

/** Single-use: a valid nonce can succeed only once. */
export function consumeOauthState(state: string): boolean {
  const parsed = parseSignedOauthState(state)
  if (!parsed) return false
  if (parsed.expiresAt <= Date.now()) return false
  if (consumedOauthNonces.has(parsed.nonce)) return false
  consumedOauthNonces.set(parsed.nonce, { expiresAt: parsed.expiresAt })
  return true
}
