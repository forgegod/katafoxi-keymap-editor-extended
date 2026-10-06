import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from './api.svelte.js'

vi.mock('../config', () => ({
  apiBaseUrl: 'http://api.test',
  githubAppName: 'test-app',
  enableGitHub: true,
  enableLocal: false
}))

function jsonResponse(status: number, body: unknown = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  })
}

describe('API', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    localStorage.clear()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
  })

  it('emits authentication-failed and throws on 401 without suppressAuthEmit', async () => {
    const api = new API()
    const onAuthFailed = vi.fn()
    api.on('authentication-failed', onAuthFailed)
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'unauthorized' }))

    await expect(api._request('/github/installation')).rejects.toMatchObject({
      response: { status: 401 }
    })

    expect(onAuthFailed).toHaveBeenCalledTimes(1)
    expect(onAuthFailed).toHaveBeenCalledWith(
      expect.objectContaining({ status: 401 })
    )
  })

  it('init on 401 marks unauthorized, initialized, clears auth_token, and does not emit', async () => {
    const api = new API()
    const onAuthFailed = vi.fn()
    api.on('authentication-failed', onAuthFailed)
    localStorage.setItem('auth_token', 'legacy-jwt')
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'unauthorized' }))

    await api.init()

    expect(api.authorized).toBe(false)
    expect(api.initialized).toBe(true)
    expect(onAuthFailed).not.toHaveBeenCalled()
    expect(localStorage.getItem('auth_token')).toBeNull()
  })

  it('init on 500 marks unauthorized and does not emit authentication-failed', async () => {
    const api = new API()
    const onAuthFailed = vi.fn()
    api.on('authentication-failed', onAuthFailed)
    fetchMock.mockResolvedValue(jsonResponse(500, { error: 'boom' }))

    await api.init()

    expect(api.authorized).toBe(false)
    expect(onAuthFailed).not.toHaveBeenCalled()
  })

  it('fetchLayoutAndKeymap on 400 emits repo-validation-error and rethrows', async () => {
    const api = new API()
    const body = { errors: ['missing info.json'] }
    const onValidation = vi.fn()
    api.on('repo-validation-error', onValidation)
    api.repoInstallationMap = { 'acme/lark': '42' }
    fetchMock.mockResolvedValue(jsonResponse(400, body))

    await expect(api.fetchLayoutAndKeymap('acme/lark', 'main')).rejects.toMatchObject({
      response: { status: 400, data: body }
    })

    expect(onValidation).toHaveBeenCalledTimes(1)
    expect(onValidation).toHaveBeenCalledWith(body)
  })

  it('fetchLayoutAndKeymap treats a non-ok hostSnapshot as null', async () => {
    const api = new API()
    api.repoInstallationMap = { 'acme/lark': '42' }
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        info: {
          layouts: {
            default: { layout: [{ x: 0, y: 0, row: 0, col: 0 }] }
          }
        },
        keymap: { layers: [[{ value: '&kp', params: [{ value: 'A', params: [] }] }]] },
        hostSnapshot: { version: 99, view: {}, layouts: [] },
        headSha: 'abc123'
      })
    )

    const result = await api.fetchLayoutAndKeymap('acme/lark', 'main')

    expect(result.hostSnapshot).toBeNull()
    expect(result.headSha).toBe('abc123')
    expect(result.layout).toHaveLength(1)
  })

  it('fetchLayoutAndKeymap infers a rectangular layout when info.json is null', async () => {
    const api = new API()
    api.repoInstallationMap = { 'acme/lark': '42' }
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        info: null,
        keymap: {
          layers: [['&kp A', '&kp B', '&kp C', '&kp D']],
          layer_names: ['default']
        },
        hostSnapshot: null
      })
    )

    const result = await api.fetchLayoutAndKeymap('acme/lark', 'main')

    expect(result.warnings).toEqual(['github_inferred_layout'])
    expect(result.layout).toHaveLength(4)
    expect(result.layout[0]).toMatchObject({ row: 0, col: 0, x: 0, y: 0 })
    expect(result.layout[3]).toMatchObject({ row: 0, col: 3, x: 3, y: 0 })
  })

  it('fetchLayoutAndKeymap rejects when info.json is null and keymap is empty', async () => {
    const api = new API()
    const onValidation = vi.fn()
    api.on('repo-validation-error', onValidation)
    api.repoInstallationMap = { 'acme/lark': '42' }
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        info: null,
        keymap: { layers: [[]], layer_names: ['default'] },
        hostSnapshot: null
      })
    )

    await expect(api.fetchLayoutAndKeymap('acme/lark', 'main')).rejects.toMatchObject({
      response: { status: 400 }
    })
    expect(onValidation).toHaveBeenCalledTimes(1)
  })

  it('commitChanges POSTs encoded branch URL with layout/keymap and credentials', async () => {
    const api = new API()
    api.repoInstallationMap = { 'acme/lark': '42' }
    const layout = [{ x: 0, y: 0 }]
    const keymap = { layers: [] }
    fetchMock.mockResolvedValue(jsonResponse(200, { committed: true }))

    await api.commitChanges('acme/lark', 'feature/x', layout, keymap, null, null, 'abc123')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/github/keyboard-files/42/acme%2Flark/feature%2Fx',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({
          layout,
          keymap,
          hostSnapshot: null,
          hostDeliverables: null,
          baseSha: 'abc123'
        })
      })
    )
  })

  it('createBranch POSTs the name and the branch it copies', async () => {
    const api = new API()
    api.repoInstallationMap = { 'acme/lark': '42' }
    fetchMock.mockResolvedValue(jsonResponse(201, { name: 'topic' }))

    await expect(api.createBranch('acme/lark', 'topic', 'main')).resolves.toEqual({
      name: 'topic'
    })
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/github/installation/42/acme%2Flark/branches',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ name: 'topic', from: 'main' })
      })
    )
  })

  it('fetchFirmwareBuild GETs the branch build and firmwareDownloadUrl stays same-origin', async () => {
    const api = new API()
    api.repoInstallationMap = { 'acme/keymap': '42' }
    const body = {
      status: 'success',
      sha: 'abcdef1234567890',
      shortSha: 'abcdef1',
      at: '2026-09-29T11:40:00.000Z',
      htmlUrl: 'https://github.com/acme/keymap/actions/runs/7',
      artifactId: 2,
      artifactName: 'firmware',
      detail: null
    }
    fetchMock.mockResolvedValue(jsonResponse(200, body))

    await expect(api.fetchFirmwareBuild('acme/keymap', 'main')).resolves.toEqual(body)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/github/builds/42/acme%2Fkeymap?branch=main',
      expect.objectContaining({ credentials: 'include' })
    )
    expect(api.firmwareDownloadUrl('acme/keymap', 2, 'firmware')).toBe(
      'http://api.test/github/builds/42/acme%2Fkeymap/artifact/2?name=firmware'
    )
  })

  it('logout still clears session state when POST fails without emitting', async () => {
    const api = new API()
    const onAuthFailed = vi.fn()
    api.on('authentication-failed', onAuthFailed)
    api.authorized = true
    api.login = 'octocat'
    api.installations = [{ id: 1 }]
    api.repositories = [{ id: 1, full_name: 'acme/lark' }]
    api.repoInstallationMap = { 'acme/lark': '42' }
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'unauthorized' }))

    await api.logout()

    expect(api.authorized).toBe(false)
    expect(api.login).toBeNull()
    expect(api.installations).toBeNull()
    expect(api.repositories).toBeNull()
    expect(api.repoInstallationMap).toBeNull()
    expect(onAuthFailed).not.toHaveBeenCalled()
  })
})
