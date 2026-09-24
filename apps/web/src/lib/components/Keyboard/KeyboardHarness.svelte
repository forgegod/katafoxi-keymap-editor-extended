<script lang="ts">
  import {
    getBehaviorCatalog,
    getKeycodeCatalog,
    type ParsedKeymap
  } from '@keymap-editor/keymap-core'
  import { untrack } from 'svelte'
  import { setDefinitionsContext } from '../../context'
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

  let keymap = $state<ParsedKeymap>(
    untrack(() => JSON.parse(JSON.stringify(initialKeymap ?? preset())) as ParsedKeymap)
  )

  let updateCount = $state(0)

  export function getKeymap(): ParsedKeymap {
    return keymap
  }

  export function getUpdateCount(): number {
    return updateCount
  }

  function handleUpdate(next: ParsedKeymap) {
    updateCount += 1
    keymap = next
  }
</script>

<Keyboard {layout} {keymap} onUpdate={handleUpdate} />
