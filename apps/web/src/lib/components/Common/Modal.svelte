<script lang="ts">
  import { onMount } from 'svelte'
  import type { Snippet } from 'svelte'

  interface Props {
    children: Snippet
    onBackdrop?: () => void
  }

  let { children, onBackdrop }: Props = $props()

  let wrapperEl: HTMLDivElement | undefined = $state()

  onMount(() => {
    const root = document.getElementById('modal-root')
    if (!root || !wrapperEl) return
    root.appendChild(wrapperEl)
    return () => {
      wrapperEl?.remove()
    }
  })
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
  bind:this={wrapperEl}
  class="modal-wrapper"
  style="position:absolute;top:0;left:0;width:100vw;height:100vh;background-color:rgba(104,123,162,0.39);z-index:50;display:flex;justify-content:center;align-items:center;"
  onclick={event => {
    if (onBackdrop && event.target === wrapperEl) onBackdrop()
  }}
>
  <div class="modal-content" style="display:block;">
    {@render children()}
  </div>
</div>
