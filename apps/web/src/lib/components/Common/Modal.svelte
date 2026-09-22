<script lang="ts">
  import { onMount } from 'svelte'
  import type { Snippet } from 'svelte'

  interface Props {
    children: Snippet
  }

  let { children }: Props = $props()

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

<div
  bind:this={wrapperEl}
  class="modal-wrapper"
  style="position:absolute;top:0;left:0;width:100vw;height:100vh;background-color:rgba(104,123,162,0.39);z-index:50;display:flex;justify-content:center;align-items:center;"
>
  <div class="modal-content" style="display:block;">
    {@render children()}
  </div>
</div>
