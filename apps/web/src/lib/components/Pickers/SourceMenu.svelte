<script lang="ts">
  import type { Snippet } from 'svelte'
  import Button from '../Common/Button.svelte'
  import Spinner from '../Common/Spinner.svelte'

  interface Props {
    label: string
    title: string
    busy?: boolean
    /** Soft one-shot cue on the trigger (first-visit intro). */
    accent?: boolean
    /** When false, the trigger runs `onActivate` and does not open the menu. */
    popup?: boolean
    open?: boolean
    onActivate?: () => void
    children: Snippet
  }

  let {
    label,
    title,
    busy = false,
    accent = false,
    popup = true,
    open = $bindable(false),
    onActivate,
    children
  }: Props = $props()

  let menuEl = $state<HTMLDivElement | undefined>()

  $effect(() => {
    if (!open) return
    function handle(event: PointerEvent) {
      if (event.target instanceof Node && menuEl?.contains(event.target)) return
      open = false
    }
    document.addEventListener('pointerdown', handle)
    return () => document.removeEventListener('pointerdown', handle)
  })
</script>

<div class="source-menu" bind:this={menuEl}>
  <Button
    variant="outline"
    class="source-trigger{accent ? ' source-trigger-accent' : ''}"
    {title}
    aria-label={title}
    aria-haspopup={popup ? 'dialog' : undefined}
    aria-expanded={popup ? open : undefined}
    onclick={() => {
      if (!popup) {
        onActivate?.()
        return
      }
      open = !open
    }}
  >
    <span class="source-trigger-label">{label}</span>
  </Button>
  {#if busy}
    <Spinner class="source-busy" />
  {/if}
  <!-- Kept mounted so a closed menu still loads the keymap. `hidden` removes it from layout. -->
  <div class="source-popover" role="dialog" aria-label={title} hidden={!open}>
    {@render children()}
  </div>
</div>

<style>
  .source-menu {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .source-menu :global(.source-trigger) {
    position: relative;
    max-width: 16rem;
    justify-content: flex-start;
    padding: 0 22px 0 8px;
  }

  .source-trigger-label {
    overflow: hidden;
    min-width: 0;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .source-menu :global(.source-trigger)::after {
    content: '';
    position: absolute;
    right: 6px;
    top: 50%;
    width: 10px;
    height: 7px;
    transform: translateY(-50%);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 8'%3E%3Cpath fill='none' stroke='%23555' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round' d='M1 1.5 6 6.5 11 1.5'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: center;
    background-size: 10px 7px;
    pointer-events: none;
  }

  .source-menu :global(.source-trigger-accent) {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent);
    /* Soft pulse while Demo is the active source. */
    animation: source-trigger-pulse 2s ease-in-out infinite;
  }

  @keyframes source-trigger-pulse {
    0%,
    100% {
      box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
    }
    50% {
      box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 28%, transparent);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .source-menu :global(.source-trigger-accent) {
      animation: none;
    }
  }

  .source-menu :global(.source-busy) {
    width: 16px;
    height: 16px;
    color: var(--text-muted);
  }

  .source-menu :global(.source-busy svg) {
    width: 16px;
    height: 16px;
  }

  .source-popover {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 8;
    display: flex;
    flex-direction: column;
    gap: 8px;
    box-sizing: border-box;
    width: max-content;
    min-width: 16rem;
    /* Wide enough for a row of source cards; demo list still fits. */
    max-width: min(36rem, calc(100vw - 24px));
    margin: 0;
    padding: 8px;
    overflow-x: hidden;
    overflow-y: auto;
    max-height: min(70vh, 36rem);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.14);
  }

  .source-popover[hidden] {
    display: none !important;
  }

  .source-popover :global(.selector) {
    width: 100%;
  }

  .source-popover :global(.control) {
    width: 100%;
    max-width: none;
  }
</style>
