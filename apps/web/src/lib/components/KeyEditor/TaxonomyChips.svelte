<script lang="ts">
  import {
    taxonomyChipIsActive,
    type TaxonomyChip
  } from '@keymap-editor/keymap-core'

  interface Props {
    chips: TaxonomyChip[]
    activeContexts: string[]
    onChoose: (chipId: string) => void
  }

  let { chips, activeContexts, onChoose }: Props = $props()
</script>

<div class="key-editor-taxonomy" role="tablist" aria-label="Value group">
  {#each chips as chip (chip.id)}
    <button
      type="button"
      class="key-editor-chip"
      class:active={taxonomyChipIsActive(chip, activeContexts)}
      role="tab"
      aria-selected={taxonomyChipIsActive(chip, activeContexts)}
      onclick={() => onChoose(chip.id)}
    >
      {chip.label}
    </button>
  {/each}
</div>
