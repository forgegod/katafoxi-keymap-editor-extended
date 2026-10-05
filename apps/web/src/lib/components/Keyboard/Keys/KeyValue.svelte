<script lang="ts">
  import { isKeypadCode, keycapLegend } from '@keymap-editor/keymap-core'
  import Icon from '../../Common/Icon.svelte'

  type SelectEvent = {
    target: EventTarget | null
    codeIndex: number
    code: string | number | undefined
    param: unknown
  }

  interface Props {
    param: unknown
    index: number
    value: string | number | undefined
    source?: Record<string, unknown> | null
    /** When false (default), paint only — clicks bubble to the parent layer slot. */
    interactive?: boolean
    onSelect?: (event: SelectEvent) => void
  }

  let {
    param,
    index,
    value,
    source,
    interactive = false,
    onSelect
  }: Props = $props()

  const title = $derived(
    source ? `(${source.code}) ${source.description ?? ''}` : undefined
  )
  const text = $derived(
    keycapLegend(
      (source?.code ?? value) as string | number | undefined,
      source?.symbol as string | undefined
    )
  )
  const faIcon = $derived(source?.faIcon as string | undefined)
  const keypad = $derived(
    isKeypadCode((source?.code ?? value) as string | number | undefined)
  )

  function handleClick(event: MouseEvent) {
    event.stopPropagation()
    onSelect?.({
      target: event.target,
      codeIndex: index,
      code: value,
      param
    })
  }
</script>

{#if interactive}
  <button type="button" class="code" class:keypad {title} onclick={handleClick}>
    {#if faIcon}
      <Icon name={faIcon} />
    {:else if text}
      {text}
    {:else}
      <span>⦸</span>
    {/if}
  </button>
{:else}
  <span class="code" class:keypad {title}>
    {#if faIcon}
      <Icon name={faIcon} />
    {:else if text}
      {text}
    {:else}
      <span>⦸</span>
    {/if}
  </span>
{/if}
