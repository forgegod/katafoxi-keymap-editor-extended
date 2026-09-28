<script lang="ts">
  import {
    getBehaviorCatalog,
    getKeycodeCatalog,
    layerLegendSymbol,
    type HostLegendView,
    type KeyBindingNode,
    type LayerView
  } from '@keymap-editor/keymap-core'
  import { setSearchContext } from '../../../context'
  import { buildSearchContext } from '../../../search-context'
  import Key from './Key.svelte'

  interface Props {
    position?: { x: number; y: number }
    size?: { u: number; h: number }
    value?: string | number
    params?: Array<{ value?: string | number; params?: unknown[] }>
    keyIndex?: number
    layerIndex?: number
    layerBindings?: KeyBindingNode[]
    layerView?: LayerView
    hostView?: HostLegendView
    onUpdate?: (keyIndex: number, layerIndex: number, binding: KeyBindingNode) => void
  }

  let {
    position = { x: 0, y: 0 },
    size = { u: 1, h: 1 },
    value = '&kp',
    params = [{ value: 'A', params: [] }],
    keyIndex = 0,
    layerIndex = 0,
    layerBindings,
    layerView,
    hostView,
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
  layerBindings={
    layerBindings ?? [{ value, params: params as KeyBindingNode[] }]
  }
  {layerView}
  {hostView}
  onUpdate={(keyIndex, layerIndex, binding) => onUpdate(keyIndex, layerIndex, binding)}
/>
