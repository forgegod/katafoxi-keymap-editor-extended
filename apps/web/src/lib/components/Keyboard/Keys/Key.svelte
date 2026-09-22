<script lang="ts">
  import { composeKey } from '@keymap-editor/keymap-core'
  import { type LegendMode } from '../../../context'
  import { searchStore } from '../../../stores'
  import { getBehaviourParams } from '../../../hydrate'
  import { getKeyStyles } from '../../../key-units'
  import {
    createPromptMessage,
    hydrateTree,
    isSimple,
    isComplex,
    makeIndex,
    type HydratedNode
  } from '../../../hydrate'
  import { get, pick } from '../../../utils'
  import KeyParamlist from './KeyParamlist.svelte'
  import KeyCap from '../../KeyCap.svelte'
  import Modal from '../../Common/Modal.svelte'
  import ValuePicker from '../../ValuePicker.svelte'
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
  }

  let {
    position,
    rotation,
    size,
    label,
    value,
    params = [],
    onUpdate,
    legendMode = 'zmk'
  }: Props = $props()

  let search = $state<{
    getSearchTargets: (param: unknown, behaviour: string | number) => unknown[]
    sources: Record<string, Record<string, unknown>>
  } | null>(null)

  $effect(() => {
    return searchStore.subscribe(v => {
      search = v
    })
  })

  let editing = $state<{
    target: EventTarget | null
    targets: unknown[]
    codeIndex: number
    code: string | number | undefined
    param: unknown
  } | null>(null)

  const sources = $derived(search?.sources ?? {})
  const behaviour = $derived(
    get(sources.behaviours, String(value)) as Record<string, unknown> | undefined
  )
  const behaviourParams = $derived(getBehaviourParams(params, behaviour as never))
  const normalized = $derived(hydrateTree(value, params, sources))
  const index = $derived(makeIndex(normalized))
  const positioningStyle = $derived(getKeyStyles(position, size, rotation))

  const isKpBinding = $derived(typeof value === 'string' && /^&kp\b/.test(value))
  const composedLegend = $derived.by(() => {
    if (!isKpBinding) return null
    const paramCode = params[0]?.value
    const keycode =
      paramCode !== undefined
        ? String(paramCode)
        : String(value).replace(/^&kp\s*/, '').trim()
    return composeKey({ keycode })
  })
  const showComposed = $derived(
    legendMode === 'composed' && isKpBinding && composedLegend
  )

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

  function handleSelectCode(event: {
    target: EventTarget | null
    codeIndex: number
    code: string | number | undefined
    param: unknown
  }) {
    if (legendMode === 'composed' || !search) return
    editing = {
      target: event.target,
      codeIndex: event.codeIndex,
      code: event.code,
      param: event.param,
      targets: search.getSearchTargets(event.param, value) as unknown[]
    }
  }

  function handleSelectBehaviour(event: MouseEvent) {
    if (legendMode === 'composed' || !search) return
    event.stopPropagation()
    editing = {
      target: event.target,
      targets: search.getSearchTargets('behaviour', value) as unknown[],
      codeIndex: 0,
      code: value,
      param: 'behaviour'
    }
  }

  /** Clone bind tree without `source` — those are $state proxies and break structuredClone. */
  function cloneBindTree(node: HydratedNode): HydratedNode {
    return {
      value: node.value,
      params: (node.params ?? []).map(cloneBindTree)
    }
  }

  function handleSelectValue(sourceChoice: { code?: string | number }) {
    if (!editing) return
    const { codeIndex } = editing
    const updated = cloneBindTree(normalized)
    const idx = makeIndex(updated)
    const targetCode = idx[codeIndex]
    if (!targetCode) {
      editing = null
      return
    }

    targetCode.value = sourceChoice.code
    targetCode.params = []

    editing = null
    onUpdate(pick(updated, ['value', 'params']))
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
  style={Object.entries(positioningStyle)
    .map(([k, v]) => `${k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`)}:${v}`)
    .join(';')}
  onmouseover={onMouseOver}
  onmouseleave={onMouseLeave}
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
      {index}
      params={behaviourParams}
      values={normalized.params}
      onSelect={handleSelectCode}
    />
  {/if}

  {#if editing && legendMode === 'zmk'}
    <Modal>
      <ValuePicker
        target={editing.target}
        value={String(editing.code ?? '')}
        param={editing.param}
        choices={editing.targets as Array<{
          code?: string | number
          description?: string
        }>}
        prompt={createPromptMessage(editing.param)}
        searchKey="code"
        onSelect={handleSelectValue}
        onCancel={() => (editing = null)}
      />
    </Modal>
  {/if}
</div>
