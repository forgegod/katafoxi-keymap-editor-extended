<script lang="ts">
  import {
    ALT_GR_COLUMN_LABEL,
    ALT_GR_SHIFT_COLUMN_LABEL,
    addHostLanguage,
    encodeKeyBinding,
    hostLanguageName,
    hostLanguagesAvailable,
    hostLayoutChoice,
    isAddableHostLanguage,
    hostLayoutChoiceLabel,
    hostLegendColumns,
    hostLegendTableRow,
    getKeycodeCatalog,
    resolveBinding,
    replaceHostLanguage,
    removeHostLanguage,
    setHostColumnAlt,
    toggleHostLanguage,
    toggleShownLayer,
    type HostLanguageId,
    type HostLegendColumn,
    type KeyBindingNode
  } from '@keymap-editor/keymap-core'
  import { editor, hostLegendAnchorIndex } from '../editor.svelte.js'
  import EyeToggle from './EyeToggle.svelte'
  import HostProfileBar from './HostProfileBar.svelte'
  import HostProfileMenu from './HostProfileMenu.svelte'
  import Icon from './Common/Icon.svelte'

  const view = $derived(editor.hostLegend)
  const layers = $derived(editor.layerView)
  const columns = $derived(hostLegendColumns(view))
  const addable = $derived(hostLanguagesAvailable(view))
  const markedLayers = $derived(layers.shown)
  const layerNames = $derived(editor.hostLegendLayerNames)
  const anchorIndex = $derived(hostLegendAnchorIndex(editor.draftKeymap))
  const keycodes = $derived(getKeycodeCatalog().byCode)

  let hovered = $state(false)
  let pinned = $state(false)
  let focused = $state(false)
  let openProfile = $state<HostLanguageId | null>(null)
  let pickingNew = $state(false)
  let pickingFor = $state<HostLanguageId | null>(null)
  let renamingIndex = $state<number | null>(null)
  let editing = $state('')
  let pendingDelete = $state<{ index: number; name: string } | null>(null)
  let stripEl: HTMLDivElement | undefined = $state()
  const busy = $derived(renamingIndex != null || pendingDelete != null)
  const open = $derived(hovered || pinned || focused || busy)

  type LayerRow = {
    index: number
    name: string
    marked: boolean
    binding: KeyBindingNode | undefined
  }

  const allRows = $derived(
    layerNames.map((name, index): LayerRow => ({
      index,
      name,
      marked: markedLayers.includes(index),
      binding: editor.draftKeymap?.layers[index]?.[anchorIndex]
    }))
  )
  const collapsedRows = $derived(allRows.filter(row => row.marked))
  const visibleRows = $derived(open ? allRows : collapsedRows)

  function keycodeName(code: string) {
    const aliases = keycodes[code]?.aliases ?? [code]
    return aliases.reduce((best, name) => (name.length > best.length ? name : best))
  }

  function bindingTap(node: KeyBindingNode | undefined): string | null {
    if (!node) return null
    return resolveBinding(node).tap
  }

  function zmkCell(node: KeyBindingNode | undefined): string {
    const tap = bindingTap(node)
    if (tap) return keycodeName(tap)
    return node ? encodeKeyBinding(node) : ''
  }

  function activeProfileLabel(language: HostLanguageId): string {
    const id = editor.activeProfileId(language)
    const user = editor.profilesForLanguage(language).find(profile => profile.id === id)
    if (user) return user.name
    const choice = hostLayoutChoice(id)
    return choice ? hostLayoutChoiceLabel(choice) : ''
  }

  function toggleLanguage(language: HostLanguageId) {
    void editor.commitHostMap(toggleHostLanguage(view, language))
  }

  function applyLanguage(_language: HostLanguageId, next: ReturnType<typeof addHostLanguage>) {
    pickingNew = false
    pickingFor = null
    void editor.commitHostMap(next)
  }

  function addLanguage(language: HostLanguageId) {
    applyLanguage(language, addHostLanguage(view, language))
  }

  const REMOVE_LANGUAGE = '__remove__'

  function languageChoices(): HostLanguageId[] {
    return hostLanguagesAvailable(view)
  }

  function startAddLanguage() {
    if (addable.length === 0) return
    pickingNew = true
    pickingFor = null
    openProfile = null
  }

  function pickNewLanguage(value: string) {
    if (!isAddableHostLanguage(value)) return
    addLanguage(value)
  }

  function toggleLanguagePicker(column: HostLegendColumn) {
    if (!isAddableHostLanguage(column.language)) return
    if (!column.wide) void editor.commitHostMap(toggleHostLanguage(view, column.language))
    pickingNew = false
    pickingFor = pickingFor === column.language ? null : column.language
    openProfile = null
  }

  function changeLanguage(from: HostLanguageId, value: string) {
    if (value === REMOVE_LANGUAGE) {
      pickingNew = false
      pickingFor = null
      void editor.commitHostMap(removeHostLanguage(view, from))
      return
    }
    if (!isAddableHostLanguage(value) || value === from) {
      pickingFor = null
      return
    }
    applyLanguage(value, replaceHostLanguage(view, from, value))
  }

  function focusSelect(node: HTMLSelectElement) {
    node.focus()
  }

  function toggleLayer(index: number) {
    if (index === 0) {
      editor.layerView = { ...layers, layer0Raw: !layers.layer0Raw }
      return
    }
    editor.layerView = toggleShownLayer(layers, index)
  }

  function toggleAlt(language: HostLanguageId, field: 'altGr' | 'altGrShift', on: boolean) {
    void editor.commitHostMap(setHostColumnAlt(view, language, field, !on))
  }

  const columnCount = $derived(
    2 +
      columns.reduce((count, column) => count + (column.wide ? 3 : 1), 0) +
      (addable.length || pickingNew ? 1 : 0)
  )

  function hoverLayer(layer: number) {
    editor.legendHover = { kind: 'layer', layer }
  }

  function hoverAlt(kind: 'altGr' | 'altGrShift') {
    editor.legendHover = { kind }
  }

  function clearHover() {
    editor.legendHover = null
  }

  function handleFocusOut(event: FocusEvent) {
    const root = event.currentTarget as HTMLElement
    const next = event.relatedTarget
    if (next instanceof Node && root.contains(next)) return
    focused = false
  }

  function handleMouseLeave() {
    hovered = false
    if (pinned || busy) return
    focused = false
    const active = document.activeElement
    if (active instanceof HTMLElement && stripEl?.contains(active)) active.blur()
  }

  function cancelRename() {
    renamingIndex = null
    editing = ''
  }

  function finishRename() {
    if (renamingIndex == null) return
    const index = renamingIndex
    const name = editing
    cancelRename()
    editor.renameLayer(index, name)
  }

  function startRename(event: MouseEvent, index: number) {
    event.stopPropagation()
    pendingDelete = null
    renamingIndex = index
    editing = layerNames[index] ?? ''
  }

  function requestDelete(event: MouseEvent, index: number, name: string) {
    event.stopPropagation()
    cancelRename()
    pendingDelete = { index, name }
  }

  function confirmDelete() {
    if (!pendingDelete) return
    const index = pendingDelete.index
    pendingDelete = null
    editor.deleteLayer(index)
  }

  function cancelDelete() {
    pendingDelete = null
  }

  function focusInput(node: HTMLInputElement) {
    node.focus()
    node.select()
  }

  function onRenameKey(event: KeyboardEvent) {
    if (event.key === 'Enter') finishRename()
    if (event.key === 'Escape') {
      event.stopPropagation()
      cancelRename()
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    if (pickingNew || pickingFor) {
      pickingNew = false
      pickingFor = null
      event.stopPropagation()
      return
    }
    if (renamingIndex != null) {
      cancelRename()
      event.stopPropagation()
      return
    }
    if (pendingDelete) {
      cancelDelete()
      event.stopPropagation()
      return
    }
    pinned = false
    hovered = false
  }

  $effect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!stripEl || stripEl.contains(event.target as Node)) return
      cancelRename()
      cancelDelete()
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  })

  function togglePinned(event: MouseEvent) {
    event.stopPropagation()
    pinned = !pinned
  }
</script>

{#snippet languageHead(column: HostLegendColumn, interactive: boolean)}
  {@const choice = hostLayoutChoice(column.layoutId)}
  {@const language = column.language}
  {@const extra = isAddableHostLanguage(language)}
  {@const choosing = pickingFor === language}
  <div class="lang-head" class:narrow={!column.wide && !choosing}>
    {#if interactive}
      <EyeToggle
        on={column.shown}
        label={column.shown ? `Скрыть ${choice?.languageName ?? language}` : `Показать ${choice?.languageName ?? language}`}
        onclick={() => toggleLanguage(language)}
      />
      {#if extra}
        <button
          type="button"
          class="lang-flag"
          title={choice?.languageName ?? language}
          aria-label={`Язык ${choice?.languageName ?? language}`}
          aria-expanded={choosing}
          onclick={() => toggleLanguagePicker(column)}
        >
          {choice?.flag ?? '—'}
        </button>
      {:else}
        <span class="lang-flag" title={choice?.languageName ?? language}>{choice?.flag ?? '—'}</span>
      {/if}
      <div class="lang-tools" hidden={!column.wide && !choosing}>
        {#if choosing}
          <select
            use:focusSelect
            class="language-select"
            aria-label="Язык"
            value=""
            onchange={event => changeLanguage(language, event.currentTarget.value)}
          >
            <option value="" disabled hidden></option>
            <option value={REMOVE_LANGUAGE}>Убрать язык</option>
            {#each languageChoices() as option (option)}
              <option value={option}>{hostLanguageName(option)}</option>
            {/each}
          </select>
        {/if}
        {#if column.wide}
          <HostProfileMenu
            {language}
            languageName={choice?.languageName ?? language}
            open={openProfile === language}
            onToggle={() => {
              openProfile = openProfile === language ? null : language
            }}
            onClose={() => {
              if (openProfile === language) openProfile = null
            }}
          />
        {/if}
      </div>
    {:else}
      <span class="eye-spacer"></span>
      <span class="lang-flag">{choice?.flag ?? '—'}</span>
      {#if column.wide}
        <span class="profile-name">{activeProfileLabel(language)}</span>
      {/if}
    {/if}
  </div>
{/snippet}

{#snippet altHead(column: HostLegendColumn, field: 'altGr' | 'altGrShift', label: string, name: string, interactive: boolean)}
  <th
    class:off={!column[field]}
    onmouseenter={interactive ? () => hoverAlt(field) : undefined}
    onmouseleave={interactive ? clearHover : undefined}
  >
    {#if interactive}
      <button
        type="button"
        class="col-toggle"
        class:on={column[field]}
        aria-label={name}
        title={name}
        onclick={() => toggleAlt(column.language, field, column[field])}
      >
        {label}
      </button>
    {:else}
      {label}
    {/if}
  </th>
{/snippet}

{#snippet legendTable(rows: LayerRow[], interactive: boolean)}
  <table>
    <thead>
      <tr>
        <th>
          {#if interactive}
            <button
              type="button"
              class="layer-disclosure"
              class:on={open}
              aria-expanded={open}
              aria-pressed={pinned}
              aria-controls="host-legend-layers"
              aria-label="Show all layers"
              onclick={togglePinned}
            >
              {open ? '▾' : '▸'}
            </button>
          {/if}
        </th>
        <th>ZMK keycode</th>
        {#each columns as column (column.language)}
          <th class:off={!column.shown} class:narrow={!column.wide}>
            {@render languageHead(column, interactive)}
          </th>
          {#if column.wide}
            {@render altHead(column, 'altGr', ALT_GR_COLUMN_LABEL, 'AltGr', interactive)}
            {@render altHead(column, 'altGrShift', ALT_GR_SHIFT_COLUMN_LABEL, 'AltGr+Shift', interactive)}
          {/if}
        {/each}
        {#if interactive && pickingNew}
          <th class="add-language-cell">
            <div class="lang-head">
              <select
                use:focusSelect
                class="language-select"
                aria-label="Язык"
                value=""
                onchange={event => pickNewLanguage(event.currentTarget.value)}
              >
                <option value="" disabled>Язык</option>
                {#each languageChoices() as option (option)}
                  <option value={option}>{hostLanguageName(option)}</option>
                {/each}
              </select>
            </div>
          </th>
        {:else if interactive && addable.length > 0}
          <th class="add-language-cell">
            <button
              type="button"
              class="add-language"
              aria-label="Добавить язык"
              title="Добавить язык"
              onclick={startAddLanguage}
            >
              +
            </button>
          </th>
        {/if}
      </tr>
    </thead>
    <tbody id={interactive ? 'host-legend-layers' : undefined}>
      {#each rows as row (row.index)}
        {@const cells = hostLegendTableRow(row.binding, view)}
        <tr
          data-layer={row.index}
          class:off={!row.marked}
          class:raw={row.index === 0 && layers.layer0Raw}
          onmouseenter={interactive ? () => hoverLayer(row.index) : undefined}
          onmouseleave={interactive ? clearHover : undefined}
        >
          <th scope="row">
            <div class="row-head">
              {#if interactive}
                <EyeToggle
                  on={row.index === 0 ? !layers.layer0Raw : row.marked}
                  label={
                    row.index === 0
                      ? `Показать host-легенду ${row.name}`
                      : `Показать ${row.name}`
                  }
                  onclick={() => toggleLayer(row.index)}
                />
                {#if renamingIndex === row.index}
                  <input
                    use:focusInput
                    class="name layer-name"
                    value={editing}
                    oninput={event => (editing = event.currentTarget.value)}
                    onkeydown={onRenameKey}
                  />
                {:else}
                  <button
                    type="button"
                    class="layer-name"
                    onclick={event => startRename(event, row.index)}
                  >
                    {row.name}
                  </button>
                {/if}
                {#if layerNames.length > 1}
                  <Icon
                    name="times-circle"
                    class="delete"
                    title={`Delete layer ${row.name}`}
                    onclick={event => requestDelete(event, row.index, row.name)}
                  />
                {/if}
              {:else}
                <span class="eye-spacer"></span>
                {row.name}
              {/if}
            </div>
          </th>
          <td class="zmk">{zmkCell(row.binding)}</td>
          {#each columns as column (column.language)}
            <td class:second={column.language !== 'en'} class:off={!column.shown} class:narrow={!column.wide}>
              {cells.find(item => item.language === column.language)?.pair ?? ''}
            </td>
            {#if column.wide}
              <td class="alt" class:off={!column.altGr}>{cells.find(item => item.language === column.language)?.altGr ?? ''}</td>
              <td class="alt" class:off={!column.altGrShift}>
                {cells.find(item => item.language === column.language)?.altGrShift ?? ''}
              </td>
            {/if}
          {/each}
          {#if interactive && (pickingNew || addable.length > 0)}
            <td></td>
          {/if}
        </tr>
      {/each}
    </tbody>
    {#if interactive && open}
      <tfoot>
        <tr>
          <th colspan={columnCount}>
            <button type="button" class="add-layer" onclick={() => editor.addLayer()}>
              Add Layer
            </button>
          </th>
        </tr>
      </tfoot>
    {/if}
  </table>
{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  bind:this={stripEl}
  class="host-legend-strip"
  class:expanded={open}
  class:pinned
  role="region"
  aria-label="Host legend"
  onmouseenter={() => (hovered = true)}
  onmouseleave={handleMouseLeave}
  onfocusin={() => (focused = true)}
  onfocusout={handleFocusOut}
  onkeydown={handleKeydown}
>
  <div class="legend-sizer" aria-hidden="true" inert>
    {@render legendTable(collapsedRows, false)}
  </div>
  <div class="legend-panel" style="position: absolute">
    {@render legendTable(visibleRows, true)}
    <HostProfileBar />
    {#if pendingDelete}
      <div class="delete-confirm" role="alertdialog" aria-label="Delete layer">
        <p>Delete layer {pendingDelete.name}?</p>
        <div class="delete-confirm-actions">
          <button type="button" class="confirm-delete" onclick={confirmDelete}>
            Delete
          </button>
          <button type="button" class="cancel-delete" onclick={cancelDelete}>
            Cancel
          </button>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .host-legend-strip {
    position: relative;
    z-index: 4;
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 16px 24px;
    width: max-content;
    padding: 6px 4px 2px;
    font-size: 13px;
    color: #444;
  }

  .legend-sizer {
    visibility: hidden;
    pointer-events: none;
  }

  .legend-panel {
    position: absolute;
    top: 6px;
    left: 4px;
    z-index: 4;
    background: var(--page-bg, #fff);
  }

  .host-legend-strip.expanded .legend-panel {
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
  }

  table {
    border-collapse: collapse;
    width: max-content;
    border: 1px solid rgba(60, 60, 60, 0.16);
  }

  th,
  td {
    padding: 2px 5px;
    text-align: left;
    font-weight: 500;
    white-space: nowrap;
    border: 1px solid rgba(60, 60, 60, 0.08);
  }

  thead th {
    font-size: 12px;
    color: #666;
  }

  tbody th {
    color: #888;
    font-size: 11px;
    font-weight: 400;
  }

  .zmk {
    color: #9a9a9a;
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 12px;
  }

  .second {
    color: #1d6f8a;
  }

  .alt {
    opacity: 0.75;
  }

  .off {
    opacity: 0.4;
  }

  tr.raw td:not(.zmk) {
    opacity: 0.4;
  }

  .lang-head,
  .row-head {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .lang-head.narrow,
  th.narrow,
  td.narrow {
    min-width: 0;
    width: 1%;
  }

  .lang-tools {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .lang-tools[hidden] {
    display: none;
  }

  .language-select {
    max-width: 7.5rem;
    min-height: 24px;
    padding: 1px 4px;
    font: inherit;
    font-size: 12px;
  }

  .add-language-cell {
    width: 1%;
  }

  .add-language {
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1px dashed #1d6f8a;
    border-radius: 4px;
    background: #fff;
    color: #1d6f8a;
    font: inherit;
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
  }

  .add-language:hover {
    background: rgba(29, 111, 138, 0.08);
  }

  .lang-flag {
    font-size: 16px;
    line-height: 1.2;
  }

  button.lang-flag {
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 16px;
    line-height: 1.2;
    cursor: pointer;
  }

  .profile-name {
    font-size: 12px;
    color: #666;
  }

  .eye-spacer {
    display: inline-block;
    width: 16px;
    height: 16px;
    padding: 1px;
  }

  .col-toggle,
  .layer-disclosure {
    margin: 0;
    padding: 1px 6px;
    border: 1px solid #ccc;
    border-radius: 10px;
    background: #f3f3f3;
    color: #777;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .col-toggle.on,
  .layer-disclosure.on {
    background: #fff;
    border-color: #1d6f8a;
    color: #333;
  }

  .layer-name {
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    cursor: text;
  }

  input.layer-name {
    width: 8em;
    padding: 0 2px;
    border: 1px solid #ccc;
    border-radius: 3px;
    background: #fff;
    color: #222;
    cursor: text;
  }

  .row-head :global(.delete) {
    flex: none;
    width: 14px;
    height: 14px;
    color: #999;
    cursor: pointer;
  }

  .row-head :global(.delete:hover) {
    color: #c0392b;
  }

  .add-layer {
    margin: 0;
    padding: 1px 0;
    border: 0;
    background: transparent;
    color: #1d6f8a;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }

  .add-layer:hover {
    text-decoration: underline;
  }

  tfoot th {
    font-weight: 400;
  }

  .delete-confirm {
    position: absolute;
    top: calc(100% - 2px);
    left: 0;
    z-index: 5;
    margin: 0;
    padding: 10px 12px;
    width: 180px;
    background: #fff;
    color: #222;
    border-radius: 8px;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.28);
  }

  .delete-confirm p {
    margin: 0 0 8px;
    font-size: 90%;
  }

  .delete-confirm-actions {
    display: flex;
    gap: 6px;
  }

  .delete-confirm button {
    flex: 1;
    height: 26px;
    border: none;
    border-radius: 13px;
    cursor: pointer;
    font: inherit;
    font-size: 85%;
  }

  .confirm-delete {
    background: #c0392b;
    color: #fff;
  }

  .cancel-delete {
    background: #ddd;
    color: #333;
  }
</style>
