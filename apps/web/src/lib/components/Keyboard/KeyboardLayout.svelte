<script lang="ts">
  import type {
    HostLegendView,
    LayerView,
    KeyBindingNode,
    LayoutKey,
    LegendHover
  } from '@keymap-editor/keymap-core'
  import Key from './Keys/Key.svelte'

  interface KeyGeometry {
    position: { x: number; y: number }
    rotation: { x: number | undefined; y: number | undefined; a: number | undefined }
    size: { u: number; h: number }
  }

  interface Props {
    layout: LayoutKey[]
    bindings: KeyBindingNode[]
    onUpdate: (keyIndex: number, layerIndex: number, binding: KeyBindingNode) => void
    hostView?: HostLegendView
    layerView?: LayerView
    legendHover?: LegendHover | null
    legendAnchorIndex?: number
    layerIndex?: number
    layerStack?: KeyBindingNode[][]
    usedKeycodes?: ReadonlyMap<string, readonly number[]>
    usedRevision?: string
    usedLayerLabels?: readonly string[]
    hidden?: ReadonlySet<number>
    comboMode?: boolean
    comboPositions?: ReadonlySet<number> | null
    /** Bead hover: highlight these keys' layer strips. */
    comboPeek?: { positions: ReadonlySet<number>; faceLayer: number } | null
    onComboToggle?: (keyIndex: number) => void
  }

  let {
    layout,
    bindings,
    onUpdate,
    hostView,
    layerView,
    legendHover = null,
    legendAnchorIndex = 0,
    layerIndex,
    layerStack,
    usedKeycodes = new Map(),
    usedRevision = '',
    usedLayerLabels = [],
    hidden,
    comboMode = false,
    comboPositions = null,
    comboPeek = null,
    onComboToggle
  }: Props = $props()

  const BLANK: KeyBindingNode = { value: '&none', params: [] }

  const normalized = $derived(
    layout.map((_, i) => bindings[i] || { value: '&none', params: [] })
  )

  const keyGeometry = $derived.by((): KeyGeometry[] =>
    layout.map(key => {
      const { w = 1, u = w, h = 1 } = key
      return {
        position: { x: key.x, y: key.y },
        rotation: { x: key.rx, y: key.ry, a: key.r },
        size: { u: u ?? 1, h: h ?? 1 }
      }
    })
  )

  let prevKeyColumns: KeyBindingNode[][] | null = null
  const keyColumns = $derived.by((): KeyBindingNode[][] | null => {
    if (!layerStack) {
      prevKeyColumns = null
      return null
    }
    const layerCount = layerStack.length
    const keyCount = layout.length
    const prev = prevKeyColumns
    const next: KeyBindingNode[][] = new Array(keyCount)
    for (let i = 0; i < keyCount; i++) {
      const old = prev?.[i]
      let reuse = old != null && old.length === layerCount
      if (reuse && old) {
        for (let layer = 0; layer < layerCount; layer++) {
          const binding = layerStack[layer][i] ?? BLANK
          if (old[layer] !== binding) {
            reuse = false
            break
          }
        }
      }
      if (reuse && old) {
        next[i] = old
        continue
      }
      const col: KeyBindingNode[] = new Array(layerCount)
      for (let layer = 0; layer < layerCount; layer++) {
        col[layer] = layerStack[layer][i] ?? BLANK
      }
      next[i] = col
    }
    prevKeyColumns = next
    return next
  })

</script>

<div style="position: relative">
  {#each layout as key, i (i)}
    {#if !hidden?.has(i)}
    {@const geom = keyGeometry[i]}
    <Key
      position={geom.position}
      rotation={geom.rotation}
      size={geom.size}
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
      isLegendAnchor={i === legendAnchorIndex}
      layerBindings={keyColumns?.[i]}
      {comboMode}
      comboMember={comboMode && (comboPositions?.has(i) ?? false)}
      comboPeekLayer={
        !comboMode && comboPeek?.positions.has(i) ? comboPeek.faceLayer : null
      }
      {onUpdate}
      {onComboToggle}
    />
    {/if}
  {/each}
</div>
