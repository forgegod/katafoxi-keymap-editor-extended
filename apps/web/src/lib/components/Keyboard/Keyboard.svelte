<script lang="ts">
  import {
    collectUsedKeycodes,
    layerLegendSymbol,
    usedKeycodesRevision,
    type HostLegendView,
    type LegendHover,
    type KeyBindingNode,
    type LayoutKey,
    type ParsedKeymap
  } from '@keymap-editor/keymap-core'
  import {
    getDefinitionsContext,
    setSearchContext,
    type LegendMode,
    type SearchContextValue
  } from '../../context'
  import { buildSearchContext } from '../../search-context'
  import { getKeyBoundingBox } from '../../key-units'
  import LayerSelector from './LayerSelector.svelte'
  import KeyboardLayout from './KeyboardLayout.svelte'

  interface Props {
    layout: LayoutKey[]
    keymap: ParsedKeymap
    onUpdate: (keymap: ParsedKeymap) => void
    legendMode?: LegendMode
    hostView?: HostLegendView
    legendHover?: LegendHover | null
  }

  let { layout, keymap, onUpdate, legendMode = 'zmk', hostView, legendHover = null }: Props =
    $props()

  let activeLayer = $state<number | 'all'>(0)
  let lastNumericLayer = $state(0)
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

  const boundingBox = $derived(
    layout
      .map(key =>
        getKeyBoundingBox(
          { x: key.x, y: key.y },
          { u: key.u || key.w || 1, h: key.h || 1 },
          { x: key.rx, y: key.ry, a: key.r }
        )
      )
      .reduce(
        (acc, { max }) => ({
          x: Math.max(acc.x, max.x),
          y: Math.max(acc.y, max.y)
        }),
        { x: 0, y: 0 }
      )
  )

  const wrapperStyle = $derived(
    `width: ${boundingBox.x}px; height: ${boundingBox.y}px; margin: 0 auto; padding: 40px;`
  )

  function handleCreateLayer() {
    const layer = keymap.layers.length
    const makeKeycode = (): KeyBindingNode => ({ value: '&trans', params: [] })
    const newLayer = Array.from({ length: layout.length }, makeKeycode)
    onUpdate({
      ...keymap,
      layer_names: [...layerNames, `Layer #${layer}`],
      layers: [...keymap.layers, newLayer]
    })
  }

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

  $effect(() => {
    if (legendMode === 'composed') {
      activeLayer = 'all'
    } else {
      activeLayer = lastNumericLayer
    }
  })

  function selectLayer(layer: number | 'all') {
    if (layer !== 'all') lastNumericLayer = layer
    activeLayer = layer
  }

  function handleRenameLayer(layerName: string) {
    if (activeLayer === 'all') return
    const names = [
      ...layerNames.slice(0, activeLayer),
      layerName,
      ...layerNames.slice(activeLayer + 1)
    ]
    onUpdate({ ...keymap, layer_names: names })
  }

  function handleDeleteLayer(layerIndex: number) {
    const names = [...layerNames]
    names.splice(layerIndex, 1)
    const layers = [...keymap.layers]
    layers.splice(layerIndex, 1)
    const last = Math.max(0, layers.length - 1)
    if (lastNumericLayer > last) lastNumericLayer = last
    if (activeLayer !== 'all' && activeLayer > last) {
      activeLayer = last
      lastNumericLayer = last
    }
    onUpdate({ ...keymap, layers, layer_names: names })
  }
</script>

<LayerSelector
  layers={layerNames}
  {activeLayer}
  showAllLayers={legendMode === 'composed'}
  onSelect={selectLayer}
  onNewLayer={handleCreateLayer}
  onRenameLayer={handleRenameLayer}
  onDeleteLayer={handleDeleteLayer}
/>

<div style={wrapperStyle}>
  {#if isReady}
    <KeyboardLayout
      {layout}
      bindings={
        activeLayer === 'all'
          ? keymap.layers[0]
          : keymap.layers[activeLayer]
      }
      layerStack={activeLayer === 'all' ? keymap.layers : undefined}
      {legendMode}
      {hostView}
      {legendHover}
      {usedKeycodes}
      {usedRevision}
      {usedLayerLabels}
      onUpdate={event =>
        handleUpdateLayer(activeLayer === 'all' ? 0 : activeLayer, event)
      }
    />
  {/if}
</div>
