<script lang="ts">
  import {
    keycapColumns,
    type ComposedLegend,
    type LegendHoverHit
  } from '@keymap-editor/keymap-core'
  import type { LegendMode } from '../context'

  interface Props {
    legend: ComposedLegend
    mode?: LegendMode
    stacked?: boolean
    hit?: LegendHoverHit
  }

  let { legend, mode = 'composed', stacked = false, hit = 'none' }: Props = $props()

  const title = $derived(
    [legend.keycode, legend.bilingualNote].filter(Boolean).join(' ')
  )
  const columns = $derived(keycapColumns(legend))
</script>

{#if mode === 'composed'}
  <div
    class="keycap"
    class:keypad={legend.keypad}
    class:stacked
    {title}
  >
    <span class="line" class:legend-hit={hit === 'combo'}>
      {#each columns as column, index (index)}
        <span class="col" class:alt={column.kind === 'alt'}>
          {#each column.pieces as piece, pieceIndex (pieceIndex)}<span
              class:second={piece.tone === 'second'}>{piece.text}</span>{/each}
        </span>
      {/each}
      {#if legend.hold}
        <span class="hold" class:legend-hit={hit === 'hold'}>{legend.hold}</span>
      {/if}
    </span>
  </div>
{:else}
  <span class="zmk-fallback">{legend.keycode || legend.en[0]}</span>
{/if}

<style>
  .keycap {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    width: 100%;
    height: 100%;
    padding: 2px;
    box-sizing: border-box;
    font-family: Quicksand, avenir, sans-serif;
    font-size: 13px;
    font-weight: 500;
    line-height: 1;
    color: #555;
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
    color: #1d6f8a;
  }

  .col.alt {
    opacity: 0.7;
  }

  .line.legend-hit,
  .hold.legend-hit {
    background: #e4c56a;
    border-radius: 3px;
    color: #444;
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
    color: #444;
  }

  .zmk-fallback {
    font-size: 110%;
  }
</style>
