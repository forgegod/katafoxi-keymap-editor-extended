<script lang="ts">
  import {
    behaviorKeycapRole,
    composeLegendDecode,
    composeLayerRows,
    encodeKeyBinding,
    isComplex,
    isHoldTapBehavior,
    isSimple,
    legendHoverHit,
    type HostLegendView,
    type KeyBindingNode,
    type LayerView,
    type LegendHover
  } from '@keymap-editor/keymap-core'
  import { currentBinding } from '../../../binding-tree'
  import { getSearchContext } from '../../../context'
  import { getBehaviourParams } from '../../../hydrate'
  import { createKeyEditSession } from '../../../key-edit-session.svelte'
  import { getKeyStyles } from '../../../key-units'
  import KeyCap from '../../KeyCap.svelte'
  import LegendDecodeCard from '../../LegendDecodeCard.svelte'
  import './Key.css'
  import Modal from '../../Common/Modal.svelte'
  import KeyEditor from '../../KeyEditor/KeyEditor.svelte'
  import ZmkLegend from './ZmkLegend.svelte'

  interface Props {
    position: { x: number; y: number }
    rotation?: { x?: number; y?: number; a?: number }
    size: { u: number; h: number }
    label?: string
    value: string | number
    params?: Array<{ value?: string | number; params?: unknown[] }>
    keyIndex: number
    layerIndex?: number
    onUpdate: (keyIndex: number, layerIndex: number, binding: KeyBindingNode) => void
    hostView?: HostLegendView
    layerView?: LayerView
    legendHover?: LegendHover | null
    layerBindings?: KeyBindingNode[]
    usedKeycodes?: ReadonlyMap<string, readonly number[]>
    usedRevision?: string
    usedLayerLabels?: readonly string[]
  }

  let {
    position,
    rotation,
    size,
    label,
    value,
    params = [],
    keyIndex,
    layerIndex,
    onUpdate,
    hostView,
    layerView,
    legendHover = null,
    layerBindings,
    usedKeycodes = new Map(),
    usedRevision = '',
    usedLayerLabels = []
  }: Props = $props()

  const searchBox = getSearchContext()
  const search = $derived(searchBox.current)
  const sources = $derived(search?.sources ?? {})
  const stackBindings = $derived(
    layerBindings?.length ? layerBindings : [currentBinding(value, params)]
  )
  const session = createKeyEditSession({
    sources: () => sources,
    search: () => search,
    bindings: () => stackBindings,
    layerIndex: () => layerIndex,
    keyIndex: () => keyIndex,
    onUpdate: (nextKey, nextLayer, binding) => onUpdate(nextKey, nextLayer, binding)
  })
  const composedRows = $derived(composeLayerRows(stackBindings, hostView, layerView))
  const positioningStyle = $derived(getKeyStyles(position, size, rotation))
  const holdTapVisible = $derived(
    isHoldTapBehavior(value) && session.normalized.params.length === 2
  )
  const behaviorRole = $derived(
    behaviorKeycapRole(value, {
      paramCount: session.normalized.params.length,
      holdTapVisible
    })
  )
  const behaviourParams = $derived(
    getBehaviourParams(session.normalized.params, session.normalized.source as never)
  )

  let decode = $state<{ layer: number; rect: DOMRect } | null>(null)
  const decodeCard = $derived(
    decode ? composeLegendDecode(session.bindingForLayer(decode.layer), hostView) : null
  )
  const decodeTooltipId = $derived(
    decode ? `legend-decode-${keyIndex}-${decode.layer}` : undefined
  )

  function openDecode(layer: number, target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return
    decode = { layer, rect: target.getBoundingClientRect() }
  }

  function hideDecode() {
    decode = null
  }

  function openEditor(slotCodeIndex: number, fromLayer?: number) {
    hideDecode()
    session.openEditor(slotCodeIndex, fromLayer)
  }

  function handleRowClick(event: MouseEvent, fromLayer: number) {
    event.stopPropagation()
    hideDecode()
    session.openRow(fromLayer)
  }

  function rowTitle(row: { title: string; binding: KeyBindingNode }): string {
    return row.title || encodeKeyBinding(row.binding)
  }

  function rowAriaLabel(row: { layer: number; title: string; binding: KeyBindingNode }): string {
    const title = rowTitle(row)
    const code = String(row.binding.value)
    if (code === '&trans') return `${title}, layer ${row.layer}, passes through`
    if (code === '&none') return `${title}, layer ${row.layer}, silent`
    return `${title}, layer ${row.layer}`
  }

  function blankRowMark(binding: KeyBindingNode): string {
    return String(binding.value) === '&trans' ? '↓' : '∅'
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="key"
  data-label={label}
  data-u={size.u}
  data-h={size.h}
  data-simple={isSimple(session.normalized)}
  data-long={isComplex(session.normalized, behaviourParams)}
  data-hold-tap={holdTapVisible}
  data-behavior={behaviorRole}
  data-editable={session.canEdit}
  data-stacked="true"
  style={Object.entries(positioningStyle)
    .map(([k, v]) => `${k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}:${v}`)
    .join(';')}
>
  <div class="keycap-wrap layer-stack" style="--layer-rows: {composedRows.length || 1}">
    {#each composedRows as row (row.layer)}
      {@const hit = legendHoverHit(row.binding, legendHover)}
      <button
        type="button"
        class="layer-slot"
        data-layer={row.layer}
        aria-label={rowAriaLabel(row)}
        aria-describedby={decode?.layer === row.layer ? decodeTooltipId : undefined}
        onclick={event => handleRowClick(event, row.layer)}
        onmouseenter={event => openDecode(row.layer, event.currentTarget)}
        onmouseleave={hideDecode}
        onfocus={event => openDecode(row.layer, event.currentTarget)}
        onblur={hideDecode}
      >
        {#if row.blank}
          <span class="layer-empty" aria-hidden="true">{blankRowMark(row.binding)}</span>
        {:else if row.legend}
          <KeyCap legend={row.legend} mode="composed" stacked {hit} />
        {:else}
          <ZmkLegend binding={row.binding} raw={row.raw} {hit} />
        {/if}
      </button>
    {/each}
  </div>

  {#if decode && decodeCard && !session.editing}
    <LegendDecodeCard card={decodeCard} anchor={decode.rect} tooltipId={decodeTooltipId ?? ''} />
  {/if}

  {#if session.editing && session.canEdit && session.activeSlot}
    <Modal onBackdrop={session.closeEditor}>
      <KeyEditor
        bindingLabel={session.bindingLabel}
        behaviours={session.behaviours}
        editorSlots={session.slots}
        activeCodeIndex={session.activeSlot.codeIndex}
        choices={session.choices}
        {usedKeycodes}
        {usedRevision}
        {usedLayerLabels}
        onSelectBehaviour={session.selectBehaviour}
        onSelectValue={session.selectValue}
        onToggleHold={session.toggleHold}
        onActivateSlot={openEditor}
        onConfirm={session.confirm}
        onCancel={session.closeEditor}
      />
    </Modal>
  {/if}
</div>
