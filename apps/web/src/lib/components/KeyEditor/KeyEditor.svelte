<script lang="ts">
  import fuzzysort from 'fuzzysort'
  import { onMount } from 'svelte'
  import {
    groupChoicesByContext,
    representativeLabel,
    uniqueCatalogChoices,
    type CatalogChoice
  } from '@keymap-editor/keymap-core'
  import { isKeycodeParam, type EditorSlot } from '../../key-editor'
  import Icon from '../Common/Icon.svelte'
  import './KeyEditor.css'

  interface Choice extends CatalogChoice {
    name?: string
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
  const used = $derived(new Set([...usedKeycodes].map(String)))
  const activeSlot = $derived(
    slots.find(slot => slot.codeIndex === activeCodeIndex) ?? slots[0]
  )
  const paramSlots = $derived(slots.filter(slot => slot.param !== 'behaviour'))
  const dimUsed = $derived(isKeycodeParam(activeSlot?.param))
  const displayChoices = $derived(uniqueCatalogChoices(choices))
  const showFilter = $derived(displayChoices.length > 16)

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

  const groups = $derived(groupChoicesByContext(filtered))
  const showGroupTitles = $derived(
    groups.length > 1 && groups.some(group => group.context !== 'Other')
  )

  function choiceLabel(choice: Choice): string {
    return representativeLabel(choice) || String(choice.code ?? '')
  }

  function isActiveChoice(choice: Choice): boolean {
    return String(choice.code ?? '') === String(activeSlot?.value ?? '')
  }

  function isUsedChoice(choice: Choice): boolean {
    return dimUsed && used.has(String(choice.code ?? ''))
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
      {#each behaviours as behaviour}
        <button
          type="button"
          class="key-editor-chip"
          class:active={String(behaviour.code) === String(slots[0]?.value ?? '')}
          title={behaviour.name ? String(behaviour.name) : undefined}
          onclick={() => onSelectBehaviour(behaviour)}
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

      {#if showFilter}
        <input
          class="key-editor-filter"
          type="search"
          placeholder="Filter values…"
          bind:value={query}
        />
      {/if}

      <div class="key-editor-values">
        {#if filtered.length === 0}
          <p class="key-editor-empty">No matching values.</p>
        {:else}
          {#each groups as group}
            <div class="key-editor-group">
              {#if showGroupTitles}
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
                    title={item.description ? String(item.description) : String(item.code ?? '')}
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
    <p class="key-editor-empty">This behaviour has no extra values.</p>
  {/if}
</div>
