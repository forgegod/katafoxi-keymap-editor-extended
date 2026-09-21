import * as config from '../config'

type Listener = (...args: unknown[]) => void

/** Minimal EventEmitter (replaces eventemitter3). */
export class EventEmitter {
  private listeners = new Map<string, Set<Listener>>()

  on(event: string, fn: Listener): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set())
    this.listeners.get(event)!.add(fn)
    return this
  }

  off(event: string, fn: Listener): this {
    this.listeners.get(event)?.delete(fn)
    return this
  }

  emit(event: string, ...args: unknown[]): this {
    this.listeners.get(event)?.forEach(fn => fn(...args))
    return this
  }
}

export interface GitHubRepo {
  id: number
  full_name: string
  default_branch?: string
  [key: string]: unknown
}

export interface GitHubBranch {
  name: string
  [key: string]: unknown
}

interface RequestOptions {
  url: string
  method?: string
  headers?: Record<string, string>
  body?: unknown
  data?: unknown
}

interface RequestError extends Error {
  response?: { status: number; data?: unknown }
}

export class API extends EventEmitter {
  token: string | null = null
  initialized = false
  installations: unknown[] | null = null
  repositories: GitHubRepo[] | null = null
  repoInstallationMap: Record<string, string> | null = null

  async _request(options: string | RequestOptions): Promise<{ data: unknown }> {
    let opts: RequestOptions =
      typeof options === 'string' ? { url: options } : { ...options }

    if (opts.url.startsWith('/')) {
      opts.url = `${config.apiBaseUrl}${opts.url}`
    }

    const headers: Record<string, string> = { ...(opts.headers || {}) }
    if (this.token && !headers.Authorization) {
      headers.Authorization = `Bearer ${this.token}`
    }

    const method = (opts.method || 'GET').toUpperCase()
    const bodyPayload = opts.body ?? opts.data
    let body: string | undefined
    if (bodyPayload !== undefined && method !== 'GET' && method !== 'HEAD') {
      if (!headers['Content-Type']) {
        headers['Content-Type'] = 'application/json'
      }
      body =
        typeof bodyPayload === 'string'
          ? bodyPayload
          : JSON.stringify(bodyPayload)
    }

    const response = await fetch(opts.url, { method, headers, body })
    const contentType = response.headers.get('content-type') || ''
    const data = contentType.includes('application/json')
      ? await response.json()
      : await response.text()

    if (!response.ok) {
      const err = new Error(`Request failed: ${response.status}`) as RequestError
      err.response = { status: response.status, data }
      if (response.status === 401) {
        console.error('Authentication failed.')
        this.emit('authentication-failed', err.response)
      }
      throw err
    }

    return { data }
  }

  async init() {
    if (this.initialized) {
      return
    }

    const installationUrl = `${config.apiBaseUrl}/github/installation`
    const param = new URLSearchParams(window.location.search).get('token')
    if (!localStorage.auth_token && param) {
      window.history.replaceState({}, '', window.location.pathname)
      localStorage.auth_token = param
    }

    if (localStorage.auth_token) {
      this.token = localStorage.auth_token
      const { data } = (await this._request(installationUrl)) as {
        data: {
          installation?: unknown
          installations: unknown[]
          repositories: GitHubRepo[]
          repoInstallationMap: Record<string, string>
        }
      }
      this.emit('authenticated')

      if (!data.installation) {
        console.warn('No GitHub app installation found for authenticated user.')
        this.emit('app-not-installed')
      }

      this.installations = data.installations
      this.repositories = data.repositories
      this.repoInstallationMap = data.repoInstallationMap
    }

    this.initialized = true
  }

  beginLoginFlow() {
    localStorage.removeItem('auth_token')
    window.location.href = `${config.apiBaseUrl}/github/authorize`
  }

  beginInstallAppFlow() {
    window.location.href = `https://github.com/apps/${config.githubAppName}/installations/new`
  }

  isGitHubAuthorized() {
    return !!this.token
  }

  isAppInstalled() {
    return !!(this.installations?.length && this.repositories?.length)
  }

  async fetchRepoBranches(repo: GitHubRepo) {
    const installation = encodeURIComponent(
      this.repoInstallationMap![repo.full_name]
    )
    const repository = encodeURIComponent(repo.full_name)
    const { data } = await this._request(
      `/github/installation/${installation}/${repository}/branches`
    )
    return data as GitHubBranch[]
  }

  async fetchLayoutAndKeymap(repo: string, branch?: string | null) {
    const installation = encodeURIComponent(this.repoInstallationMap![repo])
    const repository = encodeURIComponent(repo)
    const url = new URL(
      `${config.apiBaseUrl}/github/keyboard-files/${installation}/${repository}`
    )

    if (branch) {
      url.search = new URLSearchParams({ branch }).toString()
    }

    try {
      const { data } = (await this._request(url.toString())) as {
        data: {
          info: { layouts: Record<string, { layout: unknown }> }
          keymap: unknown
        }
      }
      const defaultLayout =
        data.info.layouts.default ||
        data.info.layouts[Object.keys(data.info.layouts)[0]]
      return {
        layout: defaultLayout.layout,
        keymap: data.keymap
      }
    } catch (err) {
      const requestErr = err as RequestError
      if (requestErr.response?.status === 400) {
        console.error(
          'Failed to load keymap and layout from github',
          requestErr.response.data
        )
        this.emit('repo-validation-error', requestErr.response.data)
      }
      throw err
    }
  }

  commitChanges(
    repo: string,
    branch: string,
    layout: unknown,
    keymap: unknown
  ) {
    const installation = encodeURIComponent(this.repoInstallationMap![repo])
    const repository = encodeURIComponent(repo)

    return this._request({
      url: `/github/keyboard-files/${installation}/${repository}/${encodeURIComponent(branch)}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: { layout, keymap }
    })
  }
}

const github = new API()
export default github
