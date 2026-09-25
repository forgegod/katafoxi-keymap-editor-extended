<script lang="ts">
  import {
    behaviorKeycapRole,
    composeKey,
    compactBehaviorLegend,
    legendHoverHit,
    composeLayerRows,
    encodeKeyBinding,
    getBehaviorCatalog,
    isComplex,
    isHoldTapBehavior,
    isSimple,
    type HostLegendView,
    type KeyBindingNode,
    type LegendHover
  } from '@keymap-editor/keymap-core'
  import { getSearchContext, type LegendMode } from '../../../context'
  import { getBehaviourParams } from '../../../hydrate'
  import { getKeyStyles } from '../../../key-units'
  import {
    hydrateTree,
    makeIndex,
    type HydratedNode
  } from '../../../hydrate'
  import {
    applyModifierHold,
    applyTerminalKey,
    buildEditorSlots,
    keycodeChainRootSlot,
    nextEditorSlot,
    terminalKeySlot
  } from '../../../key-editor'
  import { pick } from '../../../utils'
  import KeyParamlist from './KeyParamlist.svelte'
  import KeyCap from '../../KeyCap.svelte'
  import './Key.css'
  import Modal from '../../Common/Modal.svelte'
  import KeyEditor from '../../KeyEditor/KeyEditor.svelte'

  interface Props {
    position: { x: number; y: number }
    rotation?: { x?: number; y?: number; a?: number }
    size: { u: number; h: number }
    label?: string
    value: string | number
    params?: Array<{ value?: string | number; params?: unknown[] }>
    onUpdate: (bind: { value: string | number | undefined; params: HydratedNode[] }) => void
    legendMode?: LegendMode
    hostView?: HostLegendView
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
    onUpdate,
    legendMode = 'zmk',
    hostView,
    legendHover = null,
    layerBindings,
    usedKeycodes = new Map(),
    usedRevision = '',
    usedLayerLabels = []
  }: Props = $props()

  const searchBox = getSearchContext()
  const search = $derived(searchBox.current)

  let editing = $state<{ slotCodeIndex: number } | null>(null)
  let draftValue = $state<string | number | null>(null)
  let draftParamsJson = $state<string | null>(null)

  const sources = $derived(search?.sources ?? {})
  const behaviour = $derived(
    sources.behaviours?.[String(value)] as Record<string, unknown> | undefined
  )
  const behaviourParams = $derived(getBehaviourParams(params, behaviour as never))
  const normalized = $derived(hydrateTree(value, params, sources))
  const working = $derived(
    draftValue == null && draftParamsJson == null
      ? normalized
      : hydrateTree(
          draftValue ?? '&none',
          draftParamsJson ? JSON.parse(draftParamsJson) : [],
          sources
        )
  )
  const workingBehaviourParams = $derived(
    getBehaviourParams(
      working.params,
      lookupBehaviour(draftValue ?? working.value) as never
    )
  )
  const slots = $derived(buildEditorSlots(working, workingBehaviourParams))
  const activeSlot = $derived(
    slots.find(slot => slot.codeIndex === editing?.slotCodeIndex) ??
      slots.find(slot => slot.param !== 'behaviour') ??
      slots[0]
  )
  const behaviourCode = $derived(String(slots[0]?.value ?? working.value ?? '&none'))
  const valueParam = $derived(
    activeSlot?.param != null && activeSlot.param !== 'behaviour'
      ? activeSlot.param
      : typeof workingBehaviourParams[0] === 'string'
        ? workingBehaviourParams[0]
        : undefined
  )
  const behaviours = $derived(
    (search?.getSearchTargets('behaviour', behaviourCode) ?? []) as Array<{
      code?: string | number
      name?: string
    }>
  )
  const choices = $derived(
    !search || valueParam == null || valueParam === 'behaviour'
      ? []
      : (search.getSearchTargets(valueParam, behaviourCode) as Array<{
          code?: string | number
          description?: string
          context?: string
          symbol?: string
        }>)
  )
  const positioningStyle = $derived(getKeyStyles(position, size, rotation))
  const bindingLabel = $derived(
    encodeKeyBinding({
      value: behaviourCode,
      params: (working.params ?? []).map(toBindingNode)
    })
  )
  const canEdit = $derived(legendMode === 'zmk' && !!search)

  const stacked = $derived(legendMode === 'composed' && (layerBindings?.length ?? 0) > 0)
  const composedRows = $derived.by(() => {
    if (legendMode !== 'composed') return []
    if (stacked && layerBindings) return composeLayerRows(layerBindings, hostView)
    const binding = {
      value,
      params: (params ?? []) as KeyBindingNode[]
    }
    return [
      {
        layer: 0,
        binding,
        blank: false,
        title: encodeKeyBinding(binding),
        legend: composeKey({ binding, hostView })
      }
    ]
  })
  const composedLegend = $derived(composedRows[0]?.legend ?? null)
  const showComposed = $derived(legendMode === 'composed' && composedLegend != null)
  const showStack = $derived(stacked)
  const compactLegend = $derived(
    compactBehaviorLegend({
      value,
      params: (params ?? []).map(node => ({
        value: node.value ?? '',
        params: (node.params ?? []) as KeyBindingNode[]
      }))
    })
  )
  const currentBinding = $derived({
    value,
    params: (params ?? []).map(node => ({
      value: node.value ?? '',
      params: (node.params ?? []) as KeyBindingNode[]
    }))
  })
  const currentHoverHit = $derived(legendHoverHit(currentBinding, legendHover))

  function rowHoverHit(binding: KeyBindingNode) {
    return legendHoverHit(binding, legendHover)
  }

  function zmkRowView(node: KeyBindingNode) {
    const hydrated = hydrateTree(node.value, node.params ?? [], sources)
    const nextBehaviour = lookupBehaviour(node.value)
    const rowParams = getBehaviourParams(hydrated.params, nextBehaviour as never)
    const holdTap = isHoldTapBehavior(node.value) && hydrated.params.length === 2
    return {
      title: encodeKeyBinding(node),
      hydrated,
      params: rowParams,
      holdTap,
      behaviorRole: behaviorKeycapRole(node.value, {
        paramCount: hydrated.params.length,
        holdTapVisible: holdTap
      }),
      code: String(node.value)
    }
  }
  const holdTapVisible = $derived(
    isHoldTapBehavior(value) && normalized.params.length === 2
  )
  const behaviorRole = $derived(
    behaviorKeycapRole(value, {
      paramCount: normalized.params.length,
      holdTapVisible
    })
  )

  function toBindingNode(node: HydratedNode): KeyBindingNode {
    return {
      value: node.value ?? '',
      params: (node.params ?? []).map(toBindingNode)
    }
  }

  function readDraft(): HydratedNode | null {
    if (draftValue == null && draftParamsJson == null) return null
    return {
      value: draftValue ?? undefined,
      params: draftParamsJson ? JSON.parse(draftParamsJson) : []
    }
  }

  function lookupBehaviour(code: string | number | undefined) {
    const key = String(code ?? '')
    return (sources.behaviours?.[key] ?? getBehaviorCatalog().byCode[key]) as
      | Record<string, unknown>
      | undefined
  }

  function setDraft(node: HydratedNode, preferIndex: number) {
    const plain = cloneBindTree(node)
    const nextBehaviour = lookupBehaviour(plain.value)
    const nextParams = getBehaviourParams(plain.params, nextBehaviour as never)
    const hydrated = hydrateTree(plain.value ?? '&none', plain.params, sources)
    const nextSlots = buildEditorSlots(hydrated, nextParams)
    draftValue = plain.value ?? null
    draftParamsJson = JSON.stringify(plain.params ?? [])
    editing = { slotCodeIndex: nextEditorSlot(nextSlots, preferIndex) }
  }

  function closeEditor() {
    editing = null
    draftValue = null
    draftParamsJson = null
  }

  function openEditor(slotCodeIndex: number) {
    if (!canEdit) return
    if (!editing) {
      const plain = cloneBindTree(normalized)
      draftValue = plain.value ?? null
      draftParamsJson = JSON.stringify(plain.params ?? [])
    }
    editing = { slotCodeIndex }
  }

  function handleSelectCode(event: {
    target: EventTarget | null
    codeIndex: number
    code: string | number | undefined
    param: unknown
  }) {
    const terminal = terminalKeySlot(slots, event.codeIndex)
    openEditor(terminal?.codeIndex ?? event.codeIndex)
  }

  function handleSelectBehaviour(event: MouseEvent) {
    event.stopPropagation()
    openEditor(0)
  }

  function handleKeyClick() {
    if (!canEdit || editing) return
    const firstValue = slots.find(slot => slot.param !== 'behaviour')
    const terminal = terminalKeySlot(slots, firstValue?.codeIndex ?? 1)
    openEditor(terminal?.codeIndex ?? firstValue?.codeIndex ?? 0)
  }

  /** Clone bind tree without `source` — those are $state proxies and break structuredClone. */
  function cloneBindTree(node: HydratedNode): HydratedNode {
    return {
      value: node.value,
      params: (node.params ?? []).map(cloneBindTree)
    }
  }

  function emptyParamNodes(count: number): HydratedNode[] {
    return Array.from({ length: count }, () => ({ value: undefined, params: [] }))
  }

  function handleEditorBehaviour(choice: { code?: string | number }) {
    const nextValue = choice.code
    if (nextValue == null) return
    const nextBehaviour = lookupBehaviour(nextValue)
    const nextParams = getBehaviourParams([], nextBehaviour as never)
    setDraft(
      { value: nextValue, params: emptyParamNodes(nextParams.length) },
      nextParams.length === 0 ? 0 : 1
    )
  }

  function handleEditorValue(choice: { code?: string | number }) {
    const current = readDraft()
    if (!editing || !activeSlot || !current || choice.code == null) return
    const updated = cloneBindTree(current)
    const root = keycodeChainRootSlot(slots, editing.slotCodeIndex)
    if (root && (activeSlot.param === 'code' || activeSlot.param === 'keycode')) {
      applyTerminalKey(updated, root.codeIndex, choice.code)
    } else {
      let target = makeIndex(updated)[editing.slotCodeIndex]
      if (!target && editing.slotCodeIndex > 0) {
        updated.params = emptyParamNodes(Math.max(updated.params.length, 1))
        target = updated.params[0]
      }
      if (!target) return
      target.value = choice.code
      target.params = []
    }
    setDraft(updated, root?.codeIndex ?? editing.slotCodeIndex)
  }

  function handleToggleHold(wrapCode: string) {
    const current = readDraft()
    if (!editing || !current) return
    const root = keycodeChainRootSlot(slots, editing.slotCodeIndex)
    if (!root) return
    const updated = applyModifierHold(cloneBindTree(current), root.codeIndex, wrapCode)
    setDraft(updated, root.codeIndex)
  }

  function handleConfirm() {
    const current = readDraft()
    if (!current) return
    onUpdate(pick(cloneBindTree(current), ['value', 'params']))
    closeEditor()
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="key"
  data-label={label}
  data-u={size.u}
  data-h={size.h}
  data-simple={isSimple(normalized)}
  data-long={isComplex(normalized, behaviourParams)}
  data-hold-tap={holdTapVisible}
  data-behavior={behaviorRole}
  data-editable={canEdit}
  data-stacked={showStack}
  style={Object.entries(positioningStyle)
    .map(([k, v]) => `${k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}:${v}`)
    .join(';')}
  onclick={handleKeyClick}
>
  {#if showStack}
    <div class="keycap-wrap layer-stack">
      {#each composedRows as row (row.layer)}
        {@const hit = rowHoverHit(row.binding)}
        <div class="layer-slot" data-layer={row.layer}>
          {#if row.blank}
            <span class="layer-empty" aria-hidden="true"></span>
          {:else if row.legend}
            <KeyCap legend={row.legend} mode="composed" stacked {hit} />
          {:else}
            {@const zmk = zmkRowView(row.binding)}
            {@const compact = compactBehaviorLegend(row.binding)}
            <span class="zmk-row" class:legend-hit={hit === 'combo'} title={zmk.title}>
              {#if compact}
                {compact}
              {:else}
                {#if zmk.behaviorRole !== 'hidden'}
                  <span class="zmk-beh">{zmk.code}</span>
                {/if}
                <KeyParamlist
                  root={true}
                  holdTap={zmk.holdTap}
                  parentCodeIndex={0}
                  params={zmk.params}
                  values={zmk.hydrated.params}
                  onSelect={() => {}}
                />
              {/if}
            </span>
          {/if}
        </div>
      {/each}
    </div>
  {:else if showComposed && composedLegend}
    <div class="keycap-wrap">
      <KeyCap legend={composedLegend} mode="composed" hit={currentHoverHit} />
    </div>
  {:else if compactLegend}
    <span class:legend-hit={currentHoverHit === 'combo'} title={bindingLabel}>{compactLegend}</span>
  {:else}
    <span class:legend-hit={currentHoverHit === 'combo'}>
    {#if behaviour && behaviorRole !== 'hidden'}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <span
        class="behaviour-binding"
        class:center={behaviorRole === 'center'}
        onclick={handleSelectBehaviour}
      >
        {String(behaviour.code ?? '')}
      </span>
    {/if}
    <KeyParamlist
      root={true}
      holdTap={holdTapVisible}
      parentCodeIndex={0}
      params={behaviourParams}
      values={normalized.params}
      onSelect={handleSelectCode}
    />
    </span>
  {/if}

  {#if editing && canEdit && activeSlot}
    <Modal onBackdrop={closeEditor}>
      <KeyEditor
        {bindingLabel}
        {behaviours}
        editorSlots={slots}
        activeCodeIndex={activeSlot.codeIndex}
        {choices}
        {usedKeycodes}
        {usedRevision}
        {usedLayerLabels}
        onSelectBehaviour={handleEditorBehaviour}
        onSelectValue={handleEditorValue}
        onToggleHold={handleToggleHold}
        onActivateSlot={openEditor}
        onConfirm={handleConfirm}
        onCancel={closeEditor}
      />
    </Modal>
  {/if}
</div>
