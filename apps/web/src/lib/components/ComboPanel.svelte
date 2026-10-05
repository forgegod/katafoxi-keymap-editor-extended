<script lang="ts">
  import {
    COMBO_MAX_KEYS,
    COMBO_MIN_KEYS,
    COMBO_PRIOR_IDLE_MS_DEFAULT,
    COMBO_TIMEOUT_MS_DEFAULT,
    clampComboPriorIdleMs,
    clampComboTimeoutMs,
    comboChordOverlapPartners,
    comboDesignHint,
    comboKeysIssue,
    comboKeysMessage,
    comboOverlapMessage,
    createEmptyCombo,
    mergeHoldTapCatalog,
    isPlaceholderComboId,
    nextComboIdFromBinding,
    type ZmkCombo
  } from '@keymap-editor/keymap-core'
  import { getDefinitionsContext, getSearchContext } from '../context'
  import { isEditableFocus } from '../editor-shortcuts'
  import { editor } from '../editor.svelte.js'
  import { createKeyEditSession } from '../key-edit-session.svelte'
  import ComboLayerChips from './ComboLayerChips.svelte'
  import ComboList from './ComboList.svelte'
  import ComboTimeoutControls from './ComboTimeoutControls.svelte'
  import KeyEditorHost from './KeyEditorHost.svelte'

  const definitionsBox = getDefinitionsContext()
  const searchBox = getSearchContext()

  const combos = $derived(editor.draftKeymap?.combos ?? [])
  const layer0 = $derived(editor.draftKeymap?.layers?.[0])
  const layerCount = $derived(editor.draftKeymap?.layers?.length ?? 0)
  const layerNames = $derived(
    editor.draftKeymap?.layer_names ??
      Array.from({ length: layerCount }, (_, i) => `Layer ${i}`)
  )
  const active = $derived(
    combos.find(c => c.id === editor.activeComboId) ?? null
  )
  const overlapPartners = $derived(comboChordOverlapPartners(combos))
  const activeIssue = $derived(
    active ? comboKeysIssue(active.keyPositions) : null
  )
  const activeOverlapId = $derived(
    active ? (overlapPartners.get(active.id) ?? null) : null
  )
  const designHint = $derived(
    active
      ? comboDesignHint(active.keyPositions, layer0, active.binding)
      : null
  )
  const activeHint = $derived(
    editor.comboNotice ??
      comboKeysMessage(activeIssue) ??
      comboOverlapMessage(activeOverlapId) ??
      designHint
  )
  const hintIsSoft = $derived(
    !editor.comboNotice &&
      activeIssue == null &&
      activeOverlapId == null &&
      designHint != null
  )
  const timeoutMs = $derived(active?.timeoutMs ?? COMBO_TIMEOUT_MS_DEFAULT)
  const timeoutIsCustom = $derived(active?.timeoutMs !== undefined)
  const priorIdleOn = $derived(active?.requirePriorIdleMs !== undefined)
  const priorIdleMs = $derived(
    active?.requirePriorIdleMs ?? COMBO_PRIOR_IDLE_MS_DEFAULT
  )
  const layersAreGlobal = $derived(
    !active?.layers || active.layers.length === 0
  )
  const selectedLayers = $derived(new Set(active?.layers ?? []))

  const sources = $derived.by(() => {
    const defs = definitionsBox.current
    const behaviours = defs
      ? mergeHoldTapCatalog(
          defs.behaviours,
          editor.draftKeymap?.holdTaps ?? editor.baselineKeymap?.holdTaps
        ).byCode
      : {}
    return {
      keycodes: (defs?.keycodes.byCode ?? {}) as Record<string, unknown>,
      behaviours: behaviours as Record<string, unknown>
    }
  })

  const session = createKeyEditSession({
    sources: () => sources as Record<string, Record<string, unknown>>,
    search: () => searchBox.current,
    bindings: () => (active ? [active.binding] : [{ value: '&none', params: [] }]),
    layerIndex: () => 0,
    keyIndex: () => -1,
    onUpdate: (_keyIndex, _layerIndex, binding) => {
      if (!active) return
      const patch: Partial<ZmkCombo> = { binding }
      if (isPlaceholderComboId(active.id)) {
        patch.id = nextComboIdFromBinding(
          binding,
          combos.filter(c => c.id !== active.id)
        )
      }
      patchActive(patch)
      if (patch.id) editor.activeComboId = patch.id
    }
  })

  function patchActive(patch: Partial<ZmkCombo>) {
    if (!active) return
    const next = combos.map(c => {
      if (c.id !== active.id) return c
      const merged: ZmkCombo = { ...c, ...patch }
      if ('timeoutMs' in patch && patch.timeoutMs === undefined) {
        delete merged.timeoutMs
      }
      if (
        'requirePriorIdleMs' in patch &&
        patch.requirePriorIdleMs === undefined
      ) {
        delete merged.requirePriorIdleMs
      }
      if (
        'layers' in patch &&
        (patch.layers === undefined || patch.layers.length === 0)
      ) {
        delete merged.layers
      }
      if ('slowRelease' in patch && !patch.slowRelease) {
        delete merged.slowRelease
      }
      return merged
    })
    editor.updateCombos(next)
    editor.refreshComboNotice()
  }

  function selectCombo(id: string) {
    editor.activeComboId = id
    editor.refreshComboNotice()
  }

  function addCombo() {
    const combo = createEmptyCombo(combos)
    editor.updateCombos([...combos, combo])
    editor.activeComboId = combo.id
    editor.refreshComboNotice()
  }

  function removeActive() {
    if (!active) return
    const next = combos.filter(c => c.id !== active.id)
    editor.updateCombos(next)
    editor.activeComboId = next[0]?.id ?? null
    editor.refreshComboNotice()
  }

  function renameActive(event: Event) {
    if (!active) return
    const input = event.currentTarget as HTMLInputElement
    const id = input.value.trim().replace(/[^a-zA-Z0-9_]/g, '_') || active.id
    if (id === active.id) return
    if (combos.some(c => c.id === id)) {
      input.value = active.id
      return
    }
    patchActive({ id })
    editor.activeComboId = id
  }

  function setTimeoutMs(ms: number) {
    patchActive({ timeoutMs: clampComboTimeoutMs(ms) })
  }

  function onTimeoutInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    setTimeoutMs(Number(input.value))
  }

  function clearTimeoutMs() {
    patchActive({ timeoutMs: undefined })
  }

  function setPriorIdleMs(ms: number) {
    patchActive({ requirePriorIdleMs: clampComboPriorIdleMs(ms) })
  }

  function onPriorIdleInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    setPriorIdleMs(Number(input.value))
  }

  function clearPriorIdleMs() {
    patchActive({ requirePriorIdleMs: undefined })
  }

  function setSlowRelease(on: boolean) {
    patchActive({ slowRelease: on || undefined })
  }

  function setAllLayers() {
    patchActive({ layers: undefined })
  }

  function toggleLayer(index: number) {
    if (!active) return
    if (layersAreGlobal) {
      patchActive({ layers: [index] })
      return
    }
    const set = new Set(active.layers)
    if (set.has(index)) set.delete(index)
    else set.add(index)
    if (set.size === 0 || set.size >= layerCount) {
      patchActive({ layers: undefined })
      return
    }
    patchActive({ layers: [...set].sort((a, b) => a - b) })
  }

  function editBinding() {
    if (!active) return
    session.openRow(0)
  }

  function openEditor(slotCodeIndex: number) {
    session.openEditor(slotCodeIndex, 0)
  }

  function closePanel() {
    editor.tryExitComboMode()
  }

  /** Escape = Done: close binding editor first, blur fields, then leave combo mode. */
  $effect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.defaultPrevented || event.repeat) return
      if (session.editing) {
        event.preventDefault()
        // Capture + stop so KeyEditor's window listener does not also run, then
        // a second handler would see editing=false and exit combo mode.
        event.stopImmediatePropagation()
        session.closeEditor()
        return
      }
      if (isEditableFocus(event.target)) {
        event.preventDefault()
        if (event.target instanceof HTMLElement) event.target.blur()
        return
      }
      event.preventDefault()
      editor.tryExitComboMode()
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  })
</script>

<aside class="combo-panel" aria-label="Combos">
  <header class="combo-head">
    <div class="combo-head-title">
      <h2 class="combo-title">Combos</h2>
      <a
        class="combo-docs"
        href="https://zmk.dev/docs/keymaps/combos"
        target="_blank"
        rel="noopener noreferrer"
        title="ZMK combo parameters reference"
      >
        ZMK docs
      </a>
    </div>
    <div class="combo-head-actions">
      <button type="button" class="combo-btn" onclick={addCombo}>New</button>
      <button
        type="button"
        class="combo-btn done"
        aria-label="Done editing combos"
        aria-keyshortcuts="Escape"
        title="Done editing combos (Esc)"
        onclick={closePanel}
      >
        Done
        <kbd class="esc-hint">Esc</kbd>
      </button>
    </div>
  </header>

  <section class="combo-props" aria-label="Selected combo settings">
    {#if active}
      <div class="props-top">
        <label class="combo-field grow">
          <span class="field-label" title="Settings apply to this combo only">
            Id · {active.id}
          </span>
          <input
            type="text"
            value={active.id}
            spellcheck="false"
            onchange={renameActive}
          />
        </label>
        <label class="slow-compact" title="Keep the binding until every combo key is released">
          <input
            type="checkbox"
            checked={!!active.slowRelease}
            onchange={event =>
              setSlowRelease((event.currentTarget as HTMLInputElement).checked)}
          />
          Slow
        </label>
      </div>

      <ComboTimeoutControls
        {timeoutMs}
        {timeoutIsCustom}
        {priorIdleOn}
        {priorIdleMs}
        onTimeoutMs={setTimeoutMs}
        onTimeoutInput={onTimeoutInput}
        onClearTimeout={clearTimeoutMs}
        onPriorIdleMs={setPriorIdleMs}
        onPriorIdleInput={onPriorIdleInput}
        onClearPriorIdle={clearPriorIdleMs}
      />

      <ComboLayerChips
        {layerCount}
        {layerNames}
        {layersAreGlobal}
        {selectedLayers}
        onAllLayers={setAllLayers}
        onToggleLayer={toggleLayer}
      />

      <div class="combo-actions">
        <button type="button" class="combo-btn" onclick={editBinding}>
          Binding
        </button>
        <button type="button" class="combo-btn danger" onclick={removeActive}>
          Delete
        </button>
      </div>
      {#if activeHint}
        <p class="combo-warn" class:soft={hintIsSoft} role="status">{activeHint}</p>
      {:else}
        <p class="combo-hint">
          Click {COMBO_MIN_KEYS}–{COMBO_MAX_KEYS} keys on the board.
        </p>
      {/if}
    {:else}
      <p class="combo-empty props-empty">
        Select or New. Properties are per combo.
      </p>
    {/if}
  </section>

  <ComboList
    {combos}
    activeComboId={editor.activeComboId}
    {layer0}
    onSelect={selectCombo}
  />
</aside>

<KeyEditorHost
  open={!!(session.editing && session.canEdit && session.activeSlot)}
  bindingLabel={session.bindingLabel}
  behaviours={session.behaviours}
  editorSlots={session.slots}
  activeCodeIndex={session.activeSlot?.codeIndex ?? 0}
  choices={session.choices}
  onSelectBehaviour={session.selectBehaviour}
  onSelectValue={session.selectValue}
  onToggleHold={session.toggleHold}
  onActivateSlot={openEditor}
  onConfirm={session.confirm}
  onCancel={session.closeEditor}
/>

<style>
  .combo-panel {
    box-sizing: border-box;
    flex: 0 0 16rem;
    width: 16rem;
    align-self: stretch;
    max-height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 8px 10px;
    border: 1px solid color-mix(in srgb, var(--shade) 12%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--surface) 70%, transparent);
    color: var(--text);
    font-size: var(--font-sm, 0.85rem);
  }

  .combo-head {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .combo-head-title {
    display: flex;
    align-items: baseline;
    gap: 8px;
    min-width: 0;
  }

  .combo-title {
    margin: 0;
    font-size: inherit;
    font-weight: 700;
  }

  .combo-docs {
    color: var(--text-muted);
    font-size: 0.88em;
    text-decoration: underline;
    text-underline-offset: 2px;
    white-space: nowrap;
  }

  .combo-docs:hover,
  .combo-docs:focus-visible {
    color: var(--accent, #3a7);
  }

  .combo-head-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .combo-props {
    flex: none;
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 7px 8px;
    border: 1px solid color-mix(in srgb, var(--shade) 12%, transparent);
    border-radius: 6px;
    background: color-mix(in srgb, var(--surface-sunken) 55%, transparent);
  }

  .props-top {
    display: flex;
    align-items: flex-end;
    gap: 6px;
  }

  .props-empty {
    margin: 0;
  }

  .combo-btn {
    height: 22px;
    padding: 0 7px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--surface-sunken);
    color: var(--text);
    font: inherit;
    cursor: pointer;
  }

  .combo-btn.done {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }

  .esc-hint {
    font: inherit;
    font-size: 0.72em;
    font-weight: 650;
    letter-spacing: 0.02em;
    padding: 0 4px;
    border: 1px solid color-mix(in srgb, var(--border) 80%, transparent);
    border-radius: 3px;
    background: color-mix(in srgb, var(--stage-bg, #111) 35%, transparent);
    color: var(--text-disabled, #888);
    line-height: 1.4;
  }

  .combo-btn.danger {
    color: var(--danger, #b33);
  }

  .combo-empty,
  .combo-hint {
    margin: 0;
    color: var(--text-muted);
    line-height: 1.3;
    font-size: 0.92em;
  }

  .combo-field {
    display: grid;
    gap: 2px;
    font-size: 0.9em;
    color: var(--text-muted);
  }

  .combo-field.grow {
    flex: 1 1 auto;
    min-width: 0;
  }

  .field-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .combo-field input {
    height: 24px;
    padding: 0 6px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--surface-sunken);
    color: var(--text);
    font: inherit;
  }

  .slow-compact {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: none;
    margin: 0 0 1px;
    font-size: 0.9em;
    cursor: pointer;
    white-space: nowrap;
  }

  .combo-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .combo-warn {
    margin: 0;
    color: var(--danger, #b33);
    line-height: 1.3;
    font-size: 0.92em;
  }

  .combo-warn.soft {
    color: var(--warning, #b8860b);
  }
</style>
