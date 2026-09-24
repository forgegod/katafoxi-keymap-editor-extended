<script lang="ts">
  import {
    bandCatalogChoices,
    catalogChoiceTooltip,
    choiceMatchesCode,
    formatUsedChoiceTooltip,
    isKeypadChoice,
    isModifierKey,
    usedLayersForChoice,
    valueBandCaption,
    type CatalogChoice,
    type ChoiceGroup
  } from '@keymap-editor/keymap-core'
  import { codeColumnMinPx, codeGridMetrics } from '../../code-grid'
  import Icon from '../Common/Icon.svelte'

  interface Choice extends CatalogChoice {
    faIcon?: string
  }

  interface Props {
    groups: ChoiceGroup[]
    showGroupTitles: boolean
    searching: boolean
    pickKeyHint: boolean
    activeValue?: string | number
    dimUsed: boolean
    used: ReadonlyMap<string, readonly number[]>
    usedLayerLabels?: readonly string[]
    labelChoice: (choice: CatalogChoice) => string
    onChoose: (choice: Choice) => void
  }

  let {
    groups,
    showGroupTitles,
    searching,
    pickKeyHint,
    activeValue,
    dimUsed,
    used,
    usedLayerLabels = [],
    labelChoice,
    onChoose
  }: Props = $props()

  let valuesEl: HTMLDivElement | undefined = $state()
  let valuesWidth = $state(1045)

  function choiceLabel(choice: Choice): string {
    if (isModifierKey(choice)) return String(choice.code ?? '')
    return labelChoice(choice)
  }

  function codeGridStyle(items: Choice[], context: string): string {
    const minColPx = codeColumnMinPx(items.map(choiceLabel), {
      fitLongest: /^Consumer/i.test(context)
    })
    const { cols, rows } = codeGridMetrics(items.length, valuesWidth, minColPx)
    return `--code-cols:${cols};--code-rows:${rows};--code-col-min:${minColPx}px`
  }

  function isActiveChoice(choice: Choice): boolean {
    return choiceMatchesCode(choice, activeValue)
  }

  function isUsedChoice(choice: Choice): boolean {
    return dimUsed && usedLayersForChoice(choice, used).length > 0
  }

  function valueTooltip(choice: Choice): string {
    const base = catalogChoiceTooltip(choice)
    if (!dimUsed) return base
    const layers = usedLayersForChoice(choice, used)
    return formatUsedChoiceTooltip(base, layers, usedLayerLabels)
  }

  $effect(() => {
    if (!valuesEl) return
    const node = valuesEl
    const sync = () => {
      valuesWidth = node.clientWidth
    }
    sync()
    const observer = new ResizeObserver(sync)
    observer.observe(node)
    return () => observer.disconnect()
  })
</script>

<div class="key-editor-values" bind:this={valuesEl}>
  {#if pickKeyHint}
    <p class="key-editor-empty">Pick a key to finish the combo.</p>
  {/if}
  {#if groups.length === 0 || groups.every(group => group.items.length === 0)}
    <p class="key-editor-empty">No matching values.</p>
  {:else}
    {#each groups as group}
      <div class="key-editor-group">
        {#if showGroupTitles || searching}
          <h3>{group.context}</h3>
        {/if}
        {#each bandCatalogChoices(group.items) as band}
          {@const caption = valueBandCaption(band.kind)}
          <div class="key-editor-band" data-band={band.kind}>
            {#if caption}
              <p class="key-editor-band-label" title={caption.hint}>
                <span>{caption.label}</span>
                <svg
                  class="key-editor-band-hint"
                  viewBox="0 0 16 16"
                  aria-hidden="true"
                >
                  <circle
                    cx="8"
                    cy="8"
                    r="6.4"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.35"
                  />
                  <circle cx="8" cy="5" r="1" fill="currentColor" />
                  <path
                    d="M8 7.35v4.1"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.35"
                    stroke-linecap="round"
                  />
                </svg>
              </p>
            {/if}
            <div
              class="key-editor-grid"
              class:codes={band.kind === 'codes'}
              data-band={band.kind}
              style={band.kind === 'codes'
                ? codeGridStyle(band.items as Choice[], group.context)
                : undefined}
            >
              {#each band.items as choice}
                {@const item = choice as Choice}
                <button
                  type="button"
                  class="key-editor-choice"
                  class:active={isActiveChoice(item)}
                  class:used={isUsedChoice(item) && !isActiveChoice(item)}
                  class:keypad={isKeypadChoice(item)}
                  title={valueTooltip(item)}
                  onclick={() => onChoose(item)}
                >
                  {#if item.faIcon}
                    <Icon name={String(item.faIcon)} />
                  {/if}
                  {choiceLabel(item)}
                </button>
              {/each}
            </div>
          </div>
        {/each}
      </div>
    {/each}
  {/if}
</div>
