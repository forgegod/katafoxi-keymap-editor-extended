<script lang="ts">
  import {
    behaviorKeycapRole,
    composeLegendDecode,
    composeLayerRows,
    encodeKeyBinding,
    hostKeyByZmk,
    isBlankLayerBinding,
    isComplex,
    multilangKeycapLines,
    isHoldTapBehavior,
    isSimple,
    legendHoverHit,
    resolveBinding,
    symbolAlignCaption,
    type HostLegendView,
    type KeyBindingNode,
    type LayerView,
    type LegendHover
  } from '@keymap-editor/keymap-core'
  import { currentBinding } from '../../../binding-tree'
  import { getSearchContext } from '../../../context'
  import { editor } from '../../../editor.svelte.js'
  import { getBehaviourParams } from '../../../hydrate'
  import { createKeyEditSession } from '../../../key-edit-session.svelte'
  import { getKeyStyles } from '../../../key-units'
  import {
    claimLegendDecode,
    lockLegendDecode,
    releaseLegendDecode,
    unlockLegendDecode,
    isLegendDecodeLocked,
    lockedLegendDecodeKeyIndex
  } from '../../../legend-decode-active'
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
  const composedRows = $derived.by(() => {
    void editor.hostLayoutRevision
    return composeLayerRows(stackBindings, hostView, layerView)
  })
  const activeHostView = $derived(hostView ?? editor.hostLegend)
  /** Session face: every host language as its own row, firmware layers other than 0 hidden. */
  const multilangOn = $derived(editor.multilangViewOn)
  const multilangFace = $derived.by(() => {
    void editor.hostLayoutRevision
    if (!multilangOn || layerView?.layer0Raw) return null
    const binding = stackBindings[0]
    if (!binding || isBlankLayerBinding(binding)) return null
    const lines = multilangKeycapLines(binding, activeHostView)
    if (!lines) return null
    return { binding, lines }
  })
  const faceRows = $derived(
    multilangOn ? composedRows.filter(row => row.layer === 0) : composedRows
  )
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
  let keyRoot: HTMLDivElement | undefined = $state()
  const inHostSession = $derived(editor.hostEditSession?.keyIndex === keyIndex)
  const decodeCard = $derived.by(() => {
    void editor.hostLayoutRevision
    return decode ? composeLegendDecode(session.bindingForLayer(decode.layer), hostView) : null
  })
  const decodeTooltipId = $derived(
    decode ? `legend-decode-${keyIndex}-${decode.layer}` : undefined
  )

  function decodeRowEl(): HTMLElement | null {
    const layer = decode?.layer
    if (layer == null || !keyRoot) return null
    const row = keyRoot.querySelector(`.layer-slot[data-layer="${layer}"]`)
    return row instanceof HTMLElement ? row : null
  }

  function openDecode(layer: number, target: EventTarget | null) {
    if (!(target instanceof HTMLElement)) return
    // A locked host-edit session owns the board: no foreign hover tooltips.
    if (isLegendDecodeLocked() && lockedLegendDecodeKeyIndex() !== keyIndex) return
    if (inHostSession) return
    const rect = target.getBoundingClientRect()
    if (!claimLegendDecode(keyIndex, layer, hideDecode)) return
    decode = { layer, rect }
  }

  function hideDecode() {
    unlockLegendDecode(keyIndex)
    decode = null
    releaseLegendDecode(keyIndex)
    if (editor.hostEditSession?.keyIndex === keyIndex) {
      editor.endHostEditSession()
    }
  }

  function endHostEditSession() {
    editor.endHostEditSession()
    unlockLegendDecode(keyIndex)
    decode = null
    releaseLegendDecode(keyIndex)
  }

  function handleRowBlur() {
    if (inHostSession) return
    hideDecode()
  }

  function handleRowLeave() {
    if (inHostSession) return
    hideDecode()
  }

  function openEditor(slotCodeIndex: number, fromLayer?: number) {
    hideDecode()
    session.openEditor(slotCodeIndex, fromLayer)
  }

  function bindingHasHostEdit(binding: KeyBindingNode): boolean {
    const tap = resolveBinding(binding).tap
    return tap != null && hostKeyByZmk(tap) != null
  }

  function handleRowClick(event: MouseEvent, fromLayer: number) {
    event.stopPropagation()
    // Alt+click: only entry into host-layout edit (locked card + catalog).
    if (event.altKey) {
      event.preventDefault()
      if (!bindingHasHostEdit(session.bindingForLayer(fromLayer))) return
      openDecode(fromLayer, event.currentTarget)
      editor.beginHostEditSession(keyIndex, fromLayer)
      claimLegendDecode(keyIndex, fromLayer, hideDecode)
      lockLegendDecode(keyIndex)
      const id = `legend-decode-${keyIndex}-${fromLayer}`
      queueMicrotask(() => {
        const card = document.getElementById(id)
        if (card instanceof HTMLElement) card.focus()
      })
      return
    }
    hideDecode()
    session.openRow(fromLayer)
  }

  /** Arm a level only inside an existing Alt+click session — never starts one. */
  function armHostCell(
    language: import('@keymap-editor/keymap-core').HostLanguageId,
    level: number
  ) {
    if (!inHostSession || !decode) return
    const zmkCode = decodeCard?.keycode?.replace(/^KC_/, '') ?? ''
    if (!zmkCode) return
    editor.armHostSymbolEdit({ language, zmk: zmkCode, level })
  }

  $effect(() => {
    return () => {
      unlockLegendDecode(keyIndex)
      releaseLegendDecode(keyIndex)
    }
  })

  $effect(() => {
    // Accept / catalog Escape may clear the session; drop our locked card with it.
    if (editor.hostEditSession?.keyIndex === keyIndex) return
    if (!decode || !isLegendDecodeLocked() || lockedLegendDecodeKeyIndex() !== keyIndex) return
    unlockLegendDecode(keyIndex)
    decode = null
    releaseLegendDecode(keyIndex)
  })

  $effect(() => {
    if (!inHostSession || !decodeTooltipId) return
    const cardId = decodeTooltipId
    function onKeydown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopImmediatePropagation()
      endHostEditSession()
    }
    function onPointerDown(event: PointerEvent) {
      const target = event.target
      if (target instanceof Element && target.closest('.host-symbol-picker, .catalog-toggle')) {
        return
      }
      if (target instanceof Node) {
        const card = document.getElementById(cardId)
        if (card?.contains(target)) return
        const row = decodeRowEl()
        if (row?.contains(target)) return
      }
      event.preventDefault()
      event.stopPropagation()
      endHostEditSession()
    }
    window.addEventListener('keydown', onKeydown, true)
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      window.removeEventListener('keydown', onKeydown, true)
      window.removeEventListener('pointerdown', onPointerDown, true)
    }
  })
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

  function slotAlign(binding: KeyBindingNode): { moved: boolean; conflict: boolean; title: string } {
    const align = editor.symbolAlignIndex
    const tap = resolveBinding(binding).tap
    if (!align || tap == null || !hostKeyByZmk(tap)) {
      return { moved: false, conflict: false, title: '' }
    }
    const moved = align.byZmk.has(tap)
    const conflict = align.conflictByZmk.has(tap)
    return { moved, conflict, title: moved || conflict ? symbolAlignCaption(tap, align) : '' }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={keyRoot}
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
  {#if multilangFace}
    {@const hit = legendHoverHit(multilangFace.binding, legendHover)}
    {@const marks = slotAlign(multilangFace.binding)}
    <div
      class="keycap-wrap layer-stack multilang"
      style="--layer-rows: {multilangFace.lines.length || 1}"
    >
      <button
        type="button"
        class="layer-slot multilang-face"
        class:symbol-moved={marks.moved}
        class:altgr-conflict={marks.conflict}
        data-layer="0"
        style="grid-row: 1 / -1"
        aria-label={rowAriaLabel({
          layer: 0,
          title: encodeKeyBinding(multilangFace.binding),
          binding: multilangFace.binding
        })}
        aria-describedby={decode?.layer === 0 && !inHostSession ? decodeTooltipId : undefined}
        title={marks.title || undefined}
        onclick={event => handleRowClick(event, 0)}
        onmouseenter={event => openDecode(0, event.currentTarget)}
        onmouseleave={handleRowLeave}
        onfocus={event => openDecode(0, event.currentTarget)}
        onblur={handleRowBlur}
      >
        {#each multilangFace.lines as line, index (line.language)}
          <span class="lang-line" data-lang-index={index}>
            <KeyCap legend={line.legend} stacked {hit} conflict={marks.conflict} />
          </span>
        {/each}
      </button>
    </div>
  {:else}
  <div class="keycap-wrap layer-stack" style="--layer-rows: {faceRows.length || 1}">
    {#each faceRows as row (row.layer)}
      {@const hit = legendHoverHit(row.binding, legendHover)}
      {@const marks = slotAlign(row.binding)}
      <button
        type="button"
        class="layer-slot"
        class:symbol-moved={marks.moved}
        class:altgr-conflict={marks.conflict}
        data-layer={row.layer}
        aria-label={rowAriaLabel(row)}
        aria-describedby={
          decode?.layer === row.layer && !inHostSession ? decodeTooltipId : undefined
        }
        title={marks.title || undefined}
        onclick={event => handleRowClick(event, row.layer)}
        onmouseenter={event => openDecode(row.layer, event.currentTarget)}
        onmouseleave={handleRowLeave}
        onfocus={event => openDecode(row.layer, event.currentTarget)}
        onblur={handleRowBlur}
      >
        {#if row.blank}
          <span class="layer-empty" aria-hidden="true">{blankRowMark(row.binding)}</span>
        {:else if row.legend}
          <KeyCap legend={row.legend} stacked {hit} conflict={marks.conflict} />
        {:else}
          <ZmkLegend binding={row.binding} raw={row.raw} {hit} />
        {/if}
      </button>
    {/each}
  </div>
  {/if}

  {#if decode && decodeCard && !session.editing}
    <LegendDecodeCard
      card={decodeCard}
      anchor={decode.rect}
      tooltipId={decodeTooltipId ?? ''}
      hostSession={inHostSession}
      onArmCell={armHostCell}
      onEndSession={endHostEditSession}
    />
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
