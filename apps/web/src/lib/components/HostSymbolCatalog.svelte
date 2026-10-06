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
      if (event.key !== 'Tab' || !editor.hostSymbolEditTarget) return
      const focused = event.target
      if (focused instanceof Element && focused.closest('.host-symbol-picker')) return
      event.preventDefault()
      event.stopImmediatePropagation()
      editor.stepHostSymbolEdit(event.shiftKey ? -1 : 1)
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
