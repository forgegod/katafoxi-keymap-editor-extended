<script lang="ts">
  import type { Snippet } from 'svelte'
  import { pushEscapeHandler } from '../../escape-stack'

  interface Props {
    children: Snippet
    onBackdrop?: () => void
    /** Wider shell for long fixed-width content (e.g. exported .keymap). */
    size?: 'default' | 'wide'
    ariaLabel?: string
    ariaLabelledby?: string
  }

  let {
    children,
    onBackdrop,
    size = 'default',
    ariaLabel,
    ariaLabelledby
  }: Props = $props()

  let wrapperEl: HTMLDivElement | undefined = $state()

  const FOCUSABLE =
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

  function focusables(root: Element): HTMLElement[] {
    return [...root.querySelectorAll(FOCUSABLE)].filter(
      (el): el is HTMLElement => el instanceof HTMLElement
    )
  }

  function trapTab(event: KeyboardEvent) {
    if (event.key !== 'Tab' || event.isComposing) return
    const content = wrapperEl?.querySelector('.modal-content')
    if (!content) return
    const items = focusables(content)
    if (items.length === 0) {
      event.preventDefault()
      return
    }
    const first = items[0]
    const last = items[items.length - 1]
    const active = document.activeElement
    if (event.shiftKey) {
      if (active === first || !content.contains(active)) {
        event.preventDefault()
        last.focus()
      }
    } else if (active === last || !content.contains(active)) {
      event.preventDefault()
      first.focus()
    }
  }

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

    const dismiss = onBackdrop
    const popEscape = pushEscapeHandler(() => {
      dismiss?.()
    })
    wrapperEl.addEventListener('keydown', trapTab)
    return () => {
      wrapperEl?.removeEventListener('keydown', trapTab)
      popEscape()
      if (previous && document.contains(previous)) {
        previous.focus({ preventScroll: true, focusVisible: false } as FocusOptions)
      }
    }
  })
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  bind:this={wrapperEl}
  class="modal-wrapper"
  role="dialog"
  aria-modal="true"
  aria-label={ariaLabel}
  aria-labelledby={ariaLabelledby}
  tabindex="-1"
  onclick={event => {
    if (onBackdrop && event.target === wrapperEl) onBackdrop()
  }}
>
  <div class="modal-content" data-size={size}>
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

  .modal-content[data-size='wide'] {
    max-width: min(98vw, 1600px);
  }
</style>
