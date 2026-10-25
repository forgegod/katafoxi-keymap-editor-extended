<script lang="ts">
  import {
    getBehaviorCatalog,
    mergeHoldTapCatalog,
    getKeycodeCatalog,
    layerLegendSymbol,
    type HostLegendView,
    type KeyBindingNode,
    type LayerView
  } from '@keymap-editor/keymap-core'
  import { setSearchContext } from '../../../context'
  import { editor } from '../../../editor.svelte.js'
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
    comboPeekLayer?: number | null
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
    comboPeekLayer = null,
    onUpdate = () => {}
  }: Props = $props()

  const definitions = $derived({
    keycodes: getKeycodeCatalog(),
    behaviours: mergeHoldTapCatalog(getBehaviorCatalog(), editor.draftKeymap?.holdTaps)
  })
  const layers = $derived((editor.draftKeymap?.layers ?? [[]]).map((_, code) => ({
    code, symbol: layerLegendSymbol(code), description: `Layer ${code}`
  })))
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
  comboPeekLayer={comboPeekLayer}
  legendHover={editor.legendHover}
  onUpdate={(keyIndex, layerIndex, binding) => onUpdate(keyIndex, layerIndex, binding)}
/>
