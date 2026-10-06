<script lang="ts">
  import github, { type FirmwareBuild } from '../github/api.svelte.js'
  import {
    firmwareBuildLabel,
    firmwareBuildSecondary,
    firmwareBuildTitle,
    formatAge,
    isTrustedFirmwareHref,
    startFirmwareBuildPoll
  } from '../firmware-build.js'
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

  const age = $derived(formatAge(build?.at ?? null, now))
  const busy = $derived(
    build?.status === 'pending' ||
      build?.status === 'queued' ||
      build?.status === 'in_progress'
  )
  const visible = $derived(!!build && build.status !== 'none')

  const secondary = $derived(firmwareBuildSecondary(build))
  const label = $derived(firmwareBuildLabel(build))
  const title = $derived(firmwareBuildTitle(build, age))

  const downloadUrl = $derived.by(() => {
    if (build?.status !== 'success' || !build.artifactId) return ''
    const url = github.firmwareDownloadUrl(repository, build.artifactId, build.artifactName)
    return isTrustedFirmwareHref(url) ? url : ''
  })
  const htmlUrl = $derived(
    build?.htmlUrl && isTrustedFirmwareHref(build.htmlUrl) ? build.htmlUrl : ''
  )

  $effect(() => {
    void refreshKey
    return startFirmwareBuildPoll({
      repository,
      branch,
      fetchBuild: (repo, br) => github.fetchFirmwareBuild(repo, br),
      onUpdate: (next, at) => {
        build = next
        now = at
      }
    })
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
  {:else if htmlUrl && (build.status === 'failure' || build.status === 'cancelled' || build.status === 'success')}
    <a class={chipClass} href={htmlUrl} target="_blank" rel="noreferrer" {title}>
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
    height: var(--chrome-h);
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
    color: var(--text-muted);
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

  /* Quiet wash while an archive is ready — solid green stays on Commit. */
  .downloadable {
    background: color-mix(in srgb, var(--accent) 12%, var(--surface));
    color: var(--accent-strong);
    border-color: var(--accent);
  }

  .downloadable .when {
    color: inherit;
    opacity: 0.85;
  }

  a.downloadable:hover {
    background: var(--surface);
    border-color: var(--accent-strong);
    color: var(--accent-strong);
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
