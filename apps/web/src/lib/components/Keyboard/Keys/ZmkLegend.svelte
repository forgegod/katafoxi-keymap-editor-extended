<script lang="ts">
  import {
    behaviorKeycapRole,
    compactBehaviorLegend,
    getBehaviorCatalog,
    isHoldTapBinding,
    type KeyBindingNode,
    type LegendHoverHit
  } from '@keymap-editor/keymap-core'
  import { getSearchContext } from '../../../context'
  import { getBehaviourParams, hydrateTree } from '../../../hydrate'
  import KeyParamlist from './KeyParamlist.svelte'

  interface Props {
    binding: KeyBindingNode
    raw?: boolean
    hit?: LegendHoverHit
  }

  let { binding, raw = false, hit = 'none' }: Props = $props()

  const searchBox = getSearchContext() as
    | { current?: { sources?: Record<string, Record<string, unknown>> } }
    | undefined
  const sources = $derived(searchBox?.current?.sources ?? {})

  function lookupBehaviour(code: string | number | undefined) {
    const key = String(code ?? '')
    return (sources.behaviours?.[key] ?? getBehaviorCatalog().byCode[key]) as
      | Record<string, unknown>
      | undefined
  }

  const hydrated = $derived(hydrateTree(binding.value, binding.params ?? [], sources))
  const rowParams = $derived(
    getBehaviourParams(hydrated.params, lookupBehaviour(binding.value) as never)
  )
  const holdTap = $derived(isHoldTapBinding(hydrated))
  const behaviorRole = $derived(
    behaviorKeycapRole(binding.value, {
      paramCount: hydrated.params.length,
      holdTapVisible: holdTap
    })
  )
  const compact = $derived(compactBehaviorLegend(binding))
  const code = $derived(String(binding.value))
</script>

<span class="zmk-row" class:zmk-raw={raw} class:legend-hit={hit === 'combo'}>
  {#if compact}
    {compact}
  {:else}
    {#if behaviorRole !== 'hidden'}
      <span class="zmk-beh">{code}</span>
    {/if}
    <KeyParamlist
      root={true}
      {holdTap}
      parentCodeIndex={0}
      params={rowParams}
      values={hydrated.params}
    />
  {/if}
</span>
