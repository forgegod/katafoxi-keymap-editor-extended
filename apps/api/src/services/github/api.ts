const baseUrl = 'https://api.github.com'

/** JSON/REST GitHub calls. Artifact zip download uses a longer budget. */
export const GITHUB_API_TIMEOUT_MS = 15_000
export const GITHUB_ZIP_TIMEOUT_MS = 120_000

export interface ApiRequestOptions {
  url: string
  method?: string
  headers?: Record<string, string>
  token?: string
  data?: unknown
  params?: Record<string, string>
  timeoutMs?: number
}

/**
 * GitHub REST path: encode each segment, keep `/` between branch/content parts.
 * `githubApiPath('repos', 'acme/lark', 'commits', 'feature/x#y')`
 * → `/repos/acme/lark/commits/feature/x%23y`
 */
export function githubApiPath(...parts: string[]): string {
  const encoded = parts
    .flatMap(part => part.split('/'))
    .filter(segment => segment.length > 0)
    .map(encodeURIComponent)
    .join('/')
  return `/${encoded}`
}

function prepare(options: ApiRequestOptions | string): { url: string; init: RequestInit } {
  const opts: ApiRequestOptions =
    typeof options === 'string' ? { url: options } : { ...options }

  let url = opts.url
  if (url.startsWith('/')) {
    url = `${baseUrl}${url}`
  }

  if (opts.params) {
    const parsed = new URL(url)
    for (const [k, v] of Object.entries(opts.params)) {
      parsed.searchParams.set(k, v)
    }
    url = parsed.toString()
  }

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    ...opts.headers
  }

  if (opts.token) {
    headers.Authorization = `Bearer ${opts.token}`
  }

  const init: RequestInit = {
    method: opts.method || (opts.data ? 'POST' : 'GET'),
    headers,
    signal: AbortSignal.timeout(opts.timeoutMs ?? GITHUB_API_TIMEOUT_MS)
  }

  if (opts.data !== undefined) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json'
    init.body = typeof opts.data === 'string' ? opts.data : JSON.stringify(opts.data)
  }

  return { url, init }
}

async function throwIfNotOk(response: Response): Promise<void> {
  if (response.ok) return
  const raw = await response.text()
  let data: unknown = raw
  try {
    data = JSON.parse(raw) as unknown
  } catch {
    data = raw
  }
  throw Object.assign(new Error(`GitHub API ${response.status}`), {
    response: { status: response.status, data, url: response.url }
  })
}

export async function request(options: ApiRequestOptions | string) {
  const { url, init } = prepare(options)
  const response = await fetch(url, init)
  await throwIfNotOk(response)

  const contentType = response.headers.get('content-type') || ''
  let data: unknown
  if (contentType.includes('application/json')) {
    data = await response.json()
  } else {
    data = await response.text()
  }

  return {
    data,
    headers: Object.fromEntries(response.headers.entries()),
    status: response.status
  }
}

/** Follows GitHub's artifact redirect and returns the zip response (body streamed). */
export async function requestZip(options: ApiRequestOptions | string): Promise<Response> {
  const opts: ApiRequestOptions =
    typeof options === 'string'
      ? { url: options, timeoutMs: GITHUB_ZIP_TIMEOUT_MS }
      : { ...options, timeoutMs: options.timeoutMs ?? GITHUB_ZIP_TIMEOUT_MS }
  const { url, init } = prepare(opts)
  const response = await fetch(url, init)
  await throwIfNotOk(response)
  return response
}
