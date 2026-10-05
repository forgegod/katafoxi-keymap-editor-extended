<script lang="ts">
  import {
    absentLayoutIndexes,
    collectUsedKeycodes,
    encodeKeyBinding,
    mergeHoldTapCatalog,
    effectiveShownLayers,
    isBlankLayerBinding,
    layerLegendSymbol,
    usedKeycodesRevision,
    type HostLegendView,
    type LayerView,
    type LegendHover,
    type KeyBindingNode,
    type LayoutKey,
    type ParsedKeymap,
    type ZmkCombo
  } from '@keymap-editor/keymap-core'
  import {
    getDefinitionsContext,
    setSearchContext,
    type SearchContextValue
  } from '../../context'
  import { editor } from '../../editor.svelte.js'
  import { buildSearchContext } from '../../search-context'
  import { getKeyBoundingBox } from '../../key-units'
  import KeyboardLayout from './KeyboardLayout.svelte'
  import MatrixSchemeOverlay from './MatrixSchemeOverlay.svelte'
  import ComboArcsOverlay from './ComboArcsOverlay.svelte'
  import ComboPanel from '../ComboPanel.svelte'
  import EncoderBar from './EncoderBar.svelte'

  interface Props {
    layout: LayoutKey[]
    keymap: ParsedKeymap
    onUpdate: (keymap: ParsedKeymap) => void
    hostView?: HostLegendView
    layerView?: LayerView
    legendHover?: LegendHover | null
    /**
     * Firmware-scheme view: show every matrix slot (including absent) and
     * draw layout row/col rails. The legend column owns the toggle.
     */
    schemeMode?: boolean
  }

  let {
    layout,
    keymap,
    onUpdate,
    hostView,
    layerView,
    legendHover = null,
    schemeMode = false
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

  const holdTaps = $derived(keymap.holdTaps ?? editor.baselineKeymap?.holdTaps)
  const behaviours = $derived(
    definitions ? mergeHoldTapCatalog(definitions.behaviours, holdTaps) : null
  )
  const search = $derived.by((): SearchContextValue =>
    buildSearchContext(
      definitions && behaviours ? { ...definitions, behaviours } : definitions,
      availableLayers
    )
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

  const comboMode = $derived(editor.comboMode)
  const activeComboPositions = $derived.by(() => {
    if (!comboMode || editor.activeComboId == null) return null
    const combo = (keymap.combos ?? []).find(c => c.id === editor.activeComboId)
    return combo ? new Set(combo.keyPositions) : null
  })
  const shownLayersForCombos = $derived(
    layerView
      ? effectiveShownLayers(layerView, keymap.layers?.length ?? 0)
      : [0]
  )
  const boardCombos = $derived(keymap.combos ?? [])
  const hasEncoders = $derived(
    (keymap.sensorBindings ?? []).some(row => row.length > 0)
  )
  let comboHoverPeek = $state<{
    positions: ReadonlySet<number>
    faceLayer: number
  } | null>(null)

  function comboBindingLabel(combo: ZmkCombo): string {
    try {
      return encodeKeyBinding(combo.binding)
    } catch {
      return String(combo.binding.value)
    }
  }

  function openComboFromBoard(comboId: string) {
    editor.activeComboId = comboId
    if (!editor.comboMode) {
      editor.schemeMode = false
      editor.comboMode = true
    }
    editor.refreshComboNotice()
  }

  const hiddenKeys = $derived.by(() => {
    if (schemeMode) return new Set<number>()
    return new Set(absentLayoutIndexes(layout))
  })

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

  function measureStage() {
    const el = stageEl
    if (!el) return
    const box = el.getBoundingClientRect()
    stageW = box.width
    stageH = box.height
  }

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
    measureStage()
    return () => observer.disconnect()
  })

  // Panel mount/unmount changes stage width; remeasure after layout.
  $effect(() => {
    void comboMode
    if (!stageEl) return
    requestAnimationFrame(measureStage)
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
    if (schemeMode && !isBlankLayerBinding(binding)) {
      editor.promoteAbsentKey(keyIndex, binding)
    }
    handleUpdateLayer(layerIndex, [
      ...layer.slice(0, keyIndex),
      binding,
      ...layer.slice(keyIndex + 1)
    ])
  }

</script>

<div class="keyboard-root">
  {#if comboMode}
    <ComboPanel />
  {/if}
  <div class="keyboard-column">
    {#if hasEncoders}
      <EncoderBar />
    {/if}
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
            {comboMode}
            comboPositions={activeComboPositions}
            comboPeek={comboHoverPeek}
            onUpdate={handleUpdateBinding}
            onComboToggle={index => editor.toggleComboPosition(index)}
          />
          {#if !comboMode && boardCombos.length > 0}
            <ComboArcsOverlay
              {layout}
              combos={boardCombos}
              shownLayers={shownLayersForCombos}
              hidden={hiddenKeys}
              width={bounds.width}
              height={bounds.height}
              minX={bounds.minX}
              minY={bounds.minY}
              labelFor={comboBindingLabel}
              onSelect={openComboFromBoard}
              onHover={hover => {
                comboHoverPeek = hover
                  ? { positions: new Set(hover.positions), faceLayer: hover.faceLayer }
                  : null
              }}
            />
          {/if}
          {#if schemeMode}
            <MatrixSchemeOverlay
              {layout}
              width={bounds.width}
              height={bounds.height}
              minX={bounds.minX}
              minY={bounds.minY}
            />
          {/if}
        {/if}
      </div>
    </div>
    </div>
  </div>
</div>

<style>
  /* Fill board-stack. Combo panel sits beside the stage and shrinks it. */
  .keyboard-root {
    display: flex;
    flex-direction: row;
    align-items: stretch;
    gap: 10px;
    width: 100%;
    height: 100%;
    min-width: 0;
    min-height: 0;
    box-sizing: border-box;
  }

  .keyboard-column {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    align-items: stretch;
    min-width: 0;
    min-height: 0;
  }

  .keyboard-stage {
    display: flex;
    flex: 1 1 auto;
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
