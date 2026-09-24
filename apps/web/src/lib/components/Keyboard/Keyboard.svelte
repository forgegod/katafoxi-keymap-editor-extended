<script lang="ts">
  import {
    collectUsedKeycodes,
    layerLegendSymbol,
    usedKeycodesRevision,
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
  }

  let { layout, keymap, onUpdate, legendMode = 'zmk' }: Props = $props()

  let activeLayer = $state(0)
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

  function handleRenameLayer(layerName: string) {
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
    if (activeLayer > layers.length - 1) {
      activeLayer = Math.max(0, layers.length - 1)
    }
    onUpdate({ ...keymap, layers, layer_names: names })
  }
</script>

<LayerSelector
  layers={layerNames}
  {activeLayer}
  onSelect={i => (activeLayer = i)}
  onNewLayer={handleCreateLayer}
  onRenameLayer={handleRenameLayer}
  onDeleteLayer={handleDeleteLayer}
/>

<div style={wrapperStyle}>
  {#if isReady}
    <KeyboardLayout
      {layout}
      bindings={keymap.layers[activeLayer]}
      {legendMode}
      {usedKeycodes}
      {usedRevision}
      {usedLayerLabels}
      onUpdate={event => handleUpdateLayer(activeLayer, event)}
    />
  {/if}
</div>
