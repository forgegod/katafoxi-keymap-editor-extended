<script lang="ts">
  import {
    ALT_LEVEL_EMPTY,
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

  /** Split ˬ placeholders from real glyphs so empty AltGr slots can hide until hover. */
  function markParts(text: string): { empty: boolean; text: string }[] {
    if (!text) return []
    const parts: { empty: boolean; text: string }[] = []
    let buf = ''
    let empty = text[0] === ALT_LEVEL_EMPTY
    for (const ch of text) {
      const isEmpty = ch === ALT_LEVEL_EMPTY
      if (buf && isEmpty !== empty) {
        parts.push({ empty, text: buf })
        buf = ''
        empty = isEmpty
      }
      buf += ch
    }
    if (buf) parts.push({ empty, text: buf })
    return parts
  }
</script>

<div
  class="keycap"
  class:keypad={legend.keypad}
  class:stacked
>
  <span class="line" class:legend-hit={hit === 'combo'}>
    {#each columns as column, index (index)}
      <span class="col" class:alt={column.kind === 'alt'} class:os-conflict={conflict && column.kind === 'alt'}>
        {#each column.pieces as piece, pieceIndex (pieceIndex)}
          <span class:second={piece.tone === 'second'}>
            {#each markParts(piece.text) as part, partIndex (partIndex)}
              {#if part.empty}
                <span class="empty-mark">{part.text}</span>
              {:else}
                {part.text}
              {/if}
            {/each}
          </span>
        {/each}
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
    color: var(--text-muted);
    opacity: 1;
  }

  .line.legend-hit {
    padding: 0 2px;
  }

  /* Same wash as `.code.keypad` / `.key-editor-choice.keypad` — no stroke. */
  .keycap.keypad {
    background: var(--keypad-wash);
    border-radius: 3px;
    padding-inline: 2px;
  }

  .keycap.stacked.keypad {
    background: var(--keypad-wash);
    padding-inline: 2px;
  }

  .hold {
    font-size: 9px;
    line-height: 1;
    padding: 1px 3px;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.12);
    color: var(--text-muted);
  }
</style>
