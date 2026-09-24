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
  <div class="keycap" class:keypad={legend.keypad} title={legend.keycode}>
    <span class="slot primary-0">{legend.primary[0]}</span>
    <span class="slot primary-1">{legend.primary[1]}</span>
    <span class="slot altgr-0">{legend.altGr[0]}</span>
    <span class="slot altgr-1">{legend.altGr[1]}</span>
    {#if legend.hold}
      <span class="hold-badge">{legend.hold}</span>
    {/if}
  </div>
{:else}
  <span class="zmk-fallback">{legend.keycode || legend.primary[0]}</span>
{/if}

<style>
  .keycap {
    position: relative;
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    width: 100%;
    height: 100%;
    min-height: 2.5em;
    padding: 4px;
    box-sizing: border-box;
    font-family: Quicksand, avenir, sans-serif;
    font-size: 85%;
    font-weight: 500;
    line-height: 1.1;
    color: #666;
  }

  .slot {
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .primary-0 {
    grid-column: 1;
    grid-row: 1;
    justify-content: flex-start;
    align-items: flex-start;
  }

  .primary-1 {
    grid-column: 2;
    grid-row: 1;
    justify-content: flex-end;
    align-items: flex-start;
  }

  .altgr-0 {
    grid-column: 1;
    grid-row: 2;
    justify-content: flex-start;
    align-items: flex-end;
    opacity: 0.75;
    font-size: 90%;
  }

  .altgr-1 {
    grid-column: 2;
    grid-row: 2;
    justify-content: flex-end;
    align-items: flex-end;
    opacity: 0.75;
    font-size: 90%;
  }

  .keycap.keypad {
    box-shadow: inset 0 0 0 1.5px rgba(60, 60, 60, 0.4);
    background: rgba(0, 0, 0, 0.04);
    border-radius: 4px;
  }

  .hold-badge {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 9px;
    line-height: 1;
    padding: 1px 3px;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.12);
    color: #444;
    white-space: nowrap;
    pointer-events: none;
  }

  .zmk-fallback {
    font-size: 110%;
  }
</style>
