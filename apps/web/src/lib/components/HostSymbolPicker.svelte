<script module lang="ts">
  /** Survives catalog collapse and component remounts. */
  export const hostSymbolExpandedByLanguage = new Map<string, Record<string, boolean>>()
  export const hostSymbolScrollByLanguage = new Map<string, number>()

  export type HostSymbolPickerGeometry = {
    left: number
    top: number
    width: number
    height: number
  }

  /** Last user-placed box; reused on reopen. */
  export const hostSymbolPickerFrame: {
    geometry: HostSymbolPickerGeometry | null
  } = { geometry: null }

  const DEFAULT_WIDTH = 560
  const DEFAULT_HEIGHT = 420
  const MIN_WIDTH = 240
  const MIN_HEIGHT = 180
</script>

<script lang="ts">
  import {
    hostSymbolShelves,
    type HostLanguageId,
    type HostSymbolShelf,
    type HostSymbolShelfEntry
  } from '@keymap-editor/keymap-core'
  import { editor } from '../editor.svelte.js'

  interface Props {
    language: HostLanguageId
    /** Soft initial anchor (toggle button); ignored once geometry is saved. */
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
  let positioned = false
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
    const root = document.getElementById('modal-root') ?? document.body
    if (!el) return
    root.appendChild(el)
    const savedScroll = hostSymbolScrollByLanguage.get(language)
    if (bodyEl && savedScroll != null) bodyEl.scrollTop = savedScroll
    return () => {
      if (bodyEl) hostSymbolScrollByLanguage.set(language, bodyEl.scrollTop)
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
    const maxW = Math.max(MIN_WIDTH, window.innerWidth - 16)
    const maxH = Math.max(MIN_HEIGHT, window.innerHeight - 16)
    const w = Math.min(maxW, Math.max(MIN_WIDTH, width))
    const h = Math.min(maxH, Math.max(MIN_HEIGHT, height))
    const x = Math.max(8, Math.min(left, window.innerWidth - w - 8))
    const y = Math.max(8, Math.min(top, window.innerHeight - h - 8))
    return { left: x, top: y, width: w, height: h }
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
    const width = Math.min(DEFAULT_WIDTH, window.innerWidth - 16)
    const height = Math.min(DEFAULT_HEIGHT, window.innerHeight - 16)
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
    return entry.glyph ? `${entry.glyph} ${entry.keysym}` : entry.keysym
  }

  function entryValue(entry: HostSymbolShelfEntry): string {
    return entry.glyph || entry.keysym
  }

  function pick(entry: HostSymbolShelfEntry) {
    if (disabled) return
    const value = entryValue(entry)
    if (onPick) {
      onPick(value)
      return
    }
    void editor.pickHostSymbol(value)
  }
</script>

<div
  bind:this={el}
  class="host-symbol-picker"
  class:dragging
  role="dialog"
  aria-label="Host symbol catalog"
  aria-modal="true"
  tabindex="-1"
  style="position:fixed;left:8px;top:48px;z-index:45"
  onclick={event => event.stopPropagation()}
  onkeydown={event => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      editor.closeHostSymbolCatalog()
    }
  }}
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
  <div class="picker-body" bind:this={bodyEl}>
    {#if disabled}
      <p class="hint" role="status">Select a level cell on the decode card</p>
    {/if}
    {#each shelves as shelf (shelf.id)}
      <section class="shelf" data-shelf={shelf.id} data-open={isExpanded(shelf) ? 'true' : 'false'}>
        {#if shelf.open}
          <h2 class="shelf-title">{shelf.title}</h2>
          <div class="glyph-grid" role="group" aria-label={shelf.title}>
            {#each shelf.entries as entry (`${shelf.id}-${entry.keysym}`)}
              <button
                type="button"
                class="glyph"
                class:modifier={!entry.glyph}
                aria-label={entryLabel(entry)}
                disabled={disabled}
                onclick={() => pick(entry)}
              >
                {entry.glyph || entry.keysym}
              </button>
            {/each}
          </div>
        {:else}
          <button
            type="button"
            class="shelf-toggle"
            aria-expanded={isExpanded(shelf)}
            onclick={() => toggleShelf(shelf.id)}
          >
            {shelf.title}
          </button>
          {#if isExpanded(shelf)}
            <div class="glyph-grid" role="group" aria-label={shelf.title}>
              {#each shelf.entries as entry (`${shelf.id}-${entry.keysym}`)}
                <button
                  type="button"
                  class="glyph"
                  class:modifier={!entry.glyph}
                  aria-label={entryLabel(entry)}
                  disabled={disabled}
                  onclick={() => pick(entry)}
                >
                  {entry.glyph || entry.keysym}
                </button>
              {/each}
            </div>
          {/if}
        {/if}
      </section>
    {/each}
  </div>
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
    background: #f7f4ee;
    box-shadow:
      0 0 0 1px rgba(40, 36, 30, 0.14),
      0 12px 28px rgba(40, 36, 30, 0.22);
    color: #333;
    font-family: Quicksand, avenir, sans-serif;
    font-size: 12px;
    line-height: 1.2;
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
    border-bottom: 1px solid rgba(40, 36, 30, 0.1);
    background: rgba(40, 36, 30, 0.04);
    cursor: grab;
    touch-action: none;
  }

  .host-symbol-picker.dragging .picker-chrome {
    cursor: grabbing;
  }

  .picker-title {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: #5a554e;
  }

  .picker-hint {
    color: #9a948c;
    font-size: 12px;
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
    font-size: 11px;
    color: #6b6560;
  }

  .shelf {
    margin: 0 0 8px;
  }

  .shelf:last-child {
    margin-bottom: 0;
  }

  .shelf-title {
    margin: 0 0 4px;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.03em;
    color: #6b6560;
  }

  .shelf-toggle {
    display: block;
    width: 100%;
    margin: 0 0 4px;
    padding: 3px 6px;
    border: 0;
    border-radius: 4px;
    background: rgba(40, 36, 30, 0.06);
    color: #4a4540;
    font: inherit;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }

  .shelf-toggle:hover {
    background: rgba(40, 36, 30, 0.1);
  }

  .glyph-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 2px;
  }

  .glyph {
    min-width: 1.6em;
    min-height: 1.6em;
    margin: 0;
    padding: 2px 4px;
    border: 0;
    border-radius: 3px;
    background: #fff;
    color: #222;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
    line-height: 1.2;
    cursor: pointer;
  }

  .glyph:hover:not(:disabled) {
    background: #e8e2d6;
  }

  .glyph:disabled {
    opacity: 0.45;
    cursor: default;
  }

  .glyph.modifier {
    font-size: 10px;
    color: #5a554e;
  }
</style>
