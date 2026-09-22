const baseUrl = 'https://api.github.com'

export interface ApiRequestOptions {
  url: string
  method?: string
  headers?: Record<string, string>
  token?: string
  data?: unknown
  params?: Record<string, string>
}

export async function request(options: ApiRequestOptions | string) {
  let opts: ApiRequestOptions =
    typeof options === 'string' ? { url: options } : { ...options }

  if (opts.url.startsWith('/')) {
    opts.url = `${baseUrl}${opts.url}`
  }

  if (opts.params) {
    const url = new URL(opts.url)
    for (const [k, v] of Object.entries(opts.params)) {
      url.searchParams.set(k, v)
    }
    opts.url = url.toString()
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

  const response = await fetch(opts.url, init)
  const limitRemaining = response.headers.get('x-ratelimit-remaining')
  if (limitRemaining) {
    console.log('GitHub API ratelimit remaining requests:', limitRemaining)
  }

  if (!response.ok) {
    let data: unknown
    try {
      data = await response.json()
    } catch {
      data = await response.text()
    }
    const err = Object.assign(new Error(`GitHub API ${response.status}`), {
      response: { status: response.status, data }
    })
    throw err
  }

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
