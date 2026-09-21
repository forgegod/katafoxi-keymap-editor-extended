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
  <i class="icon fa fa-spinner"></i>
  {#if children}
    {@render children()}
  {/if}
</div>
