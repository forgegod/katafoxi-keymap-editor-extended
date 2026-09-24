<script lang="ts">
  import type { ChoiceGroup } from '@keymap-editor/keymap-core'

  interface Props {
    chips: ChoiceGroup[]
    activeContexts: string[]
    onSelect: (context: string) => void
  }

  let { chips, activeContexts, onSelect }: Props = $props()
</script>

<div class="key-editor-taxonomy" role="tablist" aria-label="Value group">
  {#each chips as group}
    <button
      type="button"
      class="key-editor-chip"
      class:active={activeContexts.includes(group.context)}
      role="tab"
      aria-selected={activeContexts.includes(group.context)}
      onclick={() => onSelect(group.context)}
    >
      {group.context}
    </button>
  {/each}
</div>
