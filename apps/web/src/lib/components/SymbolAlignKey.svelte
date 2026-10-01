<script lang="ts">
  import { editor } from '../editor.svelte.js'

  const marksOn = $derived(editor.canAlignHostSymbols && editor.symbolAlignOn)
</script>

{#if marksOn}
  <div class="align-key" aria-label="Symbol difference marks">
    <span
      class="sample"
      title="No shared key for this symbol, or it is missing from one language."
    >
      <span class="swatch moved" aria-hidden="true"></span>
      position
    </span>
    <span
      class="sample"
      title="Windows keeps AltGr or AltGr+Shift from the other language and drops this one."
    >
      <span class="swatch win" aria-hidden="true"></span>
      Win AltGr
    </span>
  </div>
{/if}

<style>
  .align-key {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: 0;
    padding: 0 1px;
    color: var(--text-muted);
    font-size: 10px;
    font-weight: 500;
    line-height: 1.2;
  }

  .sample {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: var(--text-muted);
  }

  .swatch {
    flex: none;
    box-sizing: border-box;
    width: 8px;
    height: 8px;
  }

  .swatch.moved {
    border-radius: 0;
    border-bottom: 2px solid var(--mark-diff);
  }

  .swatch.win {
    border-radius: 1px;
    box-shadow: inset 0 0 0 1.25px var(--mark-altgr);
  }
</style>
