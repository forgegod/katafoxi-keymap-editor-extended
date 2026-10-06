<script lang="ts">
  import {
    comboDictionaryIndexModel,
    comboIndexHitActiveId,
    composeLegendDecode,
    hostKeyByZmk,
    parseKeyBinding,
    stripKcPrefix,
    typewriterIndexBandFace,
    typewriterIndexZmk,
    type ComboIndexHit,
    type ComboIndexOther,
    type LayoutKey,
    type LegendDecodeCard as LegendDecodeCardModel,
    type TypewriterIndexBandFace,
    type TypewriterIndexKey,
    type ZmkCombo
  } from '@keymap-editor/keymap-core'
  import { getKeyBoundingBox, getKeyStyles } from '../../key-units'
  import { editor } from '../../editor.svelte.js'
  import { hostEditCycleLanguages } from '../../host-edit-cycle'
  import {
    claimLegendDecode,
    DICTIONARY_DECODE_KEY,
    isLegendDecodeLocked,
    lockLegendDecode,
    lockedLegendDecodeKeyIndex,
    releaseLegendDecode,
    unlockLegendDecode
  } from '../../legend-decode-active'
  import LegendDecodeCard from '../LegendDecodeCard.svelte'
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
  const hostView = $derived.by(() => {
    void editor.hostLayoutRevision
    return editor.hostLegend
  })

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
    return comboIndexHitActiveId(hit)
  }

  function bandsActive(bands: {
    base?: ComboIndexHit
    shift?: ComboIndexHit
    mods?: ComboIndexHit[]
  }): boolean {
    return (
      (bands.base != null && activeKeyId === hitActiveId(bands.base)) ||
      (bands.shift != null && activeKeyId === hitActiveId(bands.shift)) ||
      (bands.mods?.some(mod => activeKeyId === hitActiveId(mod)) ?? false)
    )
  }

  function bandFace(
    key: TypewriterIndexKey,
    band: 'base' | 'shift',
    split: boolean
  ): TypewriterIndexBandFace {
    return typewriterIndexBandFace(key, band, hostView, split)
  }

  let decode = $state<{
    card: LegendDecodeCardModel
    rect: DOMRect
    zmk: string
  } | null>(null)

  const inHostSession = $derived(
    editor.hostEditSession?.keyIndex === DICTIONARY_DECODE_KEY
  )
  const decodeModeHint = $derived(
    decode && hostKeyByZmk(decode.zmk)
      ? 'Click — combo · Alt+click — host'
      : 'Click — combo'
  )

  function hideDecode() {
    unlockLegendDecode(DICTIONARY_DECODE_KEY)
    decode = null
    releaseLegendDecode(DICTIONARY_DECODE_KEY)
    if (editor.hostEditSession?.keyIndex === DICTIONARY_DECODE_KEY) {
      editor.endHostEditSession()
    }
  }

  function hidePeek() {
    if (inHostSession) return
    unlockLegendDecode(DICTIONARY_DECODE_KEY)
    decode = null
    releaseLegendDecode(DICTIONARY_DECODE_KEY)
  }

  function endHostEditSession() {
    editor.endHostEditSession()
    unlockLegendDecode(DICTIONARY_DECODE_KEY)
    decode = null
    releaseLegendDecode(DICTIONARY_DECODE_KEY)
  }

  function decodeCardForHit(hit: ComboIndexHit): {
    card: LegendDecodeCardModel
    zmk: string
  } | null {
    const zmk = typewriterIndexZmk(hit.keyId)
    if (!zmk) return null
    try {
      return {
        card: composeLegendDecode(parseKeyBinding(`&kp ${zmk}`), editor.hostLegend),
        zmk
      }
    } catch {
      return null
    }
  }

  function openIndexPeek(hit: ComboIndexHit, target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return
    if (inHostSession) return
    if (isLegendDecodeLocked() && lockedLegendDecodeKeyIndex() !== DICTIONARY_DECODE_KEY) {
      return
    }
    const next = decodeCardForHit(hit)
    if (!next) return
    if (!claimLegendDecode(DICTIONARY_DECODE_KEY, 0, hideDecode)) return
    decode = { ...next, rect: target.getBoundingClientRect() }
  }

  function openIndexHostEdit(hit: ComboIndexHit, target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return
    if (isLegendDecodeLocked() && lockedLegendDecodeKeyIndex() !== DICTIONARY_DECODE_KEY) {
      return
    }
    const next = decodeCardForHit(hit)
    if (!next || !hostKeyByZmk(next.zmk)) return
    if (!claimLegendDecode(DICTIONARY_DECODE_KEY, 0, hideDecode)) return
    decode = { ...next, rect: target.getBoundingClientRect() }
    editor.beginHostEditSession(DICTIONARY_DECODE_KEY, 0, next.zmk)
    const language = hostEditCycleLanguages(editor.hostLegend)[0]
    if (language) {
      editor.armHostSymbolEdit({
        language,
        zmk: next.zmk,
        level: hit.band === 'shift' ? 1 : 0
      })
    }
    lockLegendDecode(DICTIONARY_DECODE_KEY)
    queueMicrotask(() => {
      const el = document.getElementById(`legend-decode-${DICTIONARY_DECODE_KEY}-0`)
      if (el instanceof HTMLElement) el.focus()
    })
  }

  function handleHalfEnter(hit: ComboIndexHit, event: Event) {
    onHoverHit(hit)
    openIndexPeek(hit, event.currentTarget)
  }

  function handleHalfFocus(hit: ComboIndexHit, event: FocusEvent) {
    const target = event.currentTarget
    if (!(target instanceof HTMLElement) || !target.matches(':focus-visible')) return
    handleHalfEnter(hit, event)
  }

  function handleHalfLeave(event: MouseEvent | FocusEvent) {
    if (inHostSession) return
    const next = 'relatedTarget' in event ? event.relatedTarget : null
    if (
      next instanceof Element &&
      (next.closest('.index-half') || next.closest('.index-mod'))
    ) {
      return
    }
    hidePeek()
    onHoverHit(null)
  }

  function handleIndexKeyLeave(event: MouseEvent) {
    const next = event.relatedTarget
    if (next instanceof Element && next.closest('.index-key.covered')) return
    onHoverHit(null)
    hidePeek()
  }

  function handleHitClick(event: MouseEvent, hit: ComboIndexHit | ComboIndexOther) {
    if (event.altKey && 'keyId' in hit) {
      event.preventDefault()
      openIndexHostEdit(hit, event.currentTarget)
      return
    }
    hidePeek()
    onSelectHit(hit)
  }

  function armHostCell(
    language: import('@keymap-editor/keymap-core').HostLanguageId,
    level: number
  ) {
    if (!inHostSession || !decode) return
    const zmk = stripKcPrefix(decode.card.keycode)
    if (!zmk) return
    editor.armHostSymbolEdit({ language, zmk, level })
  }

  $effect(() => {
    if (editor.hostEditSession?.keyIndex === DICTIONARY_DECODE_KEY) return
    if (!decode || !isLegendDecodeLocked() || lockedLegendDecodeKeyIndex() !== DICTIONARY_DECODE_KEY) {
      return
    }
    unlockLegendDecode(DICTIONARY_DECODE_KEY)
    decode = null
    releaseLegendDecode(DICTIONARY_DECODE_KEY)
  })

  $effect(() => {
    if (!inHostSession || !decode) return
    const cardId = `legend-decode-${DICTIONARY_DECODE_KEY}-0`
    function onPointerDown(event: PointerEvent) {
      const target = event.target
      if (target instanceof Element && target.closest('.host-symbol-picker')) {
        return
      }
      if (target instanceof Node) {
        const card = document.getElementById(cardId)
        if (card?.contains(target)) return
      }
      event.preventDefault()
      event.stopPropagation()
      endHostEditSession()
    }
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => window.removeEventListener('pointerdown', onPointerDown, true)
  })

  $effect(() => {
    if (open) return
    hideDecode()
  })

  onDestroy(() => {
    onHoverHit(null)
    hideDecode()
  })
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
              {@const split = bands.base != null && bands.shift != null}
              {@const hasMods = (bands.mods?.length ?? 0) > 0}
              <div
                class="index-key covered"
                class:split
                class:has-mods={hasMods}
                class:active={bandsActive(bands)}
                role="group"
                aria-label="{key.label}"
                style:top={style.top}
                style:left={style.left}
                style:width={style.width}
                style:height={style.height}
                style:transform-origin={style.transformOrigin}
                style:transform={style.transform}
                onmouseleave={handleIndexKeyLeave}
              >
                {#if bands.shift}
                  {@const shiftHit = bands.shift}
                  <button
                    type="button"
                    class="index-half shift"
                    class:active={activeKeyId === hitActiveId(shiftHit)}
                    aria-label="{key.label} shift chord"
                    aria-pressed={activeKeyId === hitActiveId(shiftHit)}
                    onclick={event => handleHitClick(event, shiftHit)}
                    onmouseenter={event => handleHalfEnter(shiftHit, event)}
                    onfocus={event => handleHalfFocus(shiftHit, event)}
                    onmouseleave={handleHalfLeave}
                    onblur={handleHalfLeave}
                  >
                    {@render bandPacks(bandFace(key, 'shift', split))}
                  </button>
                {/if}
                {#if bands.base}
                  {@const baseHit = bands.base}
                  <button
                    type="button"
                    class="index-half base"
                    class:active={activeKeyId === hitActiveId(baseHit)}
                    aria-label="{key.label} chord"
                    aria-pressed={activeKeyId === hitActiveId(baseHit)}
                    onclick={event => handleHitClick(event, baseHit)}
                    onmouseenter={event => handleHalfEnter(baseHit, event)}
                    onfocus={event => handleHalfFocus(baseHit, event)}
                    onmouseleave={handleHalfLeave}
                    onblur={handleHalfLeave}
                  >
                    {@render bandPacks(bandFace(key, 'base', split))}
                  </button>
                {/if}
                {#if hasMods}
                  <div class="index-mods" role="group" aria-label="{key.label} modifier chords">
                    {#each bands.mods ?? [] as modHit (comboIndexHitActiveId(modHit))}
                      <button
                        type="button"
                        class="index-mod"
                        class:active={activeKeyId === hitActiveId(modHit)}
                        aria-label="{modHit.label} chord"
                        aria-pressed={activeKeyId === hitActiveId(modHit)}
                        onclick={event => handleHitClick(event, modHit)}
                        onmouseenter={event => handleHalfEnter(modHit, event)}
                        onfocus={event => handleHalfFocus(modHit, event)}
                        onmouseleave={handleHalfLeave}
                        onblur={handleHalfLeave}
                      >
                        {modHit.label}
                      </button>
                    {/each}
                  </div>
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
            onclick={event => handleHitClick(event, item)}
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

{#snippet bandPacks(face: TypewriterIndexBandFace)}
  {#if face.packs.length > 0}
    {#each face.packs as pack, packIndex (packIndex)}
      <span class="pack" class:second={pack.tone === 'second'}>
        {#each pack.glyphs as glyph, glyphIndex (`${packIndex}-${glyphIndex}`)}
          <span
            class="glyph"
            class:alt={glyph.alt}
            class:empty={glyph.empty}
            class:dead={glyph.dead}
          >{glyph.text}</span>
        {/each}
      </span>
    {/each}
  {:else}
    {face.fallback}
  {/if}
{/snippet}

{#if decode}
  <LegendDecodeCard
    card={decode.card}
    anchor={decode.rect}
    tooltipId={`legend-decode-${DICTIONARY_DECODE_KEY}-0`}
    hostSession={inHostSession}
    modeHint={decodeModeHint}
    onArmCell={armHostCell}
    onEndSession={endHostEditSession}
  />
{/if}

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
    gap: 0.25em;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
    width: 100%;
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

  .glyph.empty {
    opacity: 0;
  }

  .index-half:hover .glyph.empty,
  .index-half:focus-visible .glyph.empty {
    opacity: 0.45;
  }

  .glyph.alt:not(.empty) {
    opacity: 0.7;
  }

  .glyph.dead {
    color: var(--warn-ink);
    background: var(--warn-wash);
    border-radius: 2px;
    box-shadow: inset 0 0 0 1px var(--warn-border);
    padding: 0 1px;
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

  .index-key.has-mods .index-half {
    flex: 1 1 0;
  }

  .index-mods {
    flex: 0 0 auto;
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 1px;
    padding: 1px 2px 2px;
    border-top: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  }

  .index-mod {
    margin: 0;
    padding: 0 3px;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: color-mix(in srgb, var(--text) 88%, transparent);
    font: 650 10px/1.2 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    cursor: pointer;
  }

  .index-mod:hover,
  .index-mod:focus-visible,
  .index-mod.active {
    background: color-mix(in srgb, var(--accent, #3a7) 22%, var(--surface-sunken, #222));
    color: var(--text);
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
