<script lang="ts">
  import { onMount, tick } from 'svelte'
  import Button from './Common/Button.svelte'
  import {
    COACH_TOUR_STEPS,
    clearCoachTourDone,
    readCoachTourDone,
    writeCoachTourDone,
    type CoachTourStep
  } from '../coach-tour'

  interface Props {
    showGithub?: boolean
    expandLegend?: boolean
    /** Increment to reopen the tour from step 1 (Demo chrome “Tour”). */
    restartKey?: number
    onPasteKeymap?: () => void
    onConnectGithub?: () => void
  }

  let {
    showGithub = true,
    expandLegend = $bindable(false),
    restartKey = 0,
    onPasteKeymap,
    onConnectGithub
  }: Props = $props()

  let active = $state(!readCoachTourDone())
  let stepIndex = $state(0)
  let appliedRestartKey = $state(0)
  let hole = $state<{
    top: number
    left: number
    width: number
    height: number
  } | null>(null)
  let tip = $state<{ top: number; left: number } | null>(null)
  let wrapperEl: HTMLDivElement | undefined = $state()
  let tipEl: HTMLDivElement | undefined = $state()

  const step = $derived(COACH_TOUR_STEPS[stepIndex] as CoachTourStep | undefined)
  const total = COACH_TOUR_STEPS.length
  const isLast = $derived(Boolean(step?.finish))

  function restartTour() {
    clearCoachTourDone()
    stepIndex = 0
    active = true
  }

  $effect(() => {
    if (restartKey === appliedRestartKey) return
    appliedRestartKey = restartKey
    if (restartKey > 0) restartTour()
  })

  function finish() {
    active = false
    expandLegend = false
    hole = null
    tip = null
    writeCoachTourDone()
  }

  function skip() {
    finish()
  }

  function go(delta: number) {
    const next = stepIndex + delta
    if (next < 0) return
    if (next >= total) {
      finish()
      return
    }
    stepIndex = next
  }

  function pasteKeymap() {
    finish()
    onPasteKeymap?.()
  }

  function connectGithub() {
    finish()
    onConnectGithub?.()
  }

  function measure() {
    if (!active || !step) {
      hole = null
      tip = null
      expandLegend = false
      return
    }
    expandLegend = Boolean(step.expandLegend)
    const target = document.querySelector(step.selector)
    if (!(target instanceof HTMLElement)) {
      hole = null
      tip = null
      return
    }
    target.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    const rect = target.getBoundingClientRect()
    const pad = 6
    const nextHole = {
      top: Math.max(0, rect.top - pad),
      left: Math.max(0, rect.left - pad),
      width: Math.min(window.innerWidth - 8, rect.width + pad * 2),
      height: Math.min(window.innerHeight - 8, rect.height + pad * 2)
    }
    hole = nextHole

    const tipW = tipEl?.offsetWidth ?? 300
    const tipH = tipEl?.offsetHeight ?? 140
    const gap = 12
    let top = nextHole.top + nextHole.height + gap
    let left = nextHole.left
    if (top + tipH > window.innerHeight - 12) {
      top = Math.max(12, nextHole.top - tipH - gap)
    }
    if (left + tipW > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - tipW - 12)
    }
    tip = { top, left }
  }

  $effect(() => {
    if (!active) return
    void stepIndex
    void expandLegend
    let cancelled = false
    const run = async () => {
      await tick()
      // Legend expand needs a paint before layer eyes exist in the interactive panel.
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
      if (!cancelled) measure()
    }
    void run()
    return () => {
      cancelled = true
    }
  })

  $effect(() => {
    if (!active) return
    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    window.addEventListener('scroll', onResize, true)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('scroll', onResize, true)
    }
  })

  function isInteractiveInCoachTip(target: EventTarget | null): boolean {
    if (!(target instanceof Element)) return false
    if (!target.closest('.coach-tip')) return false
    return Boolean(
      target.closest('button, a[href], input, select, textarea, [role="button"]')
    )
  }

  $effect(() => {
    if (!active) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault()
        skip()
        return
      }
      // Let tip buttons (Skip / Next / CTAs) own Enter and arrows.
      if (isInteractiveInCoachTip(event.target)) return
      if (event.key === 'ArrowRight' || event.key === 'Enter') {
        if (isLast) return
        event.preventDefault()
        go(1)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        go(-1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Portal under #modal-root so the overlay sits above chrome and the board.
  $effect(() => {
    const root = document.getElementById('modal-root')
    if (!root || !wrapperEl) return
    root.appendChild(wrapperEl)
    return () => {
      wrapperEl?.remove()
    }
  })

  onMount(() => {
    if (active) measure()
  })
</script>

{#if active && step}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={wrapperEl}
    class="coach-tour"
    role="dialog"
    aria-modal="true"
    aria-labelledby="coach-tour-title"
  >
    <!-- Blocks clicks while the hole is only a visual cutout. -->
    <div class="coach-catcher" aria-hidden="true"></div>
    {#if hole}
      <div
        class="coach-hole"
        style="top:{hole.top}px;left:{hole.left}px;width:{hole.width}px;height:{hole.height}px"
        aria-hidden="true"
      ></div>
    {:else}
      <div class="coach-shade" aria-hidden="true"></div>
    {/if}
    <div
      bind:this={tipEl}
      class="coach-tip"
      style={tip ? `top:${tip.top}px;left:${tip.left}px` : undefined}
    >
      <p class="coach-step" id="coach-tour-step">
        {stepIndex + 1} / {total}
      </p>
      <h2 class="coach-title" id="coach-tour-title">{step.title}</h2>
      <p class="coach-body">{step.body}</p>
      <div class="coach-actions" class:coach-actions-finish={isLast}>
        {#if isLast}
          <div class="coach-cta-row" class:single={!showGithub || !onConnectGithub}>
            <Button
              variant="accent"
              class="coach-cta"
              onclick={pasteKeymap}
              title="Paste a .keymap from the clipboard"
            >
              Paste .keymap
            </Button>
            {#if showGithub && onConnectGithub}
              <Button
                variant="outline"
                class="coach-cta"
                onclick={connectGithub}
                title="Connect a GitHub repository"
              >
                Connect GitHub
              </Button>
            {/if}
          </div>
        {:else}
          <Button variant="outline" class="coach-skip" onclick={skip}>Skip</Button>
        {/if}
        <div class="coach-nav">
          {#if stepIndex > 0}
            <Button variant="outline" class="coach-back" onclick={() => go(-1)}>
              Back
            </Button>
          {/if}
          {#if isLast}
            <Button variant="accentOutline" class="coach-done" onclick={finish}>
              Done
            </Button>
          {:else}
            <Button variant="accent" class="coach-next" onclick={() => go(1)}>
              Next
            </Button>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .coach-tour {
    position: fixed;
    inset: 0;
    z-index: var(--z-tour);
    pointer-events: none;
  }

  .coach-catcher,
  .coach-shade {
    position: absolute;
    inset: 0;
    pointer-events: auto;
  }

  .coach-shade {
    background: rgba(20, 24, 32, 0.55);
  }

  .coach-hole {
    position: absolute;
    box-sizing: border-box;
    border-radius: 8px;
    border: 2px solid var(--accent, #2a9d8f);
    box-shadow: 0 0 0 9999px rgba(20, 24, 32, 0.55);
    pointer-events: none;
  }

  .coach-tip {
    position: absolute;
    z-index: 1;
    box-sizing: border-box;
    width: min(22rem, calc(100vw - 24px));
    margin: 0;
    padding: 12px 14px;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 10px;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.28);
    pointer-events: auto;
  }

  .coach-step {
    margin: 0 0 4px;
    color: var(--text-muted);
    font-size: var(--font-xs, 0.75rem);
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .coach-title {
    margin: 0 0 6px;
    font-size: var(--font-md, 1rem);
    font-weight: 700;
    line-height: 1.25;
  }

  .coach-body {
    margin: 0 0 12px;
    color: var(--text);
    font-size: var(--font-sm, 0.85rem);
    line-height: 1.4;
  }

  .coach-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .coach-actions-finish {
    flex-direction: column;
    align-items: stretch;
    gap: 10px;
  }

  .coach-cta-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .coach-cta-row.single {
    grid-template-columns: 1fr;
  }

  .coach-nav {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-left: auto;
  }

  .coach-actions-finish .coach-nav {
    width: 100%;
    margin-left: 0;
    justify-content: space-between;
  }

  .coach-tour :global(.coach-skip),
  .coach-tour :global(.coach-back),
  .coach-tour :global(.coach-next),
  .coach-tour :global(.coach-done),
  .coach-tour :global(.coach-cta) {
    height: 1.8rem;
    padding: 0 10px;
    font-size: var(--font-sm, 0.85rem);
  }

  .coach-cta-row :global(.coach-cta) {
    width: 100%;
    justify-content: center;
  }
</style>
