<script lang="ts">
  import { hostLegendColumns, type HostLanguageId } from '@keymap-editor/keymap-core'
  import { editor } from '../editor.svelte.js'
  import PressToggle from './Common/PressToggle.svelte'
  import HostSymbolPicker from './HostSymbolPicker.svelte'

  interface Props {
    /** Show the collapse/expand toggle (product chrome). Off in isolated key tests. */
    showToggle?: boolean
  }

  let { showToggle = true }: Props = $props()

  let toggleEl: HTMLButtonElement | undefined = $state()

  const open = $derived(editor.hostSymbolCatalogOpen)
  const target = $derived(editor.hostSymbolEditTarget)
  const language = $derived.by((): HostLanguageId => {
    if (target) return target.language
    const columns = hostLegendColumns(editor.hostLegend)
    return columns[0]?.language ?? 'en'
  })
  const disabled = $derived(!target)

  $effect(() => {
    if (!open) return
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      if (editor.hostEditSession) {
        // Instant writes already applied; Escape ends the whole host-edit session.
        editor.endHostEditSession()
        return
      }
      editor.closeHostSymbolCatalog()
    }
    window.addEventListener('keydown', onKeydown, true)
    return () => window.removeEventListener('keydown', onKeydown, true)
  })
</script>

{#if showToggle}
  <div class="catalog-chrome">
    <PressToggle
      bind:buttonEl={toggleEl}
      class="catalog-toggle"
      density="bar"
      pressed={open}
      aria-expanded={open}
      aria-controls={open ? 'host-symbol-catalog' : undefined}
      aria-label="Host symbol catalog"
      title="Insert a host-layout symbol"
      onclick={() => editor.toggleHostSymbolCatalog()}
    >
      <span class="catalog-glyph" aria-hidden="true">Ω</span>
      <span class="catalog-label">Symbols</span>
    </PressToggle>
    {#if open}
      <div id="host-symbol-catalog" class="catalog-float">
        <HostSymbolPicker language={language} anchorEl={toggleEl ?? null} disabled={disabled} />
      </div>
    {/if}
  </div>
{:else if open}
  <div id="host-symbol-catalog" class="catalog-float">
    <HostSymbolPicker language={language} anchorEl={toggleEl ?? null} disabled={disabled} />
  </div>
{/if}

<style>
  /* Opening the picker must not shift Ω along the language row. */
  .catalog-chrome {
    position: relative;
    flex-shrink: 0;
  }

  .catalog-float {
    position: absolute;
    width: 0;
    height: 0;
    overflow: visible;
  }

  .catalog-glyph {
    font-family: var(--glyph-font, Inter, "Noto Sans", sans-serif);
    font-size: var(--font-icon);
    font-weight: 500;
    line-height: 1;
  }

  .catalog-label {
    line-height: 1;
  }
</style>
