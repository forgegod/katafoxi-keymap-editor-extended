<script lang="ts">
  import { blankTopRowIndexes } from '../blank-top-row'
  import { editor } from '../editor.svelte.js'
  import stackLanguagesIcon from '../assets/stack-languages.png'
  import symbolDifferencesIcon from '../assets/symbol-differences.png'
  import PressToggle from './Common/PressToggle.svelte'
  import SymbolAlignKey from './SymbolAlignKey.svelte'

  const canStack = $derived(editor.hostLegend.columns.length >= 3)
  const stacked = $derived(editor.multilangViewOn)
  const canAlign = $derived(editor.canAlignHostSymbols)
  const marksOn = $derived(canAlign && editor.symbolAlignOn)
  const topRowEmpty = $derived(
    blankTopRowIndexes(editor.layout ?? [], editor.draftKeymap?.layers ?? []).length > 0
  )
  const emptyRowLabel = $derived(
    editor.revealEmptyRow ? 'Hide empty row' : 'Show empty row'
  )

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
    <div class="empty-slot">
      {#if topRowEmpty}
        <PressToggle
          class="view-toggle half"
          pressed={editor.revealEmptyRow}
          aria-label={emptyRowLabel}
          title={emptyRowLabel}
          onclick={() => (editor.revealEmptyRow = !editor.revealEmptyRow)}
        >
          <svg class="empty-row-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <rect
              x="1.25"
              y="1.5"
              width="13.5"
              height="5"
              rx="1"
              fill="none"
              stroke="currentColor"
              stroke-width="1.25"
            />
            <rect x="1.25" y="8.5" width="6" height="5.5" rx="1" opacity="0.78" />
            <rect x="8.75" y="8.5" width="6" height="5.5" rx="1" opacity="0.78" />
          </svg>
          <span class="view-label">Empty</span>
        </PressToggle>
      {/if}
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

  .empty-slot {
    min-width: 0;
    min-height: 22px;
  }

  .legend-view :global(.view-toggle.half) {
    padding: 0 4px;
    gap: 3px;
  }

  .legend-view :global(.layer-tones-icon),
  .legend-view :global(.empty-row-icon) {
    fill: currentColor;
  }

  .legend-view :global(.empty-row-icon rect[fill='none']) {
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
