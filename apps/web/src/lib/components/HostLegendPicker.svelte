<script lang="ts">
  import {
    hostLanguagesAvailable,
    hostLegendColumns,
    type HostLanguageId
  } from '@keymap-editor/keymap-core'
  import { editor, hostLegendAnchorIndex } from '../editor.svelte.js'
  import HostAssemblyBar from './HostAssemblyBar.svelte'
  import HostLegendLanguageHead from './HostLegendLanguageHead.svelte'
  import HostSymbolCatalog from './HostSymbolCatalog.svelte'
  import HostLegendLayerRow, {
    type HostLegendLayerRowModel
  } from './HostLegendLayerRow.svelte'
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
  const anchorIndex = $derived(hostLegendAnchorIndex(editor.draftKeymap))

  let hovered = $state(false)
  let focused = $state(false)
  let openProfile = $state<HostLanguageId | null>(null)
  let pickingNew = $state(false)
  let pickingFor = $state<HostLanguageId | null>(null)
  let renamingIndex = $state<number | null>(null)
  let editing = $state('')
  let pendingDelete = $state<{ index: number; name: string } | null>(null)
  let stripEl: HTMLDivElement | undefined = $state()
  const busy = $derived(renamingIndex != null || pendingDelete != null)
  const open = $derived(hovered || focused || busy)

  const allRows = $derived(
    layerNames.map(
      (name, index): HostLegendLayerRowModel => ({
        index,
        name,
        marked: markedLayers.includes(index),
        binding: editor.draftKeymap?.layers[index]?.[anchorIndex]
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
    focused = false
    const active = document.activeElement
    if (active instanceof HTMLElement && stripEl?.contains(active)) active.blur()
  }

  function cancelRename() {
    renamingIndex = null
    editing = ''
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

</script>

{#snippet legendTable(rows: HostLegendLayerRowModel[], interactive: boolean)}
  <div class="legend-body">
    <HostLegendView />
    <div class="legend-main">
      <HostAssemblyBar />
      <div class="legend-table-row">
        <table>
          <thead>
            <tr>
              <th class="layer-col" scope="col">Layer</th>
              {#each columns as column, index (column.language)}
                <HostLegendLanguageHead
                  {column}
                  {interactive}
                  groupStart={index > 0}
                  languagesStacked={multilang}
                  bind:pickingFor
                  bind:pickingNew
                  bind:openProfile
                />
              {/each}
              {#if interactive && (pickingNew || addable.length > 0)}
                <HostLegendLanguageHead
                  {interactive}
                  bind:pickingFor
                  bind:pickingNew
                  bind:openProfile
                />
              {/if}
            </tr>
          </thead>
          <tbody id={interactive ? 'host-legend-layers' : undefined}>
            {#each rows as row (row.index)}
              <HostLegendLayerRow
                {row}
                {columns}
                {interactive}
                canDelete={layerNames.length > 1}
                showAddColumn={interactive && (pickingNew || addable.length > 0)}
                bind:renamingIndex
                bind:editing
                bind:pendingDelete
              />
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
        {#if interactive}
          <HostSymbolCatalog />
        {/if}
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
  onmouseenter={() => (hovered = true)}
  onmouseleave={handleMouseLeave}
  onfocusin={() => (focused = true)}
  onfocusout={handleFocusOut}
  onkeydown={handleKeydown}
>
  <div class="legend-sizer" aria-hidden="true" inert>
    {@render legendTable(restingRows, false)}
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
    padding: 0;
    font-size: 13px;
    color: var(--text-soft);
  }

  .legend-sizer {
    visibility: hidden;
    pointer-events: none;
  }

  .legend-panel {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 4;
    background: transparent;
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
    border: 1px solid rgba(60, 60, 60, 0.14);
    background: color-mix(in srgb, var(--surface) 55%, transparent);
  }

  th {
    padding: 2px 5px;
    text-align: left;
    font-weight: 500;
    white-space: nowrap;
    border: 1px solid rgba(60, 60, 60, 0.08);
  }

  thead th {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--text-subtle);
    background: color-mix(in srgb, var(--surface) 40%, transparent);
  }

  thead th.layer-col {
    color: var(--text-faint);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-size: 10px;
  }

  .add-layer {
    margin: 0;
    padding: 1px 0;
    border: 0;
    background: transparent;
    color: var(--accent);
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
    background: var(--surface);
    color: var(--text-strong);
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
    background: var(--danger);
    color: var(--on-accent);
  }

  .cancel-delete {
    background: var(--fill);
    color: var(--text);
  }
</style>
