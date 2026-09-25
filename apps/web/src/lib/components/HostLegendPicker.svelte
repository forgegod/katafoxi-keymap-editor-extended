<script lang="ts">
  import {
    encodeKeyBinding,
    hostLayoutChoice,
    hostLayoutChoices,
    hostLegendFor,
    hostLegendPreview,
    getKeycodeCatalog,
    hostLegendView,
    resolveBinding,
    toggleShownLayer,
    type KeyBindingNode
  } from '@keymap-editor/keymap-core'
  import { editor, hostLegendAnchorIndex } from '../editor.svelte.js'
  import EyeToggle from './EyeToggle.svelte'

  const view = $derived(editor.hostLegend)
  const base = $derived(hostLayoutChoice(view.baseId))
  const secondId = $derived(
    view.secondId ?? hostLayoutChoices.find(choice => choice.id !== view.baseId)?.id ?? view.baseId
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
  let stripEl: HTMLDivElement | undefined = $state()
  const open = $derived(hovered || pinned || focused)

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

  function chooseBase(id: string) {
    void editor.commitHostMap(hostLegendView(view, { baseId: id }))
  }

  function chooseSecond(id: string) {
    void editor.commitHostMap(hostLegendView(view, { secondId: id }))
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
      hostLegendPreview(hostLegendView(view, { secondId: secondId }), {
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

  function closeDetails(event: Event) {
    const root = (event.currentTarget as HTMLElement).closest('details')
    if (root) root.open = false
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
    if (pinned) return
    focused = false
    const active = document.activeElement
    if (active instanceof HTMLElement && stripEl?.contains(active)) active.blur()
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    pinned = false
    hovered = false
  }

  function togglePinned(event: MouseEvent) {
    event.stopPropagation()
    pinned = !pinned
  }
</script>

{#snippet langMenu(
  selectedId: string,
  otherId: string,
  label: string,
  flag: string,
  choose: (id: string) => void
)}
  <details class="lang-pick">
    <summary aria-label={label}>{flag}</summary>
    <div class="menu" role="listbox">
      {#each hostLayoutChoices as choice (choice.id)}
        <button
          type="button"
          role="option"
          aria-selected={choice.id === selectedId}
          disabled={choice.id === otherId}
          onclick={event => {
            choose(choice.id)
            closeDetails(event)
          }}
        >
          {choice.flag}
          {choice.language}
          ·
          {choice.layoutName}
        </button>
      {/each}
    </div>
  </details>
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
          <div class="lang-head">
            {#if interactive}
              <EyeToggle on={baseOn} label="Показать первый язык" onclick={toggleBase} />
              {@render langMenu(view.baseId, secondId, 'First language', base?.flag ?? '—', chooseBase)}
            {:else}
              <span class="eye-spacer"></span>
              <span>{base?.flag ?? '—'}</span>
            {/if}
          </div>
        </th>
        <th class:off={!secondOn}>
          <div class="lang-head">
            {#if interactive}
              <EyeToggle on={secondOn} label="Показать второй язык" onclick={toggleSecond} />
              {@render langMenu(secondId, view.baseId, 'Second language', second?.flag ?? '—', chooseSecond)}
            {:else}
              <span class="eye-spacer"></span>
              <span>{second?.flag ?? '—'}</span>
            {/if}
          </div>
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
              {:else}
                <span class="eye-spacer"></span>
              {/if}
              {row.name}
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
    gap: 6px;
  }

  .eye-spacer {
    display: inline-block;
    width: 16px;
    height: 16px;
    padding: 1px;
  }

  .lang-pick {
    position: relative;
  }

  .lang-pick summary {
    list-style: none;
    cursor: pointer;
    padding: 1px 4px;
    border-radius: 4px;
    font-size: 16px;
    line-height: 1.2;
  }

  .lang-pick summary::-webkit-details-marker {
    display: none;
  }

  .lang-pick summary:hover {
    background: rgba(0, 0, 0, 0.06);
  }

  .menu {
    position: absolute;
    z-index: 6;
    top: calc(100% + 4px);
    left: 0;
    display: flex;
    flex-direction: column;
    min-width: 12em;
    padding: 4px;
    border: 1px solid #ddd;
    border-radius: 6px;
    background: #fff;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  }

  .menu button {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    padding: 4px 8px;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: #333;
    font: inherit;
    font-size: 13px;
    text-align: left;
    cursor: pointer;
  }

  .menu button:hover:not(:disabled) {
    background: #f3f3f3;
  }

  .menu button:disabled {
    opacity: 0.4;
    cursor: default;
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
</style>
