<script lang="ts">
  import fuzzysort from 'fuzzysort'
  import { onMount } from 'svelte'
  import {
    behaviorFirmwareNote,
    catalogKeyChoices,
    buildChoiceLabeler,
    groupChoicesByContext,
    initialTaxonomyContexts,
    nextTaxonomyContexts,
    sortBehaviorsByRole,
    type CatalogChoice
  } from '@keymap-editor/keymap-core'
  import {
    firstMissingSlot,
    isKeycodeParam,
    terminalKeySlot,
    visibleValueSlots,
    type EditorSlot
  } from '../../key-editor'
  import {
    canConfirmBinding,
    collectActiveHolds,
    needsTerminalKey,
    shouldShowPickKeyHint
  } from '../../key-editor-view'
  import BehaviourRow from './BehaviourRow.svelte'
  import HoldRow from './HoldRow.svelte'
  import TaxonomyChips from './TaxonomyChips.svelte'
  import ValueGrid from './ValueGrid.svelte'
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
    usedKeycodes?: ReadonlyMap<string, readonly number[]>
    onSelectBehaviour: (choice: Choice) => void
    onSelectValue: (choice: Choice) => void
    onToggleHold?: (wrapCode: string) => void
    onActivateSlot: (codeIndex: number) => void
    onConfirm: () => void
    onCancel: () => void
  }

  let {
    bindingLabel,
    behaviours,
    slots,
    activeCodeIndex,
    choices,
    usedKeycodes,
    onSelectBehaviour,
    onSelectValue,
    onToggleHold,
    onActivateSlot,
    onConfirm,
    onCancel
  }: Props = $props()

  let query = $state('')
  let pinnedContexts = $state<string[] | null>(null)
  let pinnedForKey = $state('')
  let pulseIndex = $state<number | null>(null)
  let pulseOn = $state(false)
  let pulseTimer = 0

  const used = $derived(usedKeycodes ?? new Map<string, readonly number[]>())
  const activeSlot = $derived(
    slots.find(slot => slot.codeIndex === activeCodeIndex) ?? slots[0]
  )
  const paramSlots = $derived(visibleValueSlots(slots))
  const dimUsed = $derived(
    isKeycodeParam(activeSlot?.param) || activeSlot?.param === 'command'
  )
  const showHolds = $derived(isKeycodeParam(activeSlot?.param) && !!onToggleHold)
  const displayChoices = $derived(catalogKeyChoices(choices))
  const labelChoice = $derived(buildChoiceLabeler(displayChoices))
  const searching = $derived(query.trim().length > 0)
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
  const activeHolds = $derived(collectActiveHolds(slots, activeCodeIndex))
  const needsTerminal = $derived(needsTerminalKey(showHolds, activeHolds, paramSlots))
  const canConfirm = $derived(canConfirmBinding(slots))
  const pickKeyHint = $derived(
    shouldShowPickKeyHint(activeSlot, paramSlots, needsTerminal)
  )
  const firmwareNote = $derived(behaviorFirmwareNote(slots[0]?.value))
  const terminalValue = $derived(terminalKeySlot(slots, activeCodeIndex)?.value)

  function pulseMissing(codeIndex: number) {
    window.clearTimeout(pulseTimer)
    pulseOn = false
    pulseIndex = codeIndex
    requestAnimationFrame(() => {
      pulseOn = true
      pulseTimer = window.setTimeout(() => {
        pulseOn = false
      }, 1000)
    })
  }

  function handleApply() {
    if (canConfirm) {
      onConfirm()
      return
    }
    const missing = firstMissingSlot(slots)
    if (!missing) return
    onActivateSlot(missing.codeIndex)
    pulseMissing(missing.codeIndex)
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
    return () => {
      window.removeEventListener('keydown', onWindowKey)
      window.clearTimeout(pulseTimer)
    }
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
  <div class="key-editor-preview">
    <code class="binding">{bindingLabel}</code>
    <div class="key-editor-preview-actions">
      <button
        type="button"
        class="key-editor-ok"
        class:blocked={!canConfirm}
        aria-disabled={!canConfirm}
        aria-label="Apply"
        title={canConfirm ? 'Apply' : 'Pick a key to finish the combo'}
        onclick={handleApply}
      >
        ✓
      </button>
      <button
        type="button"
        class="key-editor-cancel"
        aria-label="Cancel"
        title="Cancel"
        onclick={onCancel}
      >
        ×
      </button>
    </div>
  </div>

  <div class="key-editor-body">
    <aside class="key-editor-rail">
      <h2>Edit key</h2>
    </aside>

    <div class="key-editor-main">
      <BehaviourRow
        behaviours={orderedBehaviours}
        activeCode={slots[0]?.value}
        onSelect={onSelectBehaviour}
      />

      {#if firmwareNote}
        <p class="key-editor-note">{firmwareNote}</p>
      {/if}

      {#if paramSlots.length > 0}
        <section class="key-editor-row">
          <p class="key-editor-section-label">Value</p>
          <div class="key-editor-chips">
            {#if paramSlots.length > 1}
              {#each paramSlots as slot}
                <button
                  type="button"
                  class="key-editor-chip"
                  class:active={slot.codeIndex === activeSlot?.codeIndex}
                  class:attention={pulseOn && pulseIndex === slot.codeIndex}
                  onclick={() => onActivateSlot(slot.codeIndex)}
                >
                  {slot.label}{slot.value != null && slot.value !== ''
                    ? ` · ${slot.value}`
                    : ''}
                </button>
              {/each}
            {/if}
            {#if showTaxonomy}
              <TaxonomyChips
                chips={taxonomyChips}
                {activeContexts}
                onSelect={selectTaxonomy}
              />
            {/if}
          </div>
        </section>

        {#if showHolds}
          <HoldRow
            {activeHolds}
            {terminalValue}
            {displayChoices}
            onSelectKey={code => onSelectValue({ code })}
            onToggleHold={wrap => onToggleHold?.(wrap)}
          />
        {/if}

        {#if showFilter}
          <input
            class="key-editor-filter"
            type="search"
            placeholder="Filter values…"
            bind:value={query}
          />
        {/if}

        <ValueGrid
          groups={visibleGroups}
          {showGroupTitles}
          {searching}
          {pickKeyHint}
          activeValue={activeSlot?.value}
          {dimUsed}
          {used}
          {labelChoice}
          onSelect={onSelectValue}
        />
      {:else}
        <p class="key-editor-empty">This behaviour applies immediately.</p>
      {/if}
    </div>
  </div>
</div>
