<script lang="ts">
  import {
    hostLegendTableRow,
    toggleShownLayer,
    type HostLegendColumn,
    type KeyBindingNode
  } from '@keymap-editor/keymap-core'
  import { editor } from '../editor.svelte.js'
  import EyeToggle from './EyeToggle.svelte'
  import Icon from './Common/Icon.svelte'

  export type HostLegendLayerRowModel = {
    index: number
    name: string
    marked: boolean
    binding: KeyBindingNode | undefined
  }

  interface Props {
    row: HostLegendLayerRowModel
    columns: HostLegendColumn[]
    interactive: boolean
    canDelete: boolean
    showAddColumn: boolean
    renamingIndex?: number | null
    editing?: string
    pendingDelete?: { index: number; name: string } | null
  }

  let {
    row,
    columns,
    interactive,
    canDelete,
    showAddColumn,
    renamingIndex = $bindable(null),
    editing = $bindable(''),
    pendingDelete = $bindable(null)
  }: Props = $props()

  const cells = $derived.by(() => {
    void editor.hostLayoutRevision
    const stacked = editor.multilangViewOn
    return hostLegendTableRow(row.binding, editor.hostLegend, { allWide: stacked })
  })
  const layer0Raw = $derived(editor.layerView.layer0Raw)

  function toggleLayer() {
    if (row.index === 0) {
      editor.layerView = { ...editor.layerView, layer0Raw: !editor.layerView.layer0Raw }
      return
    }
    editor.layerView = toggleShownLayer(editor.layerView, row.index)
  }

  function hoverLayer() {
    editor.legendHover = { kind: 'layer', layer: row.index }
  }

  function clearHover() {
    editor.legendHover = null
  }

  function cancelRename() {
    renamingIndex = null
    editing = ''
  }

  function finishRename() {
    if (renamingIndex !== row.index) return
    const name = editing
    cancelRename()
    editor.renameLayer(row.index, name)
  }

  function startRename(event: MouseEvent) {
    event.stopPropagation()
    pendingDelete = null
    renamingIndex = row.index
    editing = row.name
  }

  function requestDelete(event: MouseEvent) {
    event.stopPropagation()
    cancelRename()
    pendingDelete = { index: row.index, name: row.name }
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
</script>

<tr
  data-layer={row.index}
  class:off={!row.marked}
  class:raw={row.index === 0 && layer0Raw}
  onmouseenter={interactive ? hoverLayer : undefined}
  onmouseleave={interactive ? clearHover : undefined}
>
  <th scope="row">
    <div class="row-head">
      {#if interactive}
        <EyeToggle
          on={row.index === 0 ? !layer0Raw : row.marked}
          label={
            row.index === 0
              ? `Show host legend ${row.name}`
              : `Show ${row.name}`
          }
          onclick={toggleLayer}
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
            onclick={startRename}
          >
            {row.name}
          </button>
        {/if}
        {#if canDelete}
          <Icon
            name="times-circle"
            class="delete"
            title={`Delete layer ${row.name}`}
            onclick={requestDelete}
          />
        {/if}
      {:else}
        <span class="eye-spacer"></span>
        {row.name}
      {/if}
    </div>
  </th>
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
  {#if showAddColumn}
    <td></td>
  {/if}
</tr>

<style>
  th,
  td {
    padding: 2px 5px;
    text-align: left;
    font-weight: 500;
    white-space: nowrap;
    border: 1px solid rgba(60, 60, 60, 0.08);
  }

  th {
    color: #888;
    font-size: 11px;
    font-weight: 400;
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

  tr.raw td {
    opacity: 0.4;
  }

  .row-head {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  td.narrow {
    min-width: 0;
    width: 1%;
  }

  .eye-spacer {
    display: inline-block;
    width: 16px;
    height: 16px;
    padding: 1px;
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
</style>
