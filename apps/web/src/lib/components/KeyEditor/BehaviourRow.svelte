<script lang="ts">
  import {
    catalogChoiceTooltip,
    isInstantBehavior,
    zmkBehaviorDocsUrl,
    type CatalogChoice
  } from '@keymap-editor/keymap-core'

  interface Props {
    behaviours: CatalogChoice[]
    activeCode?: string | number
    onChoose: (choice: CatalogChoice) => void
  }

  let { behaviours, activeCode, onChoose }: Props = $props()

  function behaviourTooltip(choice: CatalogChoice): string {
    const base = catalogChoiceTooltip({
      ...choice,
      description: choice.description || choice.name
    })
    const instant = isInstantBehavior(choice) ? 'Applies immediately.' : ''
    const docs = zmkBehaviorDocsUrl(choice.code) ? 'Ctrl+click: docs' : ''
    return [base, instant, docs].filter(Boolean).join('\n')
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

<section class="key-editor-row">
  <p class="key-editor-section-label">Behaviour</p>
  <div class="key-editor-chips">
    {#each behaviours as behaviour (String(behaviour.code))}
      <button
        type="button"
        class="key-editor-chip"
        class:active={String(behaviour.code) === String(activeCode ?? '')}
        class:instant={isInstantBehavior(behaviour)}
        title={behaviourTooltip(behaviour)}
        onclick={event => handleBehaviourClick(event, behaviour)}
      >
        {behaviour.code}
      </button>
    {/each}
  </div>
</section>
