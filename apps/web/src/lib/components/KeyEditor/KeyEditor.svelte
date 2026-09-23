<script lang="ts">
  import fuzzysort from 'fuzzysort'
  import { onMount } from 'svelte'
  import {
    catalogChoiceTooltip,
    groupChoicesByContext,
    initialTaxonomyContexts,
    isInstantBehavior,
    nextTaxonomyContexts,
    representativeLabel,
    sortBehaviorsByRole,
    uniqueCatalogChoices,
    zmkBehaviorDocsUrl,
    type CatalogChoice
  } from '@keymap-editor/keymap-core'
  import { isKeycodeParam, type EditorSlot } from '../../key-editor'
  import Icon from '../Common/Icon.svelte'
  import './KeyEditor.css'

  interface Choice extends CatalogChoice {
    faIcon?: string
  }

  interface Props {
    bindingLabel: string
    behaviours: Choice[]
    slots: EditorSlot[]
    activeCodeIndex: number
    choices: Choice[]
    usedKeycodes?: Iterable<string>
    onSelectBehaviour: (choice: Choice) => void
    onSelectValue: (choice: Choice) => void
    onActivateSlot: (codeIndex: number) => void
    onCancel: () => void
  }

  let {
    bindingLabel,
    behaviours,
    slots,
    activeCodeIndex,
    choices,
    usedKeycodes = [],
    onSelectBehaviour,
    onSelectValue,
    onActivateSlot,
    onCancel
  }: Props = $props()

  let query = $state('')
  let pinnedContexts = $state<string[] | null>(null)
  let pinnedForKey = $state('')

  const used = $derived(new Set([...usedKeycodes].map(String)))
  const activeSlot = $derived(
    slots.find(slot => slot.codeIndex === activeCodeIndex) ?? slots[0]
  )
  const paramSlots = $derived(slots.filter(slot => slot.param !== 'behaviour'))
  const dimUsed = $derived(isKeycodeParam(activeSlot?.param))
  const displayChoices = $derived(uniqueCatalogChoices(choices))
  const orderedBehaviours = $derived(sortBehaviorsByRole(behaviours))
  const showFilter = $derived(displayChoices.length > 16)
  const catalogKey = $derived(
    `${String(activeSlot?.param ?? '')}:${displayChoices.length}`
  )

  const filtered = $derived.by(() => {
    const q = query.trim()
    if (!q) return displayChoices
    return fuzzysort
      .go(q, displayChoices, {
        keys: ['code', 'symbol', 'description', 'name'],
        limit: 500
      })
      .map(result => result.obj)
  })

  const allGroups = $derived(groupChoicesByContext(displayChoices))
  const filteredGroups = $derived(groupChoicesByContext(filtered))
  const taxonomyChips = $derived(
    allGroups.filter(group => group.context !== 'Other' || allGroups.length === 1)
  )
  const showTaxonomy = $derived(taxonomyChips.length > 1)
  const searching = $derived(query.trim().length > 0)

  const activeContexts = $derived.by(() => {
    if (pinnedContexts && pinnedForKey === catalogKey) return pinnedContexts
    return initialTaxonomyContexts(allGroups, activeSlot?.value)
  })

  const visibleGroups = $derived.by(() => {
    if (searching) return filteredGroups
    const selected = new Set(activeContexts)
    return filteredGroups.filter(group => selected.has(group.context))
  })

  const showGroupTitles = $derived(visibleGroups.length > 1)

  function choiceLabel(choice: Choice): string {
    return representativeLabel(choice) || String(choice.code ?? '')
  }

  function isActiveChoice(choice: Choice): boolean {
    return String(choice.code ?? '') === String(activeSlot?.value ?? '')
  }

  function isUsedChoice(choice: Choice): boolean {
    return dimUsed && used.has(String(choice.code ?? ''))
  }

  function valueTooltip(choice: Choice): string {
    return catalogChoiceTooltip(choice)
  }

  function behaviourTooltip(choice: Choice): string {
    const base = catalogChoiceTooltip({
      ...choice,
      description: choice.description || choice.name
    })
    const instant = isInstantBehavior(choice) ? 'Applies immediately.' : ''
    const docs = zmkBehaviorDocsUrl(choice.code)
      ? 'Ctrl+click: docs'
      : ''
    return [base, instant, docs].filter(Boolean).join('\n')
  }

  function handleBehaviourClick(event: MouseEvent, choice: Choice) {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      const url = zmkBehaviorDocsUrl(choice.code)
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
      return
    }
    onSelectBehaviour(choice)
  }

  function selectTaxonomy(context: string) {
    pinnedForKey = catalogKey
    pinnedContexts = nextTaxonomyContexts(allGroups, context)
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onCancel()
    }
  }

  onMount(() => {
    function onWindowKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onWindowKey)
    return () => window.removeEventListener('keydown', onWindowKey)
  })
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="key-editor"
  role="dialog"
  aria-label="Edit key"
  tabindex="-1"
  onkeydown={handleKeyDown}
>
  <div class="key-editor-header">
    <div>
      <h2>Edit key</h2>
      <div class="binding">{bindingLabel}</div>
    </div>
    <button type="button" class="key-editor-close" onclick={onCancel} aria-label="Close">
      ×
    </button>
  </div>

  <section>
    <p class="key-editor-section-label">Behaviour</p>
    <div class="key-editor-chips">
      {#each orderedBehaviours as behaviour}
        <button
          type="button"
          class="key-editor-chip"
          class:active={String(behaviour.code) === String(slots[0]?.value ?? '')}
          class:instant={isInstantBehavior(behaviour)}
          title={behaviourTooltip(behaviour)}
          onclick={event => handleBehaviourClick(event, behaviour)}
        >
          {behaviour.code}
        </button>
      {/each}
    </div>
  </section>

  {#if paramSlots.length > 0}
    <section>
      <p class="key-editor-section-label">Value</p>
      {#if paramSlots.length > 1}
        <div class="key-editor-chips">
          {#each paramSlots as slot}
            <button
              type="button"
              class="key-editor-chip"
              class:active={slot.codeIndex === activeSlot?.codeIndex}
              onclick={() => onActivateSlot(slot.codeIndex)}
            >
              {slot.label}{slot.value != null && slot.value !== '' ? ` · ${slot.value}` : ''}
            </button>
          {/each}
        </div>
      {/if}

      {#if showTaxonomy}
        <div class="key-editor-chips" role="tablist" aria-label="Value group">
          {#each taxonomyChips as group}
            <button
              type="button"
              class="key-editor-chip"
              class:active={activeContexts.includes(group.context)}
              role="tab"
              aria-selected={activeContexts.includes(group.context)}
              onclick={() => selectTaxonomy(group.context)}
            >
              {group.context}
            </button>
          {/each}
        </div>
      {/if}

      {#if showFilter}
        <input
          class="key-editor-filter"
          type="search"
          placeholder="Filter values…"
          bind:value={query}
        />
      {/if}

      <div class="key-editor-values">
        {#if visibleGroups.length === 0 || visibleGroups.every(group => group.items.length === 0)}
          <p class="key-editor-empty">No matching values.</p>
        {:else}
          {#each visibleGroups as group}
            <div class="key-editor-group">
              {#if showGroupTitles || searching}
                <h3>{group.context}</h3>
              {/if}
              <div class="key-editor-grid">
                {#each group.items as choice}
                  {@const item = choice as Choice}
                  <button
                    type="button"
                    class="key-editor-choice"
                    class:active={isActiveChoice(item)}
                    class:used={isUsedChoice(item) && !isActiveChoice(item)}
                    title={valueTooltip(item)}
                    onclick={() => onSelectValue(item)}
                  >
                    {#if item.faIcon}
                      <Icon name={String(item.faIcon)} />
                    {/if}
                    {choiceLabel(item)}
                  </button>
                {/each}
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </section>
  {:else}
    <p class="key-editor-empty">This behaviour applies immediately.</p>
  {/if}
</div>
