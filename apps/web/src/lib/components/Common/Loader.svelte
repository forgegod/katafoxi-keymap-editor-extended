<script lang="ts">
  import type { Snippet } from 'svelte'
  import Modal from './Modal.svelte'
  import Spinner from './Spinner.svelte'

  interface Props {
    load: () => Promise<unknown>
    delay?: number
    children: Snippet
  }

  let { load, delay = 200, children }: Props = $props()

  let loaded = $state(false)
  let delayed = $state(false)

  $effect(() => {
    const loadFn = load
    let cancelled = false
    let timeout: ReturnType<typeof setTimeout> | null = null

    loaded = false
    delayed = false

    timeout = setTimeout(() => {
      if (!cancelled && !loaded) {
        delayed = true
      }
    }, delay)

    loadFn().then(() => {
      if (cancelled) return
      if (timeout) clearTimeout(timeout)
      loaded = true
      delayed = false
    })

    return () => {
      cancelled = true
      if (timeout) clearTimeout(timeout)
    }
  })
</script>

{#if loaded}
  {@render children()}
{:else if delayed}
  <Modal>
    <Spinner style="color: white;">
      <p>Waiting for API...</p>
    </Spinner>
  </Modal>
{/if}
