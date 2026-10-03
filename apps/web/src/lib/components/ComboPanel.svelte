<script lang="ts">
  import {
    COMBO_MAX_KEYS,
    COMBO_MIN_KEYS,
    COMBO_PRIOR_IDLE_MS_DEFAULT,
    COMBO_PRIOR_IDLE_MS_MAX,
    COMBO_PRIOR_IDLE_MS_MIN,
    COMBO_TIMEOUT_MS_DEFAULT,
    COMBO_TIMEOUT_MS_MAX,
    COMBO_TIMEOUT_MS_MIN,
    clampComboPriorIdleMs,
    clampComboTimeoutMs,
    comboDesignHint,
    comboKeysIssue,
    comboKeysMessage,
    comboListMeta,
    createEmptyCombo,
    encodeKeyBinding,
    isPlaceholderComboId,
    layerLegendSymbol,
    nextComboIdFromBinding,
    type ZmkCombo
  } from '@keymap-editor/keymap-core'
  import { getDefinitionsContext, getSearchContext } from '../context'
  import { isEditableFocus } from '../editor-shortcuts'
  import { editor } from '../editor.svelte.js'
  import { createKeyEditSession } from '../key-edit-session.svelte'
  import Modal from './Common/Modal.svelte'
  import KeyEditor from './KeyEditor/KeyEditor.svelte'

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
  const activeIssue = $derived(
    active ? comboKeysIssue(active.keyPositions) : null
  )
  const designHint = $derived(
    active
      ? comboDesignHint(active.keyPositions, layer0, active.binding)
      : null
  )
  const activeHint = $derived(
    editor.comboNotice ?? comboKeysMessage(activeIssue) ?? designHint
  )
  const hintIsSoft = $derived(
    !editor.comboNotice && activeIssue == null && designHint != null
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
    return {
      keycodes: (defs?.keycodes.byCode ?? {}) as Record<string, unknown>,
      behaviours: (defs?.behaviours.byCode ?? {}) as Record<string, unknown>
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
  }

  function selectCombo(id: string) {
    editor.activeComboId = id
    editor.comboNotice = null
  }

  function addCombo() {
    const combo = createEmptyCombo(combos)
    editor.updateCombos([...combos, combo])
    editor.activeComboId = combo.id
    editor.comboNotice = comboKeysMessage('too_few')
  }

  function removeActive() {
    if (!active) return
    const next = combos.filter(c => c.id !== active.id)
    editor.updateCombos(next)
    editor.activeComboId = next[0]?.id ?? null
    editor.comboNotice = null
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

  function bindingLabel(combo: ZmkCombo): string {
    try {
      return encodeKeyBinding(combo.binding)
    } catch {
      return String(combo.binding.value)
    }
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
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })
</script>

<aside class="combo-panel" aria-label="Combos">
  <header class="combo-head">
    <h2 class="combo-title">Combos</h2>
    <div class="combo-head-actions">
      <button type="button" class="combo-btn" onclick={addCombo}>New</button>
      <button
        type="button"
        class="combo-btn"
        aria-label="Done editing combos"
        title="Done editing combos (Esc)"
        onclick={closePanel}
      >
        Done
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

      <div class="combo-timeout" role="group" aria-label="Combo timeout">
        <div class="timeout-label-row">
          <span class="timeout-label">
            Timeout <strong>{timeoutMs}ms</strong>
            {#if !timeoutIsCustom}
              <span class="timeout-default">def</span>
            {/if}
          </span>
          <div class="timeout-presets">
            <button
              type="button"
              class="combo-btn quiet"
              class:on={timeoutMs === 30 && timeoutIsCustom}
              onclick={() => setTimeoutMs(30)}
            >
              Fast
            </button>
            <button
              type="button"
              class="combo-btn quiet"
              class:on={timeoutMs === 50}
              onclick={() => setTimeoutMs(50)}
              title="Firmware default when unmarked"
            >
              Norm
            </button>
            <button
              type="button"
              class="combo-btn quiet"
              class:on={timeoutMs === 100 && timeoutIsCustom}
              onclick={() => setTimeoutMs(100)}
            >
              Slow
            </button>
            {#if timeoutIsCustom}
              <button
                type="button"
                class="combo-btn quiet"
                onclick={clearTimeoutMs}
                title="Omit timeout-ms"
              >
                Def
              </button>
            {/if}
          </div>
        </div>
        <input
          class="timeout-range"
          type="range"
          min={COMBO_TIMEOUT_MS_MIN}
          max={COMBO_TIMEOUT_MS_MAX}
          step="5"
          value={timeoutMs}
          aria-label="Combo timeout in milliseconds"
          oninput={onTimeoutInput}
        />
      </div>

      <div class="combo-timeout" role="group" aria-label="Require prior idle">
        <div class="timeout-label-row">
          <span class="timeout-label">
            {#if priorIdleOn}
              Prior idle <strong>{priorIdleMs}ms</strong>
            {:else}
              Prior idle <span class="timeout-default">off</span>
            {/if}
          </span>
          <div class="timeout-presets">
            <button
              type="button"
              class="combo-btn quiet"
              class:on={!priorIdleOn}
              onclick={clearPriorIdleMs}
              title="Omit require-prior-idle-ms"
            >
              Off
            </button>
            <button
              type="button"
              class="combo-btn quiet"
              class:on={priorIdleOn && priorIdleMs === 50}
              onclick={() => setPriorIdleMs(50)}
            >
              50
            </button>
            <button
              type="button"
              class="combo-btn quiet"
              class:on={priorIdleOn && priorIdleMs === 100}
              onclick={() => setPriorIdleMs(100)}
            >
              100
            </button>
            <button
              type="button"
              class="combo-btn quiet"
              class:on={priorIdleOn && priorIdleMs === 200}
              onclick={() => setPriorIdleMs(200)}
            >
              200
            </button>
          </div>
        </div>
        {#if priorIdleOn}
          <input
            class="timeout-range"
            type="range"
            min={COMBO_PRIOR_IDLE_MS_MIN}
            max={COMBO_PRIOR_IDLE_MS_MAX}
            step="10"
            value={priorIdleMs}
            aria-label="Require prior idle in milliseconds"
            oninput={onPriorIdleInput}
          />
        {/if}
      </div>

      <div class="combo-layers" role="group" aria-label="Active layers">
        <div class="timeout-label-row">
          <span class="timeout-label">Layers</span>
          <button
            type="button"
            class="combo-btn quiet"
            class:on={layersAreGlobal}
            onclick={setAllLayers}
            title="Combo works on every layer"
          >
            All
          </button>
        </div>
        <div class="layer-chips">
          {#each Array.from({ length: layerCount }, (_, i) => i) as index (index)}
            <button
              type="button"
              class="combo-btn quiet layer-chip"
              class:on={!layersAreGlobal && selectedLayers.has(index)}
              title={layerNames[index] ?? `Layer ${index}`}
              aria-pressed={!layersAreGlobal && selectedLayers.has(index)}
              onclick={() => toggleLayer(index)}
            >
              {layerLegendSymbol(index)}
            </button>
          {/each}
        </div>
      </div>

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

  {#if combos.length === 0}
    <p class="combo-empty">No combos yet.</p>
  {:else}
    <ul class="combo-list" role="listbox" aria-label="Combo list">
      {#each combos as combo (combo.id)}
        {@const issue = comboKeysIssue(combo.keyPositions)}
        {@const soft =
          issue == null &&
          comboDesignHint(combo.keyPositions, layer0, combo.binding)}
        <li>
          <button
            type="button"
            class="combo-item"
            class:active={combo.id === editor.activeComboId}
            class:invalid={issue != null}
            class:soft-warn={!!soft}
            role="option"
            aria-selected={combo.id === editor.activeComboId}
            onclick={() => selectCombo(combo.id)}
          >
            <span class="combo-main">
              <span class="combo-id">{combo.id}</span>
              <span class="combo-bind">{bindingLabel(combo)}</span>
            </span>
            <span class="combo-meta">{comboListMeta(combo)}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</aside>

{#if session.editing && session.canEdit && session.activeSlot}
  <Modal onBackdrop={session.closeEditor}>
    <KeyEditor
      bindingLabel={session.bindingLabel}
      behaviours={session.behaviours}
      editorSlots={session.slots}
      activeCodeIndex={session.activeSlot.codeIndex}
      choices={session.choices}
      onSelectBehaviour={session.selectBehaviour}
      onSelectValue={session.selectValue}
      onToggleHold={session.toggleHold}
      onActivateSlot={openEditor}
      onConfirm={session.confirm}
      onCancel={session.closeEditor}
    />
  </Modal>
{/if}

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

  .combo-title {
    margin: 0;
    font-size: inherit;
    font-weight: 700;
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

  .combo-btn.quiet {
    height: 20px;
    padding: 0 5px;
    font-size: 0.9em;
  }

  .combo-btn.quiet.on {
    border-color: var(--accent, #3a7);
    background: color-mix(in srgb, var(--accent, #3a7) 16%, transparent);
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

  .combo-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-height: 0;
    flex: 1 1 auto;
    overflow: auto;
  }

  .combo-item {
    width: 100%;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px;
    align-items: start;
    margin: 0;
    padding: 5px 7px;
    text-align: left;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .combo-item:hover {
    background: color-mix(in srgb, var(--hover-selection) 35%, transparent);
  }

  .combo-item.active {
    border-color: var(--accent, #3a7);
    background: color-mix(in srgb, var(--accent, #3a7) 14%, transparent);
  }

  .combo-item.invalid .combo-meta {
    color: var(--danger, #b33);
  }

  .combo-item.soft-warn .combo-meta {
    color: var(--warning, #b8860b);
  }

  .combo-main {
    display: grid;
    gap: 1px;
    min-width: 0;
  }

  .combo-id {
    font-weight: 600;
  }

  .combo-bind {
    color: var(--text-muted);
    font-size: 0.9em;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .combo-meta {
    color: var(--text-muted);
    font-size: 0.82em;
    line-height: 1.25;
    text-align: right;
    max-width: 6.5rem;
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

  .combo-timeout,
  .combo-layers {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .timeout-label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
  }

  .timeout-label {
    color: var(--text-muted);
    font-size: 0.9em;
  }

  .timeout-label strong {
    color: var(--text);
    font-weight: 600;
  }

  .timeout-default {
    opacity: 0.7;
  }

  .timeout-range {
    width: 100%;
    margin: 0;
    accent-color: var(--accent, #3a7);
  }

  .timeout-presets,
  .layer-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }

  .layer-chip {
    min-width: 1.75rem;
    justify-content: center;
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
