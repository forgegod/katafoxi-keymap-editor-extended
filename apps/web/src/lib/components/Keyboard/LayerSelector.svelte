<script lang="ts">
  import Icon from '../Common/Icon.svelte'

  interface Props {
    layers: string[]
    activeLayer: number | 'all'
    showAllLayers?: boolean
    onSelect: (layer: number | 'all') => void
    onNewLayer: () => void
    onRenameLayer: (name: string) => void
    onDeleteLayer: (index: number) => void
  }

  let {
    layers,
    activeLayer,
    showAllLayers = false,
    onSelect,
    onNewLayer,
    onRenameLayer,
    onDeleteLayer
  }: Props = $props()

  let rootEl: HTMLDivElement | undefined = $state()
  let renaming = $state(false)
  let editing = $state('')
  let pendingDelete = $state<{ index: number; name: string } | null>(null)

  function stop(fn: () => void) {
    return (event: MouseEvent) => {
      event.stopPropagation()
      fn()
    }
  }

  function handleSelect(layer: number) {
    if (layer === activeLayer) {
      editing = layers[layer]
      renaming = true
      return
    }
    renaming = false
    onSelect(layer)
  }

  function handleDelete(layerIndex: number, layerName: string) {
    renaming = false
    editing = ''
    pendingDelete = { index: layerIndex, name: layerName }
  }

  function confirmDelete() {
    if (!pendingDelete) return
    const index = pendingDelete.index
    pendingDelete = null
    onDeleteLayer(index)
  }

  function cancelDelete() {
    pendingDelete = null
  }

  function finishEditing() {
    if (!renaming) return
    const name = editing
    editing = ''
    renaming = false
    onRenameLayer(name)
  }

  function cancelEditing() {
    if (!renaming) return
    editing = ''
    renaming = false
  }

  function onKey(mapping: Record<string, () => void>) {
    return (event: KeyboardEvent) => {
      if (mapping[event.key]) mapping[event.key]()
    }
  }

  function focusInput(node: HTMLInputElement) {
    node.focus()
    node.select()
  }

  $effect(() => {
    function handleClickOutside(event: MouseEvent) {
      const clickedOutside =
        rootEl && !rootEl.contains(event.target as Node)
      if (!clickedOutside) return
      cancelEditing()
    }

    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  })
</script>

<div
  class="layer-selector layer-row"
  data-renaming={renaming}
  bind:this={rootEl}
>
  <span class="layers-label">Layers</span>
  <ul>
    {#if showAllLayers}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
      <li
        class:active={activeLayer === 'all'}
        data-layer="all"
        title="All layers"
        onclick={stop(() => {
          renaming = false
          onSelect('all')
        })}
      >
        <span class="name always">All layers</span>
      </li>
    {/if}
    {#each layers as name, i}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
      <li
        class:active={activeLayer === i}
        data-layer={i}
        title={name}
        onclick={stop(() => handleSelect(i))}
      >
        <span class="index">{i}</span>
        {#if activeLayer === i && renaming}
          <input
            use:focusInput
            class="name"
            oninput={e => (editing = (e.currentTarget as HTMLInputElement).value)}
            onkeydown={onKey({
              Enter: finishEditing,
              Escape: cancelEditing
            })}
            value={editing}
          />
        {:else}
          <span class="name">
            {name}
            <Icon
              name="times-circle"
              class="delete"
              onclick={stop(() => handleDelete(i, name))}
            />
          </span>
        {/if}
      </li>
    {/each}
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
    <li title="Add Layer" onclick={onNewLayer}>
      <span class="index">
        <Icon name="plus" />
      </span>
      <span class="name always">Add Layer</span>
    </li>
  </ul>
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

<style>
  .layer-selector {
    position: relative;
    z-index: 3;
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    padding: 2px 12px 6px;
  }

  .layers-label {
    flex: none;
    font-size: 90%;
    color: #555;
  }

  .layer-selector ul {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px;
    list-style-type: none;
    margin: 0;
    padding: 0;
    min-width: 0;
  }

  .layer-selector li {
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    background-color: rgba(201, 201, 201, 0.85);
    color: darkgray;
    border-radius: 15px;
    height: 30px;
    padding: 0;
    margin: 0;
  }

  .layer-selector li:hover {
    background-color: rgba(60, 179, 113, 0.85);
    color: white;
  }

  .layer-selector li.active {
    background-color: rgb(60, 179, 113);
    color: white;
  }

  .layer-selector li .index {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    width: 30px;
    height: 30px;
    line-height: 30px;
    text-align: center;
    flex: none;
  }

  .layer-selector li .index :global(.icon) {
    width: 0.85em;
    height: 0.85em;
  }

  .layer-selector li .name {
    display: inline-flex;
    align-items: center;
    overflow: hidden;
    width: 0;
    height: 30px;
    line-height: 30px;
    padding: 0;
    font-variant: small-caps;
    white-space: nowrap;
  }

  .layer-selector li.active .name,
  .layer-selector li .name.always {
    width: auto;
    max-width: 9em;
    padding: 0 8px 0 2px;
  }

  .layer-selector input.name {
    width: 7em;
    height: 30px;
    line-height: 30px;
    border: none;
    outline: none;
    background: transparent;
    color: white;
    font: inherit;
    font-variant: small-caps;
    padding: 0 8px 0 2px;
  }

  .layer-selector :global(.delete) {
    flex: none;
    width: 16px;
    height: 16px;
    margin-left: 4px;
  }

  .layer-selector li.active .name {
    cursor: text;
  }

  .layer-selector li .name.always {
    padding: 0 12px;
    cursor: pointer;
  }

  .layer-selector button {
    width: 30px;
    height: 30px;
    line-height: 30px;
    padding: 0;
    text-align: center;
    border-radius: 15px;
    border: none;
    background: transparent;
    color: inherit;
    cursor: pointer;
  }

  .delete-confirm {
    position: absolute;
    top: calc(100% - 2px);
    left: 12px;
    z-index: 4;
    margin: 0;
    padding: 10px 12px;
    width: 180px;
    background: #fff;
    color: #222;
    border-radius: 8px;
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.28);
    font-variant: normal;
  }

  .delete-confirm p {
    margin: 0 0 8px;
    font-size: 90%;
    color: #222;
    font-variant: normal;
  }

  .delete-confirm-actions {
    display: flex;
    gap: 6px;
  }

  .delete-confirm button {
    flex: 1;
    height: 26px;
    line-height: 26px;
    border: none;
    border-radius: 13px;
    cursor: pointer;
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
