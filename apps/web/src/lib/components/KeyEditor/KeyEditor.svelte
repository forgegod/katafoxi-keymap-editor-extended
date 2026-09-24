<script lang="ts">
  import fuzzysort from 'fuzzysort'
  import { onMount } from 'svelte'
  import {
    bandCatalogChoices,
    behaviorFirmwareNote,
    catalogChoiceTooltip,
    choiceMatchesCode,
    valueBandCaption,
    catalogKeyChoices,
    buildChoiceLabeler,
    displayChoiceLabel,
    groupChoicesByContext,
    initialTaxonomyContexts,
    isInstantBehavior,
    isKeypadChoice,
    isModifierKey,
    modifierHoldLegend,
    MODIFIER_HOLDS,
    nextTaxonomyContexts,
    sortBehaviorsByRole,
    usedLayersForChoice,
    zmkBehaviorDocsUrl,
    type CatalogChoice
  } from '@keymap-editor/keymap-core'
  import {
    codeColumnMinPx,
    codeGridMetrics,
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
    isHoldBlocked,
    needsTerminalKey,
    shouldShowPickKeyHint
  } from '../../key-editor-view'
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
  let valuesEl: HTMLDivElement | undefined = $state()
  let valuesWidth = $state(1045)
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

  function codeGridStyle(items: Choice[], context: string): string {
    const minColPx = codeColumnMinPx(items.map(choiceLabel), {
      fitLongest: /^Consumer/i.test(context)
    })
    const { cols, rows } = codeGridMetrics(items.length, valuesWidth, minColPx)
    return `--code-cols:${cols};--code-rows:${rows};--code-col-min:${minColPx}px`
  }

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

  const activeHolds = $derived(collectActiveHolds(slots, activeCodeIndex))
  const needsTerminal = $derived(needsTerminalKey(showHolds, activeHolds, paramSlots))
  const canConfirm = $derived(canConfirmBinding(slots))
  const pickKeyHint = $derived(
    shouldShowPickKeyHint(activeSlot, paramSlots, needsTerminal)
  )

  function holdLabel(hold: (typeof MODIFIER_HOLDS)[number]): string {
    return modifierHoldLegend(hold)
  }

  function holdTooltip(hold: (typeof MODIFIER_HOLDS)[number]): string {
    if (holdBlocked(hold)) {
      const key = String(terminalValue ?? hold.key)
      return `${key} is already the key. ${hold.wrap}(${key}) is the same modifier twice.`
    }
    if (hold.wrap === 'RA') {
      return 'AltGr — Right Alt (RALT).\nHold + key (RA(…)). To assign AltGr as the key, pick RALT in the list.'
    }
    const fromCatalog = displayChoices.find(choice => String(choice.code) === hold.key)
    const base = fromCatalog
      ? catalogChoiceTooltip(fromCatalog)
      : hold.key
    return `${base}\nHold + key. To assign this modifier as the key, pick ${hold.key} in the list.`
  }

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

  function holdBlocked(hold: (typeof MODIFIER_HOLDS)[number]): boolean {
    return isHoldBlocked(hold.wrap, activeHolds, terminalValue)
  }

  function handleHoldClick(
    event: MouseEvent,
    hold: (typeof MODIFIER_HOLDS)[number]
  ) {
    if (holdBlocked(hold)) return
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      onSelectValue({ code: hold.key })
      return
    }
    onToggleHold?.(hold.wrap)
  }

  function choiceLabel(choice: Choice): string {
    if (isModifierKey(choice)) return String(choice.code ?? '')
    return labelChoice(choice)
  }

  function isActiveChoice(choice: Choice): boolean {
    return choiceMatchesCode(choice, activeSlot?.value)
  }

  function isUsedChoice(choice: Choice): boolean {
    return dimUsed && usedLayersForChoice(choice, used).length > 0
  }

  function valueTooltip(choice: Choice): string {
    const base = catalogChoiceTooltip(choice)
    if (!dimUsed) return base
    const layers = usedLayersForChoice(choice, used)
    if (!layers.length) return base
    const where = layers.length === 1 ? 'on layer' : 'on layers'
    return `${base}\n${where} ${layers.join(' · ')}`
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
    <section class="key-editor-row">
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
                {slot.label}{slot.value != null && slot.value !== '' ? ` · ${slot.value}` : ''}
              </button>
            {/each}
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
        </div>
      </section>

      {#if showHolds}
        <section class="key-editor-row">
          <p class="key-editor-section-label">Hold</p>
          <div class="key-editor-holds" role="group" aria-label="Hold modifiers">
            {#each MODIFIER_HOLDS as hold}
              <button
                type="button"
                class="key-editor-choice"
                class:active={activeHolds.has(hold.wrap)}
                class:blocked={holdBlocked(hold)}
                disabled={holdBlocked(hold)}
                title={holdTooltip(hold)}
                onclick={event => handleHoldClick(event, hold)}
              >
                {holdLabel(hold)}
              </button>
            {/each}
          </div>
        </section>
      {/if}

      {#if showFilter}
        <input
          class="key-editor-filter"
          type="search"
          placeholder="Filter values…"
          bind:value={query}
        />
      {/if}

      <div class="key-editor-values" bind:this={valuesEl}>
        {#if pickKeyHint}
          <p class="key-editor-empty">Pick a key to finish the combo.</p>
        {/if}
        {#if visibleGroups.length === 0 || visibleGroups.every(group => group.items.length === 0)}
          <p class="key-editor-empty">No matching values.</p>
        {:else}
          {#each visibleGroups as group}
            <div class="key-editor-group">
              {#if showGroupTitles || searching}
                <h3>{group.context}</h3>
              {/if}
              {#each bandCatalogChoices(group.items) as band}
                {@const caption = valueBandCaption(band.kind)}
                <div class="key-editor-band" data-band={band.kind}>
                  {#if caption}
                    <p class="key-editor-band-label" title={caption.hint}>
                      <span>{caption.label}</span>
                      <svg
                        class="key-editor-band-hint"
                        viewBox="0 0 16 16"
                        aria-hidden="true"
                      >
                        <circle
                          cx="8"
                          cy="8"
                          r="6.4"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.35"
                        />
                        <circle cx="8" cy="5" r="1" fill="currentColor" />
                        <path
                          d="M8 7.35v4.1"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="1.35"
                          stroke-linecap="round"
                        />
                      </svg>
                    </p>
                  {/if}
                  <div
                    class="key-editor-grid"
                    class:codes={band.kind === 'codes'}
                    data-band={band.kind}
                    style={band.kind === 'codes'
                      ? codeGridStyle(band.items as Choice[], group.context)
                      : undefined}
                  >
                    {#each band.items as choice}
                      {@const item = choice as Choice}
                      <button
                        type="button"
                        class="key-editor-choice"
                        class:active={isActiveChoice(item)}
                        class:used={isUsedChoice(item) && !isActiveChoice(item)}
                        class:keypad={isKeypadChoice(item)}
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
            </div>
          {/each}
        {/if}
      </div>
    {:else}
      <p class="key-editor-empty">This behaviour applies immediately.</p>
    {/if}
  </div>
  </div>
</div>

