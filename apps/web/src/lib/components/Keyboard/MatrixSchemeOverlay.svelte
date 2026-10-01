<script lang="ts">
  import type { LayoutKey } from '@keymap-editor/keymap-core'
  import { schemeKeyCenters, schemePolylines } from '../../matrix-scheme'

  interface Props {
    layout: LayoutKey[]
    width: number
    height: number
    /** Canvas origin used by the keyboard fit transform. */
    minX: number
    minY: number
  }

  let { layout, width, height, minX, minY }: Props = $props()

  const lines = $derived(schemePolylines(layout))
  const points = $derived(schemeKeyCenters(layout))
  const rowLines = $derived(lines.filter(line => line.kind === 'row'))
  const colLines = $derived(lines.filter(line => line.kind === 'col'))

  /** Rough chip width so labels stay readable over keycap glyphs. */
  function chipWidth(text: string, size = 9) {
    return Math.max(text.length * size * 0.62 + 6, 14)
  }
</script>

<svg
  class="matrix-scheme"
  width={width}
  height={height}
  viewBox={`${minX} ${minY} ${width} ${height}`}
  style:left="{minX}px"
  style:top="{minY}px"
  aria-hidden="true"
>
  {#each colLines as line (line.id)}
    <path class="rail col" d={line.d} stroke={line.color} />
  {/each}
  {#each rowLines as line (line.id)}
    <path class="rail row" d={line.d} stroke={line.color} />
  {/each}
  {#each points as point (point.index)}
    {@const tw = chipWidth(point.label)}
    {@const th = 12}
    <circle class="node" cx={point.x} cy={point.y} r="3.5" />
    <g class="tag-chip" transform="translate({point.x}, {point.y - 10})">
      <rect class="tag-bg" x={-tw / 2} y={-th + 2} width={tw} height={th} rx="2" />
      <text class="tag" y="0">{point.label}</text>
    </g>
  {/each}
  {#each rowLines as line (line.id + '-label')}
    {@const tw = chipWidth(line.label, 11)}
    {@const th = 13}
    <g class="axis-chip" transform="translate({line.labelX - 8}, {line.labelY})">
      <rect class="axis-bg" x={-tw} y={-th / 2} width={tw} height={th} rx="2" />
      <text class="axis" x={-3} y="0" fill={line.color}>{line.label}</text>
    </g>
  {/each}
</svg>

<style>
  .matrix-scheme {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 4;
    overflow: visible;
    pointer-events: none;
  }

  .rail {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .rail.col {
    stroke-width: 2.5;
    stroke-dasharray: 5 6;
  }

  .rail.row {
    stroke-width: 3;
  }

  .node {
    fill: color-mix(in srgb, var(--accent, #2a9d8f) 70%, white);
    stroke: var(--stage-bg, #111);
    stroke-width: 1;
  }

  .tag-bg,
  .axis-bg {
    fill: color-mix(in srgb, var(--stage-bg, #111) 82%, var(--surface, #222));
    stroke: color-mix(in srgb, var(--border, #444) 70%, transparent);
    stroke-width: 1;
  }

  .tag {
    fill: var(--text, #e8e8e8);
    font-size: 9px;
    font-weight: 700;
    text-anchor: middle;
  }

  .axis {
    font-size: 11px;
    font-weight: 700;
    text-anchor: end;
    dominant-baseline: middle;
  }
</style>
