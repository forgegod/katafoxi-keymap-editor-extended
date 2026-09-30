<script lang="ts">
  import {
    hostLanguageName,
    hostLayout,
    keypadCoveredGlyphs,
    missingBasicGlyphs
  } from '@keymap-editor/keymap-core'
  import { editor } from '../editor.svelte.js'
  import { isUserHostLayoutId } from '../host-layout-store.js'

  const covered = $derived(keypadCoveredGlyphs(editor.draftKeymap))

  const lines = $derived.by(() => {
    // The layout id stays put when a glyph changes; the registry swap is this counter.
    void editor.hostLayoutRevision
    const next: { language: string; name: string; glyphs: string }[] = []
    for (const column of editor.hostLegend.columns) {
      if (!isUserHostLayoutId(column.layoutId)) continue
      const layout = hostLayout(column.layoutId)
      if (!layout) continue
      const missing = missingBasicGlyphs(layout, column.language, covered)
      if (missing.length === 0) continue
      next.push({
        language: column.language,
        name: hostLanguageName(column.language),
        glyphs: missing.join(' ')
      })
    }
    return next
  })
</script>

{#if lines.length > 0}
  <div
    class="host-gaps"
    aria-label="Missing basic symbols"
    title="Basic letters, digits, and punctuation missing from this layout. A keypad key counts as present."
  >
    <p class="host-gaps-title">Missing</p>
    {#each lines as line (line.language)}
      <p class="gap-line">
        <span class="gap-lang">{line.name}</span>
        <span class="gap-glyphs">{line.glyphs}</span>
      </p>
    {/each}
  </div>
{/if}

<style>
  .host-gaps {
    align-self: flex-start;
    max-width: 18rem;
    margin-left: auto;
    padding: 2px 2px 0 8px;
    color: var(--warn-ink);
    font-size: 12px;
    line-height: 1.35;
  }

  .host-gaps-title {
    margin: 0 0 2px;
    color: var(--text-subtle);
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .gap-line {
    margin: 0;
  }

  .gap-lang {
    color: var(--text-muted);
  }

  .gap-glyphs {
    font-family: var(--glyph-font, Inter, "Noto Sans", sans-serif);
    font-weight: 600;
  }
</style>
