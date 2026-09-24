<script lang="ts">
  import type { ComposedLegend } from '@keymap-editor/keymap-core'
  import type { LegendMode } from '../context'

  interface Props {
    legend: ComposedLegend
    mode?: LegendMode
  }

  let { legend, mode = 'composed' }: Props = $props()
</script>

{#if mode === 'composed'}
  <div
    class="keycap"
    class:keypad={legend.keypad}
    title={[legend.keycode, legend.bilingualNote].filter(Boolean).join(' ')}
  >
    <span class="line">
      <span class="pair">{legend.primary[0]}{legend.primary[1]}</span>
      {#if legend.altGr[0] || legend.altGr[1]}
        <span class="pair alt">{legend.altGr[0]}{legend.altGr[1]}</span>
      {/if}
      {#if legend.hold}
        <span class="hold">{legend.hold}</span>
      {/if}
    </span>
  </div>
{:else}
  <span class="zmk-fallback">{legend.keycode || legend.primary[0]}</span>
{/if}

<style>
  .keycap {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 2px;
    box-sizing: border-box;
    font-family: Quicksand, avenir, sans-serif;
    font-size: 13px;
    font-weight: 500;
    line-height: 1;
    color: #666;
  }

  .line {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: 0.35em;
    max-width: 100%;
    white-space: nowrap;
  }

  .pair.alt {
    opacity: 0.75;
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
