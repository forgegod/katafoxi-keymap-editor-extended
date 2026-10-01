<script lang="ts">
  import {
    collectUsedKeycodes,
    layerLegendSymbol,
    usedKeycodesRevision,
    type HostLegendView,
    type LayerView,
    type LegendHover,
    type KeyBindingNode,
    type LayoutKey,
    type ParsedKeymap
  } from '@keymap-editor/keymap-core'
  import { blankTopRowIndexes } from '../../blank-top-row'
  import {
    getDefinitionsContext,
    setSearchContext,
    type SearchContextValue
  } from '../../context'
  import { buildSearchContext } from '../../search-context'
  import { getKeyBoundingBox } from '../../key-units'
  import KeyboardLayout from './KeyboardLayout.svelte'

  interface Props {
    layout: LayoutKey[]
    keymap: ParsedKeymap
    onUpdate: (keymap: ParsedKeymap) => void
    hostView?: HostLegendView
    layerView?: LayerView
    legendHover?: LegendHover | null
    /** When the top row is blank, false hides it. The legend column owns the toggle. */
    revealEmptyRow?: boolean
  }

  let {
    layout,
    keymap,
    onUpdate,
    hostView,
    layerView,
    legendHover = null,
    revealEmptyRow = false
  }: Props = $props()

  const definitionsBox = getDefinitionsContext()
  const definitions = $derived(definitionsBox.current)

  const layerNames = $derived(
    keymap.layer_names ?? keymap.layers.map((_, i) => `Layer ${i}`)
  )
  const usedKeycodes = $derived(collectUsedKeycodes(keymap.layers ?? []))
  const usedRevision = $derived(usedKeycodesRevision(usedKeycodes))

  const availableLayers = $derived(
    !keymap?.layers
      ? []
      : keymap.layers.map((_, i) => ({
          code: i,
          symbol: layerLegendSymbol(i),
          description: layerNames[i] || `Layer ${i}`
        }))
  )
  const usedLayerLabels = $derived(availableLayers.map(layer => layer.symbol))

  const search = $derived.by((): SearchContextValue =>
    buildSearchContext(definitions, availableLayers)
  )

  setSearchContext({
    get current() {
      return search
    }
  })

  const isReady = $derived(
    (definitions?.keycodes.list.length ?? 0) > 0 &&
      (definitions?.behaviours.list.length ?? 0) > 0 &&
      (keymap?.layers?.length ?? 0) > 0
  )

  const blankTopRow = $derived(blankTopRowIndexes(layout, keymap.layers ?? []))
  const hiddenKeys = $derived(
    !revealEmptyRow && blankTopRow.length > 0 ? new Set(blankTopRow) : new Set<number>()
  )

  const bounds = $derived.by(() => {
    let minX = Infinity
    let minY = Infinity
    let maxX = 0
    let maxY = 0
    let counted = 0
    for (let index = 0; index < layout.length; index++) {
      if (hiddenKeys.has(index)) continue
      const key = layout[index]
      const box = getKeyBoundingBox(
        { x: key.x, y: key.y },
        { u: key.u || key.w || 1, h: key.h || 1 },
        { x: key.rx, y: key.ry, a: key.r }
      )
      minX = Math.min(minX, box.min.x)
      minY = Math.min(minY, box.min.y)
      maxX = Math.max(maxX, box.max.x)
      maxY = Math.max(maxY, box.max.y)
      counted++
    }
    if (counted === 0 || !Number.isFinite(minX) || !Number.isFinite(minY)) {
      return { minX: 0, minY: 0, width: 0, height: 0 }
    }
    return {
      minX,
      minY,
      width: Math.max(0, maxX - minX),
      height: Math.max(0, maxY - minY)
    }
  })

  let stageEl: HTMLDivElement | undefined = $state()
  let stageW = $state(0)
  let stageH = $state(0)

  $effect(() => {
    const el = stageEl
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(entries => {
      const box = entries[0]?.contentRect
      if (!box) return
      stageW = box.width
      stageH = box.height
    })
    observer.observe(el)
    return () => observer.disconnect()
  })

  const scale = $derived.by(() => {
    if (bounds.width <= 0 || bounds.height <= 0) return 1
    if (stageW < 8 || stageH < 8) return 1
    return Math.min(stageW / bounds.width, stageH / bounds.height)
  })

  const fitStyle = $derived(
    `width:${bounds.width * scale}px;height:${bounds.height * scale}px`
  )
  const canvasStyle = $derived(
    `width:${bounds.width}px;height:${bounds.height}px;transform-origin:0 0;transform:scale(${scale}) translate(${-bounds.minX}px,${-bounds.minY}px)`
  )

  function handleUpdateLayer(
    layerIndex: number,
    updatedLayer: KeyBindingNode[]
  ) {
    const layers = [
      ...keymap.layers.slice(0, layerIndex),
      updatedLayer,
      ...keymap.layers.slice(layerIndex + 1)
    ]
    onUpdate({ ...keymap, layers })
  }

  function handleUpdateBinding(
    keyIndex: number,
    layerIndex: number,
    binding: KeyBindingNode
  ) {
    const layer = keymap.layers[layerIndex]
    if (!layer) return
    if (keyIndex < 0 || keyIndex >= layer.length) return
    handleUpdateLayer(layerIndex, [
      ...layer.slice(0, keyIndex),
      binding,
      ...layer.slice(keyIndex + 1)
    ])
  }

</script>

<div class="keyboard-root">
  <div class="keyboard-stage" bind:this={stageEl}>
    <div class="keyboard-fit" style={fitStyle}>
      <div class="keyboard-canvas" style={canvasStyle}>
        {#if isReady}
          <KeyboardLayout
            {layout}
            hidden={hiddenKeys}
            bindings={keymap.layers[0]}
            layerStack={keymap.layers}
            layerIndex={0}
            {hostView}
            {layerView}
            {legendHover}
            {usedKeycodes}
            {usedRevision}
            {usedLayerLabels}
            onUpdate={handleUpdateBinding}
          />
        {/if}
      </div>
    </div>
  </div>
</div>

<style>
  .keyboard-root {
    display: contents;
  }

  .keyboard-stage {
    display: flex;
    flex-direction: column;
    align-items: center;
    /* Sit under the legend tools; leftover height stays below the board. */
    justify-content: flex-start;
    box-sizing: border-box;
    min-width: 0;
    min-height: 0;
    /* Tight inset: no corner badge over the board, so no bottom clearance. */
    padding: 4px 8px 8px;
    overflow: hidden;
    background: transparent;
  }

  .keyboard-fit {
    position: relative;
    flex: none;
    /* The canvas is translated up to the first key; clip so that shift stays inside the stage. */
    overflow: hidden;
  }

  .keyboard-canvas {
    position: absolute;
    top: 0;
    left: 0;
  }
</style>
