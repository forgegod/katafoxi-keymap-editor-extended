<script lang="ts">
  import {
    isCompactModifierChord,
    isHoldTapParam,
    keycapLegend
  } from '@keymap-editor/keymap-core'
  import KeyValue from './KeyValue.svelte'
  import KeyParamlist from './KeyParamlist.svelte'
  import { childCodeIndex, type HydratedNode } from '../../../hydrate'
  import { get } from '../../../utils'

  interface Props {
    parentCodeIndex: number
    params: unknown[]
    values: HydratedNode[]
    root?: boolean
    compact?: boolean
    holdTap?: boolean
  }

  let {
    parentCodeIndex,
    params,
    values,
    root = false,
    compact = false,
    holdTap = false
  }: Props = $props()

  function holdTapSlot(index: number): 'hold' | 'tap' | undefined {
    if (!root || !holdTap || params.length !== 2) return undefined
    return isHoldTapParam(params[index]) ? 'hold' : 'tap'
  }

  function wrapCompact(node: HydratedNode | undefined): boolean {
    if (!node) return false
    const inner = node.params?.[0]
    if (!inner || (node.params?.length ?? 0) !== 1) return false
    if ((inner.params?.length ?? 0) > 0) return false
    return isCompactModifierChord(
      String(node.source?.code ?? node.value ?? ''),
      keycapLegend(
        (inner.source?.code ?? inner.value) as string | number | undefined,
        inner.source?.symbol as string | undefined
      )
    )
  }
</script>

<span
  class="params"
  data-is-root={!!root}
  data-compact={compact}
  data-param-count={params.length}
>
  {#each params as param, i}
    {@const codeIndex = childCodeIndex(parentCodeIndex, values, i)}
    {@const nestedCompact = wrapCompact(values[i])}
    {@const slot = holdTapSlot(i)}
    <span class="param" class:compact={nestedCompact} data-slot={slot}>
      <KeyValue
        index={codeIndex}
        {param}
        value={get(values[i], 'value') as string | number | undefined}
        source={get(values[i], 'source') as Record<string, unknown> | null}
      />{#if ((get(values[i], 'source.params.length') as number) || 0) > 0}<KeyParamlist
          parentCodeIndex={codeIndex}
          params={get(values[i], 'source.params') as unknown[]}
          values={get(values[i], 'params') as HydratedNode[]}
          compact={nestedCompact}
        />{/if}
    </span>
  {/each}
</span>
