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

interface RequestExtras {
  /** Skip authentication-failed emit (e.g. session probe on init). */
  suppressAuthEmit?: boolean
}

export class API extends EventEmitter {
  authorized = $state(false)
  initialized = $state(false)
  installations = $state<unknown[] | null>(null)
  repositories = $state<GitHubRepo[] | null>(null)
  repoInstallationMap = $state<Record<string, string> | null>(null)

  async _request(
    options: string | RequestOptions,
    extras: RequestExtras = {}
  ): Promise<{ data: unknown }> {
    let opts: RequestOptions =
      typeof options === 'string' ? { url: options } : { ...options }

    if (opts.url.startsWith('/')) {
      opts.url = `${config.apiBaseUrl}${opts.url}`
    }

    const headers: Record<string, string> = { ...(opts.headers || {}) }

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

    const response = await fetch(opts.url, {
      method,
      headers,
      body,
      credentials: 'include'
    })
    const contentType = response.headers.get('content-type') || ''
    const data = contentType.includes('application/json')
      ? await response.json()
      : await response.text()

    if (!response.ok) {
      const err = new Error(`Request failed: ${response.status}`) as RequestError
      err.response = { status: response.status, data }
      if (response.status === 401 && !extras.suppressAuthEmit) {
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

    // Migrate away from legacy client JWT storage.
    localStorage.removeItem('auth_token')

    try {
      const { data } = (await this._request('/github/installation', {
        suppressAuthEmit: true
      })) as {
        data: {
          installation?: unknown
          installations: unknown[]
          repositories: GitHubRepo[]
          repoInstallationMap: Record<string, string>
        }
      }

      this.authorized = true
      this.emit('authenticated')

      this.installations = data.installations
      this.repositories = data.repositories
      this.repoInstallationMap = data.repoInstallationMap

      if (!this.isAppInstalled()) {
        console.warn('No GitHub app installation found for authenticated user.')
      }
    } catch (err) {
      const requestErr = err as RequestError
      if (requestErr.response?.status !== 401) {
        console.error('Failed to probe GitHub session.', err)
      }
      this.authorized = false
    }

    this.initialized = true
  }

  beginLoginFlow() {
    window.location.href = `${config.apiBaseUrl}/github/authorize`
  }

  beginInstallAppFlow() {
    window.location.href = `https://github.com/apps/${config.githubAppName}/installations/new`
  }

  isGitHubAuthorized() {
    return this.authorized
  }

  isAppInstalled() {
    return !!(this.installations?.length && this.repositories?.length)
  }

  async logout() {
    try {
      await this._request(
        { url: '/github/logout', method: 'POST' },
        { suppressAuthEmit: true }
      )
    } catch (err) {
      console.error('GitHub logout failed.', err)
    }

    this.authorized = false
    this.installations = null
    this.repositories = null
    this.repoInstallationMap = null
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
    let path = `/github/keyboard-files/${installation}/${repository}`
    if (branch) {
      path += `?${new URLSearchParams({ branch }).toString()}`
    }

    try {
      const { data } = (await this._request(path)) as {
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
