import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FirmwareBuild, FirmwareBuildStatus } from './github/api.svelte.js'
import {
  firmwareBuildLabel,
  firmwareBuildSecondary,
  firmwareBuildTitle,
  formatAge,
  isTrustedFirmwareHref,
  pollDelay,
  startFirmwareBuildPoll
} from './firmware-build'

function chip(partial: Partial<FirmwareBuild> & Pick<FirmwareBuild, 'status'>): FirmwareBuild {
  return {
    sha: null,
    shortSha: null,
    at: null,
    htmlUrl: null,
    artifactId: null,
    artifactName: null,
    detail: null,
    ...partial
  }
}

describe('firmware build chip copy', () => {
  it.each([
    {
      name: 'null build',
      build: null,
      age: '',
      label: '',
      secondary: '',
      title: ''
    },
    {
      name: 'none',
      build: chip({ status: 'none' }),
      age: '',
      label: 'Latest',
      secondary: '',
      title: 'Waiting for GitHub Actions to start.'
    },
    {
      name: 'pending',
      build: chip({ status: 'pending' }),
      age: '',
      label: 'Latest',
      secondary: 'Waiting',
      title: 'Waiting for GitHub Actions to start.'
    },
    {
      name: 'queued',
      build: chip({ status: 'queued' }),
      age: '',
      label: 'Latest',
      secondary: 'Waiting',
      title: 'Waiting for GitHub Actions to start.'
    },
    {
      name: 'in_progress',
      build: chip({ status: 'in_progress' }),
      age: '',
      label: 'Latest',
      secondary: 'Building',
      title: 'Firmware build is running.'
    },
    {
      name: 'failure',
      build: chip({ status: 'failure' }),
      age: '',
      label: 'Latest',
      secondary: 'Failed',
      title: 'Firmware build failed. Open the Actions log.'
    },
    {
      name: 'cancelled',
      build: chip({ status: 'cancelled' }),
      age: '',
      label: 'Latest',
      secondary: 'Cancelled',
      title: 'Firmware build was cancelled. Open the Actions log.'
    },
    {
      name: 'unavailable',
      build: chip({ status: 'unavailable' }),
      age: '',
      label: 'Build status',
      secondary: 'Needs Actions access',
      title:
        'The GitHub App needs Actions: Read. Accept the updated app permissions, then reload.'
    },
    {
      name: 'success without artifact',
      build: chip({ status: 'success' }),
      age: '1 minute ago',
      label: 'Latest',
      secondary: 'Log',
      title: 'Build succeeded. Open the Actions log.'
    },
    {
      name: 'success with artifact and age',
      build: chip({ status: 'success', artifactId: 9 }),
      age: '1 minute ago',
      label: 'Latest',
      secondary: '',
      title: 'Download the firmware archive (1 minute ago).'
    },
    {
      name: 'success with artifact and no age',
      build: chip({ status: 'success', artifactId: 9 }),
      age: '',
      label: 'Latest',
      secondary: '',
      title: 'Download the firmware archive.'
    }
  ] satisfies Array<{
    name: string
    build: FirmwareBuild | null
    age: string
    label: string
    secondary: string
    title: string
  }>)('$name maps to label/secondary/title', ({ build, age, label, secondary, title }) => {
    expect(firmwareBuildLabel(build)).toBe(label)
    expect(firmwareBuildSecondary(build)).toBe(secondary)
    expect(firmwareBuildTitle(build, age)).toBe(title)
  })
})

describe('formatAge', () => {
  const at = Date.parse('2026-10-06T12:00:00.000Z')

  function isoSecondsAgo(seconds: number): string {
    return new Date(at - seconds * 1000).toISOString()
  }

  it('returns empty for missing or invalid timestamps', () => {
    expect(formatAge(null, at)).toBe('')
    expect(formatAge('not-a-date', at)).toBe('')
  })

  it('uses just now below 45s and minutes at the 45s boundary', () => {
    expect(formatAge(isoSecondsAgo(44), at)).toBe('just now')
    expect(formatAge(isoSecondsAgo(45), at)).toBe('1 minute ago')
  })

  it('switches from minutes to hours at 60 minutes', () => {
    expect(formatAge(isoSecondsAgo(59 * 60), at)).toBe('59 minutes ago')
    expect(formatAge(isoSecondsAgo(60 * 60), at)).toBe('1 hour ago')
  })

  it('switches from hours to days at 36 hours', () => {
    expect(formatAge(isoSecondsAgo(35 * 3600), at)).toBe('35 hours ago')
    expect(formatAge(isoSecondsAgo(36 * 3600), at)).toBe('2 days ago')
  })
})

describe('pollDelay', () => {
  it.each([
    ['pending', 5000],
    ['queued', 5000],
    ['in_progress', 5000],
    [undefined, 8000],
    ['success', 20000],
    ['failure', 20000],
    ['none', 20000]
  ] as const)('%s waits %s ms', (status, ms) => {
    expect(pollDelay(status as FirmwareBuildStatus | undefined)).toBe(ms)
  })
})

describe('isTrustedFirmwareHref', () => {
  it('allows GitHub https links, same-origin paths, and the API origin', () => {
    expect(isTrustedFirmwareHref('https://github.com/acme/k/actions', '')).toBe(true)
    expect(isTrustedFirmwareHref('/github/builds/1/acme%2Fk/artifact/2', '')).toBe(true)
    expect(isTrustedFirmwareHref('http://127.0.0.1:8080/github/x', 'http://127.0.0.1:8080')).toBe(
      true
    )
  })

  it('rejects protocol-relative and off-origin hrefs', () => {
    expect(isTrustedFirmwareHref('//github.com/acme', '')).toBe(false)
    expect(isTrustedFirmwareHref('https://evil.example/firmware.zip', '')).toBe(false)
    expect(isTrustedFirmwareHref('https://evil.example/x', 'http://127.0.0.1:8080')).toBe(false)
  })
})

describe('startFirmwareBuildPoll', () => {
  afterEach(() => {
    vi.useRealTimers()
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      value: false
    })
  })

  it('ignores a stale response after the branch changes', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    let resolveMain!: (build: FirmwareBuild) => void
    const fetchMain = vi.fn(
      () =>
        new Promise<FirmwareBuild>(resolve => {
          resolveMain = resolve
        })
    )
    const fetchFeature = vi.fn(async () => chip({ status: 'success', sha: 'feat' }))
    const seen: FirmwareBuild[] = []

    const stopMain = startFirmwareBuildPoll({
      repository: 'acme/k',
      branch: 'main',
      fetchBuild: fetchMain,
      onUpdate: build => seen.push(build)
    })
    stopMain()

    const stopFeature = startFirmwareBuildPoll({
      repository: 'acme/k',
      branch: 'feature',
      fetchBuild: (repo, branch) => {
        expect(repo).toBe('acme/k')
        expect(branch).toBe('feature')
        return fetchFeature()
      },
      onUpdate: build => seen.push(build)
    })

    await vi.advanceTimersByTimeAsync(0)
    expect(seen).toEqual([chip({ status: 'success', sha: 'feat' })])

    resolveMain(chip({ status: 'in_progress', sha: 'stale' }))
    await vi.advanceTimersByTimeAsync(0)
    expect(seen).toEqual([chip({ status: 'success', sha: 'feat' })])
    stopFeature()
  })

  it('clears poll timers on unmount', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const fetchBuild = vi.fn(async () => chip({ status: 'success' }))
    const stop = startFirmwareBuildPoll({
      repository: 'acme/k',
      branch: 'main',
      fetchBuild,
      onUpdate: () => {}
    })

    await vi.advanceTimersByTimeAsync(0)
    expect(fetchBuild).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(1)

    stop()
    expect(vi.getTimerCount()).toBe(0)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchBuild).toHaveBeenCalledTimes(1)
  })

  it('polls every 15s while the document is hidden', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true
    })
    const fetchBuild = vi.fn(async () => chip({ status: 'pending' }))

    const stop = startFirmwareBuildPoll({
      repository: 'acme/k',
      branch: 'main',
      fetchBuild,
      onUpdate: () => {}
    })

    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false
    })
    await vi.advanceTimersByTimeAsync(14_999)
    expect(fetchBuild).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchBuild).toHaveBeenCalledTimes(1)
    stop()
  })
})
