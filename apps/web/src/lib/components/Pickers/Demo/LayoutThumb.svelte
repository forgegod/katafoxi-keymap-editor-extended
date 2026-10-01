<script lang="ts">
  import type { LayoutKey } from '@keymap-editor/keymap-core'

  /** Shared slot so every demo card’s preview is the same size. */
  const FRAME_W = 132
  const FRAME_H = 56

  interface Props {
    layout: LayoutKey[]
    /** Accessible name for the schematic. */
    label: string
  }

  let { layout, label }: Props = $props()

  const geometry = $derived.by(() => {
    if (!layout.length) {
      return { width: FRAME_W, height: FRAME_H, keys: [] as LayoutKey[], unit: 8, ox: 0, oy: 0 }
    }
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const key of layout) {
      const w = key.w ?? 1
      const h = key.h ?? 1
      minX = Math.min(minX, key.x)
      minY = Math.min(minY, key.y)
      maxX = Math.max(maxX, key.x + w)
      maxY = Math.max(maxY, key.y + h)
    }
    const width = Math.max(maxX - minX, 1)
    const height = Math.max(maxY - minY, 1)
    const unit = Math.min(FRAME_W / width, FRAME_H / height)
    const drawnW = width * unit
    const drawnH = height * unit
    return {
      width: FRAME_W,
      height: FRAME_H,
      unit,
      ox: (FRAME_W - drawnW) / 2,
      oy: (FRAME_H - drawnH) / 2,
      keys: layout.map(key => ({
        ...key,
        x: (key.x - minX) * unit,
        y: (key.y - minY) * unit,
        w: (key.w ?? 1) * unit,
        h: (key.h ?? 1) * unit
      }))
    }
  })
</script>

<div
  class="layout-thumb"
  role="img"
  aria-label={label}
  style:width="{geometry.width}px"
  style:height="{geometry.height}px"
>
  {#each geometry.keys as key}
    <span
      class="key"
      style:left="{geometry.ox + key.x}px"
      style:top="{geometry.oy + key.y}px"
      style:width="{(key.w ?? geometry.unit) - 1}px"
      style:height="{(key.h ?? geometry.unit) - 1}px"
      style:transform={key.r ? `rotate(${key.r}deg)` : undefined}
    ></span>
  {/each}
</div>

<style>
  .layout-thumb {
    position: relative;
    flex: 0 0 auto;
    overflow: hidden;
  }

  .key {
    position: absolute;
    box-sizing: border-box;
    background: var(--text-muted);
    border-radius: 2px;
    opacity: 0.55;
    transform-origin: top left;
  }
</style>
