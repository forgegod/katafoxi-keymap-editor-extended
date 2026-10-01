<script lang="ts">
  import { hostLegendColumns, type HostLanguageId } from '@keymap-editor/keymap-core'
  import { editor } from '../editor.svelte.js'
  import HostSymbolPicker from './HostSymbolPicker.svelte'

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

{#if open}
  <div id="host-symbol-catalog" class="catalog-float">
    <HostSymbolPicker {language} disabled={disabled} />
  </div>
{/if}

<style>
  .catalog-float {
    position: absolute;
    width: 0;
    height: 0;
    overflow: visible;
  }
</style>
