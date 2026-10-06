<script lang="ts">
  import { isKeypadCode, keycapLegend } from '@keymap-editor/keymap-core'
  import Icon from '../../Common/Icon.svelte'

  interface Props {
    param: unknown
    index: number
    value: string | number | undefined
    source?: Record<string, unknown> | null
  }

  let { value, source }: Props = $props()

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
</script>

<span class="code" class:keypad {title}>
  {#if faIcon}
    <Icon name={faIcon} />
  {:else if text}
    {text}
  {:else}
    <span>⦸</span>
  {/if}
</span>
