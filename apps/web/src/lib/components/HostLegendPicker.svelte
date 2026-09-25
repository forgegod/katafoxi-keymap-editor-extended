<script lang="ts">
  import {
    hostLayoutChoice,
    hostLayoutChoices,
    hostLegendFor,
    hostLegendPreview,
    getKeycodeCatalog,
    hostLegendView
  } from '@keymap-editor/keymap-core'
  import { editor } from '../editor.svelte.js'
  import EyeToggle from './EyeToggle.svelte'

  const view = $derived(editor.hostLegend)
  const base = $derived(hostLayoutChoice(view.baseId))
  const secondId = $derived(
    view.secondId ?? hostLayoutChoices.find(choice => choice.id !== view.baseId)?.id ?? view.baseId
  )
  const second = $derived(hostLayoutChoice(secondId))
  const baseOn = $derived(view.baseVisible !== false)
  const secondOn = $derived(view.secondId != null && view.secondVisible !== false)
  const layers = $derived(view.layers ?? [true, true, true, true])
  const letter = $derived(hostLegendFor('E', view))
  const keycodes = $derived(getKeycodeCatalog().byCode)

  function keycodeName(code: string) {
    const aliases = keycodes[code]?.aliases ?? [code]
    return aliases.reduce((best, name) => (name.length > best.length ? name : best))
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
    const next: [boolean, boolean, boolean, boolean] = [...layers]
    next[index] = !next[index]
    editor.hostLegend = hostLegendPreview(view, { layers: next })
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
</script>

<div class="host-legend-strip" aria-label="Host legend">
  <table>
    <thead>
      <tr>
        <th></th>
        <th>ZMK keycode</th>
        <th class:off={!baseOn}>
          <div class="lang-head">
            <EyeToggle on={baseOn} label="Показать первый язык" onclick={toggleBase} />
            <details class="lang-pick">
              <summary aria-label="First language">{base?.flag ?? '—'}</summary>
              <div class="menu" role="listbox">
                {#each hostLayoutChoices as choice (choice.id)}
                  <button
                    type="button"
                    role="option"
                    aria-selected={choice.id === view.baseId}
                    disabled={choice.id === secondId}
                    onclick={event => {
                      chooseBase(choice.id)
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
          </div>
        </th>
        <th class:off={!secondOn}>
          <div class="lang-head">
            <EyeToggle on={secondOn} label="Показать второй язык" onclick={toggleSecond} />
            <details class="lang-pick">
              <summary aria-label="Second language">{second?.flag ?? '—'}</summary>
              <div class="menu" role="listbox">
                {#each hostLayoutChoices as choice (choice.id)}
                  <button
                    type="button"
                    role="option"
                    aria-selected={choice.id === secondId}
                    disabled={choice.id === view.baseId}
                    onclick={event => {
                      chooseSecond(choice.id)
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
          </div>
        </th>
        <th class:off={!view.altGr} onmouseenter={() => hoverAlt('altGr')} onmouseleave={clearHover}>
          <button
            type="button"
            class="col-toggle"
            class:on={view.altGr}
            onclick={() => toggleAlt('altGr')}
          >
            AltGr
          </button>
        </th>
        <th
          class:off={!view.altGrShift}
          onmouseenter={() => hoverAlt('altGrShift')}
          onmouseleave={clearHover}
        >
          <button
            type="button"
            class="col-toggle"
            class:on={view.altGrShift}
            onclick={() => toggleAlt('altGrShift')}
          >
            AltGr+Shift
          </button>
        </th>
      </tr>
    </thead>
    <tbody>
      <tr class:off={!layers[0]} onmouseenter={() => hoverLayer(0)} onmouseleave={clearHover}>
        <th scope="row">
          <div class="row-head">
            <EyeToggle on={layers[0]} label="Показать layer0" onclick={() => toggleLayer(0)} />
            layer0
          </div>
        </th>
        <td class="zmk">{keycodeName('E')}</td>
        <td>{letter ? `${letter.en[0]}${letter.en[1]}` : 'eE'}</td>
        <td class="second" class:off={!secondOn}>
          {letter?.second ? `${letter.second[0]}${letter.second[1]}` : ''}
        </td>
        <td class="alt" class:off={!view.altGr}>{view.altGr ? (letter?.altGr ?? '') : ''}</td>
        <td class="alt" class:off={!view.altGrShift}>
          {view.altGrShift ? (letter?.altGrShift ?? '') : ''}
        </td>
      </tr>
      <tr class:off={!layers[1]} onmouseenter={() => hoverLayer(1)} onmouseleave={clearHover}>
        <th scope="row">
          <div class="row-head">
            <EyeToggle on={layers[1]} label="Показать layer1" onclick={() => toggleLayer(1)} />
            layer1
          </div>
        </th>
        <td class="zmk">{keycodeName('KP_N8')}</td>
        <td>8</td>
        <td class:off={!secondOn}></td>
        <td class:off={!view.altGr}></td>
        <td class:off={!view.altGrShift}></td>
      </tr>
      <tr class:off={!layers[2]} onmouseenter={() => hoverLayer(2)} onmouseleave={clearHover}>
        <th scope="row">
          <div class="row-head">
            <EyeToggle on={layers[2]} label="Показать layer2" onclick={() => toggleLayer(2)} />
            layer2
          </div>
        </th>
        <td class="zmk">{keycodeName('F8')}</td>
        <td>F8</td>
        <td class:off={!secondOn}></td>
        <td class:off={!view.altGr}></td>
        <td class:off={!view.altGrShift}></td>
      </tr>
      <tr class:off={!layers[3]} onmouseenter={() => hoverLayer(3)} onmouseleave={clearHover}>
        <th scope="row">
          <div class="row-head">
            <EyeToggle on={layers[3]} label="Показать layer3" onclick={() => toggleLayer(3)} />
            layer3
          </div>
        </th>
        <td class="zmk">{keycodeName('SLCK')}</td>
        <td>SLCK</td>
        <td class:off={!secondOn}></td>
        <td class:off={!view.altGr}></td>
        <td class:off={!view.altGrShift}></td>
      </tr>
    </tbody>
  </table>
</div>

<style>
  .host-legend-strip {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 16px 24px;
    width: max-content;
    max-width: 100%;
    padding: 6px 4px 2px;
    font-size: 13px;
    color: #444;
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

  .lang-head,
  .row-head {
    display: flex;
    align-items: center;
    gap: 6px;
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

  .col-toggle {
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

  .col-toggle.on {
    background: #fff;
    border-color: #1d6f8a;
    color: #333;
  }
</style>
