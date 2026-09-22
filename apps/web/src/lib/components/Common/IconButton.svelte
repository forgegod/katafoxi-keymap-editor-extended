<script lang="ts">
  import type { Snippet } from 'svelte'
  import Icon from './Icon.svelte'

  interface Props {
    collection?: string
    icon: string
    text?: string
    children?: Snippet
    onclick?: (event: MouseEvent) => void
    onClick?: (event: MouseEvent) => void
  }

  let {
    collection,
    icon,
    text,
    children,
    onclick,
    onClick
  }: Props = $props()

  const handleClick = $derived(onclick || onClick)
</script>

<button onclick={handleClick}>
  <Icon {collection} name={icon} />
  {text || ''}
  {#if children}
    {@render children()}
  {/if}
</button>
