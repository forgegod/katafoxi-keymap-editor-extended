<script lang="ts">
  import type { KeyBindingNode, LayoutKey } from '@keymap-editor/keymap-core'
  import { getKeyBoundingBox, getKeyStyles } from '../../../key-units'
  import { layoutThumbVisibleIndexes } from './layout-thumb-visible'

  /** Shared slot so every demo card’s preview is the same size. */
  const FRAME_W = 132
  const FRAME_H = 56

  interface Props {
    layout: LayoutKey[]
    /** When set, a blank top row is omitted like on the main board. */
    layers?: KeyBindingNode[][]
    /** Accessible name for the schematic. */
    label: string
  }

  let { layout, layers, label }: Props = $props()

  function keySize(key: LayoutKey) {
    const w = key.w ?? key.u ?? 1
    return { u: w, h: key.h ?? 1 }
  }

  function keyRotation(key: LayoutKey) {
    return { x: key.rx, y: key.ry, a: key.r }
  }

  const geometry = $derived.by(() => {
    const visible = layoutThumbVisibleIndexes(layout, layers).map(index => layout[index])
    if (!visible.length) {
      return {
        width: FRAME_W,
        height: FRAME_H,
        scale: 1,
        ox: 0,
        oy: 0,
        minX: 0,
        minY: 0,
        canvasW: FRAME_W,
        canvasH: FRAME_H,
        keys: [] as ReturnType<typeof getKeyStyles>[]
      }
    }

    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const key of visible) {
      const box = getKeyBoundingBox(
        { x: key.x, y: key.y },
        keySize(key),
        keyRotation(key)
      )
      minX = Math.min(minX, box.min.x)
      minY = Math.min(minY, box.min.y)
      maxX = Math.max(maxX, box.max.x)
      maxY = Math.max(maxY, box.max.y)
    }

    const canvasW = Math.max(maxX - minX, 1)
    const canvasH = Math.max(maxY - minY, 1)
    const scale = Math.min(FRAME_W / canvasW, FRAME_H / canvasH)
    const drawnW = canvasW * scale
    const drawnH = canvasH * scale

    return {
      width: FRAME_W,
      height: FRAME_H,
      scale,
      ox: (FRAME_W - drawnW) / 2,
      oy: (FRAME_H - drawnH) / 2,
      minX,
      minY,
      canvasW,
      canvasH,
      keys: visible.map(key =>
        getKeyStyles({ x: key.x, y: key.y }, keySize(key), keyRotation(key))
      )
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
  <div
    class="thumb-fit"
    style:left="{geometry.ox}px"
    style:top="{geometry.oy}px"
    style:width="{geometry.canvasW * geometry.scale}px"
    style:height="{geometry.canvasH * geometry.scale}px"
  >
    <div
      class="thumb-canvas"
      style:width="{geometry.canvasW}px"
      style:height="{geometry.canvasH}px"
      style:transform="scale({geometry.scale}) translate({-geometry.minX}px, {-geometry.minY}px)"
    >
      {#each geometry.keys as style}
        <span
          class="key"
          style:top={style.top}
          style:left={style.left}
          style:width={style.width}
          style:height={style.height}
          style:transform-origin={style.transformOrigin}
          style:transform={style.transform}
        ></span>
      {/each}
    </div>
  </div>
</div>

<style>
  .layout-thumb {
    position: relative;
    flex: 0 0 auto;
    overflow: hidden;
  }

  .thumb-fit {
    position: absolute;
    overflow: hidden;
  }

  .thumb-canvas {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
  }

  .key {
    position: absolute;
    box-sizing: border-box;
    background: var(--text-muted);
    border-radius: 2px;
    opacity: 0.55;
  }
</style>
