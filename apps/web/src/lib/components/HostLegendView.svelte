<script lang="ts">
  import { editor } from '../editor.svelte.js'
  import stackLanguagesIcon from '../assets/stack-languages.png'
  import symbolDifferencesIcon from '../assets/symbol-differences.png'
  import PressToggle from './Common/PressToggle.svelte'
  import SymbolAlignKey from './SymbolAlignKey.svelte'

  const canStack = $derived(editor.hostLegend.columns.length >= 3)
  const stacked = $derived(editor.multilangViewOn)
  const canAlign = $derived(editor.canAlignHostSymbols)
  const marksOn = $derived(canAlign && editor.symbolAlignOn)

  const stackTitle = $derived(
    canStack
      ? 'Show every host language as its own row on the key and hide other firmware layers.'
      : 'Needs 3 host languages. Two languages already share the key.'
  )
  const alignTitle = $derived(
    canAlign
      ? 'Highlight symbol differences'
      : 'Highlight symbol differences. Open a second host language first.'
  )
  const schemeTitle = $derived(
    editor.schemeMode ? 'Hide matrix scheme' : 'Show matrix scheme'
  )
</script>

<div class="legend-view" aria-label="Legend view">
  <PressToggle
    class="view-toggle"
    pressed={canStack && stacked}
    pale={!canStack}
    aria-label="Stack languages"
    title={stackTitle}
    disabled={!canStack}
    onclick={() => (editor.multilangView = !editor.multilangView)}
  >
    <img src={stackLanguagesIcon} alt="" width="14" height="14" />
    <span class="view-label">Stack</span>
  </PressToggle>

  <div class="align-block">
    <PressToggle
      class="view-toggle"
      pressed={marksOn}
      aria-label="Highlight symbol differences"
      title={alignTitle}
      disabled={!canAlign}
      onclick={() => (editor.symbolAlignOn = !editor.symbolAlignOn)}
    >
      <img src={symbolDifferencesIcon} alt="" width="14" height="14" />
      <span class="view-label">Differences</span>
    </PressToggle>
    <div class="align-slot" class:on={marksOn}>
      <SymbolAlignKey />
    </div>
  </div>

  <div class="board-row" role="group" aria-label="Keyboard layout view">
    <PressToggle
      class="view-toggle half"
      pressed={editor.layerTonesOn}
      aria-label="Layer colors"
      title="Tint each firmware layer on the key with a soft wash."
      onclick={() => (editor.layerTonesOn = !editor.layerTonesOn)}
    >
      <svg class="layer-tones-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
        <rect x="0" y="1" width="16" height="3" rx="0.5" opacity="0.4" />
        <rect x="0" y="5" width="16" height="3" rx="0.5" opacity="0.58" />
        <rect x="0" y="9" width="16" height="3" rx="0.5" opacity="0.76" />
        <rect x="0" y="13" width="16" height="3" rx="0.5" opacity="0.94" />
      </svg>
      <span class="view-label">Colors</span>
    </PressToggle>
    <div class="scheme-slot">
      <PressToggle
        class="view-toggle half"
        pressed={editor.schemeMode}
        aria-label={schemeTitle}
        title={schemeTitle}
        onclick={() => (editor.schemeMode = !editor.schemeMode)}
      >
        <svg class="scheme-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path
            d="M2 3.5h12M2 8h12M2 12.5h12M4 2v12M8 2v12M12 2v12"
            fill="none"
            stroke="currentColor"
            stroke-width="1.25"
            stroke-linecap="round"
          />
        </svg>
        <span class="view-label">Scheme</span>
      </PressToggle>
    </div>
  </div>
</div>

<style>
  .legend-view {
    display: flex;
    flex: none;
    flex-direction: column;
    align-items: stretch;
    gap: 3px;
    box-sizing: border-box;
    width: 8rem;
    margin: 0;
    padding: 4px 5px 4px 4px;
    border-right: 1px solid color-mix(in srgb, var(--shade) 10%, transparent);
    background: color-mix(in srgb, var(--surface) 35%, transparent);
    border-radius: 5px 0 0 5px;
  }

  .align-block {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  /* Reserve a shallow strip so toggling marks does not shove the board row. */
  .align-slot {
    box-sizing: border-box;
    min-height: 12px;
    display: flex;
    align-items: center;
    opacity: 0;
    pointer-events: none;
  }

  .align-slot.on {
    opacity: 1;
    pointer-events: auto;
  }

  .board-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 3px;
    align-items: stretch;
  }

  .scheme-slot {
    min-width: 0;
    min-height: 22px;
  }

  .legend-view :global(.view-toggle.half) {
    min-width: 0;
    padding: 0 3px;
    gap: 2px;
    overflow: hidden;
  }

  .legend-view :global(.view-toggle.half .view-label) {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .legend-view :global(.view-toggle.half img),
  .legend-view :global(.view-toggle.half svg) {
    width: 12px;
    height: 12px;
  }

  .legend-view :global(.layer-tones-icon) {
    fill: currentColor;
  }

  .legend-view :global(.scheme-icon path) {
    fill: none;
    stroke: currentColor;
  }

  .view-label {
    font-size: var(--font-xs);
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
  }
</style>
