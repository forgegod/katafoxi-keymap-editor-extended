<script lang="ts">
  import type { CatalogChoice, ZmkHoldTap } from '@keymap-editor/keymap-core'
  import { untrack } from 'svelte'
  import { setSearchContext, type SearchBox } from '../../context'
  import type { EditorSlot } from '../../key-editor'
  import KeyEditor from './KeyEditor.svelte'

  interface Choice extends CatalogChoice {
    commands?: CatalogChoice[]
  }

  export interface EditorScene {
    bindingLabel: string
    behaviours: Choice[]
    editorSlots: EditorSlot[]
    activeCodeIndex: number
    choices: Choice[]
    onSelectBehaviour: (choice: Choice) => void
    onSelectValue: (choice: Choice) => void
    onActivateSlot: (codeIndex: number) => void
    onConfirm: () => void
    onCancel: () => void
    holdTaps?: ZmkHoldTap[]
    onChangeHoldTaps?: (next: ZmkHoldTap[]) => void
  }

  interface Props {
    search: SearchBox
    scene: EditorScene
  }

  let { search, scene }: Props = $props()

  setSearchContext({
    get current() {
      return search.current
    }
  })

  let bindingLabel = $state(untrack(() => scene.bindingLabel))
  let behaviours = $state(untrack(() => scene.behaviours))
  let editorSlots = $state(untrack(() => scene.editorSlots))
  let activeCodeIndex = $state(untrack(() => scene.activeCodeIndex))
  let choices = $state(untrack(() => scene.choices))
  let onSelectBehaviour = $state(untrack(() => scene.onSelectBehaviour))
  let onSelectValue = $state(untrack(() => scene.onSelectValue))
  let onActivateSlot = $state(untrack(() => scene.onActivateSlot))
  let onConfirm = $state(untrack(() => scene.onConfirm))
  let onCancel = $state(untrack(() => scene.onCancel))
  let holdTaps = $state(untrack(() => scene.holdTaps))
  let onChangeHoldTaps = $state(untrack(() => scene.onChangeHoldTaps))

  export function show(next: EditorScene) {
    bindingLabel = next.bindingLabel
    behaviours = next.behaviours
    editorSlots = next.editorSlots
    activeCodeIndex = next.activeCodeIndex
    choices = next.choices
    onSelectBehaviour = next.onSelectBehaviour
    onSelectValue = next.onSelectValue
    onActivateSlot = next.onActivateSlot
    onConfirm = next.onConfirm
    onCancel = next.onCancel
    holdTaps = next.holdTaps
    onChangeHoldTaps = next.onChangeHoldTaps
  }
</script>

<KeyEditor
  {bindingLabel}
  {behaviours}
  {editorSlots}
  {activeCodeIndex}
  {choices}
  {onSelectBehaviour}
  {onSelectValue}
  {onActivateSlot}
  {onConfirm}
  {onCancel}
  {holdTaps}
  {onChangeHoldTaps}
  onToggleHold={() => {}}
/>
