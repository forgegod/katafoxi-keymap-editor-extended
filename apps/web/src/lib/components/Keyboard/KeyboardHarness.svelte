<script lang="ts">
  import {
    getBehaviorCatalog,
    getKeycodeCatalog,
    type ParsedKeymap
  } from '@keymap-editor/keymap-core'
  import { untrack } from 'svelte'
  import { setDefinitionsContext } from '../../context'
  import { editor } from '../../editor.svelte.js'
  import HostLegendPicker from '../HostLegendPicker.svelte'
  import Keyboard from './Keyboard.svelte'

  interface Props {
    initialKeymap?: ParsedKeymap
  }

  let { initialKeymap }: Props = $props()

  const definitions = {
    keycodes: getKeycodeCatalog(),
    behaviours: getBehaviorCatalog()
  }

  setDefinitionsContext({
    get current() {
      return definitions
    }
  })

  const layout = [
    { x: 0, y: 0, row: 0, col: 0 },
    { x: 1, y: 0, row: 0, col: 1 }
  ]

  const preset = (): ParsedKeymap => ({
    layer_names: ['Base', 'Raise'],
    layers: [
      [
        { value: '&kp', params: [{ value: 'A', params: [] }] },
        { value: '&kp', params: [{ value: 'F4', params: [] }] }
      ],
      [
        { value: '&kp', params: [{ value: 'F4', params: [] }] },
        { value: '&kp', params: [{ value: 'F12', params: [] }] }
      ]
    ]
  })

  untrack(() => {
    editor.layout = layout
    editor.draftKeymap = JSON.parse(JSON.stringify(initialKeymap ?? preset())) as ParsedKeymap
  })

  export function getKeymap(): ParsedKeymap {
    const km = editor.draftKeymap
    if (!km) throw new Error('missing draft keymap')
    return km
  }

  export function getUpdateCount(): number {
    return editor.undoStack.length
  }

  function handleUpdate(next: ParsedKeymap) {
    editor.updateKeymap(next)
  }
</script>

{#if editor.draftKeymap}
  <HostLegendPicker />
  <Keyboard
    {layout}
    keymap={editor.draftKeymap}
    legendMode="composed"
    hostView={editor.hostLegend}
    onUpdate={handleUpdate}
  />
{/if}
