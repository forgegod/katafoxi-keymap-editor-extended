<script lang="ts">
  import {
    comboDictionaryIndexModel,
    typewriterIndexFace,
    type ComboIndexHit,
    type ComboIndexOther,
    type LayoutKey,
    type ZmkCombo
  } from '@keymap-editor/keymap-core'
  import { getKeyBoundingBox, getKeyStyles } from '../../key-units'
  import { onDestroy } from 'svelte'

  interface Props {
    layout: LayoutKey[]
    combos: readonly ZmkCombo[]
    open: boolean
    activeKeyId: string | null
    onToggle: () => void
    onHoverHit: (hit: ComboIndexHit | ComboIndexOther | null) => void
    onSelectHit: (hit: ComboIndexHit | ComboIndexOther) => void
  }

  let {
    layout,
    combos,
    open,
    activeKeyId,
    onToggle,
    onHoverHit,
    onSelectHit
  }: Props = $props()

  const model = $derived(comboDictionaryIndexModel(layout, combos))
  const coveredCount = $derived(model.hits.size)

  const geometry = $derived.by(() => {
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    const painted = model.keys.map(key => {
      const size = { u: key.w ?? 1, h: key.h ?? 1 }
      const box = getKeyBoundingBox({ x: key.x, y: key.y }, size)
      minX = Math.min(minX, box.min.x)
      minY = Math.min(minY, box.min.y)
      maxX = Math.max(maxX, box.max.x)
      maxY = Math.max(maxY, box.max.y)
      return {
        key,
        style: getKeyStyles({ x: key.x, y: key.y }, size)
      }
    })
    const width = Math.max(maxX - minX, 1)
    const height = Math.max(maxY - minY, 1)
    return { minX, minY, width, height, painted }
  })

  let stageEl: HTMLDivElement | undefined = $state()
  let stageW = $state(0)
  let stageH = $state(0)

  $effect(() => {
    const el = stageEl
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(entries => {
      const box = entries[0]?.contentRect
      if (!box) return
      stageW = box.width
      stageH = box.height
    })
    observer.observe(el)
    const box = el.getBoundingClientRect()
    stageW = box.width
    stageH = box.height
    return () => observer.disconnect()
  })

  const scale = $derived.by(() => {
    if (geometry.width <= 0 || geometry.height <= 0) return 1
    if (stageW < 8 || stageH < 8) return 1
    return Math.min(stageW / geometry.width, stageH / geometry.height, 1)
  })

  function hitActiveId(hit: ComboIndexHit): string {
    return `${hit.keyId}:${hit.band}`
  }

  function bandsActive(bands: {
    base?: ComboIndexHit
    shift?: ComboIndexHit
  }): boolean {
    return (
      (bands.base != null && activeKeyId === hitActiveId(bands.base)) ||
      (bands.shift != null && activeKeyId === hitActiveId(bands.shift))
    )
  }

  onDestroy(() => onHoverHit(null))
</script>

<section class="combo-dictionary">
  <button
    type="button"
    class="dict-toggle"
    aria-expanded={open}
    aria-controls="combo-dictionary-index"
    onclick={onToggle}
  >
    Chord dictionary
    <span class="dict-count">{coveredCount} keys</span>
  </button>
  {#if open}
    <div
      id="combo-dictionary-index"
      class="dict-stage"
      bind:this={stageEl}
      role="group"
      aria-label="Typewriter index. Hover a key to see the chord on the board."
    >
      <div
        class="dict-fit"
        style:width="{geometry.width * scale}px"
        style:height="{geometry.height * scale}px"
      >
        <div
          class="dict-canvas"
          style:width="{geometry.width}px"
          style:height="{geometry.height}px"
          style:transform="scale({scale}) translate({-geometry.minX}px, {-geometry.minY}px)"
        >
          {#each geometry.painted as { key, style } (key.id)}
            {@const bands = model.hits.get(key.id)}
            {#if bands}
              {@const face = typewriterIndexFace(key, bands)}
              {@const split = bands.base != null && bands.shift != null}
              <div
                class="index-key covered"
                class:split
                class:active={bandsActive(bands)}
                role="group"
                aria-label="{key.label}"
                style:top={style.top}
                style:left={style.left}
                style:width={style.width}
                style:height={style.height}
                style:transform-origin={style.transformOrigin}
                style:transform={style.transform}
                onmouseleave={() => onHoverHit(null)}
              >
                {#if bands.shift && face.shift}
                  {@const shiftHit = bands.shift}
                  <button
                    type="button"
                    class="index-half shift"
                    class:active={activeKeyId === hitActiveId(shiftHit)}
                    aria-label="{key.label} shift chord"
                    aria-pressed={activeKeyId === hitActiveId(shiftHit)}
                    onclick={() => onSelectHit(shiftHit)}
                    onmouseenter={() => onHoverHit(shiftHit)}
                    onfocus={() => onHoverHit(shiftHit)}
                    onblur={() => onHoverHit(null)}
                  >
                    {face.shift}
                  </button>
                {/if}
                {#if bands.base && face.base}
                  {@const baseHit = bands.base}
                  <button
                    type="button"
                    class="index-half base"
                    class:active={activeKeyId === hitActiveId(baseHit)}
                    aria-label="{key.label} chord"
                    aria-pressed={activeKeyId === hitActiveId(baseHit)}
                    onclick={() => onSelectHit(baseHit)}
                    onmouseenter={() => onHoverHit(baseHit)}
                    onfocus={() => onHoverHit(baseHit)}
                    onblur={() => onHoverHit(null)}
                  >
                    {face.base}
                  </button>
                {/if}
              </div>
            {:else}
              <span
                class="index-key"
                aria-hidden="true"
                style:top={style.top}
                style:left={style.left}
                style:width={style.width}
                style:height={style.height}
                style:transform-origin={style.transformOrigin}
                style:transform={style.transform}
              >
                {key.label}
              </span>
            {/if}
          {/each}
        </div>
      </div>
    </div>
    {#if model.other.length > 0}
      <div class="dict-other" role="group" aria-label="Other combo outputs">
        {#each model.other as item (item.comboId)}
          <button
            type="button"
            class="dict-chip"
            class:active={activeKeyId === item.comboId}
            onclick={() => onSelectHit(item)}
            onmouseenter={() => onHoverHit(item)}
            onmouseleave={() => onHoverHit(null)}
          >
            {item.label}
          </button>
        {/each}
      </div>
    {/if}
  {/if}
</section>

<style>
  .combo-dictionary {
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
    border-top: 1px solid var(--border);
    background: var(--surface, transparent);
  }

  .dict-toggle {
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 6px 10px;
    border: 0;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-weight: 650;
    cursor: pointer;
    text-align: left;
  }

  .dict-toggle:hover,
  .dict-toggle:focus-visible {
    color: var(--accent, #7c9);
  }

  .dict-count {
    color: var(--text-muted);
    font-weight: 500;
    font-size: 0.9em;
  }

  .dict-stage {
    position: relative;
    flex: 1 1 auto;
    min-height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    padding: 0 10px 8px;
  }

  .dict-fit {
    position: relative;
    flex: none;
    overflow: hidden;
  }

  .dict-canvas {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
  }

  .index-key {
    position: absolute;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: center;
    margin: 0;
    padding: 0;
    border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
    border-radius: 6px;
    background: color-mix(in srgb, var(--text-muted) 12%, transparent);
    color: var(--text-muted);
    font: 600 13px/1 system-ui, sans-serif;
    pointer-events: none;
    overflow: hidden;
  }

  .index-key.covered {
    pointer-events: auto;
    background: var(--surface-sunken, #222);
    color: var(--text);
    border-color: var(--border);
  }

  .index-key.covered.active {
    border-color: var(--accent, #3a7);
  }

  .index-half {
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    width: 100%;
  }

  .index-key.split .index-half.shift {
    align-items: flex-end;
    padding-bottom: 1px;
    font-size: 11px;
    color: color-mix(in srgb, var(--text) 82%, transparent);
  }

  .index-key.split .index-half.base {
    align-items: flex-start;
    padding-top: 1px;
  }

  .index-half:hover,
  .index-half:focus-visible,
  .index-half.active {
    background: color-mix(in srgb, var(--accent, #3a7) 22%, var(--surface-sunken, #222));
  }

  .dict-other {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    padding: 0 10px 8px;
  }

  .dict-chip {
    margin: 0;
    padding: 2px 7px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-size: 0.8em;
    cursor: pointer;
  }

  .dict-chip.active,
  .dict-chip:hover,
  .dict-chip:focus-visible {
    color: var(--text);
    border-color: var(--accent, #4af);
  }
</style>
