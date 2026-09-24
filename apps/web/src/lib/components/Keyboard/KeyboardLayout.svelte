<script lang="ts">
  import type {
    HostLegendView,
    KeyBindingNode,
    LayoutKey,
    LegendHover
  } from '@keymap-editor/keymap-core'
  import Key from './Keys/Key.svelte'
  import type { LegendMode } from '../../context'

  interface Props {
    layout: LayoutKey[]
    bindings: KeyBindingNode[]
    onUpdate: (bindings: KeyBindingNode[]) => void
    legendMode?: LegendMode
    hostView?: HostLegendView
    legendHover?: LegendHover | null
    layerStack?: KeyBindingNode[][]
    usedKeycodes?: ReadonlyMap<string, readonly number[]>
    usedRevision?: string
    usedLayerLabels?: readonly string[]
    hidden?: ReadonlySet<number>
  }

  let {
    layout,
    bindings,
    onUpdate,
    legendMode = 'zmk',
    hostView,
    legendHover = null,
    layerStack,
    usedKeycodes = new Map(),
    usedRevision = '',
    usedLayerLabels = [],
    hidden
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

  function handleUpdateBind(keyIndex: number, updateBinding: KeyBindingNode) {
    onUpdate([
      ...normalized.slice(0, keyIndex),
      updateBinding,
      ...normalized.slice(keyIndex + 1)
    ])
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
      {usedKeycodes}
      {usedRevision}
      {usedLayerLabels}
      {legendMode}
      {hostView}
      {legendHover}
      layerBindings={layerStack?.map(layer => layer[i] ?? { value: '&none', params: [] })}
      onUpdate={bind =>
        handleUpdateBind(i, {
          value: bind.value ?? '&none',
          params: bind.params as KeyBindingNode[]
        })
      }
    />
    {/if}
  {/each}
</div>
