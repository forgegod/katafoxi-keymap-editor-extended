<script lang="ts">
  import type {
    HostLegendView,
    LayerView,
    KeyBindingNode,
    LayoutKey,
    LegendHover
  } from '@keymap-editor/keymap-core'
  import Key from './Keys/Key.svelte'

  interface Props {
    layout: LayoutKey[]
    bindings: KeyBindingNode[]
    onUpdate: (keyIndex: number, layerIndex: number, binding: KeyBindingNode) => void
    hostView?: HostLegendView
    layerView?: LayerView
    legendHover?: LegendHover | null
    layerIndex?: number
    layerStack?: KeyBindingNode[][]
    usedKeycodes?: ReadonlyMap<string, readonly number[]>
    usedRevision?: string
    usedLayerLabels?: readonly string[]
    hidden?: ReadonlySet<number>
    comboMode?: boolean
    comboPositions?: ReadonlySet<number> | null
    onComboToggle?: (keyIndex: number) => void
  }

  let {
    layout,
    bindings,
    onUpdate,
    hostView,
    layerView,
    legendHover = null,
    layerIndex,
    layerStack,
    usedKeycodes = new Map(),
    usedRevision = '',
    usedLayerLabels = [],
    hidden,
    comboMode = false,
    comboPositions = null,
    onComboToggle
  }: Props = $props()

  const normalized = $derived(
    layout.map((_, i) => bindings[i] || { value: '&none', params: [] })
  )

  function position(key: LayoutKey) {
    return { x: key.x, y: key.y }
  }
  function rotation(key: LayoutKey) {
    return { x: key.rx, y: key.ry, a: key.r }
  }
  function size(key: LayoutKey) {
    const { w = 1, u = w, h = 1 } = key
    return { u: u ?? 1, h: h ?? 1 }
  }

</script>

<div style="position: relative">
  {#each layout as key, i (i)}
    {#if !hidden?.has(i)}
    <Key
      position={position(key)}
      rotation={rotation(key)}
      size={size(key)}
      label={key.label}
      value={normalized[i].value}
      params={normalized[i].params}
      keyIndex={i}
      {layerIndex}
      {usedKeycodes}
      {usedRevision}
      {usedLayerLabels}
      {hostView}
      {layerView}
      {legendHover}
      layerBindings={layerStack?.map(layer => layer[i] ?? { value: '&none', params: [] })}
      {comboMode}
      comboMember={comboPositions?.has(i) ?? false}
      {onUpdate}
      {onComboToggle}
    />
    {/if}
  {/each}
</div>
