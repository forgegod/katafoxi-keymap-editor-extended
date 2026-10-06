import fs from 'node:fs'
import path from 'node:path'
import type { Context } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'
import type { CookieOptions } from 'hono/utils/cookie'
import jwt from 'jsonwebtoken'
import { config, originFromBaseUrl, REPO_ROOT } from '../../config.js'
import * as api from './api.js'
import { SESSION_COOKIE_MAX_AGE_SEC } from './sessions.js'

const pemPath = path.join(REPO_ROOT, 'private-key.pem')
const INSTALLATION_TOKEN_REFRESH_BEFORE_MS = 5 * 60 * 1000

export const SID_COOKIE = 'sid'
export const OAUTH_STATE_COOKIE = 'oauth_state'

let privateKey: string | Buffer | undefined

function getPrivateKey(): string | Buffer {
  if (privateKey !== undefined) return privateKey
  privateKey = config.GITHUB_APP_PRIVATE_KEY
    ? config.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n')
    : fs.readFileSync(pemPath)
  return privateKey
}

export type InstallationTokenOptions = {
  repository?: string
}

type InstallationTokenResponse = {
  data: unknown
  headers: Record<string, string>
  status: number
}

type CachedInstallationToken = {
  response?: InstallationTokenResponse
  freshUntilMs?: number
  inflight?: Promise<InstallationTokenResponse>
}

const installationTokens = new Map<string, CachedInstallationToken>()

export function clearInstallationTokenCache() {
  installationTokens.clear()
}

function repositoryTokenName(repository: string | undefined): string | undefined {
  if (!repository) return undefined
  const name = repository.trim().split('/').pop()
  return name || undefined
}

/** Repo-scoped token with the permissions this API actually uses. */
function installationTokenRequestData(
  repository: string | undefined
): { repositories: string[]; permissions: Record<string, string> } | undefined {
  const name = repositoryTokenName(repository)
  if (!name) return undefined
  return {
    repositories: [name],
    permissions: {
      contents: 'write',
      metadata: 'read',
      actions: 'read'
    }
  }
}

function installationTokenCacheKey(
  installationId: string,
  repository: string | undefined
): string {
  return `${installationId}:${repositoryTokenName(repository) ?? '*'}`
}

function tokenFreshUntilMs(data: unknown): number | undefined {
  if (data == null || typeof data !== 'object') return undefined
  const expiresAt = (data as { expires_at?: unknown }).expires_at
  if (typeof expiresAt !== 'string' || !expiresAt) return undefined
  const expiresMs = Date.parse(expiresAt)
  if (!Number.isFinite(expiresMs)) return undefined
  return expiresMs - INSTALLATION_TOKEN_REFRESH_BEFORE_MS
}

/** Uncached POST to GitHub. Prefer `createInstallationToken` so tokens are reused. */
export function mintInstallationToken(
  installationId: string,
  options: InstallationTokenOptions = {}
) {
  const token = createAppToken()
  const url = `/app/installations/${installationId}/access_tokens`
  return api.request({
    url,
    method: 'POST',
    token,
    data: installationTokenRequestData(options.repository)
  })
}

function cookieOptions(overrides: CookieOptions = {}): CookieOptions {
  const secure = config.APP_BASE_URL.startsWith('https://')
  return {
    httpOnly: true,
    path: '/',
    sameSite: 'Lax',
    secure,
    ...overrides
  }
}

export function appOrigin(): string {
  return originFromBaseUrl(config.APP_BASE_URL)
}

function headerOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    return new URL(value).origin
  } catch {
    return value
  }
}

/**
 * Defense in depth beyond SameSite=Lax: mutating requests must come from the SPA
 * origin (Origin, or Referer when Origin is absent). Matches CORS APP_BASE_URL.
 */
export function isTrustedAppOrigin(c: Context): boolean {
  const expected = appOrigin()
  const originHeader = c.req.header('Origin')
  const received = originHeader
    ? headerOrigin(originHeader)
    : headerOrigin(c.req.header('Referer'))
  const trusted = received === expected
  if (!trusted && process.env.NODE_ENV !== 'production') {
    console.warn(
      `Rejected untrusted origin: expected ${expected}, received ${received ?? '(none)'}`
    )
  }
  return trusted
}

export function setSidCookie(c: Context, sid: string) {
  setCookie(c, SID_COOKIE, sid, cookieOptions({ maxAge: SESSION_COOKIE_MAX_AGE_SEC }))
}

export function clearSidCookie(c: Context) {
  deleteCookie(c, SID_COOKIE, cookieOptions())
}

export function setOauthStateCookie(c: Context, state: string) {
  setCookie(c, OAUTH_STATE_COOKIE, state, cookieOptions({ maxAge: 10 * 60 }))
}

export function clearOauthStateCookie(c: Context) {
  deleteCookie(c, OAUTH_STATE_COOKIE, cookieOptions())
}

/**
 * GitHub rejects an app JWT whose `exp` is more than 10 minutes ahead of its
 * clock. `expiresIn: '10m'` sits on that line, so a local clock a few seconds
 * ahead fails with "exp is too far in the future". Issue the token a minute
 * early and keep it for 8 minutes: that still covers about two minutes of skew.
 */
const APP_TOKEN_ISSUED_EARLY_SEC = 60
const APP_TOKEN_TTL_SEC = 8 * 60

export function appTokenTimestamps(nowSeconds: number): { iat: number; exp: number } {
  return {
    iat: nowSeconds - APP_TOKEN_ISSUED_EARLY_SEC,
    exp: nowSeconds + APP_TOKEN_TTL_SEC
  }
}

function createAppToken(): string {
  const now = Math.floor(Date.now() / 1000)
  return jwt.sign(
    { iss: config.GITHUB_APP_ID, ...appTokenTimestamps(now) },
    getPrivateKey(),
    { algorithm: 'RS256' }
  )
}

export async function createInstallationToken(
  installationId: string,
  options: InstallationTokenOptions = {}
): Promise<InstallationTokenResponse> {
  const key = installationTokenCacheKey(installationId, options.repository)
  const now = Date.now()
  const cached = installationTokens.get(key)
  if (cached?.response && cached.freshUntilMs != null && now < cached.freshUntilMs) {
    return cached.response
  }
  if (cached?.inflight) return cached.inflight

  const inflight = mintInstallationToken(installationId, options)
    .then(response => {
      const freshUntilMs = tokenFreshUntilMs(response.data)
      if (freshUntilMs == null || freshUntilMs <= Date.now()) {
        installationTokens.delete(key)
        return response
      }
      installationTokens.set(key, { response, freshUntilMs })
      return response
    })
    .catch(err => {
      installationTokens.delete(key)
      throw err
    })

  installationTokens.set(key, { inflight })
  return inflight
}

export function createOauthFlowUrl(state: string): string {
  const redirectUrl = new URL('https://github.com/login/oauth/authorize')
  redirectUrl.search = new URLSearchParams({
    client_id: config.GITHUB_CLIENT_ID,
    redirect_uri: config.GITHUB_OAUTH_CALLBACK_URL,
    state
  }).toString()
  return redirectUrl.toString()
}

export function createOauthReturnUrl(): string {
  return config.APP_BASE_URL
}

export function createOauthDeniedUrl(): string {
  const url = new URL(config.APP_BASE_URL)
  url.searchParams.set('login', 'denied')
  return url.toString()
}

export type OauthTokenPayload = {
  accessToken: string
  refreshToken: string | null
  expiresInSec: number | null
}

/**
 * GitHub returns HTTP 200 with `{ error }` for bad codes. Require a string
 * `access_token`; otherwise the caller should respond 401.
 */
export function parseOauthTokenPayload(data: unknown): OauthTokenPayload | null {
  if (data == null || typeof data !== 'object') return null
  const body = data as {
    error?: unknown
    access_token?: unknown
    refresh_token?: unknown
    expires_in?: unknown
  }
  if (body.error != null) return null
  if (typeof body.access_token !== 'string' || body.access_token.length === 0) return null
  return {
    accessToken: body.access_token,
    refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : null,
    expiresInSec: typeof body.expires_in === 'number' && Number.isFinite(body.expires_in)
      ? body.expires_in
      : null
  }
}

export function getOauthToken(code: string) {
  return api.request({
    method: 'POST',
    url: 'https://github.com/login/oauth/access_token',
    headers: { Accept: 'application/json' },
    data: {
      client_id: config.GITHUB_CLIENT_ID,
      client_secret: config.GITHUB_CLIENT_SECRET,
      code
    }
  })
}

export function refreshOauthToken(refreshToken: string) {
  return api.request({
    method: 'POST',
    url: 'https://github.com/login/oauth/access_token',
    headers: { Accept: 'application/json' },
    data: {
      client_id: config.GITHUB_CLIENT_ID,
      client_secret: config.GITHUB_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    }
  })
}

export function getOauthUser(token: string) {
  return api.request({
    url: '/user',
    headers: { Accept: 'application/json' },
    token
  })
}
