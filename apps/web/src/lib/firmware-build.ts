import * as config from './config'
import type { FirmwareBuild, FirmwareBuildStatus } from './github/api.svelte.js'

const HIDDEN_POLL_MS = 15_000

export function isTrustedFirmwareHref(href: string, apiBaseUrl = config.apiBaseUrl): boolean {
  if (href.startsWith('https://github.com/')) return true
  if (apiBaseUrl) return href.startsWith(apiBaseUrl)
  return href.startsWith('/') && !href.startsWith('//')
}

export function pollDelay(status: FirmwareBuildStatus | undefined): number {
  if (status === 'pending' || status === 'queued' || status === 'in_progress') return 5000
  if (!status) return 8000
  return 20000
}

export function formatAge(iso: string | null, at: number): string {
  if (!iso) return ''
  const parsed = Date.parse(iso)
  if (Number.isNaN(parsed)) return ''
  const seconds = Math.max(0, Math.round((at - parsed) / 1000))
  if (seconds < 45) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 36) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  const days = Math.round(hours / 24)
  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}

export function firmwareBuildLabel(build: FirmwareBuild | null): string {
  if (!build) return ''
  if (build.status === 'unavailable') return 'Build status'
  return 'Latest'
}

export function firmwareBuildSecondary(build: FirmwareBuild | null): string {
  if (!build) return ''
  if (build.status === 'pending' || build.status === 'queued') return 'Waiting'
  if (build.status === 'in_progress') return 'Building'
  if (build.status === 'failure') return 'Failed'
  if (build.status === 'cancelled') return 'Cancelled'
  if (build.status === 'unavailable') return 'Needs Actions access'
  if (build.status === 'success' && !build.artifactId) return 'Log'
  return ''
}

export function firmwareBuildTitle(build: FirmwareBuild | null, age: string): string {
  if (!build) return ''
  if (build.status === 'unavailable') {
    return 'The GitHub App needs Actions: Read. Accept the updated app permissions, then reload.'
  }
  if (build.status === 'failure') return 'Firmware build failed. Open the Actions log.'
  if (build.status === 'cancelled') return 'Firmware build was cancelled. Open the Actions log.'
  if (build.status === 'success' && build.artifactId) {
    return age
      ? `Download the firmware archive (${age}).`
      : 'Download the firmware archive.'
  }
  if (build.status === 'success') return 'Build succeeded. Open the Actions log.'
  if (build.status === 'in_progress') return 'Firmware build is running.'
  return 'Waiting for GitHub Actions to start.'
}

export function startFirmwareBuildPoll(input: {
  repository: string
  branch: string
  fetchBuild: (repository: string, branch: string) => Promise<FirmwareBuild>
  onUpdate: (build: FirmwareBuild, now: number) => void
}): () => void {
  let cancelled = false
  let timer = 0

  async function tick() {
    if (typeof document !== 'undefined' && document.hidden) {
      timer = window.setTimeout(tick, HIDDEN_POLL_MS)
      return
    }
    try {
      const next = await input.fetchBuild(input.repository, input.branch)
      if (cancelled) return
      input.onUpdate(next, Date.now())
      timer = window.setTimeout(tick, pollDelay(next.status))
    } catch {
      if (cancelled) return
      timer = window.setTimeout(tick, pollDelay(undefined))
    }
  }

  void tick()
  return () => {
    cancelled = true
    window.clearTimeout(timer)
  }
}
