import { Hono } from 'hono'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { KeymapValidationError, parseKeymap } from '@keymap-editor/keymap-core'
import { config } from '../config.js'
import * as auth from '../services/github/auth.js'
import * as files from '../services/github/files.js'
import { MissingRepoFile } from '../services/github/files.js'
import * as builds from '../services/github/builds.js'
import * as installations from '../services/github/installations.js'
import {
  consumeOauthState,
  createOauthState,
  createSession,
  deleteSession
} from '../services/github/sessions.js'
import { githubRoutes } from './github.js'

const app = new Hono().route('/github', githubRoutes)

const VALID_INFO = {
  layouts: {
    LAYOUT: {
      layout: [{ x: 0, y: 0 }]
    }
  }
}

const VALID_KEYMAP = { layers: [['&kp A']] }

const createdSids: string[] = []

function setCookieHeaders(res: Response): string[] {
  if (typeof res.headers.getSetCookie === 'function') {
    return res.headers.getSetCookie()
  }
  const single = res.headers.get('set-cookie')
  return single ? [single] : []
}

function parseCookies(res: Response): Record<string, { value: string; raw: string }> {
  const out: Record<string, { value: string; raw: string }> = {}
  for (const header of setCookieHeaders(res)) {
    const [pair] = header.split(';')
    const eq = pair.indexOf('=')
    if (eq < 0) continue
    const name = pair.slice(0, eq).trim()
    const value = pair.slice(eq + 1).trim()
    out[name] = { value, raw: header }
  }
  return out
}

function cookieIsCleared(raw: string): boolean {
  const lower = raw.toLowerCase()
  return /max-age=0/.test(lower) || /expires=thu, 01 jan 1970/.test(lower)
}

function trackSid(sid: string): string {
  createdSids.push(sid)
  return sid
}

function sessionCookie(sid: string): string {
  return `${auth.SID_COOKIE}=${sid}`
}

async function authedRequest(
  path: string,
  init: RequestInit = {},
  sid = trackSid(createSession({ login: 'octocat', oauthAccessToken: 'user-token' }))
) {
  const headers = new Headers(init.headers)
  headers.set('Cookie', sessionCookie(sid))
  return { sid, res: await app.request(path, { ...init, headers }) }
}

const OWN_INSTALLATION_REPOS = {
  installations: [{ id: 1 }],
  repositories: [{ full_name: 'acme/lark' }, { full_name: 'acme/keymap' }],
  repoInstallationMap: { 'acme/lark': 1, 'acme/keymap': 1 }
}

beforeEach(() => {
  vi.spyOn(auth, 'getOauthToken')
  vi.spyOn(auth, 'getOauthUser')
  vi.spyOn(installations, 'fetchInstallationRepos').mockResolvedValue(OWN_INSTALLATION_REPOS)
  vi.spyOn(installations, 'fetchRepoBranches')
  vi.spyOn(files, 'fetchKeyboardFiles')
  vi.spyOn(files, 'commitChanges')
})

afterEach(() => {
  for (const sid of createdSids) deleteSession(sid)
  createdSids.length = 0
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('GET /github/authorize', () => {
  it('redirects to GitHub OAuth and sets oauth_state when code is missing', async () => {
    const res = await app.request('/github/authorize')
    expect(res.status).toBe(302)

    const location = res.headers.get('location') ?? ''
    expect(location.startsWith('https://github.com/login/oauth/authorize')).toBe(true)

    const cookies = parseCookies(res)
    expect(cookies[auth.OAUTH_STATE_COOKIE]?.value).toBeTruthy()

    const state = new URL(location).searchParams.get('state')
    expect(state).toBe(cookies[auth.OAUTH_STATE_COOKIE].value)
    consumeOauthState(state ?? '')
  })

  it('returns 401 and clears oauth_state when state does not match the cookie', async () => {
    const state = createOauthState()
    const res = await app.request(`/github/authorize?code=abc&state=${state}`, {
      headers: { Cookie: `${auth.OAUTH_STATE_COOKIE}=other-state` }
    })
    expect(res.status).toBe(401)
    const cookies = parseCookies(res)
    expect(cookies[auth.OAUTH_STATE_COOKIE]).toBeDefined()
    expect(cookieIsCleared(cookies[auth.OAUTH_STATE_COOKIE].raw)).toBe(true)
    consumeOauthState(state)
  })

  it('returns 401 and clears oauth_state when the cookie is missing', async () => {
    const state = createOauthState()
    const res = await app.request(`/github/authorize?code=abc&state=${state}`)
    expect(res.status).toBe(401)
    const cookies = parseCookies(res)
    expect(cookies[auth.OAUTH_STATE_COOKIE]).toBeDefined()
    expect(cookieIsCleared(cookies[auth.OAUTH_STATE_COOKIE].raw)).toBe(true)
    consumeOauthState(state)
  })

  it('returns 401 and clears oauth_state when state was already consumed', async () => {
    const state = createOauthState()
    expect(consumeOauthState(state)).toBe(true)

    const res = await app.request(`/github/authorize?code=abc&state=${state}`, {
      headers: { Cookie: `${auth.OAUTH_STATE_COOKIE}=${state}` }
    })
    expect(res.status).toBe(401)
    const cookies = parseCookies(res)
    expect(cookies[auth.OAUTH_STATE_COOKIE]).toBeDefined()
    expect(cookieIsCleared(cookies[auth.OAUTH_STATE_COOKIE].raw)).toBe(true)
  })

  it('exchanges a matching single-use state for a sid and reaches installation', async () => {
    const start = await app.request('/github/authorize')
    const startCookies = parseCookies(start)
    const startLocation = start.headers.get('location') ?? ''
    const state = new URL(startLocation).searchParams.get('state') ?? ''
    expect(startCookies[auth.OAUTH_STATE_COOKIE]?.value).toBe(state)

    vi.mocked(auth.getOauthToken).mockResolvedValue({
      data: { access_token: 'oauth-token' }
    } as Awaited<ReturnType<typeof auth.getOauthToken>>)
    vi.mocked(auth.getOauthUser).mockResolvedValue({
      data: { login: 'octocat' }
    } as Awaited<ReturnType<typeof auth.getOauthUser>>)
    vi.mocked(installations.fetchInstallationRepos).mockResolvedValue({
      installations: [{ id: 1 }],
      repositories: [],
      repoInstallationMap: {}
    })

    const callback = await app.request(`/github/authorize?code=abc&state=${encodeURIComponent(state)}`, {
      headers: { Cookie: `${auth.OAUTH_STATE_COOKIE}=${state}` }
    })
    expect(callback.status).toBe(302)
    expect(callback.headers.get('location')).toBe(config.APP_BASE_URL)

    const sid = parseCookies(callback)[auth.SID_COOKIE]?.value
    expect(sid).toBeTruthy()
    trackSid(sid)

    const install = await app.request('/github/installation', {
      headers: { Cookie: sessionCookie(sid) }
    })
    expect(install.status).toBe(200)
    expect(await install.json()).toMatchObject({ login: 'octocat' })
    expect(installations.fetchInstallationRepos).toHaveBeenCalledWith('oauth-token')
  })
})

describe('session and errors', () => {
  it('POST /github/logout with a valid sid returns 204 and invalidates the session', async () => {
    const sid = trackSid(createSession({ login: 'octocat', oauthAccessToken: 'user-token' }))
    const logout = await app.request('/github/logout', {
      method: 'POST',
      headers: { Cookie: sessionCookie(sid) }
    })
    expect(logout.status).toBe(204)

    const install = await app.request('/github/installation', {
      headers: { Cookie: sessionCookie(sid) }
    })
    expect(install.status).toBe(401)
    expect(installations.fetchInstallationRepos).not.toHaveBeenCalled()
  })

  it('GET /github/installation without a cookie returns 401', async () => {
    const res = await app.request('/github/installation')
    expect(res.status).toBe(401)
    expect(installations.fetchInstallationRepos).not.toHaveBeenCalled()
  })

  it('GET /github/installation with an expired sid returns 401 and clears sid', async () => {
    vi.useFakeTimers()
    const sid = trackSid(createSession({ login: 'octocat', oauthAccessToken: 'user-token' }))
    vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1)

    const res = await app.request('/github/installation', {
      headers: { Cookie: sessionCookie(sid) }
    })
    expect(res.status).toBe(401)
    const cookies = parseCookies(res)
    expect(cookies[auth.SID_COOKIE]).toBeDefined()
    expect(cookieIsCleared(cookies[auth.SID_COOKIE].raw)).toBe(true)
    expect(installations.fetchInstallationRepos).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('returns 401 when fetchInstallationRepos throws an upstream 401', async () => {
    vi.mocked(installations.fetchInstallationRepos).mockRejectedValue(
      Object.assign(new Error('unauthorized'), { response: { status: 401, data: 'bad token' } })
    )
    const { res } = await authedRequest('/github/installation')
    expect(res.status).toBe(401)
  })

  it('returns 500 when fetchInstallationRepos throws any other error', async () => {
    vi.mocked(installations.fetchInstallationRepos).mockRejectedValue(new Error('boom'))
    const { res } = await authedRequest('/github/installation')
    expect(res.status).toBe(500)
  })

  it('GET /github/keyboard-files returns 400 JSON for MissingRepoFile', async () => {
    vi.mocked(files.fetchKeyboardFiles).mockRejectedValue(
      new MissingRepoFile('config/*.keymap')
    )
    const { res } = await authedRequest('/github/keyboard-files/1/acme%2Flark')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      name: 'MissingRepoFile',
      path: 'config/*.keymap',
      errors: ['Missing file config/*.keymap']
    })
  })

  it('GET /github/keyboard-files allows a missing info.json', async () => {
    vi.mocked(files.fetchKeyboardFiles).mockResolvedValue({
      info: null,
      keymap: VALID_KEYMAP,
      originalCodeKeymap: { name: 'lark.keymap', path: 'config/lark.keymap' },
      hostSnapshot: null
    })
    const { res } = await authedRequest('/github/keyboard-files/1/acme%2Flark')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      info: null,
      keymap: parseKeymap(VALID_KEYMAP),
      hostSnapshot: null
    })
  })

  it('GET /github/keyboard-files returns 400 JSON for KeymapValidationError', async () => {
    vi.mocked(files.fetchKeyboardFiles).mockRejectedValue(
      new KeymapValidationError(['layer 0 is invalid'])
    )
    const { res } = await authedRequest('/github/keyboard-files/1/acme%2Flark')
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      name: 'KeymapValidationError',
      errors: ['layer 0 is invalid']
    })
  })

  it('GET /github/keyboard-files returns parsed keymap on success', async () => {
    vi.mocked(files.fetchKeyboardFiles).mockResolvedValue({
      info: VALID_INFO,
      keymap: VALID_KEYMAP,
      originalCodeKeymap: { name: 'lark.keymap', path: 'config/lark.keymap' },
      hostSnapshot: null
    })
    const { res } = await authedRequest('/github/keyboard-files/1/acme%2Flark')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      info: VALID_INFO,
      keymap: parseKeymap(VALID_KEYMAP),
      hostSnapshot: null
    })
  })

  it('POST /github/keyboard-files decodes a single branch segment and returns 400 on KeymapValidationError', async () => {
    const commit = vi.mocked(files.commitChanges).mockRejectedValue(
      new KeymapValidationError(['bad keymap'])
    )
    const layout = [{ x: 0, y: 0 }]
    const keymap = parseKeymap(VALID_KEYMAP)
    const { res } = await authedRequest('/github/keyboard-files/1/acme%2Flark/feature%2Fx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keymap, layout })
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({
      name: 'KeymapValidationError',
      errors: ['bad keymap']
    })
    expect(commit).toHaveBeenCalledWith(
      '1',
      'acme/lark',
      'feature/x',
      layout,
      keymap,
      null,
      null
    )
  })

  it('POST /github/keyboard-files returns 400 for invalid JSON bodies', async () => {
    const commit = vi.mocked(files.commitChanges)
    const { res } = await authedRequest('/github/keyboard-files/1/acme%2Flark/main', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json'
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ errors: ['Request body must be valid JSON'] })
    expect(commit).not.toHaveBeenCalled()
  })

  it('POST /github/keyboard-files returns 400 for an invalid branch name', async () => {
    const commit = vi.mocked(files.commitChanges)
    const layout = [{ x: 0, y: 0 }]
    const keymap = parseKeymap(VALID_KEYMAP)
    const { res } = await authedRequest('/github/keyboard-files/1/acme%2Flark/has%20space', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keymap, layout })
    })
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ name: 'BranchNameError' })
    expect(commit).not.toHaveBeenCalled()
  })

  it('GET /github/keyboard-files returns 400 for an invalid branch query', async () => {
    const fetchFiles = vi.mocked(files.fetchKeyboardFiles)
    const { res } = await authedRequest('/github/keyboard-files/1/acme%2Flark?branch=bad..name')
    expect(res.status).toBe(400)
    expect(await res.json()).toMatchObject({ name: 'BranchNameError' })
    expect(fetchFiles).not.toHaveBeenCalled()
  })

  it('POST /github/installation branches requires a session and a valid name', async () => {
    const anon = await app.request('/github/installation/1/acme%2Flark/branches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'topic', from: 'main' })
    })
    expect(anon.status).toBe(401)

    const invalid = await authedRequest('/github/installation/1/acme%2Flark/branches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'has space', from: 'main' })
    })
    expect(invalid.res.status).toBe(400)
    expect(await invalid.res.json()).toMatchObject({ name: 'BranchNameError' })
  })

  it('POST /github/installation branches creates a branch from the source commit', async () => {
    vi.spyOn(auth, 'createInstallationToken').mockResolvedValue({
      data: { token: 'install-token' }
    } as Awaited<ReturnType<typeof auth.createInstallationToken>>)
    const create = vi.spyOn(installations, 'createBranch').mockResolvedValue({ name: 'topic' })

    const { res } = await authedRequest('/github/installation/1/acme%2Flark/branches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'topic', from: 'main' })
    })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ name: 'topic' })
    expect(create).toHaveBeenCalledWith('install-token', 'acme/lark', 'topic', 'main')
  })

  it('GET /github/builds requires a session and a branch', async () => {
    const anon = await app.request('/github/builds/1/acme%2Fkeymap?branch=main')
    expect(anon.status).toBe(401)

    const missingBranch = await authedRequest('/github/builds/1/acme%2Fkeymap')
    expect(missingBranch.res.status).toBe(400)
  })

  it('GET /github/builds returns the firmware build for the branch', async () => {
    const fetchBuild = vi.spyOn(builds, 'fetchFirmwareBuild').mockResolvedValue({
      status: 'success',
      sha: 'abcdef1234567890',
      shortSha: 'abcdef1',
      at: '2026-09-29T11:40:00.000Z',
      htmlUrl: 'https://github.com/acme/keymap/actions/runs/7',
      artifactId: 2,
      artifactName: 'firmware',
      detail: null
    })
    const { res } = await authedRequest('/github/builds/1/acme%2Fkeymap?branch=main')
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ status: 'success', artifactId: 2 })
    expect(fetchBuild).toHaveBeenCalledWith('1', 'acme/keymap', 'main')
  })

  it('GET /github/builds artifact downloads a zip', async () => {
    vi.spyOn(builds, 'downloadFirmwareArtifact').mockResolvedValue(new Uint8Array([1, 2, 3]))
    const { res } = await authedRequest(
      '/github/builds/1/acme%2Fkeymap/artifact/22?name=firmware'
    )
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/zip')
    expect(res.headers.get('content-disposition')).toBe('attachment; filename="firmware.zip"')
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]))
  })
})

describe('installation access control', () => {
  it('rejects a foreign installationId with 403 before minting a token', async () => {
    const fetchFiles = vi.mocked(files.fetchKeyboardFiles)
    const createToken = vi.spyOn(auth, 'createInstallationToken')

    const { res } = await authedRequest('/github/keyboard-files/999/acme%2Flark')
    expect(res.status).toBe(403)
    expect(fetchFiles).not.toHaveBeenCalled()
    expect(createToken).not.toHaveBeenCalled()
  })

  it('rejects a foreign repository within an own installation with 403', async () => {
    const fetchFiles = vi.mocked(files.fetchKeyboardFiles)
    const createToken = vi.spyOn(auth, 'createInstallationToken')

    const { res } = await authedRequest('/github/keyboard-files/1/acme%2Fother')
    expect(res.status).toBe(403)
    expect(fetchFiles).not.toHaveBeenCalled()
    expect(createToken).not.toHaveBeenCalled()
  })

  it('allows own installation and repository', async () => {
    vi.mocked(files.fetchKeyboardFiles).mockResolvedValue({
      info: VALID_INFO,
      keymap: VALID_KEYMAP,
      originalCodeKeymap: { name: 'lark.keymap', path: 'config/lark.keymap' },
      hostSnapshot: null
    })
    const { res } = await authedRequest('/github/keyboard-files/1/acme%2Flark')
    expect(res.status).toBe(200)
    expect(files.fetchKeyboardFiles).toHaveBeenCalledWith('1', 'acme/lark', undefined)
  })

  it('caches installation access on the session across requests', async () => {
    vi.mocked(files.fetchKeyboardFiles).mockResolvedValue({
      info: VALID_INFO,
      keymap: VALID_KEYMAP,
      originalCodeKeymap: { name: 'lark.keymap', path: 'config/lark.keymap' },
      hostSnapshot: null
    })
    const sid = trackSid(createSession({ login: 'octocat', oauthAccessToken: 'user-token' }))

    const first = await app.request('/github/keyboard-files/1/acme%2Flark', {
      headers: { Cookie: sessionCookie(sid) }
    })
    const second = await app.request('/github/keyboard-files/1/acme%2Flark', {
      headers: { Cookie: sessionCookie(sid) }
    })
    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    expect(installations.fetchInstallationRepos).toHaveBeenCalledTimes(1)
  })

  it('rejects foreign installation on branch and build routes', async () => {
    const createToken = vi.spyOn(auth, 'createInstallationToken')
    const fetchBuild = vi.spyOn(builds, 'fetchFirmwareBuild')

    const branches = await authedRequest('/github/installation/999/acme%2Flark/branches')
    expect(branches.res.status).toBe(403)

    const buildsRes = await authedRequest('/github/builds/999/acme%2Fkeymap?branch=main')
    expect(buildsRes.res.status).toBe(403)

    expect(createToken).not.toHaveBeenCalled()
    expect(fetchBuild).not.toHaveBeenCalled()
  })
})
