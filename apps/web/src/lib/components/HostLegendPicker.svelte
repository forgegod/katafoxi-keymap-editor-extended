<script lang="ts">
  import { onDestroy, tick } from 'svelte'
  import {
    conditionalLayerRowPeer,
    conditionalLayerWhenTitle,
    hostLanguagesAvailable,
    hostLegendColumns,
    type HostLanguageId,
    type ParsedKeymap
  } from '@keymap-editor/keymap-core'
  import { editor } from '../editor.svelte.js'
  import { clickOutside } from '../actions/click-outside'
  import HostAssemblyBar from './HostAssemblyBar.svelte'
  import HostLegendLanguageHead from './HostLegendLanguageHead.svelte'
  import HostSymbolCatalog from './HostSymbolCatalog.svelte'
  import HostLegendLayerRow, {
    type HostLegendLayerRowModel
  } from './HostLegendLayerRow.svelte'
  import ConditionalLayers from './ConditionalLayers.svelte'
  import HostLegendView from './HostLegendView.svelte'
  import HostProfileBar from './HostProfileBar.svelte'

  const view = $derived(editor.hostLegend)
  const layers = $derived(editor.layerView)
  const multilang = $derived(editor.multilangViewOn)
  const columns = $derived(
    multilang
      ? hostLegendColumns(view).map(column => ({ ...column, wide: true, shown: true }))
      : hostLegendColumns(view)
  )
  const addable = $derived(hostLanguagesAvailable(view))
  const markedLayers = $derived(layers.shown)
  const layerNames = $derived(editor.hostLegendLayerNames)
  const anchorIndex = $derived(editor.legendAnchorIndex)

  interface Props {
    /** Keep the layer table expanded (coach tour). */
    forceOpen?: boolean
  }

  let { forceOpen = false }: Props = $props()

  let hovered = $state(false)
  let focused = $state(false)
  let openProfile = $state<HostLanguageId | null>(null)
  let pickingNew = $state(false)
  let pickingFor = $state<HostLanguageId | null>(null)
  let renamingIndex = $state<number | null>(null)
  let editing = $state('')
  let pendingDelete = $state<{ index: number; name: string } | null>(null)
  let editingWhen = $state(false)
  let operationMessage = $state('')
  // Capture the actual draft, not just an index that another edit could retarget.
  type MoveDraft = { index: number; document: ParsedKeymap }
  let pendingMove = $state.raw<MoveDraft | null>(null)
  let draggedMove = $state.raw<MoveDraft | null>(null)
  let dropTarget = $state<number | null>(null)
  let restoringFocus = $state(false)
  let moveTarget = $state(1)
  let stripEl: HTMLDivElement | undefined = $state()
  let panelEl: HTMLDivElement | undefined = $state()
  let confirmDeleteBtn: HTMLButtonElement | undefined = $state()
  /** Resting strip size while the overlay is expanded (panel is position:absolute). */
  let sizerWidth = $state(0)
  let sizerHeight = $state(0)
  const busy = $derived(renamingIndex != null || pendingDelete != null || editingWhen || pendingMove != null)
  onDestroy(editor.registerLayerOperationGuard(() => {
    if (renamingIndex != null) return 'layer name'
    if (pendingDelete != null) return 'layer deletion'
    if (editingWhen) return 'conditional rule'
    if (pendingMove) return 'layer move'
    return null
  }))
  const open = $derived(forceOpen || hovered || focused || busy || draggedMove != null || restoringFocus)

  function captureRestingSize() {
    const body = panelEl?.querySelector('.legend-body')
    if (!(body instanceof HTMLElement)) return
    sizerWidth = body.offsetWidth
    sizerHeight = body.offsetHeight
  }

  const conditionalRules = $derived(editor.draftKeymap?.conditionalLayers ?? [])
  const allRows = $derived(
    layerNames.map(
      (name, index): HostLegendLayerRowModel => ({
        index,
        name,
        marked: markedLayers.includes(index),
        binding: editor.draftKeymap?.layers[index]?.[anchorIndex],
        whenTitle: conditionalLayerWhenTitle(conditionalRules, index, layerNames),
        peer: conditionalLayerRowPeer(index, editor.legendHover, conditionalRules)
      })
    )
  )
  /** Resting strip: the sample layer. Marked and hidden layers open over the board. */
  const restingRows = $derived.by(() => {
    const sample = allRows.filter(row => row.index === 0)
    return sample.length > 0 ? sample : allRows.slice(0, 1)
  })
  const visibleRows = $derived(
    (open ? allRows : restingRows).filter(row => !multilang || row.index === 0)
  )

  const columnCount = $derived(
    1 +
      columns.reduce((count, column) => count + (column.wide ? 3 : 1), 0) +
      (addable.length || pickingNew ? 1 : 0)
  )

  function handleFocusOut(event: FocusEvent) {
    const root = event.currentTarget as HTMLElement
    const next = event.relatedTarget
    if (next instanceof Node && root.contains(next)) return
    focused = false
  }

  function handleMouseLeave() {
    hovered = false
    if (busy) return
    const active = document.activeElement
    // Pointer movement must not dismiss keyboard-focused structural controls.
    if (active instanceof HTMLElement && stripEl?.contains(active) && active.matches('[data-layer-action]')) return
    focused = false
    if (active instanceof HTMLElement && stripEl?.contains(active)) active.blur()
  }

  function cancelRename() {
    renamingIndex = null
    editing = ''
  }

  async function focusLayerAction(index: number, action: 'duplicate' | 'move') {
    const currentDocument = editor.draftKeymap
    // Removing the select fires focusout before the replacement control can focus.
    restoringFocus = true
    await tick()
    if (editor.draftKeymap === currentDocument) {
      panelEl?.querySelector<HTMLButtonElement>(`tr[data-layer="${index}"] [data-layer-action="${action}"]`)?.focus()
    }
    restoringFocus = false
  }

  function duplicateLayer(index: number) {
    const result = editor.duplicateLayer(index)
    operationMessage = result.ok
      ? `Appended ${editor.hostLegendLayerNames.at(-1)}. References still target the original layers.`
      : result.error
    void focusLayerAction(index, 'duplicate')
  }

  function startMove(index: number) {
    if (index === 0) {
      operationMessage = 'Layer 0 stays fixed. Duplicate it to append a non-default copy.'
      return
    }
    const blocker = editor.layerOperationBlocker()
    if (blocker) {
      operationMessage = blocker
      return
    }
    if (!editor.draftKeymap) return
    pendingMove = { index, document: editor.draftKeymap }
    moveTarget = index
    operationMessage = ''
  }

  function cancelMove(restoreFocus = true) {
    const index = pendingMove?.index
    pendingMove = null
    if (index == null) return
    operationMessage = 'Layer move cancelled. No changes.'
    if (restoreFocus) void focusLayerAction(index, 'move')
  }

  function performMove(move: MoveDraft, target: number) {
    if (editor.draftKeymap !== move.document) {
      operationMessage = 'The document changed. Choose the layer again before moving it.'
      void focusLayerAction(move.index, 'move')
      return
    }
    if (move.index === 0 || target === 0) {
      operationMessage = 'Layer 0 stays fixed. Choose a nonzero position.'
      void focusLayerAction(move.index, 'move')
      return
    }
    const order = move.document.layers.map((_, index) => index)
    order.splice(target, 0, order.splice(move.index, 1)[0])
    const name = layerNames[move.index]
    const result = editor.reorderLayers(order)
    operationMessage = !result.ok ? result.error : result.changed
      ? `Moved ${name} to position ${target}. Layer priority changed; reference targets were preserved.`
      : 'Layer position unchanged. No changes.'
    void focusLayerAction(result.ok ? target : move.index, 'move')
  }

  function startDrag(event: DragEvent, index: number) {
    const blocker = editor.layerOperationBlocker()
    if (index === 0 || blocker || !editor.draftKeymap || !event.dataTransfer) {
      event.preventDefault()
      operationMessage = blocker ?? 'Layer 0 stays fixed.'
      return
    }
    draggedMove = { index, document: editor.draftKeymap }
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', layerNames[index])
    operationMessage = `Moving ${layerNames[index]}. Drop on a Move control to use its position; Escape cancels.`
  }

  function dragOver(event: DragEvent, index: number) {
    if (!draggedMove) return
    event.preventDefault()
    dropTarget = index > 0 ? index : null
    if (event.dataTransfer) event.dataTransfer.dropEffect = index > 0 ? 'move' : 'none'
  }

  function dropMove(event: DragEvent, index: number) {
    const move = draggedMove
    if (!move) return // Never interpret an external drag payload as an operation.
    event.preventDefault()
    draggedMove = null
    dropTarget = null
    performMove(move, index)
  }

  function cancelDrag() {
    const move = draggedMove
    draggedMove = null
    dropTarget = null
    if (!move) return
    operationMessage = 'Layer move cancelled. No changes.'
    void focusLayerAction(move.index, 'move')
  }

  function applyMove() {
    const move = pendingMove
    pendingMove = null
    if (move) performMove(move, moveTarget)
  }

  function focusMoveTarget(node: HTMLSelectElement) {
    node.focus()
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

  $effect(() => {
    if (!pendingDelete || !confirmDeleteBtn) return
    const previous =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    confirmDeleteBtn.focus({ preventScroll: true })
    return () => {
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true })
    }
  })

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    if (draggedMove) {
      cancelDrag()
      event.stopPropagation()
      return
    }
    if (pendingMove) {
      cancelMove()
      event.stopPropagation()
      return
    }
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
    hovered = false
  }

  function dismissStripChrome() {
    cancelMove(false)
    cancelRename()
    cancelDelete()
    editingWhen = false
  }

  /** Keep the empty sizer in sync with the in-flow panel while collapsed. */
  $effect(() => {
    if (!panelEl || open) return
    const body = panelEl.querySelector('.legend-body')
    if (!(body instanceof HTMLElement)) return
    const sync = () => {
      // Skip if we already expanded this tick (observer can fire before effect cleanup).
      if (open) return
      sizerWidth = body.offsetWidth
      sizerHeight = body.offsetHeight
    }
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(body)
    return () => observer.disconnect()
  })

</script>

{#snippet legendTable(rows: HostLegendLayerRowModel[])}
  <div class="legend-body">
    <HostLegendView />
    <div class="legend-main" data-tour="legend-main">
      <HostAssemblyBar />
      <div class="legend-table-row">
        <table>
          <thead>
            <tr>
              <th class="layer-col" scope="col">Layer</th>
              {#each columns as column, index (column.language)}
                <HostLegendLanguageHead
                  {column}
                  interactive
                  groupStart={index > 0}
                  languagesStacked={multilang}
                  bind:pickingFor
                  bind:pickingNew
                  bind:openProfile
                />
              {/each}
              {#if pickingNew || addable.length > 0}
                <HostLegendLanguageHead
                  interactive
                  bind:pickingFor
                  bind:pickingNew
                  bind:openProfile
                />
              {/if}
            </tr>
          </thead>
          <tbody id="host-legend-layers">
            {#each rows as row (row.index)}
              <HostLegendLayerRow
                {row}
                {columns}
                interactive
                canDelete={layerNames.length > 1}
                showAddColumn={pickingNew || addable.length > 0}
                onduplicate={open && !multilang ? duplicateLayer : undefined}
                onmove={open && !multilang ? startMove : undefined}
                ondragstart={startDrag}
                ondragover={dragOver}
                ondrop={dropMove}
                ondragend={cancelDrag}
                dropTarget={dropTarget === row.index}
                bind:renamingIndex
                bind:editing
                bind:pendingDelete
              />
            {/each}
          </tbody>
          {#if open}
            <tfoot>
              <tr>
                <td colspan={columnCount} class="operation-feedback">
                  <p>Layer 0 stays fixed. Moves change priority, not reference targets. Choose Move, or drag it onto another Move control.</p>
                  {#if pendingMove}
                    <div class="move-controls" role="group" aria-label={`Move layer ${layerNames[pendingMove.index]}`}>
                      <label>
                        New layer position
                        <select aria-label="New layer position" bind:value={moveTarget} use:focusMoveTarget>
                          {#each layerNames as name, index}
                            {#if index > 0}<option value={index}>{index} · {name}</option>{/if}
                          {/each}
                        </select>
                      </label>
                      <button type="button" aria-label="Apply layer move" onclick={applyMove}>Apply move</button>
                      <button type="button" aria-label="Cancel layer move" onclick={() => cancelMove()}>Cancel</button>
                    </div>
                  {/if}
                  <span role="status" aria-live="polite" aria-atomic="true">{operationMessage}</span>
                </td>
              </tr>
              <tr>
                <th colspan={columnCount}>
                  <button type="button" class="add-layer" onclick={() => editor.addLayer()}>
                    Add Layer
                  </button>
                </th>
              </tr>
              <tr>
                <th class="when-cell" colspan={columnCount}>
                  <ConditionalLayers bind:editing={editingWhen} />
                </th>
              </tr>
            </tfoot>
          {/if}
        </table>
        <HostSymbolCatalog />
      </div>
    </div>
  </div>
{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div
  bind:this={stripEl}
  class="host-legend-strip"
  class:expanded={open}
  role="region"
  aria-label="Host legend"
  use:clickOutside={{ event: 'click', handler: dismissStripChrome }}
  onmouseenter={() => {
    captureRestingSize()
    hovered = true
  }}
  onmouseleave={handleMouseLeave}
  onfocusin={() => {
    captureRestingSize()
    focused = true
  }}
  onfocusout={handleFocusOut}
  onkeydown={handleKeydown}
>
  <!-- Empty box holds resting size while the live panel overlays as position:absolute. -->
  <div
    class="legend-sizer"
    class:holding={open}
    aria-hidden="true"
    inert
    style:width={open && sizerWidth ? `${sizerWidth}px` : undefined}
    style:height={open && sizerHeight ? `${sizerHeight}px` : undefined}
  ></div>
  <div class="legend-panel" class:overlay={open} bind:this={panelEl}>
    {@render legendTable(visibleRows)}
    <HostProfileBar />
    {#if pendingDelete}
      <div class="delete-confirm" role="alertdialog" aria-modal="true" aria-label="Delete layer">
        <p>Delete layer {pendingDelete.name}?</p>
        <div class="delete-confirm-actions">
          <button
            type="button"
            class="confirm-delete"
            bind:this={confirmDeleteBtn}
            onclick={confirmDelete}
          >
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
    padding: 0;
    font-size: var(--font-md);
    color: var(--text-muted);
  }

  .legend-sizer {
    display: none;
    pointer-events: none;
  }

  .legend-sizer.holding {
    display: block;
    visibility: hidden;
  }

  .legend-panel {
    position: relative;
    z-index: 4;
    background: transparent;
  }

  .legend-panel.overlay {
    position: absolute;
    top: 0;
    left: 0;
  }

  .host-legend-strip.expanded .legend-panel {
    padding: 0 0 4px;
    background: color-mix(in srgb, var(--surface) 88%, var(--stage-bg));
    border-radius: 6px;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.14);
  }

  .legend-table-row {
    display: flex;
    align-items: flex-start;
    gap: 6px;
  }

  .legend-body {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .legend-main {
    display: flex;
    flex-direction: column;
    min-width: 0;
    padding-left: 2px;
  }

  table {
    border-collapse: collapse;
    width: max-content;
    border: 1px solid color-mix(in srgb, var(--shade) 14%, transparent);
    background: color-mix(in srgb, var(--surface) 55%, transparent);
  }

  th {
    padding: 2px 5px;
    text-align: left;
    font-weight: 500;
    white-space: nowrap;
    border: 1px solid color-mix(in srgb, var(--shade) 8%, transparent);
  }

  thead th {
    font-size: var(--font-xs);
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--text-muted);
    background: color-mix(in srgb, var(--surface) 40%, transparent);
  }

  thead th.layer-col {
    color: var(--text-muted);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: var(--font-xs);
  }

  .add-layer {
    margin: 0;
    padding: 1px 0;
    border: 0;
    background: transparent;
    color: var(--accent);
    font: inherit;
    font-size: var(--font-sm);
    cursor: pointer;
  }

  .add-layer:hover {
    text-decoration: underline;
  }

  tfoot th {
    font-weight: 400;
  }

  .operation-feedback {
    white-space: normal;
    max-width: 28rem;
    padding: 4px 5px;
    font-size: var(--font-xs);
  }

  .operation-feedback p {
    margin: 0 0 4px;
  }

  .move-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin: 6px 0;
  }

  .move-controls select,
  .move-controls button {
    font: inherit;
    color: var(--text);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 4px;
  }

  tfoot th.when-cell {
    white-space: normal;
  }

  .delete-confirm {
    position: absolute;
    top: calc(100% - 2px);
    left: 0;
    z-index: 5;
    margin: 0;
    padding: 10px 12px;
    width: 180px;
    background: var(--surface);
    color: var(--text);
    border-radius: 8px;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.28);
  }

  .delete-confirm p {
    margin: 0 0 8px;
    font-size: var(--font-sm);
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
    font-size: var(--font-xs);
  }

  .confirm-delete {
    background: var(--danger);
    color: var(--on-accent);
  }

  .cancel-delete {
    background: var(--fill);
    color: var(--text);
  }
</style>
