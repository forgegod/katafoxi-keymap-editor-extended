<script lang="ts">
  import github, { type FirmwareBuild, type FirmwareBuildStatus } from '../github/api.svelte.js'
  import Spinner from './Common/Spinner.svelte'

  interface Props {
    repository: string
    branch: string
    /** Bump after a commit so the next build is picked up immediately. */
    refreshKey?: number
  }

  let { repository, branch, refreshKey = 0 }: Props = $props()

  let build = $state<FirmwareBuild | null>(null)
  let now = $state(Date.now())

  function pollDelay(status: FirmwareBuildStatus | undefined): number {
    if (status === 'pending' || status === 'queued' || status === 'in_progress') return 5000
    if (!status) return 8000
    return 20000
  }

  function formatAge(iso: string | null, at: number): string {
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

  const age = $derived(formatAge(build?.at ?? null, now))
  const busy = $derived(
    build?.status === 'pending' ||
      build?.status === 'queued' ||
      build?.status === 'in_progress'
  )
  const visible = $derived(!!build && build.status !== 'none')

  const secondary = $derived.by(() => {
    if (!build) return ''
    if (build.status === 'pending' || build.status === 'queued') return 'Waiting'
    if (build.status === 'in_progress') return 'Building'
    if (build.status === 'failure') return 'Failed'
    if (build.status === 'cancelled') return 'Cancelled'
    if (build.status === 'unavailable') return 'Needs Actions access'
    if (build.status === 'success' && !build.artifactId) return 'Log'
    return age
  })

  const label = $derived.by(() => {
    if (!build) return ''
    if (build.status === 'unavailable') return 'Build status'
    return 'Latest'
  })

  const title = $derived.by(() => {
    if (!build) return ''
    if (build.status === 'unavailable') {
      return 'The GitHub App needs Actions: Read. Accept the updated app permissions, then reload.'
    }
    if (build.status === 'failure') return 'Firmware build failed. Open the Actions log.'
    if (build.status === 'cancelled') return 'Firmware build was cancelled. Open the Actions log.'
    if (build.status === 'success' && build.artifactId) return 'Download the firmware archive.'
    if (build.status === 'success') return 'Build succeeded. Open the Actions log.'
    if (build.status === 'in_progress') return 'Firmware build is running.'
    return 'Waiting for GitHub Actions to start.'
  })

  const downloadUrl = $derived(
    build?.status === 'success' && build.artifactId
      ? github.firmwareDownloadUrl(repository, build.artifactId, build.artifactName)
      : ''
  )

  $effect(() => {
    const repo = repository
    const br = branch
    void refreshKey
    let cancelled = false
    let timer = 0

    async function tick() {
      if (typeof document !== 'undefined' && document.hidden) {
        timer = window.setTimeout(tick, 15000)
        return
      }
      try {
        const next = await github.fetchFirmwareBuild(repo, br)
        if (cancelled) return
        build = next
        now = Date.now()
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
  })
</script>

{#if visible && build}
  {@const chipClass = `firmware-build ${build.status}${downloadUrl ? ' downloadable' : ''}`}
  {#if downloadUrl}
    <a class={chipClass} href={downloadUrl} {title}>
      {@render chip()}
      <svg class="download" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v11" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </svg>
    </a>
  {:else if build.htmlUrl && (build.status === 'failure' || build.status === 'cancelled' || build.status === 'success')}
    <a class={chipClass} href={build.htmlUrl} target="_blank" rel="noreferrer" {title}>
      {@render chip()}
    </a>
  {:else}
    <span class={chipClass} role="status" {title}>
      {@render chip()}
    </span>
  {/if}
{:else if !build}
  <span class="firmware-build pending" role="status" title="Checking the latest firmware build.">
    <span class="copy">
      <span class="line">Latest <Spinner /></span>
    </span>
  </span>
{/if}

{#snippet chip()}
  <span class="copy">
    <span class="line">
      {label}
      {#if build?.status === 'success'}
        <svg class="mark" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 12.5 9.2 17 19 7" />
        </svg>
      {/if}
      {#if busy}
        <Spinner />
      {/if}
    </span>
    {#if secondary}
      <span class="when">{secondary}</span>
    {/if}
  </span>
{/snippet}

<style>
  .firmware-build {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    box-sizing: border-box;
    height: 26px;
    padding: 0 6px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--surface);
    color: var(--text);
    font-family: Quicksand, avenir, sans-serif;
    font-size: var(--font-sm);
    line-height: 1.05;
    text-decoration: none;
    white-space: nowrap;
  }

  .copy {
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .line {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .when {
    font-size: var(--font-xs);
    opacity: 0.95;
  }

  .mark,
  .download {
    fill: none;
    stroke: currentColor;
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .mark {
    width: 11px;
    height: 11px;
  }

  .download {
    width: 14px;
    height: 14px;
  }

  .downloadable {
    background: var(--info);
    color: var(--on-accent);
    border-color: transparent;
  }

  a.downloadable:hover {
    background: var(--info-strong);
  }

  .failure,
  .cancelled {
    background: var(--surface);
    color: var(--danger-ink);
    border-color: var(--danger-border);
  }

  a.failure:hover,
  a.cancelled:hover {
    background: var(--danger-wash);
  }

  .unavailable {
    background: var(--surface);
    color: var(--warn);
    border-color: var(--warn-border);
  }

  .firmware-build :global(.spinner) {
    display: inline-flex;
    width: 11px;
    height: 11px;
  }

  .firmware-build :global(.spinner .icon) {
    width: 11px;
    height: 11px;
  }
</style>
