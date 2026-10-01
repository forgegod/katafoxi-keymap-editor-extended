<script lang="ts">
  import {
    taxonomyChipIsActive,
    type TaxonomyChip
  } from '@keymap-editor/keymap-core'
  import SelectChip from '../Common/SelectChip.svelte'

  interface Props {
    chips: TaxonomyChip[]
    activeContexts: string[]
    onChoose: (chipId: string) => void
  }

  let { chips, activeContexts, onChoose }: Props = $props()
</script>

<div class="key-editor-taxonomy" role="tablist" aria-label="Value group">
  {#each chips as chip (chip.id)}
    <SelectChip
      active={taxonomyChipIsActive(chip, activeContexts)}
      role="tab"
      aria-selected={taxonomyChipIsActive(chip, activeContexts)}
      onclick={() => onChoose(chip.id)}
    >
      {chip.label}
    </SelectChip>
  {/each}
</div>
