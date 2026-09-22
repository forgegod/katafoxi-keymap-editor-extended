<script lang="ts">
  import Icon from '../Common/Icon.svelte'

  interface Props {
    layers: string[]
    activeLayer: number
    onSelect: (layer: number) => void
    onNewLayer: () => void
    onRenameLayer: (name: string) => void
    onDeleteLayer: (index: number) => void
  }

  let {
    layers,
    activeLayer,
    onSelect,
    onNewLayer,
    onRenameLayer,
    onDeleteLayer
  }: Props = $props()

  let rootEl: HTMLDivElement | undefined = $state()
  let renaming = $state(false)
  let editing = $state('')

  function stop(fn: () => void) {
    return (event: MouseEvent) => {
      event.stopPropagation()
      fn()
    }
  }

  function handleSelect(layer: number) {
    if (layer === activeLayer) {
      editing = layers[activeLayer]
      renaming = true
      return
    }
    renaming = false
    onSelect(layer)
  }

  function handleDelete(layerIndex: number, layerName: string) {
    const confirmation = `Really delete layer: ${layerName}?`
    if (window.confirm(confirmation)) {
      onDeleteLayer(layerIndex)
    }
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
  class="layer-selector"
  data-renaming={renaming}
  bind:this={rootEl}
>
  <p>Layers:</p>
  <ul>
    {#each layers as name, i}
      <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_element_interactions -->
      <li
        class:active={activeLayer === i}
        data-layer={i}
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
    <li onclick={onNewLayer}>
      <span class="index">
        <Icon name="plus" />
      </span>
      <span class="name">Add Layer</span>
    </li>
  </ul>
</div>

<style>
  .layer-selector {
    position: absolute;
    z-index: 2;
  }

  .layer-selector ul {
    display: inline-block;
    list-style-type: none;
    margin: 0;
    padding: 0;
  }

  .layer-selector li {
    cursor: pointer;
    background-color: rgba(201, 201, 201, 0.85);
    color: darkgray;
    border-radius: 15px;
    height: 30px;
    padding: 0;
    margin: 4px 2px;
  }

  .layer-selector li:hover {
    background-color: rgba(60, 179, 113, 0.85);
    color: white;
  }

  .layer-selector li.active {
    background-color: rgb(60, 179, 113);
    color: white;
  }

  .layer-selector li :global(*) {
    display: inline-block;
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
    vertical-align: top;
  }

  .layer-selector li .index :global(.icon) {
    width: 0.85em;
    height: 0.85em;
    vertical-align: 0;
  }

  .layer-selector li .name {
    overflow: hidden;
    width: 0;
    height: 30px;
    line-height: 30px;
    padding: 0;
    font-variant: small-caps;
  }

  .layer-selector:hover li .name,
  .layer-selector[data-renaming='true'] li .name {
    transition: 0.15s ease-in;
    width: 120px;
    padding: 0 0 0 10px;
  }

  .layer-selector input.name {
    vertical-align: top;
    width: 100px;
    border: none;
    outline: none;
    background: transparent;
    color: white;
  }

  .layer-selector :global(.delete) {
    float: right;
    height: 30px;
    line-height: 30px;
    width: 30px;
  }

  .layer-selector li.active .name {
    cursor: text;
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

  .layer-selector > p {
    margin: 4px 2px;
    font-size: 90%;
    color: #555;
  }
</style>
