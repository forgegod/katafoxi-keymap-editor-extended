<script lang="ts">
  import type { Snippet } from 'svelte'
  import Button from './Button.svelte'

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

<div class="dialog">
  {@render children()}
  {#if dismissText}
    <Button variant="accent" class="dialog-dismiss" onclick={onDismiss}>
      {dismissText}
    </Button>
  {/if}
</div>

<style>
  .dialog {
    max-width: 500px;
    margin: 40px;
    padding: 20px 40px;
    background: var(--surface);
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
  }

  .dialog :global(.dialog-dismiss) {
    display: block;
    margin: 12px auto 0;
  }
</style>
