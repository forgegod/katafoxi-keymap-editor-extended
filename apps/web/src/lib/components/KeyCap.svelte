<script lang="ts">
  import { keycapFace, type ComposedLegend, type LegendHoverHit } from '@keymap-editor/keymap-core'
  import { observeKeycapFit, requestKeycapFit } from '../fit-scheduler'

  interface Props {
    legend: ComposedLegend
    stacked?: boolean
    hit?: LegendHoverHit
    /** AltGr pair disagrees; Windows keeps the other language. */
    conflict?: boolean
  }

  let { legend, stacked = false, hit = 'none', conflict = false }: Props = $props()

  /** Face content comes only from core `keycapFace` — UI paints and scale-to-fits. */
  const face = $derived(keycapFace(legend))
  const bilingual = $derived(face.packs.length >= 2)

  let keycapEl: HTMLDivElement | undefined = $state()
  let faceEl: HTMLSpanElement | undefined = $state()
  let scale = $state(1)

  $effect(() => {
    const box = keycapEl
    if (!box) return
    return observeKeycapFit({
      box,
      getFace: () => faceEl,
      setScale: next => {
        scale = next
      }
    })
  })

  $effect(() => {
    void face.packs
    void face.hold
    void stacked
    const box = keycapEl
    if (box) requestKeycapFit(box)
  })
</script>

<div
  class="keycap"
  class:keypad={legend.keypad}
  class:stacked
  class:bilingual
  class:scaled={scale < 0.999}
  bind:this={keycapEl}
>
  <span
    class="face"
    class:legend-hit={hit === 'combo'}
    class:has-hold={Boolean(face.hold)}
    style="transform: scale({scale})"
    bind:this={faceEl}
  >
    <span class="langs" class:bilingual>
      {#each face.packs as pack, packIndex (packIndex)}
        <span class="pack" class:second={pack.tone === 'second'}>
          {#each pack.glyphs as glyph, glyphIndex (`${packIndex}-${glyphIndex}`)}
            <span
              class="glyph"
              class:alt={glyph.alt}
              class:empty={Boolean(glyph.empty)}
              class:dead={Boolean(glyph.dead)}
              class:os-conflict={conflict && glyph.alt && !glyph.empty}
            >{glyph.text}</span>
          {/each}
        </span>
      {/each}
    </span>
    {#if face.hold}
      <span class="hold" class:legend-hit={hit === 'hold'}>{face.hold}</span>
    {/if}
  </span>
</div>

<style>
  .keycap {
    display: flex;
    align-items: center;
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
    padding: 0 1px;
  }

  /* Paint `keycapFace` only; scale when the layer row is too narrow. */
  .face {
    display: inline-flex;
    align-items: baseline;
    gap: 0.2em;
    white-space: nowrap;
    transform-origin: left center;
  }

  .keycap.bilingual:not(.scaled) .face {
    width: 100%;
    display: flex;
    justify-content: space-between;
  }

  .keycap.bilingual:not(.scaled) .langs {
    flex: 1 1 auto;
    display: flex;
    justify-content: space-between;
    min-width: 0;
  }

  .langs {
    display: inline-flex;
    align-items: baseline;
    gap: 0.35em;
  }

  .pack {
    display: inline-flex;
    align-items: baseline;
    flex: 0 0 auto;
  }

  .pack.second {
    color: var(--accent);
  }

  .glyph {
    display: inline-block;
    line-height: 1;
  }

  /* Placeholders stay in the layout; visible only while the layer row is hovered. */
  .glyph.empty {
    opacity: 0;
  }

  :global(.layer-slot:hover) .glyph.empty,
  :global(.layer-slot:focus-visible) .glyph.empty {
    opacity: 0.45;
  }

  .glyph.alt:not(.empty) {
    opacity: 0.7;
  }

  .glyph.alt.os-conflict {
    opacity: 1;
    color: var(--conflict-ink);
  }

  .glyph.dead {
    color: var(--warn-ink);
    background: var(--warn-wash);
    border-radius: 2px;
    box-shadow: inset 0 0 0 1px var(--warn-border);
    padding: 0 1px;
  }

  .hold {
    flex: 0 0 auto;
    font-size: 0.78em;
    line-height: 1;
    padding: 1px 2px;
    border-radius: 3px;
    background: var(--shade-wash-mid);
    color: var(--text-muted);
  }

  .face.legend-hit,
  .hold.legend-hit {
    background: var(--highlight);
    border-radius: 3px;
    color: var(--text-muted);
    opacity: 1;
  }

  .keycap.keypad {
    background: var(--keypad-wash);
    border-radius: 3px;
    padding-inline: 2px;
  }

  .keycap.stacked.keypad {
    background: var(--keypad-wash);
    padding-inline: 2px;
  }
</style>
