<script lang="ts">
  import {
    keycapColumns,
    type ComposedLegend,
    type LegendHoverHit
  } from '@keymap-editor/keymap-core'

  interface Props {
    legend: ComposedLegend
    stacked?: boolean
    hit?: LegendHoverHit
    /** AltGr pair disagrees; Windows keeps the other language. */
    conflict?: boolean
  }

  let { legend, stacked = false, hit = 'none', conflict = false }: Props = $props()

  const columns = $derived(keycapColumns(legend))
</script>

<div
  class="keycap"
  class:keypad={legend.keypad}
  class:stacked
>
  <span class="line" class:legend-hit={hit === 'combo'}>
    {#each columns as column, index (index)}
      <span class="col" class:alt={column.kind === 'alt'} class:os-conflict={conflict && column.kind === 'alt'}>
        {#each column.pieces as piece, pieceIndex (pieceIndex)}<span
            class:second={piece.tone === 'second'}>{piece.text}</span>{/each}
      </span>
    {/each}
    {#if legend.hold}
      <span class="hold" class:legend-hit={hit === 'hold'}>{legend.hold}</span>
    {/if}
  </span>
</div>

<style>
  .keycap {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    width: 100%;
    height: 100%;
    padding: 2px;
    box-sizing: border-box;
    font-family: var(--glyph-font, Inter, "Noto Sans", sans-serif);
    font-size: 13px;
    font-weight: 500;
    line-height: 1;
    color: var(--text-muted);
    overflow: hidden;
  }

  .keycap.stacked {
    height: 100%;
    font-size: 11px;
    padding: 0;
  }

  .keycap.stacked.keypad {
    box-shadow: none;
    background: transparent;
  }

  .line {
    display: flex;
    align-items: baseline;
    justify-content: flex-start;
    gap: 0.3em;
    max-width: 100%;
    white-space: nowrap;
  }

  .col .second {
    color: var(--accent);
  }

  .col.alt {
    opacity: 0.7;
  }

  .col.alt.os-conflict {
    opacity: 1;
    color: var(--conflict-ink);
  }

  .line.legend-hit,
  .hold.legend-hit {
    background: var(--highlight);
    border-radius: 3px;
    color: var(--text-soft);
    opacity: 1;
  }

  .line.legend-hit {
    padding: 0 2px;
  }

  .keycap.keypad {
    box-shadow: inset 0 0 0 1.5px rgba(60, 60, 60, 0.4);
    background: rgba(0, 0, 0, 0.04);
    border-radius: 4px;
  }

  .hold {
    font-size: 9px;
    line-height: 1;
    padding: 1px 3px;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.12);
    color: var(--text-soft);
  }
</style>
