import {
  inferRectangularLayout,
  parseHostKeymapSnapshot,
  type HostKeymapSnapshot,
  type LayoutKey,
  type ParsedKeymap
} from '@keymap-editor/keymap-core'
import * as config from '../config'

export interface KeyboardFilesResult {
  layout: LayoutKey[]
  keymap: ParsedKeymap
  hostSnapshot: HostKeymapSnapshot | null
  warnings: string[]
}

/** Accept a validated snapshot at the SPA boundary; non-ok → no snapshot. */
function hostSnapshotFromResponse(raw: unknown): HostKeymapSnapshot | null {
  const parsed = parseHostKeymapSnapshot(raw)
  return parsed.ok ? parsed.snapshot : null
}

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

export type FirmwareBuildStatus =
  | 'none'
  | 'pending'
  | 'queued'
  | 'in_progress'
  | 'success'
  | 'failure'
  | 'cancelled'
  | 'unavailable'

export interface FirmwareBuild {
  status: FirmwareBuildStatus
  sha: string | null
  shortSha: string | null
  at: string | null
  htmlUrl: string | null
  artifactId: number | null
  artifactName: string | null
  detail: string | null
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
  login = $state<string | null>(null)
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
          login?: string
          installation?: unknown
          installations: unknown[]
          repositories: GitHubRepo[]
          repoInstallationMap: Record<string, string>
        }
      }

      this.authorized = true
      this.login = typeof data.login === 'string' ? data.login : null
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
    this.login = null
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

  async createBranch(repo: string, name: string, from: string): Promise<{ name: string }> {
    const installation = encodeURIComponent(this.repoInstallationMap![repo])
    const repository = encodeURIComponent(repo)
    const { data } = await this._request({
      url: `/github/installation/${installation}/${repository}/branches`,
      method: 'POST',
      data: { name, from }
    })
    const created = data as { name?: unknown }
    if (!created || typeof created.name !== 'string' || !created.name) {
      throw new Error('Create branch response was not JSON')
    }
    return { name: created.name }
  }

  async fetchLayoutAndKeymap(
    repo: string,
    branch?: string | null
  ): Promise<KeyboardFilesResult> {
    const installation = encodeURIComponent(this.repoInstallationMap![repo])
    const repository = encodeURIComponent(repo)
    let path = `/github/keyboard-files/${installation}/${repository}`
    if (branch) {
      path += `?${new URLSearchParams({ branch }).toString()}`
    }

    try {
      const { data } = (await this._request(path)) as {
        data: {
          info: { layouts: Record<string, { layout: LayoutKey[] }> } | null
          keymap: ParsedKeymap
          hostSnapshot?: unknown
        }
      }
      const hostSnapshot = hostSnapshotFromResponse(data.hostSnapshot ?? null)
      const warnings: string[] = []
      if (data.info?.layouts && Object.keys(data.info.layouts).length > 0) {
        const defaultLayout =
          data.info.layouts.default ||
          data.info.layouts[Object.keys(data.info.layouts)[0]]
        return {
          layout: defaultLayout.layout,
          keymap: data.keymap,
          hostSnapshot,
          warnings
        }
      }

      const layer0 = Array.isArray(data.keymap?.layers) ? data.keymap.layers[0] : null
      const keyCount = Array.isArray(layer0) ? layer0.length : 0
      if (keyCount <= 0) {
        const err = new Error('Request failed: 400') as RequestError
        err.response = {
          status: 400,
          data: {
            name: 'MissingRepoFile',
            path: 'config/info.json',
            errors: [
              'Missing file config/info.json and keymap has no bindings to infer a layout from'
            ]
          }
        }
        throw err
      }

      warnings.push('github_inferred_layout')
      return {
        layout: inferRectangularLayout(keyCount),
        keymap: data.keymap,
        hostSnapshot,
        warnings
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

  async fetchFirmwareBuild(repo: string, branch: string): Promise<FirmwareBuild> {
    const installation = encodeURIComponent(this.repoInstallationMap![repo])
    const repository = encodeURIComponent(repo)
    const path = `/github/builds/${installation}/${repository}?${new URLSearchParams({ branch })}`
    const { data } = await this._request(path)
    if (!data || typeof data !== 'object' || !('status' in data)) {
      throw new Error('Firmware build response was not JSON')
    }
    return data as FirmwareBuild
  }

  firmwareDownloadUrl(repo: string, artifactId: number, artifactName: string | null): string {
    const installation = encodeURIComponent(this.repoInstallationMap![repo])
    const repository = encodeURIComponent(repo)
    const params = new URLSearchParams()
    if (artifactName) params.set('name', artifactName)
    const query = params.toString()
    const path = `/github/builds/${installation}/${repository}/artifact/${artifactId}`
    return `${config.apiBaseUrl}${path}${query ? `?${query}` : ''}`
  }

  commitChanges(
    repo: string,
    branch: string,
    layout: unknown,
    keymap: unknown,
    hostSnapshot?: unknown,
    hostDeliverables?: unknown
  ) {
    const installation = encodeURIComponent(this.repoInstallationMap![repo])
    const repository = encodeURIComponent(repo)

    return this._request({
      url: `/github/keyboard-files/${installation}/${repository}/${encodeURIComponent(branch)}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      data: {
        layout,
        keymap,
        hostSnapshot: hostSnapshot ?? null,
        hostDeliverables: hostDeliverables ?? null
      }
    })
  }
}

const github = new API()
export default github
