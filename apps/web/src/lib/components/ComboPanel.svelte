<script lang="ts">
  import {
    COMBO_MAX_KEYS,
    COMBO_MIN_KEYS,
    comboKeysIssue,
    comboKeysMessage,
    createEmptyCombo,
    encodeKeyBinding,
    type ZmkCombo
  } from '@keymap-editor/keymap-core'
  import { getDefinitionsContext, getSearchContext } from '../context'
  import { editor } from '../editor.svelte.js'
  import { createKeyEditSession } from '../key-edit-session.svelte'
  import Modal from './Common/Modal.svelte'
  import KeyEditor from './KeyEditor/KeyEditor.svelte'

  const definitionsBox = getDefinitionsContext()
  const searchBox = getSearchContext()

  const combos = $derived(editor.draftKeymap?.combos ?? [])
  const active = $derived(
    combos.find(c => c.id === editor.activeComboId) ?? null
  )
  const activeIssue = $derived(
    active ? comboKeysIssue(active.keyPositions) : null
  )
  const activeHint = $derived(
    editor.comboNotice ?? comboKeysMessage(activeIssue)
  )

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
      patchActive({ binding })
    }
  })

  function patchActive(patch: Partial<ZmkCombo>) {
    if (!active) return
    const next = combos.map(c =>
      c.id === active.id ? { ...c, ...patch } : c
    )
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

  function positionLabel(combo: ZmkCombo): string {
    const n = combo.keyPositions.length
    if (n === 0) return 'no keys'
    if (n === 1) return '1 key — need 2+'
    if (n > COMBO_MAX_KEYS) return `${n} keys — max ${COMBO_MAX_KEYS}`
    return combo.keyPositions.join(' · ')
  }

  function closePanel() {
    editor.tryExitComboMode()
  }
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
        title="Done editing combos"
        onclick={closePanel}
      >
        Done
      </button>
    </div>
  </header>

  {#if combos.length === 0}
    <p class="combo-empty">
      No combos yet. New creates one; click {COMBO_MIN_KEYS}–{COMBO_MAX_KEYS} keys
      on the board.
    </p>
  {:else}
    <ul class="combo-list" role="listbox" aria-label="Combo list">
      {#each combos as combo (combo.id)}
        {@const issue = comboKeysIssue(combo.keyPositions)}
        <li>
          <button
            type="button"
            class="combo-item"
            class:active={combo.id === editor.activeComboId}
            class:invalid={issue != null}
            role="option"
            aria-selected={combo.id === editor.activeComboId}
            onclick={() => selectCombo(combo.id)}
          >
            <span class="combo-id">{combo.id}</span>
            <span class="combo-bind">{bindingLabel(combo)}</span>
            <span class="combo-pos">{positionLabel(combo)}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  {#if active}
    <div class="combo-detail">
      <label class="combo-field">
        <span>Id</span>
        <input
          type="text"
          value={active.id}
          spellcheck="false"
          onchange={renameActive}
        />
      </label>
      <div class="combo-actions">
        <button type="button" class="combo-btn" onclick={editBinding}>
          Edit binding
        </button>
        <button type="button" class="combo-btn danger" onclick={removeActive}>
          Delete
        </button>
      </div>
      {#if activeHint}
        <p class="combo-warn" role="status">{activeHint}</p>
      {:else}
        <p class="combo-hint">
          Click keys on the board ({COMBO_MIN_KEYS}–{COMBO_MAX_KEYS}) to set
          positions.
        </p>
      {/if}
    </div>
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
    flex: 0 0 14rem;
    width: 14rem;
    align-self: stretch;
    max-height: 100%;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 8px 10px;
    border: 1px solid color-mix(in srgb, var(--shade) 12%, transparent);
    border-radius: 8px;
    background: color-mix(in srgb, var(--surface) 70%, transparent);
    color: var(--text);
    font-size: var(--font-sm, 0.85rem);
  }

  .combo-head {
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

  .combo-btn {
    height: 24px;
    padding: 0 8px;
    border: 1px solid var(--border);
    border-radius: 5px;
    background: var(--surface-sunken);
    color: var(--text);
    font: inherit;
    cursor: pointer;
  }

  .combo-btn.danger {
    color: var(--danger, #b33);
  }

  .combo-empty,
  .combo-hint {
    margin: 0;
    color: var(--text-muted);
    line-height: 1.35;
  }

  .combo-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    max-height: 12rem;
    overflow: auto;
  }

  .combo-item {
    width: 100%;
    display: grid;
    grid-template-columns: 1fr;
    gap: 1px;
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

  .combo-item.invalid .combo-pos {
    color: var(--danger, #b33);
  }

  .combo-id {
    font-weight: 600;
  }

  .combo-bind,
  .combo-pos {
    color: var(--text-muted);
    font-size: 0.92em;
  }

  .combo-detail {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 4px;
    border-top: 1px solid color-mix(in srgb, var(--shade) 12%, transparent);
  }

  .combo-field {
    display: grid;
    gap: 2px;
    font-size: 0.92em;
    color: var(--text-muted);
  }

  .combo-field input {
    height: 26px;
    padding: 0 6px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: var(--surface-sunken);
    color: var(--text);
    font: inherit;
  }

  .combo-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .combo-warn {
    margin: 0;
    color: var(--danger, #b33);
    line-height: 1.35;
  }
</style>
