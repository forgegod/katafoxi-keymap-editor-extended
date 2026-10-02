<script lang="ts">
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
    onSelect
  }: Props = $props()

  const segs = $derived(
    buildComboArcSegs(layout, combos, { shownLayers, hidden, labelFor })
  )

  let hoverId = $state<string | null>(null)
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
        onmouseenter={() => (hoverId = seg.comboId)}
        onmouseleave={() => {
          if (hoverId === seg.comboId) hoverId = null
        }}
        onfocus={() => (hoverId = seg.comboId)}
        onblur={() => {
          if (hoverId === seg.comboId) hoverId = null
        }}
      >
        <title>{seg.title}</title>
        <circle class="dot-hit" cx={seg.midX} cy={seg.midY} r="11" />
        <circle class="dot" cx={seg.midX} cy={seg.midY} r="4.5" />
        {#if hoverId === seg.comboId}
          <g class="tip" transform="translate({seg.midX}, {seg.midY})">
            <rect
              class="tip-bg"
              x={-Math.max(seg.label.length * 3.2, 18)}
              y="-20"
              width={Math.max(seg.label.length * 6.4, 36)}
              height="16"
              rx="3"
            />
            <text class="tip-text" y="-12">{seg.label}</text>
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

  .combo-bead.hover .dot,
  .combo-bead:focus-visible .dot {
    fill: var(--accent, #3a7);
    stroke-width: 1.5;
  }

  .tip {
    pointer-events: none;
  }

  .tip-bg {
    fill: color-mix(in srgb, var(--stage-bg, #111) 88%, var(--surface, #222));
    stroke: color-mix(in srgb, var(--accent, #3a7) 45%, transparent);
    stroke-width: 1;
  }

  .tip-text {
    fill: var(--text, #eee);
    font-size: 10px;
    font-weight: 650;
    text-anchor: middle;
    dominant-baseline: middle;
  }
</style>
