<script lang="ts">
  import type { Snippet } from 'svelte'
  import './spinner.css'

  interface Props {
    children?: Snippet
    style?: string
    class?: string
  }

  let { children, style, class: className = '' }: Props = $props()
</script>

<div class="spinner {className}" style={style}>
  <svg class="icon" viewBox="0 0 24 24" aria-hidden="true">
    <circle
      cx="12"
      cy="12"
      r="9"
      fill="none"
      stroke="currentColor"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-dasharray="40 60"
    />
  </svg>
  {#if children}
    {@render children()}
  {/if}
</div>
