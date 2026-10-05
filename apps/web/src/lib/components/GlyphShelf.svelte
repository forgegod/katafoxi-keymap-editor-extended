<script lang="ts">
  import type { HostSymbolShelf, HostSymbolShelfEntry } from '@keymap-editor/keymap-core'

  interface Props {
    shelf: HostSymbolShelf
    expanded: boolean
    disabled?: boolean
    entryLabel: (entry: HostSymbolShelfEntry) => string
    onToggle: () => void
    onPick: (entry: HostSymbolShelfEntry) => void
    onShowLoupe: (event: Event, entry: HostSymbolShelfEntry) => void
    onHideLoupe: () => void
  }

  let {
    shelf,
    expanded,
    disabled = false,
    entryLabel,
    onToggle,
    onPick,
    onShowLoupe,
    onHideLoupe
  }: Props = $props()
</script>

<section class="shelf" data-shelf={shelf.id} data-open={expanded ? 'true' : 'false'}>
  {#if shelf.open}
    <h2 class="shelf-title">{shelf.title}</h2>
    <div class="glyph-grid" role="group" aria-label={shelf.title}>
      {#each shelf.entries as entry (`${shelf.id}-${entry.keysym}`)}
        <button
          type="button"
          class="glyph"
          class:modifier={!entry.glyph && !entry.dead}
          class:dead={entry.dead}
          class:idle={disabled}
          {disabled}
          aria-label={entryLabel(entry)}
          onmouseover={event => onShowLoupe(event, entry)}
          onmouseout={onHideLoupe}
          onfocus={event => onShowLoupe(event, entry)}
          onblur={onHideLoupe}
          onclick={() => onPick(entry)}
        >
          {entry.glyph || entry.keysym}
        </button>
      {/each}
    </div>
  {:else}
    <button
      type="button"
      class="shelf-toggle"
      aria-expanded={expanded}
      onclick={onToggle}
    >
      {shelf.title}
    </button>
    {#if expanded}
      <div class="glyph-grid" role="group" aria-label={shelf.title}>
        {#each shelf.entries as entry (`${shelf.id}-${entry.keysym}`)}
          <button
            type="button"
            class="glyph"
            class:modifier={!entry.glyph && !entry.dead}
            class:dead={entry.dead}
            class:idle={disabled}
            {disabled}
            aria-label={entryLabel(entry)}
            onmouseover={event => onShowLoupe(event, entry)}
            onmouseout={onHideLoupe}
            onfocus={event => onShowLoupe(event, entry)}
            onblur={onHideLoupe}
            onclick={() => onPick(entry)}
          >
            {entry.glyph || entry.keysym}
          </button>
        {/each}
      </div>
    {/if}
  {/if}
</section>

<style>
  .shelf {
    margin: 0 0 8px;
  }

  .shelf:last-child {
    margin-bottom: 0;
  }

  .shelf-title {
    margin: 0 0 4px;
    font-size: var(--font-xs);
    font-weight: 700;
    letter-spacing: 0.03em;
    color: var(--paper-ink-muted);
  }

  .shelf-toggle {
    display: block;
    width: 100%;
    margin: 0 0 4px;
    padding: 3px 6px;
    border: 0;
    border-radius: 4px;
    background: color-mix(in srgb, var(--paper-shade) 6%, transparent);
    color: var(--paper-ink-strong);
    font: inherit;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }

  .shelf-toggle:hover {
    background: color-mix(in srgb, var(--paper-shade) 10%, transparent);
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
    background: var(--surface);
    color: var(--text);
    font-family: var(--glyph-font, Inter, 'Noto Sans', sans-serif);
    font-size: 13px;
    line-height: 1.2;
    cursor: pointer;
  }

  .glyph:hover {
    background: var(--paper-deep);
  }

  .glyph.idle {
    color: var(--paper-ink-muted);
  }

  .glyph.idle:hover {
    background: var(--surface);
  }

  .glyph.modifier {
    font-size: 10px;
    color: var(--paper-ink);
  }

  .glyph.dead {
    color: var(--warn-ink);
    background: var(--warn-wash);
    box-shadow: inset 0 0 0 1px var(--warn-border);
  }

  .glyph.dead:hover {
    background: color-mix(in srgb, var(--warn-wash) 70%, var(--paper-deep));
  }
</style>
