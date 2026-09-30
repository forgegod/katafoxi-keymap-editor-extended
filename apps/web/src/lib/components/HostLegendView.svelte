<script lang="ts">
  import { blankTopRowIndexes } from '../blank-top-row'
  import { editor } from '../editor.svelte.js'
  import stackLanguagesIcon from '../assets/stack-languages.png'
  import symbolDifferencesIcon from '../assets/symbol-differences.png'

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
    <img src={stackLanguagesIcon} alt="" width="16" height="16" />
    <span class="view-label">Stack languages</span>
  </button>

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
    <img src={symbolDifferencesIcon} alt="" width="16" height="16" />
    <span class="view-label">Symbol differences</span>
  </button>

  {#if topRowEmpty}
    <button
      type="button"
      class="empty-row"
      aria-expanded={editor.revealEmptyRow}
      aria-label={emptyRowLabel}
      title={emptyRowLabel}
      onclick={() => (editor.revealEmptyRow = !editor.revealEmptyRow)}
    >
      {emptyRowLabel}
    </button>
  {/if}
</div>

<style>
  .legend-view {
    display: flex;
    flex: none;
    flex-direction: row;
    align-items: center;
    gap: 6px;
    margin-right: 8px;
  }

  .view-toggle {
    box-sizing: border-box;
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 4px;
    height: 26px;
    margin: 0;
    padding: 0 8px;
    white-space: nowrap;
    border: 1px solid #c4c4c4;
    border-radius: 6px;
    background: #f3f3f3;
    color: #444;
    font: inherit;
    cursor: pointer;
  }

  .view-toggle:hover:not(:disabled):not(.on) {
    background: #fff;
    border-color: #1d6f8a;
  }

  .view-toggle.on {
    background: #fff;
    border: 2px solid #1d6f8a;
    color: #1d6f8a;
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
    width: 16px;
    height: 16px;
  }

  .view-label {
    font-size: 12px;
    font-weight: 600;
    line-height: 1;
    white-space: nowrap;
  }

  .empty-row {
    box-sizing: border-box;
    height: 26px;
    margin: 0;
    padding: 0 8px;
    white-space: nowrap;
    border: 1px dashed #c4c4c4;
    border-radius: 6px;
    background: transparent;
    color: #777;
    font: inherit;
    font-size: 12px;
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
