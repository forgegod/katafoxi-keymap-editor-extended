<script lang="ts">
  import {
    catalogChoiceTooltip,
    isInstantBehavior,
    zmkBehaviorDocsUrl,
    type CatalogChoice
  } from '@keymap-editor/keymap-core'
  import SelectChip from '../Common/SelectChip.svelte'

  interface Props {
    behaviours: CatalogChoice[]
    activeCode?: string | number
    onChoose: (choice: CatalogChoice) => void
  }

  let { behaviours, activeCode, onChoose }: Props = $props()

  const parameterized = $derived(behaviours.filter(b => !isInstantBehavior(b)))
  const instant = $derived(behaviours.filter(b => isInstantBehavior(b)))

  function behaviourTooltip(choice: CatalogChoice): string {
    const base = catalogChoiceTooltip({
      ...choice,
      description: choice.description || choice.name
    })
    const instantNote = isInstantBehavior(choice) ? 'Applies immediately.' : ''
    const docs = zmkBehaviorDocsUrl(choice.code) ? 'Ctrl+click: docs' : ''
    return [base, instantNote, docs].filter(Boolean).join('\n')
  }

  function handleBehaviourClick(event: MouseEvent, choice: CatalogChoice) {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      const url = zmkBehaviorDocsUrl(choice.code)
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
      return
    }
    onChoose(choice)
  }
</script>

{#snippet chip(behaviour: CatalogChoice)}
  <SelectChip
    active={String(behaviour.code) === String(activeCode ?? '')}
    instant={isInstantBehavior(behaviour)}
    title={behaviourTooltip(behaviour)}
    onclick={event => handleBehaviourClick(event, behaviour)}
  >
    {behaviour.code}
  </SelectChip>
{/snippet}

<section class="key-editor-row">
  <p class="key-editor-section-label">Behaviour</p>
  <div class="key-editor-behaviour-groups">
    {#if parameterized.length}
      <div
        class="key-editor-chips"
        data-behaviour-group="params"
        role="group"
        aria-label="Behaviours that take a value"
      >
        {#each parameterized as behaviour (String(behaviour.code))}
          {@render chip(behaviour)}
        {/each}
      </div>
    {/if}
    {#if instant.length}
      <div
        class="key-editor-chips"
        data-behaviour-group="instant"
        role="group"
        aria-label="Instant behaviours — dashed chips apply immediately"
      >
        <span
          class="key-editor-chip-note"
          title="Dashed chips apply as soon as you pick them — no value to choose."
        >
          Instant
        </span>
        {#each instant as behaviour (String(behaviour.code))}
          {@render chip(behaviour)}
        {/each}
      </div>
    {/if}
  </div>
</section>
