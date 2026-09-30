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
    <img src={stackLanguagesIcon} alt="" width="18" height="18" />
    <span class="view-label">Stack<br />languages</span>
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
    <img src={symbolDifferencesIcon} alt="" width="18" height="18" />
    <span class="view-label">Symbol<br />differences</span>
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
      {#if editor.revealEmptyRow}
        Hide<br />empty row
      {:else}
        Show<br />empty row
      {/if}
    </button>
  {/if}
</div>

<style>
  .legend-view {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding-top: 6px;
  }

  .view-toggle {
    box-sizing: border-box;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 3px;
    width: 4.7rem;
    margin: 0;
    padding: 4px 2px 5px;
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
    width: 18px;
    height: 18px;
  }

  .view-label {
    font-size: 10px;
    font-weight: 600;
    line-height: 1.15;
    text-align: center;
  }

  .empty-row {
    box-sizing: border-box;
    width: 4.7rem;
    margin: 0;
    padding: 2px 3px 3px;
    border: 1px dashed #c4c4c4;
    border-radius: 6px;
    background: transparent;
    color: #777;
    font: inherit;
    font-size: 10px;
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
