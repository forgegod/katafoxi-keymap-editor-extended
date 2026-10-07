<script lang="ts">
  import type { CatalogChoice } from '@keymap-editor/keymap-core'
  import { editor } from '../editor.svelte.js'
  import type { EditorSlot } from '../key-editor'
  import Modal from './Common/Modal.svelte'
  import KeyEditor from './KeyEditor/KeyEditor.svelte'

  interface Choice extends CatalogChoice {
    faIcon?: string
  }

  interface Props {
    open: boolean
    bindingLabel: string
    behaviours: Choice[]
    editorSlots: EditorSlot[]
    activeCodeIndex: number
    choices: Choice[]
    usedKeycodes?: ReadonlyMap<string, readonly number[]>
    usedRevision?: string
    usedLayerLabels?: readonly string[]
    variant?: 'key' | 'encoder'
    onSelectBehaviour: (choice: Choice) => void
    onSelectValue: (choice: Choice) => void
    onToggleHold?: (wrapCode: string) => void
    onActivateSlot: (codeIndex: number) => void
    /** Runs after any staged hold-tap nodes are armed for the next keymap update. */
    onConfirm: () => void
    onCancel: () => void
  }

  let {
    open,
    bindingLabel,
    behaviours,
    editorSlots,
    activeCodeIndex,
    choices,
    usedKeycodes,
    usedRevision,
    usedLayerLabels,
    variant = 'key',
    onSelectBehaviour,
    onSelectValue,
    onToggleHold,
    onActivateSlot,
    onConfirm,
    onCancel
  }: Props = $props()

  const encoderEdit = $derived(variant === 'encoder')
</script>

{#if open}
  <Modal onBackdrop={onCancel} ariaLabel={encoderEdit ? 'Edit encoder' : 'Edit key'}>
    <KeyEditor
      {bindingLabel}
      {behaviours}
      {editorSlots}
      {activeCodeIndex}
      {choices}
      {usedKeycodes}
      {usedRevision}
      {usedLayerLabels}
      {variant}
      {onSelectBehaviour}
      {onSelectValue}
      onToggleHold={encoderEdit ? undefined : onToggleHold}
      {onActivateSlot}
      onConfirm={staged => {
        if (staged?.length) editor.armHoldTapsForNextUpdate(staged)
        onConfirm()
      }}
      onCancel={onCancel}
      holdTaps={
        encoderEdit
          ? undefined
          : (editor.draftKeymap?.holdTaps ?? editor.baselineKeymap?.holdTaps)
      }
      onChangeHoldTaps={
        encoderEdit ? undefined : next => editor.updateHoldTaps(next)
      }
    />
  </Modal>
{/if}
