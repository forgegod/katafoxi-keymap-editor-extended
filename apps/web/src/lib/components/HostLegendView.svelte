<script lang="ts">
  import { blankTopRowIndexes } from '../blank-top-row'
  import { editor } from '../editor.svelte.js'
  import stackLanguagesIcon from '../assets/stack-languages.png'
  import symbolDifferencesIcon from '../assets/symbol-differences.png'
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
  <button
    type="button"
    class="view-toggle"
    class:on={canStack && stacked}
    class:pale={!canStack}
    aria-pressed={canStack && stacked}
    aria-label="Stack languages"
    title={stackTitle}
    disabled={!canStack}
    onclick={() => (editor.multilangView = !editor.multilangView)}
  >
    <img src={stackLanguagesIcon} alt="" width="14" height="14" />
    <span class="view-label">Stack</span>
  </button>

  <div class="align-block">
    <button
      type="button"
      class="view-toggle"
      class:on={marksOn}
      aria-pressed={marksOn}
      aria-label="Highlight symbol differences"
      title={alignTitle}
      disabled={!canAlign}
      onclick={() => (editor.symbolAlignOn = !editor.symbolAlignOn)}
    >
      <img src={symbolDifferencesIcon} alt="" width="14" height="14" />
      <span class="view-label">Differences</span>
    </button>
    <div class="align-slot" class:on={marksOn}>
      <SymbolAlignKey />
    </div>
  </div>

  <div class="board-row" role="group" aria-label="Keyboard layout view">
    <button
      type="button"
      class="view-toggle half"
      class:on={editor.layerTonesOn}
      aria-pressed={editor.layerTonesOn}
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
    </button>
    <div class="empty-slot">
      {#if topRowEmpty}
        <button
          type="button"
          class="empty-row"
          aria-expanded={editor.revealEmptyRow}
          aria-label={emptyRowLabel}
          title={emptyRowLabel}
          onclick={() => (editor.revealEmptyRow = !editor.revealEmptyRow)}
        >
          {editor.revealEmptyRow ? 'Hide' : 'Empty'}
        </button>
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
    width: 7.5rem;
    margin: 0;
    padding: 4px 5px 4px 4px;
    border-right: 1px solid color-mix(in srgb, #000 10%, transparent);
    background: color-mix(in srgb, #fff 35%, transparent);
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

  .view-toggle {
    box-sizing: border-box;
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    justify-content: flex-start;
    gap: 4px;
    width: 100%;
    height: 22px;
    margin: 0;
    padding: 0 6px;
    white-space: nowrap;
    border: 1px solid #c4c4c4;
    border-radius: 5px;
    background: #f3f3f3;
    color: #444;
    font: inherit;
    cursor: pointer;
  }

  .view-toggle.half {
    padding: 0 4px;
    gap: 3px;
  }

  .view-toggle:hover:not(:disabled):not(.on) {
    background: #fff;
    border-color: #1d6f8a;
  }

  .view-toggle.on {
    background: #fff;
    border: 2px solid #1d6f8a;
    color: #1d6f8a;
    padding: 0 5px;
  }

  .view-toggle.half.on {
    padding: 0 3px;
  }

  .view-toggle.pale,
  .view-toggle:disabled {
    background: #f3f3f3;
    border-color: #e4e4e4;
    color: #888;
    opacity: 0.45;
    cursor: default;
  }

  .view-toggle img {
    display: block;
    width: 14px;
    height: 14px;
    flex: none;
  }

  .view-toggle .layer-tones-icon {
    display: block;
    flex: none;
    fill: currentColor;
  }

  .view-label {
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
  }

  .empty-row {
    box-sizing: border-box;
    width: 100%;
    height: 22px;
    margin: 0;
    padding: 0 4px;
    white-space: nowrap;
    border: 1px dashed #c4c4c4;
    border-radius: 5px;
    background: transparent;
    color: #777;
    font: inherit;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.15;
    text-align: center;
    cursor: pointer;
  }

  .empty-row:hover {
    border-color: #1d6f8a;
    color: #333;
    background: #fff;
  }
</style>
