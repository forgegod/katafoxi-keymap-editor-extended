import fs from 'node:fs'
import path from 'node:path'
import jwt from 'jsonwebtoken'
import { config, REPO_ROOT } from '../../config.js'
import * as api from './api.js'

const pemPath = path.join(REPO_ROOT, 'private-key.pem')

function getPrivateKey(): string | Buffer {
  if (config.GITHUB_APP_PRIVATE_KEY) {
    return config.GITHUB_APP_PRIVATE_KEY.replace(/\\n/g, '\n')
  }
  return fs.readFileSync(pemPath)
}

export function createAppToken(): string {
  return jwt.sign({ iss: config.GITHUB_APP_ID }, getPrivateKey(), {
    algorithm: 'RS256',
    expiresIn: '10m'
  })
}

export function createInstallationToken(installationId: string) {
  const token = createAppToken()
  const url = `/app/installations/${installationId}/access_tokens`
  return api.request({ url, method: 'POST', token })
}

export function createOauthFlowUrl(): string {
  const redirectUrl = new URL('https://github.com/login/oauth/authorize')
  redirectUrl.search = new URLSearchParams({
    client_id: config.GITHUB_CLIENT_ID,
    redirect_uri: config.GITHUB_OAUTH_CALLBACK_URL,
    state: 'foo'
  }).toString()
  return redirectUrl.toString()
}

export function createOauthReturnUrl(token: string): string {
  const url = new URL(config.APP_BASE_URL)
  url.search = new URLSearchParams({ token }).toString()
  return url.toString()
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

export function getUserToken(
  oauth: { access_token: string },
  user: { login: string }
): string {
  return jwt.sign(
    {
      oauth_access_token: oauth.access_token,
      sub: user.login
    },
    getPrivateKey(),
    { algorithm: 'RS256' }
  )
}

export function verifyUserToken(token: string) {
  return jwt.verify(token, getPrivateKey(), {
    algorithms: ['RS256']
  }) as { sub: string; oauth_access_token: string }
}
