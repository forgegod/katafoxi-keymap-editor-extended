import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  GITHUB_API_TIMEOUT_MS,
  GITHUB_ZIP_TIMEOUT_MS,
  githubApiPath,
  request,
  requestZip
} from './api.js'

describe('githubApiPath', () => {
  it('encodes each segment and keeps slashes between them', () => {
    expect(githubApiPath('repos', 'acme/lark', 'commits', 'feature/x')).toBe(
      '/repos/acme/lark/commits/feature/x'
    )
    expect(githubApiPath('repos', 'acme/lark', 'commits', 'main#x')).toBe(
      '/repos/acme/lark/commits/main%23x'
    )
    expect(githubApiPath('repos', 'acme/lark', 'contents', 'config/lark.keymap')).toBe(
      '/repos/acme/lark/contents/config/lark.keymap'
    )
    expect(githubApiPath('repos', 'acme/lark', 'git', 'refs', 'heads', 'y%')).toBe(
      '/repos/acme/lark/git/refs/heads/y%25'
    )
  })
})

describe('GitHub fetch timeouts', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  function hangUntilAborted(): typeof fetch {
    return ((_url: string | URL | Request, init?: RequestInit) => {
      const signal = init?.signal
      return new Promise((_resolve, reject) => {
        if (!signal) return
        const fail = () => reject(signal.reason ?? new Error('aborted'))
        if (signal.aborted) {
          fail()
          return
        }
        signal.addEventListener('abort', fail)
      })
    }) as typeof fetch
  }

  it('fails a hung API fetch by timeout', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
      const controller = new AbortController()
      queueMicrotask(() =>
        controller.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
      )
      return controller.signal
    })
    vi.stubGlobal('fetch', hangUntilAborted())

    await expect(request({ url: '/user' })).rejects.toMatchObject({ name: 'TimeoutError' })
    expect(timeout).toHaveBeenCalledWith(GITHUB_API_TIMEOUT_MS)
  })

  it('uses a longer timeout for artifact zip download', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout').mockImplementation(() => {
      const controller = new AbortController()
      queueMicrotask(() =>
        controller.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError'))
      )
      return controller.signal
    })
    vi.stubGlobal('fetch', hangUntilAborted())

    await expect(requestZip({ url: '/repos/acme/keymap/actions/artifacts/22/zip' })).rejects.toMatchObject({
      name: 'TimeoutError'
    })
    expect(timeout).toHaveBeenCalledWith(GITHUB_ZIP_TIMEOUT_MS)
  })
})
