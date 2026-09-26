<script lang="ts">
  import {
    ALT_GR_COLUMN_LABEL,
    ALT_GR_SHIFT_COLUMN_LABEL,
    ALT_LEVEL_EMPTY,
    composeLegendDecode,
    hostLanguageName,
    hostLevels,
    keysymToGlyph,
    parseKeyBinding,
    withEditableLegendDecodeGaps,
    type HostLanguageId,
    type LegendDecodeCard
  } from '@keymap-editor/keymap-core'
  import { editor } from '../editor.svelte.js'

  interface Props {
    card: LegendDecodeCard
    anchor: DOMRect
    tooltipId: string
    /** Alt+click host-edit session for this card. */
    hostSession?: boolean
    onArmCell?: (language: HostLanguageId, level: number) => void
    onEndSession?: () => void
  }

  let {
    card,
    anchor,
    tooltipId,
    hostSession = false,
    onArmCell,
    onEndSession
  }: Props = $props()
  let el: HTMLDivElement | undefined = $state()
  let busy = $state(false)

  const LEVEL_LABELS = ['tap', '⇧', ALT_GR_COLUMN_LABEL, ALT_GR_SHIFT_COLUMN_LABEL] as const

  const zmk = $derived(card.keycode?.replace(/^KC_/, '') ?? '')
  const showBinding = $derived(!zmk || card.binding !== `&kp ${zmk}`)
  const dialogLabel = $derived(
    card.keycode ? `Legend decode ${card.keycode}` : 'Legend decode'
  )
  const displayCard = $derived.by(() => {
    void editor.hostLayoutRevision
    try {
      const base = composeLegendDecode(parseKeyBinding(card.binding), editor.hostLegend)
      return withEditableLegendDecodeGaps(base, editor.hostLegend)
    } catch {
      return card
    }
  })
  const editing = $derived.by(() => {
    const target = editor.hostSymbolEditTarget
    if (!target || !zmk || target.zmk !== zmk) return null
    return { language: target.language, level: target.level }
  })
  const dropsWarning = $derived.by(() => {
    void editor.hostLayoutRevision
    const target = editor.hostSymbolEditTarget
    if (!target || target.zmk !== zmk || target.level !== 0) return false
    const keysym = hostLevels(editor.activeProfileId(target.language), target.zmk)?.keysyms[0]
    return keysym != null && keysymToGlyph(keysym) == null
  })
  /** Host levels exist only for keys in the host-key registry. */
  const hostEditable = $derived(Boolean(displayCard.keycode))
  const hasDiff = $derived(
    displayCard.current.some(column => column.slots.some(slot => slot.differs))
  )
  /** Revert only in an Alt+click session — hover peek is read-only. */
  const showRevertRow = $derived(hostSession && hasDiff)

  $effect(() => {
    const root = document.getElementById('modal-root') ?? document.body
    if (!el) return
    root.appendChild(el)
    return () => el?.remove()
  })

  $effect(() => {
    if (!el) return
    void displayCard
    void anchor
    void hostSession
    void showRevertRow
    const box = el.getBoundingClientRect()
    let left = anchor.left + anchor.width / 2 - box.width / 2
    left = Math.max(8, Math.min(left, window.innerWidth - box.width - 8))
    let top = anchor.top - box.height - 2
    if (top < 8) top = anchor.bottom + 2
    el.style.left = `${left}px`
    el.style.top = `${top}px`
  })

  $effect(() => {
    if (!el) return
    if (hostSession) {
      el.setAttribute('role', 'dialog')
      el.setAttribute('aria-label', dialogLabel)
      el.setAttribute('aria-modal', 'true')
      el.setAttribute('tabindex', '-1')
    } else {
      el.setAttribute('role', 'tooltip')
      el.removeAttribute('aria-label')
      el.removeAttribute('aria-modal')
      el.removeAttribute('tabindex')
    }
  })

  $effect(() => {
    if (!hostSession) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !event.altKey && !event.ctrlKey && !event.metaKey) {
        const target = event.target
        if (target instanceof HTMLElement && target.closest('button.slot, button.revert, input, textarea')) {
          return
        }
        event.preventDefault()
        event.stopImmediatePropagation()
        onEndSession?.()
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        onEndSession?.()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  $effect(() => {
    if (!el || !hostSession) return
    const node = el
    const key = zmk
    const click = (event: MouseEvent) => {
      event.stopPropagation()
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('[data-host-accept], [data-host-cancel]')) {
        onEndSession?.()
        return
      }
      const revert = target.closest('[data-host-revert]')
      if (revert instanceof HTMLElement) {
        const language = revert.dataset.language as HostLanguageId
        const level = Number(revert.dataset.level)
        if (!key || busy || !Number.isInteger(level)) return
        void (async () => {
          busy = true
          try {
            await editor.revertHostKeyLevel(language, key, level)
          } finally {
            busy = false
          }
        })()
        return
      }
      const cell = target.closest('[data-host-edit]')
      if (cell instanceof HTMLElement) {
        const language = cell.dataset.language as HostLanguageId
        const level = Number(cell.dataset.level)
        if (!key || !Number.isInteger(level)) return
        onArmCell?.(language, level)
        queueMicrotask(() => {
          if (cell instanceof HTMLElement) cell.focus()
        })
      }
    }
    node.addEventListener('click', click, true)
    return () => {
      node.removeEventListener('click', click, true)
    }
  })
</script>

<div
  bind:this={el}
  id={tooltipId}
  class="legend-decode"
  class:session={hostSession}
  class:peek={!hostSession}
  style="position:fixed;left:{anchor.left}px;top:{anchor.top}px;z-index:40"
>
  <div class="ids">
    {#if showBinding}<span class="bind">{displayCard.binding}</span>{/if}
    {#if displayCard.keycode}
      <span class="id" title="ZMK keycode"><span class="mark">ZMK</span> {displayCard.keycode}</span>
    {/if}
    {#if displayCard.vk}
      <span class="id" title="Windows virtual-key"><span class="mark">Win</span> {displayCard.vk}</span>
    {/if}
    {#if displayCard.evdevName}
      <span class="id" title="Linux evdev"><span class="mark">Lin</span> {displayCard.evdevName}</span>
    {/if}
    {#if displayCard.hold}<span class="hold">{displayCard.hold}</span>{/if}
  </div>
  {#if displayCard.current.length}
    <div
      class="decode-table"
      style="--lang-count: {displayCard.current.length}"
      role="table"
      aria-label="Host levels"
    >
      <div class="row flags" role="row">
        {#each displayCard.current as column (column.language)}
          <div
            class="lang-head flag"
            role="columnheader"
            data-language={column.language}
            title={hostLanguageName(column.language)}
          >
            {column.flag}
          </div>
        {/each}
      </div>
      <div class="row levels" role="row">
        {#each displayCard.current as column (column.language)}
          <div class="lang" data-language={column.language} role="rowgroup">
            {#each LEVEL_LABELS as label, index (`${column.language}-lvl-${index}`)}
              <span class="level-label" role="columnheader">{label}</span>
            {/each}
          </div>
        {/each}
      </div>
      {#if displayCard.system}
        <div class="row system" role="row">
          {#each displayCard.system as column (column.language)}
            <div class="lang" data-language={column.language} role="rowgroup">
              {#each column.slots as slot, index (`${column.language}-sys-${index}`)}
                <span class="slot" class:empty={slot.text === ALT_LEVEL_EMPTY} role="cell"
                  >{slot.text}</span
                >
              {/each}
            </div>
          {/each}
        </div>
      {/if}
      <div class="row current" role="row">
        {#each displayCard.current as column (column.language)}
          <div class="lang" data-language={column.language} role="rowgroup">
            {#each column.slots as slot, index (`${column.language}-${index}`)}
              {@const isEditing =
                hostSession &&
                editing?.language === column.language &&
                editing.level === index}
              <div class="cell" class:editing={isEditing} role="cell">
                {#if hostSession}
                  <button
                    type="button"
                    class="slot"
                    class:empty={slot.text === ALT_LEVEL_EMPTY}
                    class:diff={slot.differs}
                    data-host-edit
                    data-language={column.language}
                    data-level={index}
                    data-text={slot.text}
                    disabled={!zmk}
                    aria-label={`Edit ${column.language} level ${index}`}
                    aria-expanded={isEditing}
                    aria-haspopup="dialog"
                  >
                    {slot.text}
                  </button>
                {:else}
                  <span
                    class="slot"
                    class:empty={slot.text === ALT_LEVEL_EMPTY}
                    class:diff={slot.differs}
                    >{slot.text}</span
                  >
                {/if}
              </div>
            {/each}
          </div>
        {/each}
      </div>
      {#if showRevertRow}
        <div class="row revert-row" role="row">
          {#each displayCard.current as column (column.language)}
            <div class="lang" data-language={column.language} role="rowgroup">
              {#each column.slots as slot, index (`${column.language}-rev-${index}`)}
                <div class="cell revert-cell" role="cell">
                  {#if slot.differs}
                    <button
                      type="button"
                      class="revert"
                      data-host-revert
                      data-language={column.language}
                      data-level={index}
                      title="Revert to system"
                      aria-label={`Revert ${column.language} level ${index}`}
                      disabled={busy || !zmk}
                    >
                      ↺
                    </button>
                  {/if}
                </div>
              {/each}
            </div>
          {/each}
        </div>
      {/if}
      {#if dropsWarning}
        <p class="warn" role="status">
          Base level is non-character — this key drops out of composition
        </p>
      {/if}
    </div>
  {/if}
  {#if hostSession}
    <div class="session-bar" role="group" aria-label="Host edit session">
      <button
        type="button"
        class="session-accept"
        data-host-accept
        title="Enter"
        onclick={() => onEndSession?.()}
      >
        Accept <kbd>Enter</kbd>
      </button>
      <button
        type="button"
        class="session-cancel"
        data-host-cancel
        title="Edits are already saved — Escape only closes the session"
        onclick={() => onEndSession?.()}
      >
        Cancel <kbd>Esc</kbd>
      </button>
    </div>
  {:else if hostEditable}
    <p class="mode-hint" role="note">
      Click row — ZMK · Alt+click — host
    </p>
  {:else}
    <p class="mode-hint" role="note">Click row — ZMK</p>
  {/if}
</div>

<style>
  .legend-decode {
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

  /* Hover peek must not steal the pointer — no bridge / hold onto the card. */
  .legend-decode.peek {
    pointer-events: none;
  }

  .legend-decode.session {
    pointer-events: auto;
    box-shadow:
      0 0 0 1px rgba(40, 36, 30, 0.18),
      0 10px 28px rgba(40, 36, 30, 0.24);
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

  .decode-table {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .row {
    display: grid;
    grid-template-columns: repeat(var(--lang-count, 1), minmax(0, 1fr));
    column-gap: 12px;
    align-items: center;
  }

  .lang-head {
    display: flex;
    justify-content: center;
    font-size: 14px;
    line-height: 1;
  }

  .lang {
    display: grid;
    grid-template-columns: repeat(4, minmax(1.35em, 1fr));
    column-gap: 2px;
    align-items: center;
    justify-items: center;
  }

  .level-label {
    font-family: Quicksand, avenir, sans-serif;
    font-size: 9px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: #8a847c;
    line-height: 1;
  }

  .row.system {
    opacity: 0.45;
  }

  .cell {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 1.35em;
    min-height: 1.35em;
  }

  .cell.editing .slot {
    outline: 1px solid #1d6f8a;
    outline-offset: 1px;
  }

  .revert-cell {
    min-height: 1.1em;
  }

  button.slot,
  span.slot {
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 1.35em;
    min-height: 1.35em;
    margin: 0;
    padding: 1px 3px;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: inherit;
    font: inherit;
  }

  button.slot {
    cursor: pointer;
  }

  button.slot:disabled {
    cursor: default;
  }

  .slot.empty {
    color: #aaa;
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

  .warn {
    margin: 4px 0 0;
    grid-column: 1 / -1;
    white-space: normal;
    font-size: 10px;
    line-height: 1.25;
    font-family: Quicksand, avenir, sans-serif;
    color: #8a5a00;
  }

  .revert {
    margin: 0;
    padding: 0 2px;
    border: 0;
    border-radius: 3px;
    background: transparent;
    color: #7a746c;
    font: inherit;
    font-size: 11px;
    line-height: 1;
    cursor: pointer;
  }

  .revert:hover:not(:disabled) {
    background: rgba(40, 36, 30, 0.08);
    color: #333;
  }

  .mode-hint {
    margin: 7px 0 0;
    padding-top: 5px;
    border-top: 1px solid rgba(40, 36, 30, 0.1);
    white-space: normal;
    font-family: Quicksand, avenir, sans-serif;
    font-size: 10px;
    line-height: 1.3;
    color: #7a746c;
  }

  .session-bar {
    display: flex;
    gap: 6px;
    margin-top: 8px;
    padding-top: 6px;
    border-top: 1px solid rgba(40, 36, 30, 0.12);
  }

  .session-bar button {
    flex: 1;
    height: 26px;
    margin: 0;
    padding: 0 8px;
    border: 0;
    border-radius: 13px;
    font-family: Quicksand, avenir, sans-serif;
    font-size: 12px;
    cursor: pointer;
  }

  .session-bar kbd {
    margin-left: 4px;
    padding: 0 4px;
    border-radius: 3px;
    background: rgba(255, 255, 255, 0.22);
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 10px;
    font-weight: 600;
  }

  .session-cancel kbd {
    background: rgba(0, 0, 0, 0.08);
  }

  .session-accept {
    background: #1d6f8a;
    color: #fff;
  }

  .session-cancel {
    background: #ddd;
    color: #333;
  }
</style>
