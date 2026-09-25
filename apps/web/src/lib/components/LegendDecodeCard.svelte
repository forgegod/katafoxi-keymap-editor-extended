<script lang="ts">
  import {
    ALT_LEVEL_EMPTY,
    hostLanguageName,
    type LegendDecodeCard
  } from '@keymap-editor/keymap-core'

  interface Props {
    card: LegendDecodeCard
    anchor: DOMRect
    tooltipId: string
  }

  let { card, anchor, tooltipId }: Props = $props()
  let el: HTMLDivElement | undefined = $state()

  const zmk = $derived(card.keycode?.replace(/^KC_/, '') ?? '')
  const showBinding = $derived(!zmk || card.binding !== `&kp ${zmk}`)

  $effect(() => {
    const root = document.getElementById('modal-root') ?? document.body
    if (!el) return
    root.appendChild(el)
    return () => el?.remove()
  })

  $effect(() => {
    if (!el) return
    void card
    void anchor
    const box = el.getBoundingClientRect()
    let left = anchor.left + anchor.width / 2 - box.width / 2
    left = Math.max(8, Math.min(left, window.innerWidth - box.width - 8))
    let top = anchor.top - box.height - 8
    if (top < 8) top = anchor.bottom + 8
    el.style.left = `${left}px`
    el.style.top = `${top}px`
  })
</script>

<div
  bind:this={el}
  id={tooltipId}
  role="tooltip"
  class="legend-decode"
  style="position:fixed;left:{anchor.left}px;top:{anchor.top}px;z-index:40"
>
  <div class="ids">
    {#if showBinding}<span class="bind">{card.binding}</span>{/if}
    {#if card.keycode}
      <span class="id" title="ZMK keycode"><span class="mark">ZMK</span> {card.keycode}</span>
    {/if}
    {#if card.vk}
      <span class="id" title="Windows virtual-key"><span class="mark">Win</span> {card.vk}</span>
    {/if}
    {#if card.evdevName}
      <span class="id" title="Linux evdev"><span class="mark">Lin</span> {card.evdevName}</span>
    {/if}
    {#if card.hold}<span class="hold">{card.hold}</span>{/if}
  </div>
  {#if card.current.length}
    <div class="grid">
      <div class="row flags">
        {#each card.current as column (column.language)}
          <div
            class="lang flag"
            data-language={column.language}
            title={hostLanguageName(column.language)}
          >
            {column.flag}
          </div>
        {/each}
      </div>
      {#if card.system}
        <div class="row system">
          {#each card.system as column (column.language)}
            <div class="lang" data-language={column.language}>
              {#each column.slots as slot, index (`${column.language}-sys-${index}`)}
                <span class="slot" class:empty={slot.text === ALT_LEVEL_EMPTY}>{slot.text}</span>
              {/each}
            </div>
          {/each}
        </div>
      {/if}
      <div class="row current">
        {#each card.current as column (column.language)}
          <div class="lang" data-language={column.language}>
            {#each column.slots as slot, index (`${column.language}-${index}`)}
              <span
                class="slot"
                class:empty={slot.text === ALT_LEVEL_EMPTY}
                class:diff={slot.differs}>{slot.text}</span
              >
            {/each}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .legend-decode {
    pointer-events: none;
    box-sizing: border-box;
    min-width: 18em;
    padding: 7px 9px 8px;
    border-radius: 8px;
    background: #f7f4ee;
    box-shadow:
      0 0 0 1px rgba(40, 36, 30, 0.12),
      0 8px 22px rgba(40, 36, 30, 0.18);
    color: #333;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 1.2;
    white-space: nowrap;
  }

  .ids {
    display: flex;
    flex-wrap: nowrap;
    gap: 0.85em;
    margin-bottom: 6px;
    color: #6b6560;
    font-size: 11px;
    font-family: Quicksand, avenir, sans-serif;
  }

  .ids .id {
    display: inline-flex;
    align-items: baseline;
    gap: 0.3em;
  }

  .ids .mark {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.04em;
    color: #8a847c;
  }

  .ids .bind {
    color: #4a4540;
  }

  .ids .hold {
    padding: 0 4px;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.08);
    color: #444;
  }

  .grid {
    display: grid;
    gap: 3px 0;
  }

  .row {
    display: flex;
    gap: 0.85em;
  }

  .lang {
    display: grid;
    grid-template-columns: repeat(4, 1.15em);
    justify-items: center;
  }

  .row.flags {
    margin-bottom: 1px;
  }

  .lang.flag {
    font-family: inherit;
    font-size: 13px;
    line-height: 1;
    justify-items: center;
    align-content: center;
  }

  .slot {
    min-width: 1em;
    text-align: center;
  }

  .slot.empty {
    opacity: 0.38;
  }

  .row.system {
    color: #8a847c;
    opacity: 0.72;
  }

  .lang[data-language='ru'] .slot,
  .lang[data-language='uk'] .slot,
  .lang[data-language='de'] .slot {
    color: #1d6f8a;
  }

  .row.system .lang[data-language='ru'] .slot,
  .row.system .lang[data-language='uk'] .slot,
  .row.system .lang[data-language='de'] .slot {
    color: #5e8a96;
  }

  .slot.diff {
    color: #5a3d00;
    background: #e4c56a;
    border-radius: 3px;
  }

  .lang[data-language='ru'] .slot.diff,
  .lang[data-language='uk'] .slot.diff,
  .lang[data-language='de'] .slot.diff {
    color: #0f4a5c;
  }
</style>
