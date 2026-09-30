<script lang="ts">
  import { editor } from '../editor.svelte.js'
  import stackLanguagesIcon from '../assets/stack-languages.png'
  import symbolDifferencesIcon from '../assets/symbol-differences.png'

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
  </button>

  <div class="marks-block">
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
    </button>
    {#if marksOn}
      <span class="marks">
        <span class="moved" title="A symbol that sits on a different key.">position</span>
        <span class="win" title="Windows keeps AltGr or AltGr+Shift from the other language and drops this one.">Win AltGr</span>
      </span>
    {/if}
  </div>
</div>

<style>
  .legend-view {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 6px;
    padding-top: 6px;
  }

  .marks-block {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 3px;
  }

  .view-toggle {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    margin: 0;
    padding: 0;
    border: 1px solid #c4c4c4;
    border-radius: 6px;
    background: #f3f3f3;
    cursor: pointer;
  }

  .view-toggle:hover:not(:disabled):not(.on) {
    background: #fff;
    border-color: #1d6f8a;
  }

  .view-toggle.on {
    background: #fff;
    border: 2px solid #1d6f8a;
  }

  .view-toggle.pale,
  .view-toggle:disabled {
    background: #f3f3f3;
    border-color: #e4e4e4;
    opacity: 0.45;
    cursor: default;
  }

  .view-toggle img {
    display: block;
    width: 18px;
    height: 18px;
  }

  .marks {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 2px;
    color: #555;
    font-size: 11px;
    line-height: 1.2;
  }

  .moved {
    border-bottom: 1px solid #c47b00;
  }

  .win {
    padding: 0 3px;
    border-radius: 3px;
    box-shadow: inset 0 0 0 1px #b42318;
    color: #9a3412;
  }
</style>
