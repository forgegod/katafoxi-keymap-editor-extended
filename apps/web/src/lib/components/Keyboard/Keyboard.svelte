<script lang="ts">
  import { getDefinitionsContext, type LegendMode } from '../../context'
  import { definitionsStore, searchStore } from '../../stores'
  import { getKeyBoundingBox } from '../../key-units'
  import LayerSelector from './LayerSelector.svelte'
  import KeyboardLayout from './KeyboardLayout.svelte'

  interface LayoutKey {
    x: number
    y: number
    w?: number
    u?: number
    h?: number
    rx?: number
    ry?: number
    r?: number
    label?: string
  }

  export interface Keymap {
    layer_names?: string[]
    layers: Array<Array<{ value: string | number; params?: unknown[] }>>
  }

  interface Props {
    layout: LayoutKey[]
    keymap: Keymap
    onUpdate: (keymap: Keymap) => void
    legendMode?: LegendMode
  }

  let { layout, keymap, onUpdate, legendMode = 'zmk' }: Props = $props()

  let activeLayer = $state(0)
  let definitions = $state(getDefinitionsContext())

  $effect(() => {
    return definitionsStore.subscribe(v => {
      if (v) definitions = v
    })
  })

  const layerNames = $derived(
    keymap.layer_names ?? keymap.layers.map((_, i) => `Layer ${i}`)
  )

  const availableLayers = $derived(
    !keymap?.layers
      ? []
      : keymap.layers.map((_, i) => ({
          code: i,
          description: layerNames[i] || `Layer ${i}`
        }))
  )

  const sources = $derived({
    kc: (definitions?.keycodes.indexed ?? {}) as Record<string, unknown>,
    code: (definitions?.keycodes.indexed ?? {}) as Record<string, unknown>,
    mod: Object.fromEntries(
      (definitions?.keycodes ?? [])
        .filter(k => k.isModifier)
        .map(k => [k.code, k])
    ) as Record<string, unknown>,
    behaviours: (definitions?.behaviours.indexed ?? {}) as Record<
      string,
      unknown
    >,
    layer: Object.fromEntries(availableLayers.map(l => [l.code, l])) as Record<
      string,
      unknown
    >
  })

  const searchTargets = $derived({
    behaviour: definitions?.behaviours ?? [],
    layer: availableLayers,
    mod: (definitions?.keycodes ?? []).filter(k => k.isModifier),
    code: definitions?.keycodes ?? []
  })

  $effect(() => {
    const targets = searchTargets
    const src = sources
    searchStore.set({
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
    })
  })

  const isReady = $derived(
    Object.keys(definitions?.keycodes.indexed ?? {}).length > 0 &&
      Object.keys(definitions?.behaviours.indexed ?? {}).length > 0 &&
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
    const makeKeycode = () => ({ value: '&trans', params: [] as unknown[] })
    const newLayer = Array.from({ length: layout.length }, makeKeycode)
    onUpdate({
      ...keymap,
      layer_names: [...layerNames, `Layer #${layer}`],
      layers: [...keymap.layers, newLayer]
    })
  }

  function handleUpdateLayer(
    layerIndex: number,
    updatedLayer: Array<{ value: string | number; params?: unknown[] }>
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
      bindings={keymap.layers[activeLayer] as Array<{
        value: string | number
        params?: Array<{ value?: string | number; params?: unknown[] }>
      }>}
      {legendMode}
      onUpdate={event => handleUpdateLayer(activeLayer, event)}
    />
  {/if}
</div>
