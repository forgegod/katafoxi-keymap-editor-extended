<script lang="ts">
  import {
    composeKey,
    encodeKeyBinding,
    type KeyBindingNode
  } from '@keymap-editor/keymap-core'
  import { getSearchContext, type LegendMode } from '../../../context'
  import { getBehaviourParams } from '../../../hydrate'
  import { getKeyStyles } from '../../../key-units'
  import {
    hydrateTree,
    isSimple,
    isComplex,
    makeIndex,
    type HydratedNode
  } from '../../../hydrate'
  import {
    applyModifierHold,
    applyTerminalKey,
    buildEditorSlots,
    keycodeChainRootSlot,
    terminalKeySlot
  } from '../../../key-editor'
  import { get, pick } from '../../../utils'
  import KeyParamlist from './KeyParamlist.svelte'
  import KeyCap from '../../KeyCap.svelte'
  import Modal from '../../Common/Modal.svelte'
  import KeyEditor from '../../KeyEditor/KeyEditor.svelte'
  import './Key.css'

  interface Props {
    position: { x: number; y: number }
    rotation?: { x?: number; y?: number; a?: number }
    size: { u: number; h: number }
    label?: string
    value: string | number
    params?: Array<{ value?: string | number; params?: unknown[] }>
    onUpdate: (bind: { value: string | number | undefined; params: HydratedNode[] }) => void
    legendMode?: LegendMode
    usedKeycodes?: ReadonlyMap<string, readonly number[]>
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
    usedKeycodes = new Map()
  }: Props = $props()

  const searchBox = getSearchContext()
  const search = $derived(searchBox.current)

  let editing = $state<{ slotCodeIndex: number } | null>(null)
  let draftBind = $state<HydratedNode | null>(null)

  const sources = $derived(search?.sources ?? {})
  const behaviour = $derived(
    get(sources.behaviours, String(value)) as Record<string, unknown> | undefined
  )
  const behaviourParams = $derived(getBehaviourParams(params, behaviour as never))
  const normalized = $derived(hydrateTree(value, params, sources))
  const working = $derived(draftBind ?? normalized)
  const workingBehaviour = $derived(
    get(sources.behaviours, String(working.value)) as Record<string, unknown> | undefined
  )
  const workingBehaviourParams = $derived(
    getBehaviourParams(working.params, workingBehaviour as never)
  )
  const slots = $derived(buildEditorSlots(working, workingBehaviourParams))
  const activeSlot = $derived(
    slots.find(slot => slot.codeIndex === editing?.slotCodeIndex) ??
      slots.find(slot => slot.param !== 'behaviour') ??
      slots[0]
  )
  const behaviours = $derived(
    (search?.getSearchTargets('behaviour', working.value) ?? []) as Array<{
      code?: string | number
      name?: string
    }>
  )
  const choices = $derived.by(() => {
    if (!search || !activeSlot || activeSlot.param === 'behaviour') return []
    return search.getSearchTargets(activeSlot.param, working.value) as Array<{
      code?: string | number
      description?: string
      context?: string
      symbol?: string
    }>
  })
  const positioningStyle = $derived(getKeyStyles(position, size, rotation))
  const bindingLabel = $derived(
    encodeKeyBinding({
      value: String(working.value ?? '&none'),
      params: (working.params ?? []).map(toBindingNode)
    })
  )
  const canEdit = $derived(legendMode === 'zmk' && !!search)

  const composedLegend = $derived.by(() => {
    if (legendMode !== 'composed') return null
    return composeKey({
      binding: {
        value,
        params: (params ?? []) as KeyBindingNode[]
      }
    })
  })
  const showComposed = $derived(legendMode === 'composed' && composedLegend != null)

  function toBindingNode(node: HydratedNode): KeyBindingNode {
    return {
      value: node.value ?? '',
      params: (node.params ?? []).map(toBindingNode)
    }
  }

  function hydrateBind(node: HydratedNode): HydratedNode {
    return hydrateTree(
      node.value ?? '&none',
      (node.params ?? []).map(cloneBindTree),
      sources
    )
  }

  function setDraft(node: HydratedNode, preferIndex: number) {
    draftBind = hydrateBind(node)
    const nextBehaviour = get(sources.behaviours, String(draftBind.value)) as
      | Record<string, unknown>
      | undefined
    const nextParams = getBehaviourParams(draftBind.params, nextBehaviour as never)
    const nextSlots = buildEditorSlots(draftBind, nextParams)
    const terminal = terminalKeySlot(nextSlots, preferIndex)
    editing = { slotCodeIndex: terminal?.codeIndex ?? preferIndex }
  }

  function closeEditor() {
    editing = null
    draftBind = null
  }

  function openEditor(slotCodeIndex: number) {
    if (!canEdit) return
    if (!editing) {
      draftBind = hydrateBind(normalized)
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

  function handleEditorBehaviour(choice: { code?: string | number }) {
    const nextValue = choice.code
    if (nextValue == null) return
    const nextBehaviour = get(sources.behaviours, String(nextValue)) as
      | Record<string, unknown>
      | undefined
    const nextParams = getBehaviourParams([], nextBehaviour as never)
    setDraft({ value: nextValue, params: [] }, nextParams.length === 0 ? 0 : 1)
  }

  function handleEditorValue(choice: { code?: string | number }) {
    if (!editing || !activeSlot || !draftBind || choice.code == null) return
    const updated = cloneBindTree(draftBind)
    const root = keycodeChainRootSlot(slots, editing.slotCodeIndex)
    if (root && (activeSlot.param === 'code' || activeSlot.param === 'keycode')) {
      applyTerminalKey(updated, root.codeIndex, choice.code)
    } else {
      const target = makeIndex(updated)[editing.slotCodeIndex]
      if (!target) return
      target.value = choice.code
      target.params = []
    }
    setDraft(updated, root?.codeIndex ?? editing.slotCodeIndex)
  }

  function handleToggleHold(wrapCode: string) {
    if (!editing || !draftBind) return
    const root = keycodeChainRootSlot(slots, editing.slotCodeIndex)
    if (!root) return
    const updated = applyModifierHold(cloneBindTree(draftBind), root.codeIndex, wrapCode)
    setDraft(updated, root.codeIndex)
  }

  function handleConfirm() {
    if (!draftBind) return
    onUpdate(pick(cloneBindTree(draftBind), ['value', 'params']))
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
  data-editable={canEdit}
  style={Object.entries(positioningStyle)
    .map(([k, v]) => `${k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}:${v}`)
    .join(';')}
  onclick={handleKeyClick}
>
  {#if showComposed && composedLegend}
    <div class="keycap-wrap">
      <KeyCap legend={composedLegend} mode="composed" />
    </div>
  {:else}
    {#if behaviour}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <span class="behaviour-binding" onclick={handleSelectBehaviour}>
        {String(behaviour.code ?? '')}
      </span>
    {/if}
    <KeyParamlist
      root={true}
      parentCodeIndex={0}
      params={behaviourParams}
      values={normalized.params}
      onSelect={handleSelectCode}
    />
  {/if}

  {#if editing && canEdit && activeSlot}
    <Modal onBackdrop={closeEditor}>
      <KeyEditor
        {bindingLabel}
        {behaviours}
        {slots}
        activeCodeIndex={activeSlot.codeIndex}
        {choices}
        {usedKeycodes}
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
