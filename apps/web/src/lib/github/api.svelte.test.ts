import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API } from './api.svelte.js'

vi.mock('../config', () => ({
  apiBaseUrl: 'http://api.test',
  appBaseUrl: '',
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

  it('commitChanges POSTs encoded branch URL with layout/keymap and credentials', async () => {
    const api = new API()
    api.repoInstallationMap = { 'acme/lark': '42' }
    const layout = [{ x: 0, y: 0 }]
    const keymap = { layers: [] }
    fetchMock.mockResolvedValue(jsonResponse(200, { committed: true }))

    await api.commitChanges('acme/lark', 'feature/x', layout, keymap)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      'http://api.test/github/keyboard-files/42/acme%2Flark/feature%2Fx',
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        body: JSON.stringify({ layout, keymap })
      })
    )
  })

  it('logout still clears session state when POST fails without emitting', async () => {
    const api = new API()
    const onAuthFailed = vi.fn()
    api.on('authentication-failed', onAuthFailed)
    api.authorized = true
    api.installations = [{ id: 1 }]
    api.repositories = [{ id: 1, full_name: 'acme/lark' }]
    api.repoInstallationMap = { 'acme/lark': '42' }
    fetchMock.mockResolvedValue(jsonResponse(401, { error: 'unauthorized' }))

    await api.logout()

    expect(api.authorized).toBe(false)
    expect(api.installations).toBeNull()
    expect(api.repositories).toBeNull()
    expect(api.repoInstallationMap).toBeNull()
    expect(onAuthFailed).not.toHaveBeenCalled()
  })
})
