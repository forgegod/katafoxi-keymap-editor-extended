<script lang="ts">
  import type { Snippet } from 'svelte'
  import Spinner from '../Common/Spinner.svelte'

  interface Props {
    label: string
    title: string
    busy?: boolean
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
  <button
    type="button"
    class="source-trigger"
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
  </button>
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

  :global(#actions) .source-trigger {
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

  .source-trigger::after {
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

  .source-menu :global(.source-busy) {
    width: 16px;
    height: 16px;
    color: #555;
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
    min-width: 16rem;
    max-width: 22rem;
    margin: 0;
    padding: 8px;
    background: #fff;
    border: 1px solid #ccc;
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
