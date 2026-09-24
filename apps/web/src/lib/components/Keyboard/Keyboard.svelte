<script lang="ts">
  import {
    collectUsedKeycodes,
    layerLegendSymbol,
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

  const searchBox = $state<{ current: SearchContextValue | null }>({
    current: null
  })
  setSearchContext(searchBox)

  const layerNames = $derived(
    keymap.layer_names ?? keymap.layers.map((_, i) => `Layer ${i}`)
  )
  const usedKeycodes = $derived(collectUsedKeycodes(keymap.layers ?? []))

  const availableLayers = $derived(
    !keymap?.layers
      ? []
      : keymap.layers.map((_, i) => ({
          code: i,
          symbol: layerLegendSymbol(i),
          description: layerNames[i] || `Layer ${i}`
        }))
  )

  const sources = $derived({
    kc: (definitions?.keycodes.byCode ?? {}) as Record<string, unknown>,
    code: (definitions?.keycodes.byCode ?? {}) as Record<string, unknown>,
    mod: Object.fromEntries(
      (definitions?.keycodes.list ?? [])
        .filter(k => k.isModifier)
        .map(k => [k.code, k])
    ) as Record<string, unknown>,
    behaviours: (definitions?.behaviours.byCode ?? {}) as Record<
      string,
      unknown
    >,
    layer: Object.fromEntries(availableLayers.map(l => [l.code, l])) as Record<
      string,
      unknown
    >
  })

  const searchTargets = $derived({
    behaviour: definitions?.behaviours.list ?? [],
    layer: availableLayers,
    mod: (definitions?.keycodes.list ?? []).filter(k => k.isModifier),
    code: definitions?.keycodes.list ?? []
  })

  $effect(() => {
    const targets = searchTargets
    const src = sources
    searchBox.current = {
      sources: src,
      getSearchTargets: (param: unknown, behaviour: string | number) => {
        if (param && typeof param === 'object' && 'enum' in (param as object)) {
          return ((param as { enum: string[] }).enum || []).map(v => ({
            code: v
          }))
        }
        if (param === 'command') {
          const beh = src.behaviours?.[String(behaviour)] as
            | { commands?: unknown[] }
            | undefined
          return beh?.commands ?? []
        }
        if (typeof param === 'string' && !(param in targets)) {
          console.log('cannot find target for', param)
        }
        return (targets as Record<string, unknown[]>)[param as string] ?? []
      }
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
      onUpdate={event => handleUpdateLayer(activeLayer, event)}
    />
  {/if}
</div>
