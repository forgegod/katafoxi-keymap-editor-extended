import fs from 'node:fs'
import path from 'node:path'
import type { Context } from 'hono'
import { deleteCookie, setCookie } from 'hono/cookie'
import type { CookieOptions } from 'hono/utils/cookie'
import jwt from 'jsonwebtoken'
import { config, REPO_ROOT } from '../../config.js'
import * as api from './api.js'

const pemPath = path.join(REPO_ROOT, 'private-key.pem')

export const SID_COOKIE = 'sid'
export const OAUTH_STATE_COOKIE = 'oauth_state'

function getPrivateKey(): string | Buffer {
  if (config.GITHUB_APP_PRIVATE_KEY) {
    return config.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n')
  }
  return fs.readFileSync(pemPath)
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

export function setSidCookie(c: Context, sid: string) {
  setCookie(c, SID_COOKIE, sid, cookieOptions({ maxAge: 24 * 60 * 60 }))
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

export function createAppToken(): string {
  const now = Math.floor(Date.now() / 1000)
  return jwt.sign(
    { iss: config.GITHUB_APP_ID, ...appTokenTimestamps(now) },
    getPrivateKey(),
    { algorithm: 'RS256' }
  )
}

export function createInstallationToken(installationId: string) {
  const token = createAppToken()
  const url = `/app/installations/${installationId}/access_tokens`
  return api.request({ url, method: 'POST', token })
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

export function getOauthUser(token: string) {
  return api.request({
    url: '/user',
    headers: { Accept: 'application/json' },
    token
  })
}
