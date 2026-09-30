<script lang="ts">
  import { editor } from '../editor.svelte.js'

  const marksOn = $derived(editor.canAlignHostSymbols && editor.symbolAlignOn)
</script>

{#if marksOn}
  <div class="align-key" aria-label="Symbol difference marks">
    <span
      class="moved"
      title="No shared key for this symbol, or it is missing from one language."
      >position</span
    >
    <span
      class="win"
      title="Windows keeps AltGr or AltGr+Shift from the other language and drops this one."
      >Win AltGr</span
    >
  </div>
{/if}

<style>
  .align-key {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 5px;
    margin: 0;
    padding: 0 1px;
    color: #666;
    font-size: 10px;
    font-weight: 500;
    line-height: 1.2;
  }

  .moved {
    border-bottom: 1.5px solid #a67c2a;
    color: #555;
  }

  .win {
    padding: 0 2px;
    border-radius: 2px;
    box-shadow: inset 0 0 0 1px #b07060;
    color: #666;
  }
</style>
