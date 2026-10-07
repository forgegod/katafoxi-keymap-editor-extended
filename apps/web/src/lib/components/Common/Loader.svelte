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
  let error = $state<string | null>(null)

  $effect(() => {
    const loadFn = load
    let cancelled = false
    let timeout: ReturnType<typeof setTimeout> | null = null

    loaded = false
    delayed = false
    error = null

    timeout = setTimeout(() => {
      if (!cancelled && !loaded && !error) {
        delayed = true
      }
    }, delay)

    loadFn()
      .then(() => {
        if (cancelled) return
        if (timeout) clearTimeout(timeout)
        loaded = true
        delayed = false
      })
      .catch((err: unknown) => {
        if (cancelled) return
        if (timeout) clearTimeout(timeout)
        delayed = false
        error = err instanceof Error ? err.message : String(err)
        console.error('Loader failed:', err)
      })

    return () => {
      cancelled = true
      if (timeout) clearTimeout(timeout)
    }
  })
</script>

{#if loaded}
  {@render children()}
{:else if error}
  <Modal>
    <div class="error">
      <p><strong>Failed to load editor</strong></p>
      <p>{error}</p>
      <p>Local / GitHub sources still need the API on port 8080 (<code>pnpm dev</code>).</p>
    </div>
  </Modal>
{:else if delayed}
  <Modal>
    <Spinner style="color: var(--on-accent);">
      <p>Loading editor…</p>
    </Spinner>
  </Modal>
{/if}

<style>
  .error {
    background: var(--surface);
    color: var(--text);
    padding: 24px 32px;
    max-width: 420px;
    border-radius: 8px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.35);
  }
  .error code {
    font-size: 90%;
  }
</style>
