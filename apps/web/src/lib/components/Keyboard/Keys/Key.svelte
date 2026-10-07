<script lang="ts">
  import {
    behaviorKeycapRole,
    composeLegendDecode,
    composeLayerRows,
    encodeKeyBinding,
    hostKeyByZmk,
    isBlankLayerBinding,
    isComplex,
    blankRowMark,
    layerRowAriaLabel,
    stripKcPrefix,
    multilangKeycapLines,
    isHoldTapBinding,
    isSimple,
    CONDITIONAL_OCCUPIED_NOTE,
    conditionalOccupiedLayers,
    legendHoverHit,
    resolveBinding,
    symbolAlignCaption,
    symbolAlignHasBasic,
    symbolAlignHasOrnament,
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
  import { layerToneStyle } from '../../../layer-tone'
  import './Key.css'
  import KeyEditorHost from '../../KeyEditorHost.svelte'
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
    isLegendAnchor?: boolean
    layerBindings?: KeyBindingNode[]
    usedKeycodes?: ReadonlyMap<string, readonly number[]>
    usedRevision?: string
    usedLayerLabels?: readonly string[]
    comboMode?: boolean
    comboMember?: boolean
    /** Firmware layer strip to peek-highlight from combo-bead hover. */
    comboPeekLayer?: number | null
    onComboToggle?: (keyIndex: number) => void
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
    isLegendAnchor = false,
    layerBindings,
    usedKeycodes = new Map(),
    usedRevision = '',
    usedLayerLabels = [],
    comboMode = false,
    comboMember = false,
    comboPeekLayer = null,
    onComboToggle
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
  const occupiedLayers = $derived(
    conditionalOccupiedLayers(stackBindings, editor.draftKeymap?.conditionalLayers ?? [])
  )
  const positioningStyle = $derived(getKeyStyles(position, size, rotation))
  const holdTapVisible = $derived(isHoldTapBinding(session.normalized))
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
    // Same layer preview as the host-legend strip row.
    editor.setLegendHover({ kind: 'layer', layer })
  }

  function openDecodeOnFocus(layer: number, event: FocusEvent) {
    const target = event.currentTarget
    if (!(target instanceof HTMLElement) || !target.matches(':focus-visible')) return
    openDecode(layer, target)
  }

  function hideDecode() {
    unlockLegendDecode(keyIndex)
    decode = null
    releaseLegendDecode(keyIndex)
    if (editor.hostEditSession?.keyIndex === keyIndex) {
      editor.endHostEditSession()
    }
  }

  function clearLayerHover() {
    if (editor.legendHover?.kind === 'layer') editor.setLegendHover(null)
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
    clearLayerHover()
  }

  function handleRowLeave() {
    if (inHostSession) return
    hideDecode()
    clearLayerHover()
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
    if (comboMode) {
      event.preventDefault()
      onComboToggle?.(keyIndex)
      return
    }
    // Alt+click: only entry into host-layout edit (locked card + catalog).
    if (event.altKey) {
      event.preventDefault()
      const binding = session.bindingForLayer(fromLayer)
      if (!bindingHasHostEdit(binding)) return
      openDecode(fromLayer, event.currentTarget)
      const tap = resolveBinding(binding).tap
      const zmk = tap ? hostKeyByZmk(tap)?.zmk : undefined
      editor.beginHostEditSession(keyIndex, fromLayer, zmk)
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
    const zmkCode = stripKcPrefix(decodeCard?.keycode)
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

  // Escape for the host-edit session lives on LegendDecodeCard (session card).
  // Key only dismisses on outside pointerdown.
  $effect(() => {
    if (!inHostSession || !decodeTooltipId) return
    const cardId = decodeTooltipId
    function onPointerDown(event: PointerEvent) {
      const target = event.target
      if (target instanceof Element && target.closest('.host-symbol-picker')) {
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
    window.addEventListener('pointerdown', onPointerDown, true)
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true)
    }
  })
  function slotAlign(binding: KeyBindingNode): {
    moved: boolean
    basic: boolean
    conflict: boolean
    title: string
  } {
    const align = editor.symbolAlignIndex
    const tap = resolveBinding(binding).tap
    if (!align || tap == null || !hostKeyByZmk(tap)) {
      return { moved: false, basic: false, conflict: false, title: '' }
    }
    const basic = symbolAlignHasBasic(tap, align)
    const moved = symbolAlignHasOrnament(tap, align)
    const conflict = align.conflictByZmk.has(tap)
    const title =
      basic || moved || conflict || align.keyGapByZmk.has(tap)
        ? symbolAlignCaption(tap, align)
        : ''
    return { moved, basic, conflict, title }
  }

  function isUnpublished(layer: number): boolean {
    return editor.unpublishedBefore.has(`${keyIndex}:${layer}`)
  }

  function rowHint(layer: number, alignTitle: string, occupied: boolean): string | undefined {
    const before = editor.unpublishedBefore.get(`${keyIndex}:${layer}`)
    const parts: string[] = []
    if (before !== undefined) parts.push(before ? `Was ${before}` : 'Was empty')
    if (alignTitle) parts.push(alignTitle)
    if (occupied) parts.push(CONDITIONAL_OCCUPIED_NOTE)
    return parts.length ? parts.join('. ') : undefined
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={keyRoot}
  class="key"
  class:combo-member={comboMember}
  class:combo-pick={comboMode}
  class:combo-peeking={comboPeekLayer != null}
  data-label={label}
  data-u={size.u}
  data-h={size.h}
  data-simple={isSimple(session.normalized)}
  data-long={isComplex(session.normalized, behaviourParams)}
  data-hold-tap={holdTapVisible}
  data-behavior={behaviorRole}
  data-editable={comboMode || session.canEdit}
  data-tour={isLegendAnchor ? 'legend-key' : undefined}
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
        class:combo-peek={comboPeekLayer != null}
        class:unpublished={isUnpublished(0)}
        class:symbol-moved={marks.moved}
        class:symbol-basic={marks.basic}
        class:altgr-conflict={marks.conflict}
        class:when-held={occupiedLayers.has(0)}
        data-layer="0"
        style={
          editor.layerTonesOn
            ? `grid-row: 1 / -1; ${layerToneStyle(0)}`
            : 'grid-row: 1 / -1'
        }
        aria-label={layerRowAriaLabel(
          {
            layer: 0,
            title: encodeKeyBinding(multilangFace.binding),
            binding: multilangFace.binding
          },
          occupiedLayers.has(0)
        )}
        aria-describedby={decode?.layer === 0 && !inHostSession ? decodeTooltipId : undefined}
        title={rowHint(0, marks.title, occupiedLayers.has(0))}
        onclick={event => handleRowClick(event, 0)}
        onmouseenter={event => openDecode(0, event.currentTarget)}
        onmouseleave={handleRowLeave}
        onfocus={event => openDecodeOnFocus(0, event)}
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
      {@const occupied = occupiedLayers.has(row.layer)}
      <button
        type="button"
        class="layer-slot"
        class:combo-peek={comboPeekLayer === row.layer}
        class:unpublished={isUnpublished(row.layer)}
        class:symbol-moved={marks.moved}
        class:symbol-basic={marks.basic}
        class:altgr-conflict={marks.conflict}
        class:when-held={occupied}
        data-layer={row.layer}
        style={editor.layerTonesOn ? layerToneStyle(row.layer) : undefined}
        aria-label={layerRowAriaLabel(row, occupied)}
        aria-describedby={
          decode?.layer === row.layer && !inHostSession ? decodeTooltipId : undefined
        }
        title={rowHint(row.layer, marks.title, occupied)}
        onclick={event => handleRowClick(event, row.layer)}
        onmouseenter={event => openDecode(row.layer, event.currentTarget)}
        onmouseleave={handleRowLeave}
        onfocus={event => openDecodeOnFocus(row.layer, event)}
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
      previous={editor.unpublishedBefore.get(`${keyIndex}:${decode.layer}`)}
      hostSession={inHostSession}
      onArmCell={armHostCell}
      onEndSession={endHostEditSession}
    />
  {/if}

  <KeyEditorHost
    open={!!(session.editing && session.canEdit && session.activeSlot)}
    bindingLabel={session.bindingLabel}
    behaviours={session.behaviours}
    editorSlots={session.slots}
    activeCodeIndex={session.activeSlot?.codeIndex ?? 0}
    choices={session.choices}
    {usedKeycodes}
    {usedRevision}
    {usedLayerLabels}
    onSelectBehaviour={session.selectBehaviour}
    onSelectValue={session.selectValue}
    onSelectHsb={session.selectHsb}
    onToggleHold={session.toggleHold}
    onActivateSlot={openEditor}
    onConfirm={session.confirm}
    onCancel={session.closeEditor}
  />
</div>
