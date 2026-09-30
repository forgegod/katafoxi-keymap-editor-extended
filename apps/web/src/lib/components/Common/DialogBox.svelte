<script lang="ts">
  import type { Snippet } from 'svelte'

  interface Props {
    dismissText?: string | null
    onDismiss?: () => void
    children: Snippet
  }

  let {
    dismissText = 'Ok',
    onDismiss,
    children
  }: Props = $props()
</script>

<div
  class="dialog"
  style="background-color: var(--surface);padding:20px 40px;margin:40px;max-width:500px;box-shadow:0px 10px 25px rgba(0,0,0,0.4);"
>
  {@render children()}
  {#if dismissText}
    <button
      style="display:block;margin:0 auto;"
      onclick={onDismiss}
    >
      {dismissText}
    </button>
  {/if}
</div>
