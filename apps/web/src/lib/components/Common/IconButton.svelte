<script lang="ts">
  import type { Snippet } from 'svelte'
  import Button from './Button.svelte'
  import Icon from './Icon.svelte'

  interface Props {
    collection?: string
    icon: string
    text?: string
    children?: Snippet
    onclick?: (event: MouseEvent) => void
    onClick?: (event: MouseEvent) => void
    title?: string
    class?: string
    disabled?: boolean
  }

  let {
    collection,
    icon,
    text,
    children,
    onclick,
    onClick,
    title,
    class: className = '',
    disabled = false
  }: Props = $props()

  const handleClick = $derived(onclick || onClick)
</script>

<Button
  variant="outline"
  class={className}
  {title}
  {disabled}
  onclick={handleClick}
>
  <Icon {collection} name={icon} />
  {text || ''}
  {#if children}
    {@render children()}
  {/if}
</Button>
