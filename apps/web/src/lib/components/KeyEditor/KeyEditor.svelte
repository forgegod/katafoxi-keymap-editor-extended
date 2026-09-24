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
    canApplyModifierHold,
    isInstantBehavior,
    isKeypadChoice,
    isModifierKey,
    isModifierWrapCode,
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
    isBindingComplete,
    isKeycodeParam,
    isSlotFilled,
    keycodeChainRootSlot,
    terminalKeySlot,
    visibleValueSlots,
    type EditorSlot
  } from '../../key-editor'
  import Icon from '../Common/Icon.svelte'

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

  const activeHolds = $derived.by(() => {
    const root = keycodeChainRootSlot(slots, activeCodeIndex)
    const on = new Set<string>()
    if (!root) return on
    const keys = slots.filter(slot => isKeycodeParam(slot.param))
    const start = keys.findIndex(slot => slot.codeIndex === root.codeIndex)
    for (let i = start; i < keys.length; i++) {
      if (!isModifierWrapCode(keys[i].value)) break
      on.add(String(keys[i].value).toUpperCase())
    }
    return on
  })

  const needsTerminal = $derived(
    showHolds &&
      activeHolds.size > 0 &&
      paramSlots.every(slot => !isKeycodeParam(slot.param) || !isSlotFilled(slot))
  )

  const canConfirm = $derived(isBindingComplete(slots))

  const pickKeyHint = $derived(
    !!activeSlot &&
      isKeycodeParam(activeSlot.param) &&
      !isSlotFilled(activeSlot) &&
      (needsTerminal ||
        paramSlots.some(
          slot => (slot.param === 'mod' || slot.param === 'layer') && isSlotFilled(slot)
        ))
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
    return !activeHolds.has(hold.wrap) && !canApplyModifierHold(hold.wrap, terminalValue)
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

<style>
  .key-editor {
    box-sizing: border-box;
    width: min(1180px, 94vw);
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0;
    overflow: visible;
    background: none;
    padding: 0;
    box-shadow: none;
  }

  .key-editor-body {
    box-sizing: border-box;
    display: flex;
    flex-direction: row;
    align-items: stretch;
    width: 100%;
    max-height: min(calc(100vh - 9rem), 920px);
    overflow: hidden;
    background: white;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
  }

  .key-editor-rail {
    box-sizing: border-box;
    width: 92px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 10px;
    border-right: 1px solid #e2e2e2;
  }

  .key-editor-rail h2 {
    margin: 0;
    font-size: 14px;
    font-weight: 500;
    line-height: 1.2;
  }

  .key-editor-preview {
    align-self: center;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    flex-shrink: 0;
    margin: 0 0 12px;
    padding: 8px 8px 8px 16px;
    background: #1e2433;
    border-radius: 10px;
    box-shadow: 0 8px 28px rgba(20, 24, 36, 0.38);
  }

  .key-editor-preview .binding {
    box-sizing: border-box;
    min-width: 14em;
    max-width: min(40em, 70vw);
    padding: 0;
    border: none;
    background: none;
    color: #f4f5f7;
    font-family: source-code-pro, Menlo, Monaco, Consolas, 'Courier New',
      monospace;
    font-size: 14px;
    font-weight: 600;
    line-height: 1.4;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .key-editor-preview-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .key-editor-ok,
  .key-editor-cancel {
    box-sizing: border-box;
    width: 32px;
    height: 32px;
    border: none;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);
    color: #e8eaee;
    cursor: pointer;
    font-size: 18px;
    line-height: 32px;
    padding: 0;
  }

  .key-editor-ok:hover:not(:disabled):not(.blocked) {
    background: #2f8a46;
    color: white;
  }

  .key-editor-ok.blocked {
    opacity: 0.45;
  }

  .key-editor-ok.blocked:hover {
    background: rgba(255, 255, 255, 0.16);
    color: #e8eaee;
  }

  .key-editor-cancel:hover {
    background: rgba(255, 255, 255, 0.2);
    color: white;
  }

  .key-editor-ok:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .key-editor-main {
    flex: 1 1 auto;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 10px 14px 12px;
  }

  .key-editor-row {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .key-editor-section-label {
    margin: 0;
    flex-shrink: 0;
    width: 5.6em;
    padding-right: 10px;
    border-right: 1px solid #ccc;
    font-size: 12px;
    font-weight: 500;
    color: var(--muted);
    line-height: 1.2;
  }

  .key-editor-chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    min-width: 0;
    overflow: hidden;
  }

  .key-editor-chip {
    cursor: pointer;
    flex-shrink: 0;
    border: 1px solid #ddd;
    background: var(--key-face);
    color: #333;
    border-radius: 4px;
    padding: 2px 6px;
    font-family: inherit;
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
  }

  .key-editor-chip.active {
    background: var(--hover-selection);
    border-color: var(--hover-selection);
    color: white;
  }

  .key-editor-chip.attention {
    animation: key-needed 1s ease;
  }

  @keyframes key-needed {
    0%,
    100% {
      background: var(--key-face);
      border-color: #ddd;
      color: #333;
    }
    18%,
    42% {
      background: #f0b429;
      border-color: #e09a10;
      color: #2b2108;
    }
    62% {
      background: #f6d58a;
      border-color: #e09a10;
      color: #2b2108;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .key-editor-chip.attention {
      animation: none;
      background: #f0b429;
      border-color: #e09a10;
      color: #2b2108;
    }
  }

  .key-editor-chip.instant {
    border-style: dashed;
  }

  .key-editor-chip.instant.active {
    border-style: dashed;
  }

  .key-editor-filter {
    display: block;
    width: 100%;
    box-sizing: border-box;
    height: 28px;
    margin: 0;
    padding: 4px 8px;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-family: inherit;
    font-size: 13px;
  }

  .key-editor-values {
    flex: 1 1 auto;
    min-height: 0;
    overflow: hidden;
  }

  .key-editor-group + .key-editor-group {
    margin-top: 10px;
  }

  .key-editor-group h3 {
    margin: 0 0 4px;
    font-size: 11px;
    font-weight: 500;
    color: var(--muted);
  }

  .key-editor-band {
    display: flex;
    flex-direction: row;
    align-items: center;
    min-width: 0;
  }

  .key-editor-band + .key-editor-band {
    margin-top: 6px;
  }

  .key-editor-band-label {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    margin: 0 8px 0 0;
    padding: 0 8px 0 0;
    border-right: 1px solid #c8c8c8;
    color: var(--muted);
    font-size: 11px;
    line-height: 1.2;
    white-space: nowrap;
    cursor: help;
  }

  .key-editor-band-hint {
    width: 12px;
    height: 12px;
    color: #6a86a8;
    transform-origin: 50% 50%;
    animation: key-editor-hint-pulse 1.8s ease-in-out infinite;
  }

  @keyframes key-editor-hint-pulse {
    0%,
    100% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.22);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .key-editor-band-hint {
      animation: none;
    }
  }

  .key-editor-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    min-width: 0;
    flex: 1 1 auto;
  }

  .key-editor-band[data-band='shifted'] .key-editor-choice {
    border-style: dashed;
  }

  .key-editor-holds {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 3px;
    min-width: 0;
  }

  .key-editor-holds .key-editor-choice {
    border-style: dashed;
  }

  .key-editor-holds .key-editor-choice.active {
    border-style: solid;
  }

  .key-editor-holds .key-editor-choice:disabled,
  .key-editor-holds .key-editor-choice.blocked {
    cursor: not-allowed;
    opacity: 0.38;
  }

  .key-editor-holds .key-editor-choice:disabled:hover {
    background: var(--key-face);
    border-color: #e2e2e2;
    color: #333;
  }

  .key-editor-grid.codes {
    display: grid;
    grid-auto-flow: column;
    grid-template-rows: repeat(var(--code-rows, 1), auto);
    grid-template-columns: repeat(
      var(--code-cols, 10),
      minmax(var(--code-col-min, 72px), 1fr)
    );
  }

  .key-editor-choice {
    cursor: pointer;
    min-width: 2em;
    border: 1px solid #e2e2e2;
    background: var(--key-face);
    color: #333;
    border-radius: 4px;
    padding: 4px 6px;
    font-family: inherit;
    font-size: 12px;
    font-weight: 500;
    line-height: 1.2;
  }

  .key-editor-grid.codes .key-editor-choice {
    min-width: 0;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .key-editor-choice.keypad {
    border-color: #8a8a8a;
    background: rgba(0, 0, 0, 0.05);
  }

  .key-editor-choice.used {
    opacity: 0.42;
  }

  .key-editor-choice.active {
    outline: 2px solid var(--selection);
    outline-offset: 1px;
    opacity: 1;
  }

  .key-editor-choice:hover {
    background: var(--hover-selection);
    border-color: var(--hover-selection);
    color: white;
  }

  .key-editor-choice.keypad:hover {
    box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.7);
  }

  .key-editor-empty {
    margin: 4px 0 0;
    color: var(--muted);
    font-size: 13px;
  }

  .key-editor-note {
    margin: 2px 0 0;
    color: var(--muted);
    font-size: 12px;
    line-height: 1.35;
    max-width: 72em;
  }
</style>
