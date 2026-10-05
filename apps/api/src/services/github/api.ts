const baseUrl = 'https://api.github.com'

export interface ApiRequestOptions {
  url: string
  method?: string
  headers?: Record<string, string>
  token?: string
  data?: unknown
  params?: Record<string, string>
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
    headers
  }

  if (opts.data !== undefined) {
    headers['Content-Type'] = headers['Content-Type'] || 'application/json'
    init.body = typeof opts.data === 'string' ? opts.data : JSON.stringify(opts.data)
  }

  return { url, init }
}

async function throwIfNotOk(response: Response): Promise<void> {
  if (response.ok) return
  let data: unknown
  try {
    data = await response.json()
  } catch {
    data = await response.text()
  }
  throw Object.assign(new Error(`GitHub API ${response.status}`), {
    response: { status: response.status, data }
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

/** Follows GitHub's artifact redirect and returns the zip bytes. */
export async function requestBuffer(options: ApiRequestOptions | string): Promise<Uint8Array> {
  const { url, init } = prepare(options)
  const response = await fetch(url, init)
  await throwIfNotOk(response)
  return new Uint8Array(await response.arrayBuffer())
}
