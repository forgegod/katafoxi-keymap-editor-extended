<script lang="ts">
  import {
    getBehaviorCatalog,
    getKeycodeCatalog,
    layerLegendSymbol
  } from '@keymap-editor/keymap-core'
  import { setSearchContext } from '../context'
  import { buildSearchContext } from '../search-context'
  import type { EditorSlot } from '../key-editor'
  import KeyEditorHost from './KeyEditorHost.svelte'

  interface Props {
    onCancel: () => void
  }

  let { onCancel }: Props = $props()

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

  setSearchContext({
    get current() {
      return search
    },
    set current(_value) {}
  })

  const editorSlots: EditorSlot[] = [
    { codeIndex: 0, param: 'behaviour', value: '&kp', label: 'Behaviour' },
    { codeIndex: 1, param: 'code', value: 'A', label: 'Key' }
  ]
</script>

<KeyEditorHost
  open={true}
  bindingLabel="&kp A"
  behaviours={[]}
  {editorSlots}
  activeCodeIndex={1}
  choices={[]}
  onSelectBehaviour={() => {}}
  onSelectValue={() => {}}
  onActivateSlot={() => {}}
  onConfirm={() => {}}
  {onCancel}
/>
