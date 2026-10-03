<script lang="ts">
  import { onDestroy } from 'svelte'
  import type { LayoutKey, ZmkCombo } from '@keymap-editor/keymap-core'
  import { buildComboArcSegs } from '../../combo-arcs'

  interface Props {
    layout: LayoutKey[]
    combos: readonly ZmkCombo[]
    shownLayers: readonly number[]
    hidden?: ReadonlySet<number>
    width: number
    height: number
    minX: number
    minY: number
    labelFor: (combo: ZmkCombo) => string
    onSelect: (comboId: string) => void
    onHover?: (hover: { positions: readonly number[]; faceLayer: number } | null) => void
  }

  let {
    layout,
    combos,
    shownLayers,
    hidden,
    width,
    height,
    minX,
    minY,
    labelFor,
    onSelect,
    onHover
  }: Props = $props()

  const segs = $derived(
    buildComboArcSegs(layout, combos, { shownLayers, hidden, labelFor })
  )

  let hoverId = $state<string | null>(null)

  function setHover(
    comboId: string | null,
    positions: readonly number[] | null,
    faceLayer: number | null
  ) {
    hoverId = comboId
    if (positions && faceLayer != null) {
      onHover?.({ positions, faceLayer })
    } else {
      onHover?.(null)
    }
  }

  onDestroy(() => onHover?.(null))
</script>

{#if segs.length > 0}
  <svg
    class="combo-arcs"
    width={width}
    height={height}
    viewBox={`${minX} ${minY} ${width} ${height}`}
    style:left="{minX}px"
    style:top="{minY}px"
    aria-label="Combos on this board"
  >
    {#each segs as seg (seg.id)}
      <g
        class="combo-bead"
        class:anchor={seg.kind === 'anchor'}
        class:hover={hoverId === seg.comboId}
        role="button"
        tabindex="0"
        aria-label={seg.title}
        onclick={() => onSelect(seg.comboId)}
        onkeydown={event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            onSelect(seg.comboId)
          }
        }}
        onmouseenter={() => setHover(seg.comboId, seg.keyPositions, seg.faceLayer)}
        onmouseleave={() => {
          if (hoverId === seg.comboId) setHover(null, null, null)
        }}
        onfocus={() => setHover(seg.comboId, seg.keyPositions, seg.faceLayer)}
        onblur={() => {
          if (hoverId === seg.comboId) setHover(null, null, null)
        }}
      >
        <title>{seg.title}</title>
        <circle class="dot-hit" cx={seg.midX} cy={seg.midY} r="11" />
        <circle class="dot" cx={seg.midX} cy={seg.midY} r="4.5" />
        {#if hoverId === seg.comboId}
          {@const tipBelow = seg.midY - minY < 22}
          {@const tipW = Math.max(seg.label.length * 6.4, 36)}
          <g class="tip" transform="translate({seg.midX}, {seg.midY})">
            <rect
              class="tip-bg"
              x={-tipW / 2}
              y={tipBelow ? 8 : -20}
              width={tipW}
              height="16"
              rx="3"
            />
            <text class="tip-text" y={tipBelow ? 16 : -12}>{seg.label}</text>
          </g>
        {/if}
      </g>
    {/each}
  </svg>
{/if}

<style>
  .combo-arcs {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 3;
    overflow: visible;
    pointer-events: none;
  }

  .combo-bead {
    pointer-events: auto;
    cursor: pointer;
    outline: none;
  }

  .dot-hit {
    fill: transparent;
  }

  .dot {
    fill: color-mix(in srgb, var(--accent, #3a7) 78%, transparent);
    stroke: color-mix(in srgb, var(--stage-bg, #111) 65%, transparent);
    stroke-width: 1.25;
  }

  .combo-bead.anchor .dot {
    fill: color-mix(in srgb, var(--combo, #c9a227) 82%, transparent);
    stroke: color-mix(in srgb, var(--stage-bg, #111) 55%, transparent);
  }

  .combo-bead.hover .dot,
  .combo-bead:focus-visible .dot {
    fill: var(--accent, #3a7);
    stroke-width: 1.5;
  }

  .combo-bead.anchor.hover .dot,
  .combo-bead.anchor:focus-visible .dot {
    fill: var(--combo, #c9a227);
  }

  .tip {
    pointer-events: none;
  }

  .tip-bg {
    fill: color-mix(in srgb, var(--stage-bg, #111) 88%, var(--surface, #222));
    stroke: color-mix(in srgb, var(--accent, #3a7) 45%, transparent);
    stroke-width: 1;
  }

  .combo-bead.anchor .tip-bg {
    stroke: color-mix(in srgb, var(--combo, #c9a227) 50%, transparent);
  }

  .tip-text {
    fill: var(--text, #eee);
    font-size: 10px;
    font-weight: 650;
    text-anchor: middle;
    dominant-baseline: middle;
  }
</style>
