<script lang="ts">
  import {
    builtinLanguageProfileId,
    builtinLanguageProfileLabel,
    encodeKeyBinding,
    hostLayoutChoice,
    hostLayoutsForLanguage,
    hostLegendFor,
    hostLegendPreview,
    getKeycodeCatalog,
    hostLegendView,
    parseBuiltinLanguageProfileId,
    resolveBinding,
    toggleShownLayer,
    type HostLanguageId,
    type KeyBindingNode
  } from '@keymap-editor/keymap-core'
  import { editor, hostLegendAnchorIndex } from '../editor.svelte.js'
  import { isBuiltinLanguageProfile } from '../host-profiles.js'
  import EyeToggle from './EyeToggle.svelte'
  import HostProfileBar from './HostProfileBar.svelte'
  import Icon from './Common/Icon.svelte'

  const view = $derived(editor.hostLegend)
  const base = $derived(hostLayoutChoice(view.baseId))
  const secondId = $derived(
    view.secondId ??
      hostLayoutsForLanguage('ru').find(choice => choice.kind === 'in-layout')?.id ??
      view.baseId
  )
  const second = $derived(hostLayoutChoice(secondId))
  const baseOn = $derived(view.baseVisible !== false)
  const secondOn = $derived(view.secondId != null && view.secondVisible !== false)
  const markedLayers = $derived(view.shownLayers ?? [0, 1, 2, 3])
  const layerNames = $derived(editor.hostLegendLayerNames)
  const anchorIndex = $derived(hostLegendAnchorIndex(editor.draftKeymap))
  const keycodes = $derived(getKeycodeCatalog().byCode)

  let hovered = $state(false)
  let pinned = $state(false)
  let focused = $state(false)
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

  function chooseColumnProfile(language: HostLanguageId, id: string) {
    void editor.selectLanguageProfile(language, id)
  }

  function activeProfileLabel(language: HostLanguageId): string {
    const id = editor.activeProfileId(language)
    const builtin = parseBuiltinLanguageProfileId(id)
    if (builtin) return builtinLanguageProfileLabel(builtin.kind)
    return editor.profilesForLanguage(language).find(profile => profile.id === id)?.name ?? ''
  }

  function toggleBase() {
    editor.hostLegend = hostLegendPreview(view, { baseVisible: !baseOn })
  }

  function toggleSecond() {
    if (secondOn) {
      editor.hostLegend = hostLegendPreview(view, { secondVisible: false })
      return
    }
    if (view.secondId) {
      editor.hostLegend = hostLegendPreview(view, { secondVisible: true })
      return
    }
    void editor.commitHostMap(
      hostLegendPreview(hostLegendView(view, { secondId }), {
        secondVisible: true
      })
    )
  }

  function toggleLayer(index: number) {
    if (index === 0) {
      editor.hostLegend = hostLegendPreview(view, { layer0Raw: !view.layer0Raw })
      return
    }
    editor.hostLegend = toggleShownLayer(view, index)
  }

  function toggleAlt(field: 'altGr' | 'altGrShift') {
    editor.hostLegend = hostLegendPreview(view, { [field]: !view[field] })
  }

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

{#snippet profileIcons(language: HostLanguageId)}
  {@const canEdit = !isBuiltinLanguageProfile(editor.activeProfileId(language))}
  <button
    type="button"
    class="profile-icon"
    title="Сохранить как новый профиль"
    aria-label="Сохранить как новый профиль"
    onclick={() => editor.beginSaveHostProfile(language)}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 3h11l3 3v15H5z" />
      <path d="M8 3v6h8V3" />
      <path d="M8 21v-6h8v6" />
    </svg>
  </button>
  <button
    type="button"
    class="profile-icon"
    title="Скопировать профиль"
    aria-label="Скопировать профиль"
    onclick={() => editor.beginCopyHostProfile(language)}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="8" y="8" width="12" height="12" rx="1.5" />
      <path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8" />
    </svg>
  </button>
  <button
    type="button"
    class="profile-icon stub"
    title="Переименовать профиль"
    aria-label="Переименовать профиль"
    disabled={!canEdit}
    onclick={() => editor.beginRenameHostProfile(language)}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20h4L18 10l-4-4L4 16v4z" />
      <path d="M13 7l4 4" />
    </svg>
  </button>
  <button
    type="button"
    class="profile-icon stub danger"
    title="Удалить профиль"
    aria-label="Удалить профиль"
    disabled={!canEdit}
    onclick={() => editor.beginDeleteHostProfile(language)}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  </button>
{/snippet}

{#snippet languageHead(
  language: HostLanguageId,
  choice: ReturnType<typeof hostLayoutChoice>,
  visible: boolean,
  toggle: () => void,
  eyeLabel: string,
  interactive: boolean
)}
  <div class="lang-head">
    {#if interactive}
      <EyeToggle on={visible} label={eyeLabel} onclick={toggle} />
      <span class="lang-flag" title={choice?.languageName ?? language}>{choice?.flag ?? '—'}</span>
      <select
        class="profile-select"
        aria-label="Профиль {choice?.languageName ?? language}"
        value={editor.activeProfileId(language)}
        onchange={event => chooseColumnProfile(language, event.currentTarget.value)}
      >
        {#each hostLayoutsForLanguage(language) as option (option.id)}
          <option value={builtinLanguageProfileId(language, option.kind)}>
            {builtinLanguageProfileLabel(option.kind)}
          </option>
        {/each}
        {#each editor.profilesForLanguage(language) as profile (profile.id)}
          <option value={profile.id}>{profile.name}</option>
        {/each}
      </select>
      {@render profileIcons(language)}
    {:else}
      <span class="eye-spacer"></span>
      <span class="lang-flag">{choice?.flag ?? '—'}</span>
      <span class="profile-name">{activeProfileLabel(language)}</span>
    {/if}
  </div>
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
        <th class:off={!baseOn}>
          {@render languageHead('en', base, baseOn, toggleBase, 'Показать первый язык', interactive)}
        </th>
        <th class:off={!secondOn}>
          {@render languageHead(
            'ru',
            second,
            secondOn,
            toggleSecond,
            'Показать второй язык',
            interactive
          )}
        </th>
        <th
          class:off={!view.altGr}
          onmouseenter={interactive ? () => hoverAlt('altGr') : undefined}
          onmouseleave={interactive ? clearHover : undefined}
        >
          {#if interactive}
            <button
              type="button"
              class="col-toggle"
              class:on={view.altGr}
              onclick={() => toggleAlt('altGr')}
            >
              AltGr
            </button>
          {:else}
            AltGr
          {/if}
        </th>
        <th
          class:off={!view.altGrShift}
          onmouseenter={interactive ? () => hoverAlt('altGrShift') : undefined}
          onmouseleave={interactive ? clearHover : undefined}
        >
          {#if interactive}
            <button
              type="button"
              class="col-toggle"
              class:on={view.altGrShift}
              onclick={() => toggleAlt('altGrShift')}
            >
              AltGr+Shift
            </button>
          {:else}
            AltGr+Shift
          {/if}
        </th>
      </tr>
    </thead>
    <tbody id={interactive ? 'host-legend-layers' : undefined}>
      {#each rows as row (row.index)}
        {@const tap = bindingTap(row.binding)}
        {@const letter = tap ? hostLegendFor(tap, view) : null}
        <tr
          data-layer={row.index}
          class:off={!row.marked}
          class:raw={row.index === 0 && view.layer0Raw}
          onmouseenter={interactive ? () => hoverLayer(row.index) : undefined}
          onmouseleave={interactive ? clearHover : undefined}
        >
          <th scope="row">
            <div class="row-head">
              {#if interactive}
                <EyeToggle
                  on={row.index === 0 ? !view.layer0Raw : row.marked}
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
          <td>{letter ? `${letter.en[0]}${letter.en[1]}` : ''}</td>
          <td class="second" class:off={!secondOn}>
            {letter?.second ? `${letter.second[0]}${letter.second[1]}` : ''}
          </td>
          <td class="alt" class:off={!view.altGr}>{view.altGr ? (letter?.altGr ?? '') : ''}</td>
          <td class="alt" class:off={!view.altGrShift}>
            {view.altGrShift ? (letter?.altGrShift ?? '') : ''}
          </td>
        </tr>
      {/each}
    </tbody>
    {#if interactive && open}
      <tfoot>
        <tr>
          <th colspan="6">
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

  .lang-head {
    min-width: 16.5rem;
  }

  .lang-flag {
    font-size: 16px;
    line-height: 1.2;
  }

  .profile-select {
    max-width: 9.5rem;
    min-height: 24px;
    padding: 1px 4px;
    font: inherit;
    font-size: 12px;
  }

  .profile-name {
    font-size: 12px;
    color: #666;
  }

  .profile-icon {
    width: 22px;
    height: 22px;
    padding: 0;
    margin: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border: 1px solid #ccc;
    border-radius: 4px;
    background: #fff;
    color: #333;
    cursor: pointer;
  }

  .profile-icon.stub {
    background: transparent;
    color: #555;
  }

  .profile-icon.stub:hover:not(:disabled),
  .profile-icon.stub:focus-visible:not(:disabled) {
    background: rgba(0, 0, 0, 0.06);
  }

  .profile-icon.danger:not(:disabled) {
    color: #842029;
    border-color: #e2b6bb;
  }

  .profile-icon:disabled {
    color: #ccc;
    border-color: #e6e6e6;
    cursor: not-allowed;
  }

  .profile-icon svg {
    width: 13px;
    height: 13px;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
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
