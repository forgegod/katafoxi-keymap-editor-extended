<script lang="ts">
  import { layerLegendSymbol } from '@keymap-editor/keymap-core'
  import './Combo.css'

  interface Props {
    layerCount: number
    layerNames: readonly string[]
    layersAreGlobal: boolean
    selectedLayers: ReadonlySet<number>
    onAllLayers: () => void
    onToggleLayer: (index: number) => void
  }

  let {
    layerCount,
    layerNames,
    layersAreGlobal,
    selectedLayers,
    onAllLayers,
    onToggleLayer
  }: Props = $props()
</script>

<div class="combo-layers" role="group" aria-label="Active layers">
  <div class="timeout-label-row">
    <span class="timeout-label">Layers</span>
    <button
      type="button"
      class="combo-btn quiet"
      class:on={layersAreGlobal}
      onclick={onAllLayers}
      title="Combo works on every layer"
    >
      All
    </button>
  </div>
  <div class="layer-chips">
    {#each Array.from({ length: layerCount }, (_, i) => i) as index (index)}
      <button
        type="button"
        class="combo-btn quiet layer-chip"
        class:on={!layersAreGlobal && selectedLayers.has(index)}
        title={layerNames[index] ?? `Layer ${index}`}
        aria-pressed={!layersAreGlobal && selectedLayers.has(index)}
        onclick={() => onToggleLayer(index)}
      >
        {layerLegendSymbol(index)}
      </button>
    {/each}
  </div>
</div>

<style>
  .combo-layers {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .layer-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }

  .layer-chip {
    min-width: 1.6rem;
  }
</style>
