import { afterEach, describe, expect, it, vi } from 'vitest'
import * as api from './api.js'
import * as auth from './auth.js'
import {
  downloadFirmwareArtifact,
  fetchFirmwareBuild,
  firmwareArchiveName
} from './builds.js'

const NOW = Date.parse('2026-09-29T12:00:00.000Z')

function commit(sha: string, date: string) {
  return { sha, commit: { committer: { date } } }
}

function run(overrides: Record<string, unknown> = {}) {
  return {
    id: 7,
    head_sha: 'abcdef1234567890',
    status: 'completed',
    conclusion: 'success',
    html_url: 'https://github.com/acme/keymap/actions/runs/7',
    created_at: '2026-09-29T11:50:00.000Z',
    updated_at: '2026-09-29T11:58:00.000Z',
    ...overrides
  }
}

function mockGithub(handlers: Record<string, unknown>) {
  vi.spyOn(auth, 'createInstallationToken').mockResolvedValue({
    data: { token: 'install-token' }
  } as Awaited<ReturnType<typeof auth.createInstallationToken>>)
  vi.spyOn(api, 'request').mockImplementation(async options => {
    const opts = typeof options === 'string' ? { url: options } : options
    const url = opts.url
    const key = Object.keys(handlers).find(prefix => url.includes(prefix))
    if (!key) throw new Error(`unexpected ${url}`)
    const body = handlers[key]
    if (body instanceof Error) throw body
    return { data: body, headers: {}, status: 200 }
  })
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('fetchFirmwareBuild', () => {
  it('returns the firmware artifact for a successful run of the branch head', async () => {
    mockGithub({
      '/commits/': commit('abcdef1234567890', '2026-09-29T11:40:00.000Z'),
      '/actions/runs/7/artifacts': {
        artifacts: [
          { id: 1, name: 'logs', expired: false },
          { id: 2, name: 'firmware', expired: false }
        ]
      },
      '/actions/runs': { workflow_runs: [run()] }
    })

    const build = await fetchFirmwareBuild('9', 'acme/keymap', 'main', NOW)

    expect(build).toMatchObject({
      status: 'success',
      sha: 'abcdef1234567890',
      shortSha: 'abcdef1',
      at: '2026-09-29T11:40:00.000Z',
      artifactId: 2,
      artifactName: 'firmware',
      htmlUrl: 'https://github.com/acme/keymap/actions/runs/7'
    })
  })

  it('reports an in-progress run without looking up artifacts', async () => {
    const request = vi.spyOn(api, 'request')
    mockGithub({
      '/commits/': commit('abcdef1234567890', '2026-09-29T11:40:00.000Z'),
      '/actions/runs': {
        workflow_runs: [run({ status: 'in_progress', conclusion: null })]
      }
    })

    const build = await fetchFirmwareBuild('9', 'acme/keymap', 'main', NOW)

    expect(build.status).toBe('in_progress')
    expect(build.artifactId).toBeNull()
    expect(request.mock.calls.some(([options]) => {
      const url = typeof options === 'string' ? options : options.url
      return url.includes('/artifacts')
    })).toBe(false)
  })

  it('waits when the head commit has no run yet but the branch has built before', async () => {
    mockGithub({
      '/commits/': commit('bbbbbbbbbbbbbbbb', '2026-09-29T11:58:00.000Z'),
      '/actions/runs': { workflow_runs: [run()] }
    })

    const build = await fetchFirmwareBuild('9', 'acme/keymap', 'main', NOW)

    expect(build.status).toBe('pending')
    expect(build.shortSha).toBe('bbbbbbb')
    expect(build.artifactId).toBeNull()
  })

  it('hides the build when the branch has never run Actions', async () => {
    mockGithub({
      '/commits/': commit('abcdef1234567890', '2026-09-29T10:00:00.000Z'),
      '/actions/runs': { workflow_runs: [] }
    })

    const build = await fetchFirmwareBuild('9', 'acme/keymap', 'main', NOW)

    expect(build.status).toBe('none')
  })

  it('maps a missing Actions permission to unavailable', async () => {
    mockGithub({
      '/commits/': Object.assign(new Error('GitHub API 403'), {
        response: { status: 403, data: { message: 'Resource not accessible by integration' } }
      })
    })

    const build = await fetchFirmwareBuild('9', 'acme/keymap', 'main', NOW)

    expect(build).toMatchObject({ status: 'unavailable', detail: 'actions_permission' })
  })

  it('marks a failed run and skips expired firmware', async () => {
    mockGithub({
      '/commits/': commit('abcdef1234567890', '2026-09-29T11:40:00.000Z'),
      '/actions/runs': {
        workflow_runs: [run({ conclusion: 'failure' })]
      }
    })

    const build = await fetchFirmwareBuild('9', 'acme/keymap', 'main', NOW)

    expect(build.status).toBe('failure')
    expect(build.htmlUrl).toContain('/actions/runs/7')
    expect(build.artifactId).toBeNull()
  })
})

describe('downloadFirmwareArtifact', () => {
  it('downloads the artifact zip with the installation token', async () => {
    vi.spyOn(auth, 'createInstallationToken').mockResolvedValue({
      data: { token: 'install-token' }
    } as Awaited<ReturnType<typeof auth.createInstallationToken>>)
    const bytes = new Uint8Array([1, 2, 3])
    const requestBuffer = vi.spyOn(api, 'requestBuffer').mockResolvedValue(bytes)

    const result = await downloadFirmwareArtifact('9', 'acme/keymap', '22')

    expect(result).toBe(bytes)
    expect(requestBuffer).toHaveBeenCalledWith({
      url: '/repos/acme/keymap/actions/artifacts/22/zip',
      token: 'install-token'
    })
  })
})

describe('firmwareArchiveName', () => {
  it('keeps a safe stem and adds zip', () => {
    expect(firmwareArchiveName('firmware')).toBe('firmware.zip')
    expect(firmwareArchiveName('firmware.zip')).toBe('firmware.zip')
    expect(firmwareArchiveName('bad name!')).toBe('badname.zip')
    expect(firmwareArchiveName('')).toBe('firmware.zip')
  })
})
