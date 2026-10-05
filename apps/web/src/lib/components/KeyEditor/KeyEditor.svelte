<script lang="ts">
  import fuzzysort from 'fuzzysort'
  import { onMount } from 'svelte'
  import {
    behaviorFirmwareNote,
    behaviorSlotParam,
    ensureHoldTapPreset,
    HOLD_TAP_FLAVORS,
    HOLD_TAP_PRESETS,
    holdTapPresetFor,
    isStockHoldTap,
    replaceHoldTapTiming,
    zmkBehaviorDocsUrl,
    type HoldTapPreset,
    type ZmkHoldTap,
    behaviorValueCatalog,
    catalogKeyChoices,
    buildChoiceLabeler,
    buildTaxonomyChips,
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
  import SelectChip from '../Common/SelectChip.svelte'
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
    usedRevision?: string
    usedLayerLabels?: readonly string[]
    onSelectBehaviour: (choice: Choice) => void
    onSelectValue: (choice: Choice) => void
    onToggleHold?: (wrapCode: string) => void
    onActivateSlot: (codeIndex: number) => void
    onConfirm: (stagedHoldTaps?: ZmkHoldTap[] | null) => void
    onCancel: () => void
    holdTaps?: ZmkHoldTap[]
    onChangeHoldTaps?: (next: ZmkHoldTap[]) => void
  }

  let {
    bindingLabel,
    behaviours,
    editorSlots,
    activeCodeIndex,
    choices,
    usedKeycodes,
    usedRevision = '',
    usedLayerLabels = [],
    onSelectBehaviour,
    onSelectValue,
    onToggleHold,
    onActivateSlot,
    onConfirm,
    onCancel,
    holdTaps,
    onChangeHoldTaps
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
  const paramSlots = $derived.by(() => {
    const visible = visibleValueSlots(editorSlots)
    if (String(behaviourValue ?? '') !== '&as') return visible
    const keys = visible.filter(slot => isKeycodeParam(slot.param))
    const filled = keys.filter(slot => isSlotFilled(slot))
    const one = filled.at(-1) ?? keys[0]
    return one ? [one] : visible.slice(0, 1)
  })
  const keySlot = $derived(paramSlots.find(slot => isKeycodeParam(slot.param)))
  const inlineSlots = $derived(paramSlots.filter(slot => !isKeycodeParam(slot.param)))
  const catalogSlot = $derived(keySlot ?? activeSlot)
  const behaviourValue = $derived(pickedBehaviour ?? editorSlots[0]?.value)
  const valueCatalog = $derived(behaviorValueCatalog(behaviourValue))
  const catalogParam = $derived(behaviorSlotParam(behaviourValue, catalogSlot?.param))
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
  const showHolds = $derived(
    !!keySlot && !!onToggleHold && String(behaviourValue ?? '') !== '&as'
  )
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
  const activeBehaviour = $derived(
    orderedBehaviours.find(choice => String(choice.code) === String(behaviourValue ?? ''))
  )
  const behaviourCode = $derived(String(behaviourValue ?? ''))
  const preset = $derived(holdTapPresetFor(behaviourCode))
  const behaviourChoices = $derived(
    orderedBehaviours.filter(choice => !holdTapPresetFor(String(choice.code)))
  )
  const customHoldTap = $derived(
    (holdTaps ?? []).some(node => node.code === behaviourCode && !node.override) ||
      activeBehaviour?.holdTap === true
  )
  const timingFields = $derived(
    preset
      ? preset.fields
      : isStockHoldTap(behaviourCode) || customHoldTap
        ? (['tappingTermMs', 'flavor'] as const)
        : ([] as const)
  )
  /** Preset node kept in the dialog until Apply. Cancel drops it. */
  let stagedHoldTaps = $state<ZmkHoldTap[] | null>(null)
  const timingList = $derived(stagedHoldTaps ?? holdTaps)
  const timingNode = $derived(timingList?.find(node => node.code === behaviourCode))
  const autoshift = $derived(behaviourCode === '&as')

  let termDraft = $state('')
  let flavorDraft = $state('')
  let quickDraft = $state('')
  let idleDraft = $state('')
  let timingSyncKey = $state('')

  function msText(value: unknown): string {
    return typeof value === 'number' ? String(value) : ''
  }

  $effect(() => {
    const key = [
      behaviourCode,
      timingNode?.tappingTermMs ?? '',
      timingNode?.flavor ?? '',
      timingNode?.quickTapMs ?? '',
      timingNode?.requirePriorIdleMs ?? '',
      activeBehaviour?.tappingTermMs ?? '',
      activeBehaviour?.flavor ?? '',
      activeBehaviour?.quickTapMs ?? '',
      activeBehaviour?.requirePriorIdleMs ?? ''
    ].join(':')
    if (key === timingSyncKey) return
    timingSyncKey = key
    termDraft = msText(timingNode?.tappingTermMs ?? activeBehaviour?.tappingTermMs)
    const flavor = timingNode?.flavor ?? activeBehaviour?.flavor
    flavorDraft = typeof flavor === 'string' ? flavor : ''
    quickDraft = msText(timingNode?.quickTapMs ?? activeBehaviour?.quickTapMs)
    idleDraft = msText(timingNode?.requirePriorIdleMs ?? activeBehaviour?.requirePriorIdleMs)
  })

  function readMs(raw: unknown): number | undefined | null {
    const text = String(raw ?? '').trim()
    if (text === '') return undefined
    const value = Number(text)
    if (!Number.isInteger(value) || value < 0) return null
    return value
  }

  function commitTiming() {
    if (!onChangeHoldTaps || timingFields.length === 0) return
    const patch: {
      tappingTermMs?: number
      flavor?: string
      quickTapMs?: number
      requirePriorIdleMs?: number
    } = {}
    if (timingFields.includes('tappingTermMs')) {
      const tappingTermMs = readMs(termDraft)
      if (tappingTermMs === null) return
      patch.tappingTermMs = tappingTermMs
    }
    if (timingFields.includes('flavor')) {
      patch.flavor = HOLD_TAP_FLAVORS.some(item => item.id === flavorDraft) ? flavorDraft : undefined
    }
    if (timingFields.includes('quickTapMs')) {
      const quickTapMs = readMs(quickDraft)
      if (quickTapMs === null) return
      patch.quickTapMs = quickTapMs
    }
    if (timingFields.includes('requirePriorIdleMs')) {
      const requirePriorIdleMs = readMs(idleDraft)
      if (requirePriorIdleMs === null) return
      patch.requirePriorIdleMs = requirePriorIdleMs
    }
    const next = replaceHoldTapTiming(timingList, behaviourCode, patch)
    if (stagedHoldTaps) {
      stagedHoldTaps = next
      return
    }
    onChangeHoldTaps(next)
  }

  /** A preset the keymap does not have yet stays local until Apply. */
  function stagePreset(code: string) {
    const list = ensureHoldTapPreset(holdTaps, code)
    const already = (holdTaps ?? []).some(node => node.code === code)
    stagedHoldTaps = already ? null : list
  }

  function presetTitle(item: HoldTapPreset): string {
    const docs = zmkBehaviorDocsUrl(item.code) ? 'Ctrl+click: docs' : ''
    return [item.description, docs].filter(Boolean).join('\n')
  }

  function choosePresetClick(event: MouseEvent, next: HoldTapPreset) {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      const url = zmkBehaviorDocsUrl(next.code)
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
      return
    }
    choosePreset(next)
  }

  function choosePreset(next: HoldTapPreset) {
    if (!onChangeHoldTaps) return
    if (behaviourCode === next.code) return
    stagePreset(next.code)
    // Behaviour chips store a local override. Presets must replace it, or the
    // row stays on &mt after the session draft has already moved.
    pickedBehaviour = next.code
    onSelectBehaviour({
      code: next.code,
      name: next.name,
      params: [...next.params],
      holdTap: true,
      ...next.defaults
    })
  }
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
  const taxonomyChips = $derived(buildTaxonomyChips(allGroups))
  const showTaxonomy = $derived(taxonomyChips.length > 1)

  const keycodeTaxonomy = $derived(keycodePicker)

  const activeContexts = $derived.by(() => {
    if (pinnedContexts && pinnedForKey === catalogKey) return pinnedContexts
    if (!keycodeTaxonomy) return allGroups.map(group => group.context)
    return initialTaxonomyContexts(allGroups, catalogSlot?.value)
  })

  const visibleGroups = $derived.by(() => {
    if (searching || !keycodeTaxonomy) return filteredGroups
    const selected = new Set(activeContexts)
    return filteredGroups.filter(group => selected.has(group.context))
  })

  const showGroupTitles = $derived(visibleGroups.length > 1)
  const activeHolds = $derived(
    collectActiveHolds(editorSlots, keySlot?.codeIndex ?? activeCodeIndex)
  )
  const needsTerminal = $derived(needsTerminalKey(showHolds, activeHolds, paramSlots))
  const canConfirm = $derived(canConfirmBinding(editorSlots))
  const pickKeyHint = $derived(
    shouldShowPickKeyHint(catalogSlot, paramSlots, needsTerminal)
  )
  const firmwareNote = $derived(behaviorFirmwareNote(behaviourValue))

  function chooseBehaviour(choice: Choice) {
    stagedHoldTaps = null
    pickedBehaviour = choice.code ?? null
    onSelectBehaviour(choice)
  }

  function choicesFor(param: unknown): Choice[] {
    const name = typeof param === 'string' ? param : ''
    if (name === 'command') {
      if (valueCatalog.choices.length) return valueCatalog.choices as Choice[]
      const listed = behaviours.find(
        choice => String(choice.code) === behaviourCode
      ) as (Choice & { commands?: Choice[] }) | undefined
      return listed?.commands ?? []
    }
    if (search && name && name !== 'behaviour') {
      return (search.getSearchTargets(name, behaviourCode) ?? []) as Choice[]
    }
    return isKeycodeParam(name) ? choices : []
  }

  /** Write a modifier or layer without hiding the key catalog. */
  function chooseInline(slot: EditorSlot, choice: Choice) {
    onActivateSlot(slot.codeIndex)
    onSelectValue(choice)
  }

  function focusKeySlot() {
    if (keySlot) onActivateSlot(keySlot.codeIndex)
  }

  /** The key grid always edits the key slot, even after a modifier click. */
  function chooseKey(choice: Choice) {
    focusKeySlot()
    onSelectValue(choice)
  }
  const terminalValue = $derived(
    terminalKeySlot(editorSlots, keySlot?.codeIndex ?? activeCodeIndex)?.value
  )

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
      const staged = stagedHoldTaps
      stagedHoldTaps = null
      onConfirm(staged)
      return
    }
    const missing = firstMissingSlot(editorSlots)
    if (!missing) return
    onActivateSlot(missing.codeIndex)
    pulseMissing(missing.codeIndex)
  }

  function selectTaxonomy(chipId: string) {
    pinnedForKey = catalogKey
    pinnedContexts = nextTaxonomyContexts(allGroups, chipId)
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
  aria-labelledby="key-editor-binding"
  tabindex="-1"
>
  <!-- Result sticker above the panel — not a window title. -->
  <div class="key-editor-preview">
    <code id="key-editor-binding" class="binding">{previewLabel}</code>
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
    <div class="key-editor-main">
      <div class="key-editor-choice-block" data-behavior-choice>
        <BehaviourRow
          behaviours={behaviourChoices}
          activeCode={behaviourValue}
          onChoose={chooseBehaviour}
        />

        <section class="key-editor-row" data-behavior-presets>
          <p class="key-editor-section-label">Presets</p>
          <div class="key-editor-chips" role="group" aria-label="Homerow and autoshift">
            {#each HOLD_TAP_PRESETS as item (item.code)}
              <SelectChip
                active={behaviourCode === item.code}
                title={presetTitle(item)}
                aria-label={item.name}
                data-behavior-preset={item.code}
                disabled={!onChangeHoldTaps}
                onclick={event => choosePresetClick(event, item)}
              >
                {item.code}
              </SelectChip>
            {/each}
          </div>
        </section>
      </div>

      {#if timingFields.length > 0}
        <section class="key-editor-behavior" data-hold-tap-fields>
          <div class="key-editor-row">
            <p class="key-editor-section-label">Timing</p>
            <div class="key-editor-behavior-fields">
            {#if timingFields.includes('tappingTermMs')}
              <label>
                Tapping term
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputmode="numeric"
                  data-hold-tap-term
                  disabled={!onChangeHoldTaps}
                  bind:value={termDraft}
                  onchange={commitTiming}
                />
                <span>ms</span>
              </label>
            {/if}
            {#if timingFields.includes('flavor')}
              <label>
                Flavor
                <select
                  data-hold-tap-flavor
                  disabled={!onChangeHoldTaps}
                  bind:value={flavorDraft}
                  onchange={commitTiming}
                >
                  {#if isStockHoldTap(behaviourCode)}
                    <option value="">Firmware default</option>
                  {/if}
                  {#each HOLD_TAP_FLAVORS as flavor (flavor.id)}
                    <option value={flavor.id}>{flavor.label}</option>
                  {/each}
                </select>
              </label>
            {/if}
            {#if timingFields.includes('quickTapMs')}
              <label>
                Quick tap
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputmode="numeric"
                  data-hold-tap-quick
                  disabled={!onChangeHoldTaps}
                  bind:value={quickDraft}
                  onchange={commitTiming}
                />
                <span>ms</span>
              </label>
            {/if}
            {#if timingFields.includes('requirePriorIdleMs')}
              <label>
                Prior idle
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputmode="numeric"
                  data-hold-tap-idle
                  disabled={!onChangeHoldTaps}
                  bind:value={idleDraft}
                  onchange={commitTiming}
                />
                <span>ms</span>
              </label>
            {/if}
            </div>
          </div>
          <p class="key-editor-note" data-hold-tap-note>
            {#if autoshift}
              Hold sends the shifted key. Changes every key that uses {behaviourCode}.
            {:else}
              Changes every key that uses {behaviourCode}.
            {/if}
          </p>
        </section>
      {/if}

      {#if firmwareNote}
        <p class="key-editor-note">{firmwareNote}</p>
      {/if}

      {#each inlineSlots as slot (slot.codeIndex)}
        {@const options = catalogKeyChoices(choicesFor(slot.param))}
        {@const labelOf = buildChoiceLabeler(options)}
        <section class="key-editor-row" data-slot-values>
          <p class="key-editor-section-label">{slot.label}</p>
          <div class="key-editor-grid">
            {#if options.length === 0}
              <p class="key-editor-empty">No matching values.</p>
            {:else}
              {#each options as choice (String(choice.code ?? ''))}
                <button
                  type="button"
                  class="key-editor-choice"
                  class:active={String(choice.code) === String(slot.value ?? '')}
                  class:used={slot.param === 'command' &&
                    used.has(String(choice.code ?? '')) &&
                    String(choice.code) !== String(slot.value ?? '')}
                  title={choice.description || String(choice.code ?? '')}
                  onclick={() => chooseInline(slot, choice)}
                >
                  {labelOf(choice)}
                </button>
              {/each}
            {/if}
          </div>
        </section>
      {/each}

      {#if keySlot}
        <section class="key-editor-row">
          <p class="key-editor-section-label">Value</p>
          <div class="key-editor-chips">
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
            onSelectKey={code => chooseKey({ code })}
            onToggleHold={wrap => {
              focusKeySlot()
              onToggleHold?.(wrap)
            }}
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

        <ul class="key-editor-legend" aria-label="Value chip styles">
          <li>
            <span class="key-editor-legend-swatch selected" aria-hidden="true"></span>
            Selected
          </li>
          {#if dimUsed}
            <li>
              <span class="key-editor-legend-swatch used" aria-hidden="true"></span>
              Already used elsewhere
            </li>
          {/if}
          <li>
            <span class="key-editor-legend-swatch limited" aria-hidden="true"></span>
            Limited OS support
          </li>
          <li>
            <span class="key-editor-legend-swatch alias" aria-hidden="true"></span>
            Alias / alternate name
          </li>
        </ul>

        {#key usedRevision}
          <ValueGrid
            groups={visibleGroups}
            {showGroupTitles}
            {searching}
            {pickKeyHint}
            activeValue={keySlot.value}
            {dimUsed}
            {used}
            {usedLayerLabels}
            {labelChoice}
            onChoose={chooseKey}
          />
        {/key}
      {:else if inlineSlots.length === 0 && showValuePicker}
        <section class="key-editor-row">
          <p class="key-editor-section-label">Value</p>
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
      {:else if inlineSlots.length === 0}
        <p class="key-editor-empty">This behaviour applies immediately.</p>
      {/if}
    </div>
  </div>
</div>
