<script lang="ts">
  import {
    catalogChoiceTooltip,
    modifierHoldLegend,
    MODIFIER_HOLDS,
    type CatalogChoice,
    type ModifierHold
  } from '@keymap-editor/keymap-core'
  import { isHoldBlocked } from '../../key-editor-view'

  interface Props {
    activeHolds: ReadonlySet<string>
    terminalValue?: string | number
    displayChoices: CatalogChoice[]
    onSelectKey: (code: string) => void
    onToggleHold: (wrapCode: string) => void
  }

  let {
    activeHolds,
    terminalValue,
    displayChoices,
    onSelectKey,
    onToggleHold
  }: Props = $props()

  function holdBlocked(hold: ModifierHold): boolean {
    return isHoldBlocked(hold.wrap, activeHolds, terminalValue)
  }

  function holdTooltip(hold: ModifierHold): string {
    if (holdBlocked(hold)) {
      const key = String(terminalValue ?? hold.key)
      return `${key} is already the key. ${hold.wrap}(${key}) is the same modifier twice.`
    }
    if (hold.wrap === 'RA') {
      return 'AltGr — Right Alt (RALT).\nHold + key (RA(…)). To assign AltGr as the key, pick RALT in the list.'
    }
    const fromCatalog = displayChoices.find(choice => String(choice.code) === hold.key)
    const base = fromCatalog ? catalogChoiceTooltip(fromCatalog) : hold.key
    return `${base}\nHold + key. To assign this modifier as the key, pick ${hold.key} in the list.`
  }

  function handleHoldClick(event: MouseEvent, hold: ModifierHold) {
    if (holdBlocked(hold)) return
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault()
      onSelectKey(hold.key)
      return
    }
    onToggleHold(hold.wrap)
  }
</script>

<section class="key-editor-row">
  <p class="key-editor-section-label">Hold</p>
  <div class="key-editor-holds" role="group" aria-label="Hold modifiers">
    {#each MODIFIER_HOLDS as hold}
      <button
        type="button"
        class="key-editor-choice"
        class:active={activeHolds.has(hold.wrap)}
        class:blocked={holdBlocked(hold)}
        disabled={holdBlocked(hold)}
        title={holdTooltip(hold)}
        onclick={event => handleHoldClick(event, hold)}
      >
        {modifierHoldLegend(hold)}
      </button>
    {/each}
  </div>
</section>
