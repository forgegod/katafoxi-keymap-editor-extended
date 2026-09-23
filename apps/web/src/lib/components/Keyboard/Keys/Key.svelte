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
  import { buildEditorSlots } from '../../../key-editor'
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
    usedKeycodes?: Iterable<string>
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
    usedKeycodes = []
  }: Props = $props()

  const searchBox = getSearchContext()
  const search = $derived(searchBox.current)

  let editing = $state<{ slotCodeIndex: number } | null>(null)

  const sources = $derived(search?.sources ?? {})
  const behaviour = $derived(
    get(sources.behaviours, String(value)) as Record<string, unknown> | undefined
  )
  const behaviourParams = $derived(getBehaviourParams(params, behaviour as never))
  const normalized = $derived(hydrateTree(value, params, sources))
  const slots = $derived(buildEditorSlots(normalized, behaviourParams))
  const activeSlot = $derived(
    slots.find(slot => slot.codeIndex === editing?.slotCodeIndex) ??
      slots.find(slot => slot.param !== 'behaviour') ??
      slots[0]
  )
  const behaviours = $derived(
    (search?.getSearchTargets('behaviour', value) ?? []) as Array<{
      code?: string | number
      name?: string
    }>
  )
  const choices = $derived.by(() => {
    if (!search || !activeSlot || activeSlot.param === 'behaviour') return []
    return search.getSearchTargets(activeSlot.param, value) as Array<{
      code?: string | number
      description?: string
      context?: string
      symbol?: string
    }>
  })
  const positioningStyle = $derived(getKeyStyles(position, size, rotation))
  const bindingLabel = $derived(
    encodeKeyBinding({
      value: String(normalized.value ?? '&none'),
      params: (normalized.params ?? []).map(toBindingNode)
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

  function onMouseOver(event: MouseEvent) {
    const old = document.querySelector('.code.highlight')
    old?.classList.remove('highlight')
    const target = event.target as HTMLElement
    if (target.classList.contains('code')) {
      target.classList.add('highlight')
    }
  }

  function onMouseLeave(event: MouseEvent) {
    ;(event.target as HTMLElement).classList.remove('highlight')
  }

  function openEditor(slotCodeIndex: number) {
    if (!canEdit) return
    editing = { slotCodeIndex }
  }

  function handleSelectCode(event: {
    target: EventTarget | null
    codeIndex: number
    code: string | number | undefined
    param: unknown
  }) {
    openEditor(event.codeIndex)
  }

  function handleSelectBehaviour(event: MouseEvent) {
    event.stopPropagation()
    openEditor(0)
  }

  function handleKeyClick() {
    if (!canEdit || editing) return
    const firstValue = slots.find(slot => slot.param !== 'behaviour')
    openEditor(firstValue?.codeIndex ?? 0)
  }

  /** Clone bind tree without `source` — those are $state proxies and break structuredClone. */
  function cloneBindTree(node: HydratedNode): HydratedNode {
    return {
      value: node.value,
      params: (node.params ?? []).map(cloneBindTree)
    }
  }

  function nextOpenSlot(nextSlots: ReturnType<typeof buildEditorSlots>, currentIndex: number) {
    const empty = nextSlots.find(
      slot =>
        slot.param !== 'behaviour' &&
        slot.codeIndex !== currentIndex &&
        (slot.value == null || slot.value === '')
    )
    return empty?.codeIndex ?? null
  }

  function handleEditorBehaviour(choice: { code?: string | number }) {
    const nextValue = choice.code
    if (nextValue == null) return
    onUpdate({ value: nextValue, params: [] })
    const nextBehaviour = get(sources.behaviours, String(nextValue)) as
      | Record<string, unknown>
      | undefined
    const nextParams = getBehaviourParams([], nextBehaviour as never)
    if (nextParams.length === 0) {
      editing = null
      return
    }
    editing = { slotCodeIndex: 1 }
  }

  function handleEditorValue(choice: { code?: string | number }) {
    if (!editing || !activeSlot) return
    const { slotCodeIndex } = editing
    const updated = cloneBindTree(normalized)
    const idx = makeIndex(updated)
    const targetCode = idx[slotCodeIndex]
    if (!targetCode) {
      editing = null
      return
    }

    targetCode.value = choice.code
    targetCode.params = []
    onUpdate(pick(updated, ['value', 'params']))

    const nextBehaviour = get(sources.behaviours, String(updated.value)) as
      | Record<string, unknown>
      | undefined
    const nextParams = getBehaviourParams(updated.params, nextBehaviour as never)
    const nextSlots = buildEditorSlots(updated, nextParams)
    const nextIndex = nextOpenSlot(nextSlots, slotCodeIndex)
    editing = nextIndex == null ? null : { slotCodeIndex: nextIndex }
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
  onmouseover={onMouseOver}
  onmouseleave={onMouseLeave}
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
    <Modal onBackdrop={() => (editing = null)}>
      <KeyEditor
        {bindingLabel}
        {behaviours}
        {slots}
        activeCodeIndex={activeSlot.codeIndex}
        {choices}
        {usedKeycodes}
        onSelectBehaviour={handleEditorBehaviour}
        onSelectValue={handleEditorValue}
        onActivateSlot={openEditor}
        onCancel={() => (editing = null)}
      />
    </Modal>
  {/if}
</div>
