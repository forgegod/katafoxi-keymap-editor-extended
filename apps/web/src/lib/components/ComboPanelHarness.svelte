<script lang="ts">
  import {
    collectUsedKeycodes,
    getBehaviorCatalog,
    getKeycodeCatalog,
    layerLegendSymbol,
    usedKeycodesRevision
  } from '@keymap-editor/keymap-core'
  import { editor } from '../editor.svelte.js'
  import { setDefinitionsContext, setSearchContext } from '../context'
  import { buildSearchContext } from '../search-context'
  import ComboPanel from './ComboPanel.svelte'

  const usedKeycodes = $derived(
    collectUsedKeycodes(
      editor.draftKeymap?.layers ?? [],
      editor.draftKeymap?.combos
    )
  )
  const usedRevision = $derived(usedKeycodesRevision(usedKeycodes))
  const usedLayerLabels = $derived(
    (editor.draftKeymap?.layer_names ?? []).map((_, index) =>
      layerLegendSymbol(index)
    )
  )

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

<ComboPanel {usedKeycodes} {usedRevision} {usedLayerLabels} />
