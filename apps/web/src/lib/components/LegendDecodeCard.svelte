<script lang="ts">
  import {
    ALT_LEVEL_EMPTY,
    composeLegendDecode,
    glyphToKeysym,
    hostLanguageName,
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
    pinned?: boolean
    onPointerEnter?: () => void
    onPointerLeave?: () => void
    onPin?: () => void
  }

  let {
    card,
    anchor,
    tooltipId,
    pinned = false,
    onPointerEnter,
    onPointerLeave,
    onPin
  }: Props = $props()
  let el: HTMLDivElement | undefined = $state()
  let editing = $state<{ language: HostLanguageId; level: number } | null>(null)
  let draft = $state('')
  let fieldError = $state<string | null>(null)
  let busy = $state(false)

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
  const preview = $derived(glyphToKeysym(draft))
  const dropsWarning = $derived(
    editing?.level === 0 && preview.ok && keysymToGlyph(preview.keysym) == null
  )

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
    const box = el.getBoundingClientRect()
    let left = anchor.left + anchor.width / 2 - box.width / 2
    left = Math.max(8, Math.min(left, window.innerWidth - box.width - 8))
    let top = anchor.top - box.height - 8
    if (top < 8) top = anchor.bottom + 8
    el.style.left = `${left}px`
    el.style.top = `${top}px`
  })

  $effect(() => {
    if (!el) return
    if (pinned) {
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

  // Imperative listeners keep svelte-check from treating the tooltip shell as a
  // new interactive a11y surface (Modal/KeyValue already own the two warnings).
  // Capture + stopPropagation so row/KeyEditor never see the click; cell edits are
  // handled here because a bubble listener on the shell would swallow delegated
  // Svelte onclick handlers on the buttons.
  $effect(() => {
    if (!el) return
    const node = el
    const key = zmk
    const enter = () => onPointerEnter?.()
    const leave = () => onPointerLeave?.()
    const click = (event: MouseEvent) => {
      event.stopPropagation()
      const target = event.target
      if (!(target instanceof Element)) {
        onPin?.()
        return
      }
      if (target.closest('.cell-input, .cell-meta')) {
        onPin?.()
        return
      }
      const revert = target.closest('[data-host-revert]')
      if (revert instanceof HTMLElement) {
        const language = revert.dataset.language as HostLanguageId
        const level = Number(revert.dataset.level)
        onPin?.()
        if (!key || busy || !Number.isInteger(level)) return
        void (async () => {
          busy = true
          try {
            const result = await editor.revertHostKeyLevel(language, key, level)
            if (result.ok) {
              if (editing?.language === language && editing.level === level) cancelEdit()
            }
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
        const text = cell.dataset.text ?? ''
        onPin?.()
        if (!key || !Number.isInteger(level)) return
        editing = { language, level }
        draft = text === ALT_LEVEL_EMPTY ? '' : text
        fieldError = null
        return
      }
      onPin?.()
    }
    node.addEventListener('mouseenter', enter)
    node.addEventListener('mouseleave', leave)
    node.addEventListener('click', click, true)
    return () => {
      node.removeEventListener('mouseenter', enter)
      node.removeEventListener('mouseleave', leave)
      node.removeEventListener('click', click, true)
    }
  })

  function rejectionMessage(reason: string): string {
    if (reason === 'multiple-code-points') return 'Нужен один символ или имя keysym'
    if (reason === 'lone-surrogate') return 'Недопустимый символ'
    return 'Не удалось разобрать ввод'
  }

  function cancelEdit() {
    editing = null
    draft = ''
    fieldError = null
  }

  async function commitEdit() {
    if (!editing || !zmk || busy) return
    const { language, level } = editing
    const parsed = glyphToKeysym(draft)
    if (!parsed.ok) {
      fieldError = rejectionMessage(parsed.reason)
      return
    }
    busy = true
    fieldError = null
    try {
      const result = await editor.setHostKeyLevel(language, zmk, level, draft)
      if (!result.ok) {
        fieldError =
          result.reason === 'rejected' && result.detail
            ? rejectionMessage(result.detail)
            : 'Не удалось сохранить уровень'
        return
      }
      cancelEdit()
    } finally {
      busy = false
    }
  }

  function onFieldKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      void commitEdit()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      cancelEdit()
    }
  }
</script>

<div
  bind:this={el}
  id={tooltipId}
  class="legend-decode"
  class:pinned
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
    <div class="grid">
      <div class="row flags">
        {#each displayCard.current as column (column.language)}
          <div
            class="lang flag"
            data-language={column.language}
            title={hostLanguageName(column.language)}
          >
            {column.flag}
          </div>
        {/each}
      </div>
      {#if displayCard.system}
        <div class="row system">
          {#each displayCard.system as column (column.language)}
            <div class="lang" data-language={column.language}>
              {#each column.slots as slot, index (`${column.language}-sys-${index}`)}
                <span class="slot" class:empty={slot.text === ALT_LEVEL_EMPTY}>{slot.text}</span>
              {/each}
            </div>
          {/each}
        </div>
      {/if}
      <div class="row current">
        {#each displayCard.current as column (column.language)}
          <div class="lang" data-language={column.language}>
            {#each column.slots as slot, index (`${column.language}-${index}`)}
              {@const isEditing =
                editing?.language === column.language && editing.level === index}
              <div class="cell" class:editing={isEditing}>
                {#if isEditing}
                  <!-- svelte-ignore a11y_autofocus -->
                  <input
                    class="cell-input"
                    class:invalid={fieldError != null}
                    type="text"
                    value={draft}
                    aria-label={`Host level ${index} for ${column.language}`}
                    autofocus
                    disabled={busy}
                    oninput={event => {
                      draft = event.currentTarget.value
                      fieldError = null
                    }}
                    onkeydown={onFieldKeydown}
                    onclick={event => event.stopPropagation()}
                  />
                  <div class="cell-meta">
                    {#if preview.ok}
                      <span class="keysym">{preview.keysym}</span>
                    {:else}
                      <span class="keysym error">{rejectionMessage(preview.reason)}</span>
                    {/if}
                    {#if fieldError}
                      <span class="error">{fieldError}</span>
                    {/if}
                    {#if dropsWarning}
                      <span class="warn" role="status"
                        >Базовый уровень несимвольный — клавиша пропадёт из композиции</span
                      >
                    {/if}
                  </div>
                {:else}
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
                  >
                    {slot.text}
                  </button>
                  {#if slot.differs}
                    <button
                      type="button"
                      class="revert"
                      data-host-revert
                      data-language={column.language}
                      data-level={index}
                      title="Вернуть системный эталон"
                      aria-label={`Revert ${column.language} level ${index}`}
                      disabled={busy || !zmk}
                    >
                      ↺
                    </button>
                  {/if}
                {/if}
              </div>
            {/each}
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .legend-decode {
    pointer-events: auto;
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

  .legend-decode.pinned {
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
    grid-template-columns: repeat(4, minmax(1.15em, auto));
    justify-items: center;
    align-items: start;
    gap: 2px 0;
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

  .cell {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 1.15em;
  }

  .cell.editing {
    min-width: 6.5em;
    align-items: stretch;
    grid-column: span 1;
  }

  .slot {
    min-width: 1em;
    margin: 0;
    padding: 0;
    border: 0;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: center;
    cursor: pointer;
  }

  .slot:disabled {
    cursor: default;
  }

  .slot.empty {
    opacity: 0.38;
  }

  .row.system {
    color: #8a847c;
    opacity: 0.72;
  }

  .row.system .slot {
    cursor: default;
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

  .cell-input {
    box-sizing: border-box;
    width: 100%;
    min-width: 4.5em;
    margin: 0;
    padding: 1px 3px;
    border: 1px solid #8a847c;
    border-radius: 3px;
    background: #fff;
    color: #222;
    font: inherit;
  }

  .cell-input.invalid {
    border-color: #a33;
  }

  .cell-meta {
    display: flex;
    flex-direction: column;
    gap: 1px;
    max-width: 12em;
    margin-top: 2px;
    white-space: normal;
    font-size: 10px;
    line-height: 1.25;
    font-family: Quicksand, avenir, sans-serif;
  }

  .keysym {
    color: #5a554e;
  }

  .error {
    color: #a33;
  }

  .warn {
    color: #8a5a00;
  }

  .revert {
    position: absolute;
    top: -0.55em;
    right: -0.55em;
    width: 1.1em;
    height: 1.1em;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: #e8e2d6;
    color: #5a554e;
    font-size: 9px;
    line-height: 1;
    cursor: pointer;
  }

  .revert:hover {
    background: #d8d0c0;
  }
</style>
