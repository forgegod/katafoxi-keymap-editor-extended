<script lang="ts">
  import {
    DEMO_CATALOG,
    loadDemo,
    readStoredDemoId,
    writeStoredDemoId,
    type DemoCatalogEntry
  } from '../../../demo/catalog'
  import type { LayoutKey } from '@keymap-editor/keymap-core'
  import type { DemoKeyboardSelection } from '../../../editor/types'
  import LayoutThumb from './LayoutThumb.svelte'

  interface Props {
    onSelect: (event: DemoKeyboardSelection) => void
    /** Ask the source menu to switch to Clipboard. */
    onConnectClipboard?: () => void
    /** Ask the source menu to switch to GitHub. */
    onConnectGithub?: () => void
    showGithubCta?: boolean
  }

  let {
    onSelect,
    onConnectClipboard,
    onConnectGithub,
    showGithubCta = true
  }: Props = $props()

  let cards = $state<
    {
      entry: DemoCatalogEntry
      layout: LayoutKey[]
    }[]
  >([])

  let selectedId = $state(readStoredDemoId())
  let error = $state<string | null>(null)
  let loadedId = $state<string | null>(null)
  let emitGeneration = 0

  const selectedEntry = $derived(
    DEMO_CATALOG.find(entry => entry.id === selectedId) ?? DEMO_CATALOG[0]
  )

  async function emitDemo(id: string, userInitiated = false) {
    const generation = ++emitGeneration
    error = null
    try {
      const bundle = await loadDemo(id)
      if (generation !== emitGeneration) return
      const already = loadedId === id
      selectedId = id
      loadedId = id
      writeStoredDemoId(id)
      if (already && !userInitiated) return
      onSelect({
        source: 'demo',
        layout: bundle.layout,
        keymap: bundle.keymap,
        demo: { id: bundle.entry.id, name: bundle.entry.name },
        demoHost: bundle.hostSeeds,
        ...(userInitiated ? { userInitiated: true } : {})
      })
    } catch (err) {
      if (generation !== emitGeneration) return
      error = err instanceof Error ? err.message : 'Failed to load demo'
      console.error(err)
    }
  }

  $effect(() => {
    let cancelled = false
    void Promise.all(
      DEMO_CATALOG.map(async entry => {
        const bundle = await loadDemo(entry.id)
        return { entry, layout: bundle.layout }
      })
    ).then(next => {
      if (!cancelled) cards = next
    })
    return () => {
      cancelled = true
    }
  })

  function choose(id: string) {
    void emitDemo(id, true)
  }

  $effect(() => {
    emitDemo(selectedId)
  })
</script>

<div class="demo-picker">
  <p class="demo-hint">
    Explore the editor with a sample keyboard. Edits stay in this browser until you
    connect your own config.
  </p>

  <ul class="demo-list" role="listbox" aria-label="Demo keyboards">
    {#each cards as card (card.entry.id)}
      <li class="demo-item" role="none">
        <button
          type="button"
          class="demo-card"
          class:selected={card.entry.id === selectedId}
          role="option"
          aria-selected={card.entry.id === selectedId}
          onclick={() => choose(card.entry.id)}
        >
          <LayoutThumb
            layout={card.layout}
            label="{card.entry.name} layout"
          />
          <span class="demo-meta">
            <span class="demo-name">{card.entry.name}</span>
            <span class="demo-blurb">{card.entry.blurb}</span>
          </span>
        </button>
        <a
          class="demo-repo"
          href={card.entry.repoUrl}
          target="_blank"
          rel="noreferrer"
        >
          Hardware repo
        </a>
      </li>
    {/each}
  </ul>

  {#if error}
    <p class="demo-error" role="alert">{error}</p>
  {/if}

  {#if onConnectClipboard || (showGithubCta && onConnectGithub)}
    <div class="demo-cta">
      <p>
        Ready for your own keymap?
        {#if selectedEntry}
          You are on the {selectedEntry.name} demo.
        {/if}
      </p>
      <div class="cta-links">
        {#if onConnectClipboard}
          <button type="button" class="cta-link" onclick={() => onConnectClipboard()}>
            Paste .keymap
          </button>
        {/if}
        {#if showGithubCta && onConnectGithub}
          <button type="button" class="cta-link" onclick={() => onConnectGithub()}>
            Connect GitHub…
          </button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .demo-picker {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: min(34rem, calc(100vw - 48px));
    min-width: 20rem;
  }

  .demo-hint {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--font-sm, 0.85rem);
    line-height: 1.35;
  }

  .demo-list {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 6px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .demo-item {
    position: relative;
    min-width: 0;
  }

  .demo-card {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 4px;
    width: 100%;
    min-height: 0;
    margin: 0;
    padding: 6px 6px 1.4em;
    color: inherit;
    font: inherit;
    text-align: left;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 6px;
    cursor: pointer;
  }

  .demo-card:hover {
    border-color: var(--text-muted);
  }

  .demo-card.selected {
    border-color: var(--accent, #2a9d8f);
    box-shadow: inset 0 0 0 1px var(--accent, #2a9d8f);
  }

  .demo-card :global(.layout-thumb) {
    align-self: center;
  }

  .demo-meta {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 1px;
  }

  .demo-name {
    font-weight: 600;
    font-size: var(--font-sm, 0.85rem);
    line-height: 1.2;
  }

  .demo-blurb {
    display: -webkit-box;
    overflow: hidden;
    color: var(--text-muted);
    font-size: 0.75rem;
    line-height: 1.25;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 1;
    line-clamp: 1;
  }

  .demo-repo {
    position: absolute;
    left: 6px;
    bottom: 4px;
    z-index: 1;
    width: fit-content;
    color: var(--accent, #2a9d8f);
    font-size: 0.75rem;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .demo-error {
    margin: 0;
    color: var(--danger, #c0392b);
    font-size: var(--font-sm, 0.85rem);
  }

  .demo-cta {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px 10px;
    padding-top: 4px;
    border-top: 1px solid var(--border);
  }

  .demo-cta p {
    margin: 0;
    flex: 1 1 10rem;
    color: var(--text-muted);
    font-size: var(--font-sm, 0.85rem);
  }

  .cta-links {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 6px 12px;
  }

  .cta-link {
    margin: 0;
    padding: 0;
    color: var(--accent, #2a9d8f);
    font: inherit;
    font-size: var(--font-sm, 0.85rem);
    text-decoration: underline;
    text-underline-offset: 2px;
    background: none;
    border: none;
    cursor: pointer;
  }

  @media (max-width: 420px) {
    .demo-list {
      grid-template-columns: 1fr;
    }
  }
</style>
