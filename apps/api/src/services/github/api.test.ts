import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  GITHUB_API_TIMEOUT_MS,
  GITHUB_ZIP_TIMEOUT_MS,
  githubApiPath,
  request,
  requestZip
} from './api.js'

function jsonResponse(
  body: unknown,
  init: ResponseInit & { url?: string } = {}
): Response {
  const { url = 'https://api.github.com/', headers, ...rest } = init
  const response = new Response(JSON.stringify(body), {
    status: 200,
    ...rest,
    headers: { 'content-type': 'application/json', ...headers }
  })
  Object.defineProperty(response, 'url', { value: url })
  return response
}

function textResponse(body: string, init: ResponseInit & { url?: string } = {}): Response {
  const { url = 'https://api.github.com/', headers, ...rest } = init
  const response = new Response(body, {
    status: 200,
    ...rest,
    headers: { 'content-type': 'text/plain', ...headers }
  })
  Object.defineProperty(response, 'url', { value: url })
  return response
}

describe('githubApiPath', () => {
  it('encodes each segment and keeps slashes between them', () => {
    expect(githubApiPath('repos', 'acme/lark', 'commits', 'feature/x')).toBe(
      '/repos/acme/lark/commits/feature/x'
    )
    expect(githubApiPath('repos', 'acme/lark', 'contents', 'config/lark.keymap')).toBe(
      '/repos/acme/lark/contents/config/lark.keymap'
    )
  })

  it('encodes #, %, .., and drops empty segments', () => {
    expect(githubApiPath('repos', 'acme/lark', 'commits', 'feature/x#1')).toBe(
      '/repos/acme/lark/commits/feature/x%231'
    )
    expect(githubApiPath('repos', 'acme/lark', 'git', 'refs', 'heads', 'y%')).toBe(
      '/repos/acme/lark/git/refs/heads/y%25'
    )
    expect(githubApiPath('repos', 'acme/../lark', 'commits', '..')).toBe(
      '/repos/acme/../lark/commits/..'
    )
    expect(githubApiPath('', 'repos', '', 'acme/lark', '', 'commits')).toBe(
      '/repos/acme/lark/commits'
    )
  })
})

describe('GitHub REST client', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('prefixes a relative URL with https://api.github.com', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ login: 'octocat' }))
    vi.stubGlobal('fetch', fetchMock)

    await request({ url: '/user' })

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/user',
      expect.any(Object)
    )
  })

  it('merges params with an existing query string', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse([]))
    vi.stubGlobal('fetch', fetchMock)

    await request({
      url: '/search/issues?q=org:acme&page=1',
      params: { page: '2', per_page: '5' }
    })

    const calledUrl = new URL(fetchMock.mock.calls[0][0] as string)
    expect(calledUrl.origin + calledUrl.pathname).toBe('https://api.github.com/search/issues')
    expect(calledUrl.searchParams.get('q')).toBe('org:acme')
    expect(calledUrl.searchParams.get('page')).toBe('2')
    expect(calledUrl.searchParams.get('per_page')).toBe('5')
  })

  it('sends Authorization Bearer when a token is set', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)

    await request({ url: '/user', token: 'ghs_secret' })

    const init = fetchMock.mock.calls[0][1] as RequestInit
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe('Bearer ghs_secret')
  })

  it('POSTs object data as JSON with Content-Type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }))
    vi.stubGlobal('fetch', fetchMock)

    await request({ url: '/gists', data: { desc: 'note' } })

    const init = fetchMock.mock.calls[0][1] as RequestInit
    const headers = new Headers(init.headers)
    expect(init.method).toBe('POST')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(init.body).toBe(JSON.stringify({ desc: 'note' }))
  })

  it('does not re-serialize string data', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)
    const raw = '{"already":"json"}'

    await request({ url: '/gists', method: 'PATCH', data: raw })

    const init = fetchMock.mock.calls[0][1] as RequestInit
    expect(init.method).toBe('PATCH')
    expect(init.body).toBe(raw)
    expect(init.body).not.toBe(JSON.stringify(raw))
  })

  it('throws the handleGithubError shape for a non-2xx JSON body', async () => {
    const url = 'https://api.github.com/app/installations/1/access_tokens'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(
          { message: 'Requires authentication' },
          { status: 401, url }
        )
      )
    )

    await expect(request({ url: '/app/installations/1/access_tokens' })).rejects.toMatchObject({
      response: {
        status: 401,
        data: { message: 'Requires authentication' },
        url
      }
    })
  })

  it('throws the handleGithubError shape for a non-2xx text body', async () => {
    const url = 'https://api.github.com/rate_limit'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(textResponse('slow down', { status: 429, url }))
    )

    await expect(request({ url: '/rate_limit' })).rejects.toMatchObject({
      response: {
        status: 429,
        data: 'slow down',
        url
      }
    })
  })

  it('passes a 15s AbortSignal on request and 120s on requestZip', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}))
    vi.stubGlobal('fetch', fetchMock)

    await request({ url: '/user' })
    expect(timeout).toHaveBeenCalledWith(GITHUB_API_TIMEOUT_MS)
    expect(timeout.mock.results[0]?.value).toBeInstanceOf(AbortSignal)
    expect((fetchMock.mock.calls[0][1] as RequestInit).signal).toBe(timeout.mock.results[0]?.value)

    fetchMock.mockResolvedValue(textResponse('PK', { status: 200 }))
    await requestZip({ url: '/repos/acme/keymap/actions/artifacts/22/zip' })
    expect(timeout).toHaveBeenCalledWith(GITHUB_ZIP_TIMEOUT_MS)
    const zipInit = fetchMock.mock.calls[1][1] as RequestInit
    expect(zipInit.signal).toBeInstanceOf(AbortSignal)
    expect(zipInit.signal).toBe(timeout.mock.results.at(-1)?.value)
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
