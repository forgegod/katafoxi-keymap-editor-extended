<script lang="ts">
  import { editor } from '../editor.svelte.js'

  const marksOn = $derived(editor.canAlignHostSymbols && editor.symbolAlignOn)
</script>

{#if marksOn}
  <div class="align-key" aria-label="Symbol difference marks">
    <span class="moved" title="No shared key for this symbol, or it is missing from one language."
      >position</span
    >
    <span class="win" title="Windows keeps AltGr or AltGr+Shift from the other language and drops this one."
      >Win AltGr</span
    >
  </div>
{/if}

<style>
  .align-key {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0 0 4px;
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
