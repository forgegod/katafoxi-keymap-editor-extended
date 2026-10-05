<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    children: Snippet
    onBackdrop?: () => void
  }

  let { children, onBackdrop }: Props = $props()

  let wrapperEl: HTMLDivElement | undefined = $state()

  const FOCUSABLE =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

  // Portal under #app-root so Svelte 5 delegated clicks still reach the dialog.
  $effect(() => {
    const root = document.getElementById('modal-root')
    if (!root || !wrapperEl) return
    root.appendChild(wrapperEl)
    return () => {
      wrapperEl?.remove()
    }
  })

  $effect(() => {
    if (!wrapperEl) return
    const previous =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const content = wrapperEl.querySelector('.modal-content')
    const target =
      (content?.querySelector(FOCUSABLE) as HTMLElement | null) ?? wrapperEl
    target.focus({ preventScroll: true })

    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (!onBackdrop) return
      event.preventDefault()
      event.stopPropagation()
      onBackdrop()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true })
    }
  })
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  bind:this={wrapperEl}
  class="modal-wrapper"
  role="dialog"
  aria-modal="true"
  tabindex="-1"
  onclick={event => {
    if (onBackdrop && event.target === wrapperEl) onBackdrop()
  }}
>
  <div class="modal-content">
    {@render children()}
  </div>
</div>

<style>
  .modal-wrapper {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: var(--modal-scrim);
    z-index: var(--modal-z);
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 72px;
  }

  .modal-content {
    display: block;
    width: max-content;
    max-width: min(1180px, 94vw);
  }
</style>
