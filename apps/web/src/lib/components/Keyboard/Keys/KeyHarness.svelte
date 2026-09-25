<script lang="ts">
  import {
    getBehaviorCatalog,
    getKeycodeCatalog,
    layerLegendSymbol,
    type KeyBindingNode
  } from '@keymap-editor/keymap-core'
  import { setSearchContext, type LegendMode } from '../../../context'
  import type { HydratedNode } from '../../../hydrate'
  import { buildSearchContext } from '../../../search-context'
  import Key from './Key.svelte'

  interface Props {
    position?: { x: number; y: number }
    size?: { u: number; h: number }
    value?: string | number
    params?: Array<{ value?: string | number; params?: unknown[] }>
    legendMode?: LegendMode
    keyIndex?: number
    layerIndex?: number
    layerBindings?: KeyBindingNode[]
    onUpdate?: (bind: {
      value: string | number | undefined
      params: HydratedNode[]
    }) => void
  }

  let {
    position = { x: 0, y: 0 },
    size = { u: 1, h: 1 },
    value = '&kp',
    params = [{ value: 'A', params: [] }],
    legendMode = 'zmk',
    keyIndex = 0,
    layerIndex = 0,
    layerBindings,
    onUpdate = () => {}
  }: Props = $props()

  const definitions = {
    keycodes: getKeycodeCatalog(),
    behaviours: getBehaviorCatalog()
  }
  const layers = [
    {
      code: 0,
      symbol: layerLegendSymbol(0),
      description: 'Layer 0'
    }
  ]
  const search = $derived.by(() => buildSearchContext(definitions, layers))

  setSearchContext({
    get current() {
      return search
    }
  })
</script>

<Key
  {position}
  {size}
  {value}
  {params}
  {keyIndex}
  {layerIndex}
  {layerBindings}
  {legendMode}
  onUpdate={(_keyIndex, _layerIndex, bind) => onUpdate(bind)}
/>
