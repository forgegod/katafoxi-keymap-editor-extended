<script lang="ts">
  import KeyValue from './KeyValue.svelte'
  import KeyParamlist from './KeyParamlist.svelte'
  import type { HydratedNode } from '../../../hydrate'
  import { get } from '../../../utils'

  interface Props {
    index: HydratedNode[]
    params: unknown[]
    values: HydratedNode[]
    onSelect: (event: {
      target: EventTarget | null
      codeIndex: number
      code: string | number | undefined
      param: unknown
    }) => void
    root?: boolean
  }

  let { index, params, values, onSelect, root = false }: Props = $props()
</script>

<span class="params" data-is-root={!!root} data-param-count={params.length}>
  {#each params as param, i}
    <span class="param">
      <KeyValue
        index={index.indexOf(values[i])}
        {param}
        value={get(values[i], 'value') as string | number | undefined}
        source={get(values[i], 'source') as Record<string, unknown> | null}
        {onSelect}
      />
      {#if ((get(values[i], 'source.params.length') as number) || 0) > 0}
        <KeyParamlist
          {index}
          params={get(values[i], 'source.params') as unknown[]}
          values={get(values[i], 'params') as HydratedNode[]}
          {onSelect}
        />
      {/if}
    </span>
  {/each}
</span>
