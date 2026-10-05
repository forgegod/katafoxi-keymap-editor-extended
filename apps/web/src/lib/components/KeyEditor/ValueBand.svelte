<script lang="ts">
  import {
    catalogChoiceTooltip,
    choiceMatchesCode,
    choiceOsSupportLimited,
    codesBandNeedsDisclosure,
    formatUsedChoiceTooltip,
    isKeypadChoice,
    isModifierKey,
    usedLayersForChoice,
    valueBandCaption,
    type CatalogChoice,
    type ValueBand
  } from '@keymap-editor/keymap-core'
  import { codeColumnMinPx, codeGridMetrics } from '../../code-grid'
  import Icon from '../Common/Icon.svelte'

  interface Choice extends CatalogChoice {
    faIcon?: string
  }

  interface Props {
    band: ValueBand
    prevBand?: ValueBand
    nextBand?: ValueBand
    context: string
    searching: boolean
    activeValue?: string | number
    dimUsed: boolean
    used: ReadonlyMap<string, readonly number[]>
    usedLayerLabels?: readonly string[]
    labelChoice: (choice: CatalogChoice) => string
    onChoose: (choice: Choice) => void
    valuesWidth: number
    codesExpanded?: boolean
    shiftedExpanded?: boolean
    moreFKeysExpanded?: boolean
  }

  let {
    band,
    prevBand,
    nextBand,
    context,
    searching,
    activeValue,
    dimUsed,
    used,
    usedLayerLabels = [],
    labelChoice,
    onChoose,
    valuesWidth,
    codesExpanded = $bindable(false),
    shiftedExpanded = $bindable(false),
    moreFKeysExpanded = $bindable(false)
  }: Props = $props()

  function choiceLabel(choice: Choice): string {
    if (isModifierKey(choice)) return String(choice.code ?? '')
    return labelChoice(choice)
  }

  function codeGridStyle(items: Choice[], gridContext: string): string {
    const minColPx = codeColumnMinPx(items.map(choiceLabel), {
      fitLongest: /^Consumer/i.test(gridContext)
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

  function choicesHaveActive(items: readonly CatalogChoice[]): boolean {
    return items.some(choice => isActiveChoice(choice as Choice))
  }

  function bandHasActive(target: ValueBand): boolean {
    return (
      choicesHaveActive(target.items) ||
      (target.extraRows ?? []).some(row => choicesHaveActive(row))
    )
  }

  function showCodesBand(target: ValueBand): boolean {
    if (!codesBandNeedsDisclosure(context)) return true
    return searching || codesExpanded || bandHasActive(target)
  }

  function canCollapseCodes(target: ValueBand): boolean {
    return (
      codesBandNeedsDisclosure(context) &&
      !searching &&
      !bandHasActive(target)
    )
  }

  function showShiftedBand(target: ValueBand): boolean {
    return searching || shiftedExpanded || bandHasActive(target)
  }

  function showMoreFKeys(target: ValueBand): boolean {
    const more = target.extraRows?.[0] ?? []
    return (
      more.length === 0 ||
      searching ||
      moreFKeysExpanded ||
      choicesHaveActive(more)
    )
  }

  const caption = $derived(valueBandCaption(band.kind))
  const shiftedCaption = valueBandCaption('shifted')
  const shiftedOnPunct = $derived(
    band.kind === 'punct' && nextBand?.kind === 'shifted' ? nextBand : null
  )
  const skipShifted = $derived(
    band.kind === 'shifted' && prevBand?.kind === 'punct'
  )
  const codesOnExtras = $derived(
    band.kind === 'extras' && nextBand?.kind === 'codes' ? nextBand : null
  )
  const codesOpen = $derived(
    band.kind === 'codes'
      ? showCodesBand(band)
      : codesOnExtras
        ? showCodesBand(codesOnExtras)
        : false
  )
  const skipCodesCollapsed = $derived(
    band.kind === 'codes' &&
      prevBand?.kind === 'extras' &&
      !showCodesBand(band)
  )
  const render = $derived(!skipShifted && !skipCodesCollapsed)
</script>

{#if render}
  <div
    class="key-editor-band"
    class:codes-band={band.kind === 'codes' || band.kind === 'shifted'}
    data-band={band.kind}
  >
    {#if caption && (band.kind !== 'shifted' || showShiftedBand(band))}
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

    {#if band.kind === 'codes' && !showCodesBand(band)}
      <button
        type="button"
        class="key-editor-codes-toggle key-editor-inline-toggle"
        onclick={() => {
          codesExpanded = true
        }}
      >
        Codes ({band.items.length})
      </button>
    {:else if band.kind === 'codes'}
      <div class="key-editor-band-body">
        {#if canCollapseCodes(band)}
          <button
            type="button"
            class="key-editor-codes-toggle key-editor-inline-toggle"
            onclick={() => {
              codesExpanded = false
            }}
          >
            Hide
          </button>
        {/if}
        <div
          class="key-editor-grid codes"
          data-band="codes"
          style={codeGridStyle(band.items as Choice[], context)}
        >
          {#each band.items as choice}
            {@const item = choice as Choice}
            <button
              type="button"
              class="key-editor-choice"
              class:active={isActiveChoice(item)}
              class:used={isUsedChoice(item) && !isActiveChoice(item)}
              class:os-limited={choiceOsSupportLimited(item)}
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
    {:else if band.kind === 'shifted' && !showShiftedBand(band)}
      <button
        type="button"
        class="key-editor-codes-toggle"
        title={caption?.hint}
        onclick={() => {
          shiftedExpanded = true
        }}
      >
        LS · US aliases ({band.items.length})
      </button>
    {:else if band.kind === 'shifted'}
      <div class="key-editor-band-body">
        {#if !searching && !bandHasActive(band)}
          <button
            type="button"
            class="key-editor-codes-toggle"
            onclick={() => {
              shiftedExpanded = false
            }}
          >
            Hide LS · US
          </button>
        {/if}
        <div class="key-editor-grid" data-band="shifted">
          {#each band.items as choice}
            {@const item = choice as Choice}
            <button
              type="button"
              class="key-editor-choice"
              class:active={isActiveChoice(item)}
              class:used={isUsedChoice(item) && !isActiveChoice(item)}
              class:os-limited={choiceOsSupportLimited(item)}
              title={valueTooltip(item)}
              onclick={() => onChoose(item)}
            >
              {choiceLabel(item)}
            </button>
          {/each}
        </div>
      </div>
    {:else if band.kind === 'function'}
      {@const moreFKeys = band.extraRows?.[0] ?? []}
      {@const fKeysOpen = showMoreFKeys(band)}
      <div class="key-editor-grid" data-band="function">
        {#each band.items as choice}
          {@const item = choice as Choice}
          <button
            type="button"
            class="key-editor-choice"
            class:active={isActiveChoice(item)}
            class:used={isUsedChoice(item) && !isActiveChoice(item)}
            class:os-limited={choiceOsSupportLimited(item)}
            title={valueTooltip(item)}
            onclick={() => onChoose(item)}
          >
            {choiceLabel(item)}
          </button>
        {/each}
        {#if fKeysOpen}
          {#each moreFKeys as choice}
            {@const item = choice as Choice}
            <button
              type="button"
              class="key-editor-choice"
              class:active={isActiveChoice(item)}
              class:used={isUsedChoice(item) && !isActiveChoice(item)}
              class:os-limited={choiceOsSupportLimited(item)}
              title={valueTooltip(item)}
              onclick={() => onChoose(item)}
            >
              {choiceLabel(item)}
            </button>
          {/each}
          {#if moreFKeys.length > 0 && !searching && !choicesHaveActive(moreFKeys)}
            <button
              type="button"
              class="key-editor-codes-toggle key-editor-inline-toggle"
              title="Hide F13–F24"
              onclick={() => {
                moreFKeysExpanded = false
              }}
            >
              Hide
            </button>
          {/if}
        {:else if moreFKeys.length > 0}
          <button
            type="button"
            class="key-editor-codes-toggle key-editor-inline-toggle"
            title="Show F13–F24"
            onclick={() => {
              moreFKeysExpanded = true
            }}
          >
            F13–24
          </button>
        {/if}
      </div>
    {:else if band.kind === 'punct'}
      {@const shiftedOpen = shiftedOnPunct
        ? showShiftedBand(shiftedOnPunct)
        : false}
      <div class="key-editor-grid" data-band="punct">
        {#each band.items as choice}
          {@const item = choice as Choice}
          <button
            type="button"
            class="key-editor-choice"
            class:active={isActiveChoice(item)}
            class:used={isUsedChoice(item) && !isActiveChoice(item)}
            class:os-limited={choiceOsSupportLimited(item)}
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
        {#if shiftedOnPunct}
          {#if shiftedOpen}
            {#each shiftedOnPunct.items as choice}
              {@const item = choice as Choice}
              <button
                type="button"
                class="key-editor-choice shifted-alias"
                class:active={isActiveChoice(item)}
                class:used={isUsedChoice(item) && !isActiveChoice(item)}
                class:os-limited={choiceOsSupportLimited(item)}
                title={valueTooltip(item)}
                onclick={() => onChoose(item)}
              >
                {choiceLabel(item)}
              </button>
            {/each}
            {#if !searching && !bandHasActive(shiftedOnPunct)}
              <button
                type="button"
                class="key-editor-codes-toggle key-editor-inline-toggle"
                title={shiftedCaption?.hint ?? 'Hide LS · US aliases'}
                onclick={() => {
                  shiftedExpanded = false
                }}
              >
                Hide
              </button>
            {/if}
          {:else}
            <button
              type="button"
              class="key-editor-codes-toggle key-editor-inline-toggle"
              title={shiftedCaption?.hint ?? 'Show LS · US aliases'}
              onclick={() => {
                shiftedExpanded = true
              }}
            >
              LS·US
            </button>
          {/if}
        {/if}
      </div>
    {:else}
      <div class="key-editor-band-stacks">
        <div class="key-editor-grid" data-band={band.kind}>
          {#each band.items as choice}
            {@const item = choice as Choice}
            <button
              type="button"
              class="key-editor-choice"
              class:active={isActiveChoice(item)}
              class:used={isUsedChoice(item) && !isActiveChoice(item)}
              class:os-limited={choiceOsSupportLimited(item)}
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
          {#if codesOnExtras && !codesOpen}
            <button
              type="button"
              class="key-editor-codes-toggle key-editor-inline-toggle"
              title="Show rare HID codes"
              onclick={() => {
                codesExpanded = true
              }}
            >
              Codes ({codesOnExtras.items.length})
            </button>
          {/if}
        </div>

        {#each band.extraRows ?? [] as row, rowIndex}
          <div
            class="key-editor-grid"
            class:media-alt={band.kind === 'media' && rowIndex === 0}
            data-band={band.kind}
          >
            {#each row as choice}
              {@const item = choice as Choice}
              <button
                type="button"
                class="key-editor-choice"
                class:active={isActiveChoice(item)}
                class:used={isUsedChoice(item) && !isActiveChoice(item)}
                class:os-limited={choiceOsSupportLimited(item)}
                class:keypad={isKeypadChoice(item)}
                class:media-alt={band.kind === 'media'}
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
        {/each}
      </div>
    {/if}
  </div>
{/if}
