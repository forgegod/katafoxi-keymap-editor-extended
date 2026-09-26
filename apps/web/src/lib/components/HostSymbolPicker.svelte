<script lang="ts">
  import {
    hostSymbolShelves,
    type HostLanguageId,
    type HostSymbolShelf,
    type HostSymbolShelfEntry
  } from '@keymap-editor/keymap-core'

  interface Props {
    language: HostLanguageId
    anchor: DOMRect
    onPick: (text: string) => void
    onClose: () => void
    element?: HTMLElement | null
  }

  let { language, anchor, onPick, onClose, element = $bindable(null) }: Props = $props()

  let el: HTMLDivElement | undefined = $state()
  let expanded = $state<Record<string, boolean>>({})

  const shelves = $derived(hostSymbolShelves(language))

  $effect(() => {
    const next: Record<string, boolean> = {}
    for (const shelf of shelves) {
      next[shelf.id] = shelf.open
    }
    expanded = next
  })

  $effect(() => {
    element = el ?? null
  })

  $effect(() => {
    const root = document.getElementById('modal-root') ?? document.body
    if (!el) return
    root.appendChild(el)
    return () => el?.remove()
  })

  $effect(() => {
    if (!el) return
    void shelves
    void anchor
    const box = el.getBoundingClientRect()
    let left = anchor.left
    left = Math.max(8, Math.min(left, window.innerWidth - box.width - 8))
    let top = anchor.bottom + 6
    if (top + box.height > window.innerHeight - 8) {
      top = Math.max(8, anchor.top - box.height - 6)
    }
    el.style.left = `${left}px`
    el.style.top = `${top}px`
  })

  function isExpanded(shelf: HostSymbolShelf): boolean {
    return expanded[shelf.id] ?? shelf.open
  }

  function toggleShelf(id: string) {
    expanded = { ...expanded, [id]: !expanded[id] }
  }

  function entryLabel(entry: HostSymbolShelfEntry): string {
    return entry.glyph ? `${entry.glyph} ${entry.keysym}` : entry.keysym
  }

  function entryValue(entry: HostSymbolShelfEntry): string {
    return entry.glyph || entry.keysym
  }

  function pick(entry: HostSymbolShelfEntry) {
    onPick(entryValue(entry))
  }
</script>

<div
  bind:this={el}
  class="host-symbol-picker"
  role="dialog"
  aria-label="Host symbol catalog"
  aria-modal="true"
  tabindex="-1"
  style="position:fixed;left:{anchor.left}px;top:{anchor.bottom}px;z-index:45"
  onclick={event => event.stopPropagation()}
  onkeydown={event => {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onClose()
    }
  }}
>
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

<style>
  .host-symbol-picker {
    box-sizing: border-box;
    width: min(28em, calc(100vw - 16px));
    max-height: min(22em, calc(100vh - 16px));
    overflow: auto;
    padding: 8px 9px 10px;
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

  .glyph:hover {
    background: #e8e2d6;
  }

  .glyph.modifier {
    font-size: 10px;
    color: #5a554e;
  }
</style>
