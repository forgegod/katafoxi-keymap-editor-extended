<script lang="ts">
  import {
    hostSymbolPickValue,
    hostSymbolShelves,
    isUninkedHostGlyph,
    type HostLanguageId,
    type HostSymbolShelf,
    type HostSymbolShelfEntry
  } from '@keymap-editor/keymap-core'
  import { editor } from '../editor.svelte.js'
  import { pushEscapeHandler } from '../escape-stack'
  import GlyphShelf from './GlyphShelf.svelte'
  import {
    DEFAULT_PICKER_HEIGHT,
    DEFAULT_PICKER_WIDTH,
    clampPickerBox,
    hostSymbolExpandedByLanguage,
    hostSymbolPickerFrame,
    hostSymbolScrollByLanguage,
    placePickerClearOf,
    type HostSymbolPickerGeometry
  } from './host-symbol-geometry'

  interface Props {
    language: HostLanguageId
    /** Soft initial anchor; ignored once geometry is saved. */
    anchorEl?: HTMLElement | null
    /** Test override; product path uses `editor.pickHostSymbol`. */
    onPick?: (text: string) => void
    /** When true, glyph buttons stay visible but do not write. */
    disabled?: boolean
    element?: HTMLElement | null
  }

  let {
    language,
    anchorEl = null,
    onPick,
    disabled = false,
    element = $bindable(null)
  }: Props = $props()

  let el: HTMLDivElement | undefined = $state()
  let bodyEl: HTMLDivElement | undefined = $state()
  let expanded = $state<Record<string, boolean>>({})
  let positioned = $state(false)
  let dragging = $state(false)

  const shelves = $derived(hostSymbolShelves(language))

  $effect(() => {
    const saved = hostSymbolExpandedByLanguage.get(language)
    if (saved) {
      expanded = { ...saved }
      return
    }
    const next: Record<string, boolean> = {}
    for (const shelf of shelves) {
      next[shelf.id] = shelf.open
    }
    expanded = next
    hostSymbolExpandedByLanguage.set(language, next)
  })

  $effect(() => {
    element = el ?? null
  })

  $effect(() => {
    return pushEscapeHandler(() => {
      if (editor.hostEditSession) {
        editor.endHostEditSession()
        return
      }
      editor.closeHostSymbolCatalog()
    })
  })

  $effect(() => {
    const lang = language
    const root = document.getElementById('modal-root') ?? document.body
    if (!el) return
    root.appendChild(el)
    const savedScroll = hostSymbolScrollByLanguage.get(lang)
    if (bodyEl && savedScroll != null) bodyEl.scrollTop = savedScroll
    return () => {
      if (bodyEl) hostSymbolScrollByLanguage.set(lang, bodyEl.scrollTop)
      persistGeometry()
      el?.remove()
      positioned = false
    }
  })

  $effect(() => {
    if (!el || positioned) return
    void shelves
    applyInitialGeometry()
    positioned = true
  })

  $effect(() => {
    const session = editor.hostEditSession
    if (!session || !el) return
    const id = `legend-decode-${session.keyIndex}-${session.layer}`
    let frame = 0
    let attempts = 0
    let observer: ResizeObserver | undefined
    const nudge = () => {
      if (dragging || !el) return
      const card = document.getElementById(id)
      if (!card) return
      const obstacle = card.getBoundingClientRect()
      if (obstacle.width < 2 || obstacle.height < 2) return
      const box = el.getBoundingClientRect()
      const next = placePickerClearOf(
        { left: box.left, top: box.top, width: box.width, height: box.height },
        { left: obstacle.left, top: obstacle.top, width: obstacle.width, height: obstacle.height },
        { width: window.innerWidth, height: window.innerHeight }
      )
      const unchanged =
        Math.abs(next.left - box.left) < 0.5 &&
        Math.abs(next.top - box.top) < 0.5 &&
        Math.abs(next.width - box.width) < 0.5 &&
        Math.abs(next.height - box.height) < 0.5
      if (!unchanged) applyGeometry(next)
    }
    const tick = () => {
      const card = document.getElementById(id)
      const obstacle = card?.getBoundingClientRect()
      const pickerBox = el?.getBoundingClientRect()
      if (
        (!card || !obstacle || obstacle.width < 2 || !pickerBox || pickerBox.width < 2) &&
        attempts < 12
      ) {
        attempts += 1
        frame = requestAnimationFrame(tick)
        return
      }
      nudge()
      if (card && !observer) {
        observer = new ResizeObserver(() => nudge())
        observer.observe(card)
      }
    }
    frame = requestAnimationFrame(tick)
    const onResize = () => nudge()
    window.addEventListener('resize', onResize)
    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', onResize)
    }
  })

  $effect(() => {
    if (!el) return
    const node = el
    const observer = new ResizeObserver(() => {
      if (dragging) return
      persistGeometry()
    })
    observer.observe(node)
    return () => observer.disconnect()
  })

  function clampGeometry(
    left: number,
    top: number,
    width: number,
    height: number
  ): HostSymbolPickerGeometry {
    return clampPickerBox({ left, top, width, height }, {
      width: window.innerWidth,
      height: window.innerHeight
    })
  }

  function applyGeometry(geo: HostSymbolPickerGeometry) {
    if (!el) return
    const next = clampGeometry(geo.left, geo.top, geo.width, geo.height)
    el.style.left = `${next.left}px`
    el.style.top = `${next.top}px`
    el.style.width = `${next.width}px`
    el.style.height = `${next.height}px`
    hostSymbolPickerFrame.geometry = next
  }

  function persistGeometry() {
    if (!el) return
    const box = el.getBoundingClientRect()
    hostSymbolPickerFrame.geometry = clampGeometry(box.left, box.top, box.width, box.height)
  }

  function applyInitialGeometry() {
    if (!el) return
    if (hostSymbolPickerFrame.geometry) {
      applyGeometry(hostSymbolPickerFrame.geometry)
      return
    }
    const anchor = anchorEl?.getBoundingClientRect()
    const width = Math.min(DEFAULT_PICKER_WIDTH, window.innerWidth - 16)
    const height = Math.min(DEFAULT_PICKER_HEIGHT, window.innerHeight - 16)
    let left = anchor ? anchor.right - width : 8
    let top = anchor ? anchor.bottom + 6 : 48
    if (top + height > window.innerHeight - 8) {
      top = Math.max(8, (anchor?.top ?? 48) - height - 6)
    }
    applyGeometry({ left, top, width, height })
  }

  function onDragPointerDown(event: PointerEvent) {
    if (event.button !== 0 || !el) return
    const handle = event.currentTarget
    if (!(handle instanceof HTMLElement)) return
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startY = event.clientY
    const box = el.getBoundingClientRect()
    const originLeft = box.left
    const originTop = box.top
    dragging = true
    handle.setPointerCapture(event.pointerId)

    const onMove = (move: PointerEvent) => {
      applyGeometry({
        left: originLeft + (move.clientX - startX),
        top: originTop + (move.clientY - startY),
        width: box.width,
        height: box.height
      })
    }
    const onUp = (up: PointerEvent) => {
      dragging = false
      handle.releasePointerCapture(up.pointerId)
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      handle.removeEventListener('pointercancel', onUp)
      persistGeometry()
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
    handle.addEventListener('pointercancel', onUp)
  }

  function isExpanded(shelf: HostSymbolShelf): boolean {
    return expanded[shelf.id] ?? shelf.open
  }

  function toggleShelf(id: string) {
    const next = { ...expanded, [id]: !expanded[id] }
    expanded = next
    hostSymbolExpandedByLanguage.set(language, next)
  }

  function entryLabel(entry: HostSymbolShelfEntry): string {
    if (entry.dead) return `Dead key ${entry.glyph} ${entry.keysym}`
    return entry.glyph ? `${entry.glyph} ${entry.keysym}` : entry.keysym
  }

  let loupe = $state<{
    glyph: string
    keysym: string
    x: number
    y: number
    above: boolean
  } | null>(null)

  function showLoupe(event: Event, entry: HostSymbolShelfEntry) {
    if (!entry.glyph || (!entry.dead && isUninkedHostGlyph(entry.glyph))) {
      loupe = null
      return
    }
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const above = rect.top > 96
    loupe = {
      glyph: entry.glyph,
      keysym: entry.keysym,
      x: rect.left + rect.width / 2,
      y: above ? rect.top - 6 : rect.bottom + 6,
      above
    }
  }

  function hideLoupe() {
    loupe = null
  }

  function pick(entry: HostSymbolShelfEntry) {
    if (disabled) return
    const value = hostSymbolPickValue(entry)
    if (onPick) {
      onPick(value)
      return
    }
    void editor.pickHostSymbol(value)
  }

  function clearSlot() {
    if (disabled) return
    if (onPick) {
      onPick('NoSymbol')
      return
    }
    void editor.pickHostSymbol('NoSymbol')
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div
  bind:this={el}
  class="host-symbol-picker"
  class:dragging
  class:ready={positioned}
  role="dialog"
  aria-label="Host symbol catalog"
  aria-modal="true"
  tabindex="-1"
  style="position:fixed;left:8px;top:48px;z-index:var(--z-picker)"
  onclick={event => event.stopPropagation()}
>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="picker-chrome"
    role="presentation"
    onpointerdown={onDragPointerDown}
  >
    <span class="picker-title">Symbols</span>
    <span class="picker-hint" aria-hidden="true">⠿</span>
  </div>
  <div class="picker-body" bind:this={bodyEl} onscroll={hideLoupe}>
    {#if disabled}
      <p class="hint" role="status">Select a level cell on the decode card</p>
    {:else}
      <div class="clear-row">
        <button
          type="button"
          class="clear-slot"
          aria-label="Clear level"
          title="Clear this level"
          onclick={clearSlot}
        >
          Clear
        </button>
        <p class="nav-hint" role="note">
          <kbd>Tab</kbd> next level · <kbd>Shift</kbd>+<kbd>Tab</kbd> previous
        </p>
      </div>
    {/if}
    {#each shelves as shelf (shelf.id)}
      <GlyphShelf
        {shelf}
        expanded={isExpanded(shelf)}
        {disabled}
        {entryLabel}
        onToggle={() => toggleShelf(shelf.id)}
        onPick={pick}
        onShowLoupe={showLoupe}
        onHideLoupe={hideLoupe}
      />
    {/each}
  </div>
  {#if loupe}
    <div
      class="loupe"
      class:below={!loupe.above}
      style="left:{loupe.x}px;top:{loupe.y}px"
      aria-hidden="true"
    >
      <span class="loupe-glyph">{loupe.glyph}</span>
      <span class="loupe-name">{loupe.keysym}</span>
    </div>
  {/if}
</div>

<style>
  .host-symbol-picker {
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    min-width: 240px;
    min-height: 180px;
    overflow: hidden;
    resize: both;
    padding: 0;
    border-radius: 8px;
    background: var(--paper);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--paper-shade) 14%, transparent),
      0 12px 28px color-mix(in srgb, var(--paper-shade) 22%, transparent);
    color: var(--text);
    font-family: Quicksand, avenir, sans-serif;
    font-size: var(--font-sm);
    line-height: 1.2;
    /* Default left/top flash until applyInitialGeometry runs. */
    visibility: hidden;
  }

  .host-symbol-picker.ready {
    visibility: visible;
  }

  .host-symbol-picker.dragging {
    user-select: none;
    cursor: grabbing;
  }

  .picker-chrome {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 10px;
    border-bottom: 1px solid color-mix(in srgb, var(--paper-shade) 10%, transparent);
    background: color-mix(in srgb, var(--paper-shade) 4%, transparent);
    cursor: grab;
    touch-action: none;
  }

  .host-symbol-picker.dragging .picker-chrome {
    cursor: grabbing;
  }

  .picker-title {
    font-size: var(--font-xs);
    font-weight: 700;
    letter-spacing: 0.04em;
    color: var(--paper-ink);
  }

  .picker-hint {
    color: var(--paper-ink-faint);
    font-size: var(--font-sm);
    line-height: 1;
  }

  .picker-body {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    padding: 8px 9px 10px;
  }

  .hint {
    margin: 0 0 8px;
    font-size: var(--font-xs);
    color: var(--paper-ink-muted);
  }

  .clear-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
    margin: 0 0 8px;
  }

  .clear-slot {
    margin: 0;
    padding: 3px 8px;
    border: 0;
    border-radius: 4px;
    background: color-mix(in srgb, var(--paper-shade) 8%, transparent);
    color: var(--paper-ink-strong);
    font: inherit;
    font-size: var(--font-xs);
    font-weight: 600;
    cursor: pointer;
  }

  .clear-slot:hover {
    background: color-mix(in srgb, var(--paper-shade) 14%, transparent);
  }

  .nav-hint {
    margin: 0;
    font-size: var(--font-xs);
    line-height: 1.3;
    color: var(--paper-ink-muted);
  }

  .nav-hint kbd {
    padding: 0 3px;
    border-radius: 3px;
    background: color-mix(in srgb, var(--paper-shade) 10%, transparent);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 0.95em;
    font-weight: 600;
  }

  .loupe {
    position: fixed;
    z-index: var(--z-tour);
    transform: translate(-50%, -100%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 4.5em;
    padding: 8px 12px 6px;
    border-radius: 8px;
    background: var(--surface);
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--paper-shade) 14%, transparent),
      0 8px 20px color-mix(in srgb, var(--paper-shade) 20%, transparent);
    pointer-events: none;
  }

  .loupe.below {
    transform: translate(-50%, 0);
  }

  .loupe-glyph {
    font-family: var(--glyph-font, Inter, "Noto Sans", sans-serif);
    font-size: 42px;
    line-height: 1;
    color: var(--text);
  }

  .loupe-name {
    max-width: 12em;
    font-size: var(--font-xs);
    line-height: 1.2;
    color: var(--paper-ink-muted);
    text-align: center;
  }
</style>
