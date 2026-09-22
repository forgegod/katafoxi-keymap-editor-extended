<script lang="ts">
  import { resolveIcon } from '../../icons'

  interface Props {
    name: string
    class?: string
    /** Kept for call-site compat; only `brands` + github is special-cased. */
    collection?: string
    onclick?: (event: MouseEvent) => void
    title?: string
  }

  let {
    name,
    class: className = '',
    collection = 'default',
    onclick,
    title
  }: Props = $props()

  const icon = $derived(resolveIcon(name, collection))
</script>

{#if icon}
  <svg
    class="icon {className}"
    viewBox={icon.viewBox}
    aria-hidden={title ? undefined : 'true'}
    aria-label={title}
    role={onclick ? 'button' : title ? 'img' : undefined}
    {onclick}
  >
    {#each icon.paths as d}
      <path fill="currentColor" {d} />
    {/each}
  </svg>
{/if}

<style>
  .icon {
    display: inline-block;
    width: 1em;
    height: 1em;
    vertical-align: -0.125em;
    flex-shrink: 0;
  }
</style>
