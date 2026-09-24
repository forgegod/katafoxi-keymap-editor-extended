<script lang="ts">
  import fuzzysort from 'fuzzysort'
  import { onMount } from 'svelte'
  import {
    behaviorFirmwareNote,
    behaviorSlotParam,
    behaviorValueCatalog,
    catalogKeyChoices,
    buildChoiceLabeler,
    groupChoicesByContext,
    initialTaxonomyContexts,
    nextTaxonomyContexts,
    sortBehaviorsByRole,
    type CatalogChoice
  } from '@keymap-editor/keymap-core'
  import {
    editorBindingPreview,
    firstMissingSlot,
    isKeycodeParam,
    isSlotFilled,
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
  import { getSearchContext } from '../../context'
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
    editorSlots: EditorSlot[]
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
    editorSlots,
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

  const searchBox = getSearchContext()
  const search = $derived(searchBox.current)

  let pickedBehaviour = $state<string | number | null>(null)
  let query = $state('')
  let pinnedContexts = $state<string[] | null>(null)
  let pinnedForKey = $state('')
  let pulseIndex = $state<number | null>(null)
  let pulseOn = $state(false)
  let pulseTimer = 0

  const used = $derived(usedKeycodes ?? new Map<string, readonly number[]>())
  const activeSlot = $derived(
    editorSlots.find(slot => slot.codeIndex === activeCodeIndex) ?? editorSlots[0]
  )
  const paramSlots = $derived(visibleValueSlots(editorSlots))
  const behaviourValue = $derived(pickedBehaviour ?? editorSlots[0]?.value)
  const valueCatalog = $derived(behaviorValueCatalog(behaviourValue))
  const catalogParam = $derived(behaviorSlotParam(behaviourValue, activeSlot?.param))
  const resolvedChoices = $derived.by(() => {
    if (catalogParam === 'command') {
      if (valueCatalog.choices.length) return valueCatalog.choices as Choice[]
      const listed = behaviours.find(
        choice => String(choice.code) === String(behaviourValue ?? '')
      ) as (Choice & { commands?: Choice[] }) | undefined
      return listed?.commands ?? []
    }
    if (search && catalogParam != null && catalogParam !== 'behaviour') {
      return (search.getSearchTargets(catalogParam, String(behaviourValue ?? '')) ??
        []) as Choice[]
    }
    return isKeycodeParam(catalogParam) ? choices : []
  })
  const dimUsed = $derived(
    isKeycodeParam(catalogParam) || catalogParam === 'command'
  )
  const showHolds = $derived(isKeycodeParam(catalogParam) && !!onToggleHold)
  const showValuePicker = $derived(
    catalogParam != null && catalogParam !== 'behaviour'
  )
  const keycodePicker = $derived(isKeycodeParam(catalogParam))
  const displayChoices = $derived(catalogKeyChoices(resolvedChoices))
  const previewLabel = $derived(
    editorBindingPreview(editorSlots, pickedBehaviour) || bindingLabel
  )
  const labelChoice = $derived(buildChoiceLabeler(displayChoices))
  const searching = $derived(query.trim().length > 0)
  const orderedBehaviours = $derived(sortBehaviorsByRole(behaviours))
  const showFilter = $derived(displayChoices.length > 16)
  const catalogKey = $derived(
    `${String(behaviourValue ?? '')}:${String(catalogParam ?? '')}:${displayChoices.length}`
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

  const keycodeTaxonomy = $derived(keycodePicker)

  const activeContexts = $derived.by(() => {
    if (pinnedContexts && pinnedForKey === catalogKey) return pinnedContexts
    if (!keycodeTaxonomy) return allGroups.map(group => group.context)
    return initialTaxonomyContexts(allGroups, activeSlot?.value)
  })

  const visibleGroups = $derived.by(() => {
    if (searching || !keycodeTaxonomy) return filteredGroups
    const selected = new Set(activeContexts)
    return filteredGroups.filter(group => selected.has(group.context))
  })

  const showGroupTitles = $derived(visibleGroups.length > 1)
  const activeHolds = $derived(collectActiveHolds(editorSlots, activeCodeIndex))
  const needsTerminal = $derived(needsTerminalKey(showHolds, activeHolds, paramSlots))
  const canConfirm = $derived(canConfirmBinding(editorSlots))
  const pickKeyHint = $derived(
    shouldShowPickKeyHint(activeSlot, paramSlots, needsTerminal)
  )
  const firmwareNote = $derived(behaviorFirmwareNote(behaviourValue))

  function chooseBehaviour(choice: Choice) {
    pickedBehaviour = choice.code ?? null
    onSelectBehaviour(choice)
  }
  const terminalValue = $derived(terminalKeySlot(editorSlots, activeCodeIndex)?.value)

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
    const missing = firstMissingSlot(editorSlots)
    if (!missing) return
    onActivateSlot(missing.codeIndex)
    pulseMissing(missing.codeIndex)
  }

  function selectTaxonomy(context: string) {
    pinnedForKey = catalogKey
    pinnedContexts = nextTaxonomyContexts(allGroups, context)
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.isComposing || event.repeat) return
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      onCancel()
      return
    }
    if (event.key !== 'Enter') return
    const choosing =
      !canConfirm &&
      event.target instanceof HTMLButtonElement &&
      !event.target.classList.contains('key-editor-ok')
    if (choosing) return
    event.preventDefault()
    event.stopPropagation()
    handleApply()
  }

  // Rebind so Enter sees the binding filled after the dialog opened.
  $effect(() => {
    void canConfirm
    void editorSlots
    const onKey = (event: KeyboardEvent) => handleKeyDown(event)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  onMount(() => () => window.clearTimeout(pulseTimer))
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="key-editor"
  role="dialog"
  aria-label="Edit key"
  tabindex="-1"
>
  <div class="key-editor-preview">
    <code class="binding">{previewLabel}</code>
    <div class="key-editor-preview-actions">
      <button
        type="button"
        class="key-editor-ok"
        class:blocked={!canConfirm}
        aria-disabled={!canConfirm}
        aria-label="Apply"
        title={canConfirm ? 'Apply (Enter)' : 'Pick a key to finish the combo'}
        onclick={handleApply}
      >
        ✓
      </button>
      <button
        type="button"
        class="key-editor-cancel"
        aria-label="Cancel"
        title="Cancel (Esc)"
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
        activeCode={behaviourValue}
        onChoose={chooseBehaviour}
      />

      {#if firmwareNote}
        <p class="key-editor-note">{firmwareNote}</p>
      {/if}

      {#if showValuePicker && keycodePicker}
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
                onChoose={selectTaxonomy}
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
          onChoose={onSelectValue}
        />
      {:else if showValuePicker}
        <section class="key-editor-row">
          <p class="key-editor-section-label">Value</p>
          {#if paramSlots.length > 1}
            <div class="key-editor-chips">
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
            </div>
          {/if}
        </section>
        <div class="key-editor-values">
          {#if displayChoices.length === 0}
            <p class="key-editor-empty">No matching values.</p>
          {:else}
            <div class="key-editor-grid">
              {#each displayChoices as choice (String(choice.code ?? ''))}
                <button
                  type="button"
                  class="key-editor-choice"
                  class:active={String(choice.code) === String(activeSlot?.value ?? '')}
                  class:used={dimUsed &&
                    used.has(String(choice.code ?? '')) &&
                    String(choice.code) !== String(activeSlot?.value ?? '')}
                  title={choice.description || String(choice.code ?? '')}
                  onclick={() => onSelectValue(choice)}
                >
                  {labelChoice(choice)}
                </button>
              {/each}
            </div>
          {/if}
        </div>
      {:else}
        <p class="key-editor-empty">This behaviour applies immediately.</p>
      {/if}
    </div>
  </div>
</div>
