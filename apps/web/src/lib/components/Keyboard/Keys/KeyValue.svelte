<script lang="ts">
  import Icon from '../../Common/Icon.svelte'

  interface Props {
    param: unknown
    index: number
    value: string | number | undefined
    source?: Record<string, unknown> | null
    onSelect: (event: {
      target: EventTarget | null
      codeIndex: number
      code: string | number | undefined
      param: unknown
    }) => void
  }

  let { param, index, value, source, onSelect }: Props = $props()

  const title = $derived(
    source ? `(${source.code}) ${source.description ?? ''}` : undefined
  )
  const text = $derived(
    source ? String(source.symbol || source.code || '') : ''
  )
  const faIcon = $derived(source?.faIcon as string | undefined)

  function handleClick(event: MouseEvent) {
    event.stopPropagation()
    onSelect({
      target: event.target,
      codeIndex: index,
      code: value,
      param
    })
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<span class="code" {title} onclick={handleClick}>
  {#if faIcon}
    <Icon name={faIcon} />
  {:else if text}
    {text}
  {:else}
    <span>⦸</span>
  {/if}
</span>
