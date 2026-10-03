<script lang="ts">
  import {
    getBehaviorCatalog,
    getKeycodeCatalog,
    layerLegendSymbol
  } from '@keymap-editor/keymap-core'
  import { editor } from '../editor.svelte.js'
  import { setDefinitionsContext, setSearchContext } from '../context'
  import { buildSearchContext } from '../search-context'
  import ComboPanel from './ComboPanel.svelte'

  const definitions = {
    keycodes: getKeycodeCatalog(),
    behaviours: getBehaviorCatalog()
  }
  const layers = [
    {
      code: 0,
      symbol: layerLegendSymbol(0),
      description: 'Layer 0'
    }
  ]
  const search = $derived.by(() => buildSearchContext(definitions, layers))

  setDefinitionsContext({
    get current() {
      return editor.definitions ?? definitions
    },
    set current(value) {
      editor.definitions = value
    }
  })
  setSearchContext({
    get current() {
      return search
    },
    set current(_value) {}
  })
</script>

<ComboPanel />
