<script lang="ts">
  import {
    bandCatalogChoices,
    type CatalogChoice,
    type ChoiceGroup
  } from '@keymap-editor/keymap-core'
  import ValueBand from './ValueBand.svelte'

  interface Choice extends CatalogChoice {
    faIcon?: string
  }

  interface Props {
    groups: ChoiceGroup[]
    showGroupTitles: boolean
    searching: boolean
    pickKeyHint: boolean
    activeValue?: string | number
    dimUsed: boolean
    used: ReadonlyMap<string, readonly number[]>
    usedLayerLabels?: readonly string[]
    labelChoice: (choice: CatalogChoice) => string
    onChoose: (choice: Choice) => void
  }

  let {
    groups,
    showGroupTitles,
    searching,
    pickKeyHint,
    activeValue,
    dimUsed,
    used,
    usedLayerLabels = [],
    labelChoice,
    onChoose
  }: Props = $props()

  let valuesEl: HTMLDivElement | undefined = $state()
  let valuesWidth = $state(1045)
  let codesExpanded = $state(false)
  let shiftedExpanded = $state(false)
  let moreFKeysExpanded = $state(false)

  $effect(() => {
    if (!valuesEl) return
    const node = valuesEl
    const sync = () => {
      valuesWidth = node.clientWidth
    }
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(node)
    return () => observer.disconnect()
  })
</script>

<div class="key-editor-values" bind:this={valuesEl}>
  {#if pickKeyHint}
    <p class="key-editor-empty">Pick a key to finish the combo.</p>
  {/if}
  {#if groups.length === 0 || groups.every(group => group.items.length === 0)}
    <p class="key-editor-empty">No matching values.</p>
  {:else}
    {#each groups as group (group.context)}
      {@const bands = bandCatalogChoices(group.items)}
      <div class="key-editor-group">
        {#if showGroupTitles || searching}
          <h3>{group.context}</h3>
        {/if}
        {#each bands as band, bandIndex}
          <ValueBand
            {band}
            prevBand={bandIndex > 0 ? bands[bandIndex - 1] : undefined}
            nextBand={bands[bandIndex + 1]}
            context={group.context}
            {searching}
            {activeValue}
            {dimUsed}
            {used}
            {usedLayerLabels}
            {labelChoice}
            {onChoose}
            {valuesWidth}
            bind:codesExpanded
            bind:shiftedExpanded
            bind:moreFKeysExpanded
          />
        {/each}
      </div>
    {/each}
  {/if}
</div>
