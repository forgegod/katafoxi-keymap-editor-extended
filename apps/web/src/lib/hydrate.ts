import {
  getBehaviourParams,
  isCompactKeycapLegend,
  isCompactModifierChord,
  isHoldTapBehavior,
  keycapLegend
} from '@keymap-editor/keymap-core'

export { getBehaviourParams }

export interface HydratedNode {
  value: string | number | undefined
  source?: Record<string, unknown> | null
  params: HydratedNode[]
}

function get(obj: unknown, path: string, fallback?: unknown): unknown {
  if (obj == null) return fallback
  const parts = path.replace(/\[(\d+)\]/g, '.$1').split('.')
  let cur: unknown = obj
  for (const part of parts) {
    if (cur == null || typeof cur !== 'object') return fallback
    cur = (cur as Record<string, unknown>)[part]
  }
  return cur === undefined ? fallback : cur
}

function keyBy<T extends Record<string, unknown>>(
  arr: T[] | undefined,
  key: string
): Record<string, T> {
  const result: Record<string, T> = {}
  for (const item of arr ?? []) {
    result[String(item[key])] = item
  }
  return result
}

export function makeIndex(tree: HydratedNode): HydratedNode[] {
  const index: HydratedNode[] = []
  ;(function traverse(node: HydratedNode) {
    const params = node.params || []
    index.push(node)
    params.forEach(traverse)
  })(tree)
  return index
}

/** Nodes in a hydrated subtree (node + nested params), matching makeIndex DFS order. */
export function subtreeSize(node: HydratedNode | undefined): number {
  if (!node) return 1
  return 1 + (node.params ?? []).reduce((sum, child) => sum + subtreeSize(child), 0)
}

/**
 * Flat makeIndex position of values[paramIndex] when parent sits at parentCodeIndex.
 * Avoids Array.indexOf reference equality (fragile with Svelte proxies).
 */
export function childCodeIndex(
  parentCodeIndex: number,
  values: HydratedNode[],
  paramIndex: number
): number {
  let offset = parentCodeIndex + 1
  for (let i = 0; i < paramIndex; i++) {
    offset += subtreeSize(values[i])
  }
  return offset
}

function nodeLegend(node: HydratedNode | undefined): string {
  if (!node) return ''
  return keycapLegend(
    (node.source?.code ?? node.value) as string | number | undefined,
    node.source?.symbol as string | undefined
  )
}

function isCompactChord(node: HydratedNode | undefined): boolean {
  if (!node) return false
  const kids = node.params ?? []
  if (kids.length !== 1) return false
  const inner = kids[0]
  if ((inner.params ?? []).length > 0) return false
  return isCompactModifierChord(
    String(node.source?.code ?? node.value ?? ''),
    nodeLegend(inner)
  )
}

export function isSimple(normalized: HydratedNode): boolean {
  const [first] = normalized.params
  if (normalized.params.length !== 1) return false
  if (isCompactChord(first)) return true
  if ((first?.params ?? []).length > 0) return false
  return isCompactKeycapLegend(nodeLegend(first))
}

function sideIsCompact(node: HydratedNode | undefined): boolean {
  if (!node) return false
  if (isCompactChord(node)) return true
  if ((node.params ?? []).length > 0) return false
  return isCompactKeycapLegend(nodeLegend(node))
}

/** `&mt` / `&lt` with two short legends — keep in-row, do not shrink the key. */
export function isCompactHoldTap(normalized: HydratedNode): boolean {
  if (!isHoldTapBehavior(normalized.value)) return false
  if (normalized.params.length !== 2) return false
  return sideIsCompact(normalized.params[0]) && sideIsCompact(normalized.params[1])
}

export function isComplex(
  normalized: HydratedNode,
  behaviourParams: unknown[]
): boolean {
  if (isCompactHoldTap(normalized)) return false
  const [first] = normalized.params
  const symbol = nodeLegend(first)
  const isLongSymbol = symbol.length > 4
  const isMultiParam = behaviourParams.length > 1
  const isNestedParam =
    ((get(first, 'params', []) as unknown[]) || []).length > 0 &&
    !isCompactChord(first)

  return isLongSymbol || isMultiParam || isNestedParam
}

export function createPromptMessage(param: unknown): string {
  const promptMapping: Record<string, string> = {
    layer: 'Select layer',
    mod: 'Select modifier',
    behaviour: 'Select behaviour',
    command: 'Select command',
    keycode: 'Select key code'
  }

  if (param && typeof param === 'object' && 'name' in param && (param as { name?: string }).name) {
    return `Select ${(param as { name: string }).name}`
  }

  if (typeof param === 'string') {
    return promptMapping[param] || promptMapping.keycode
  }

  return promptMapping.keycode
}

export function hydrateTree(
  value: string | number,
  params: Array<{ value?: string | number; params?: unknown[] }>,
  sources: Record<string, Record<string, unknown>>
): HydratedNode {
  const bind = value
  const behaviour = sources.behaviours?.[String(bind)] as
    | { commands?: Array<{ code: string }>; params?: unknown[] }
    | undefined
  const behaviourParams = getBehaviourParams(params, behaviour)
  const commands = keyBy(
    (behaviour?.commands ?? []) as Array<Record<string, unknown>>,
    'code'
  )

  function getSourceValue(val: string | number | undefined, as: unknown) {
    if (as === 'command') return commands[String(val)]
    if (as === 'raw' || (as && typeof as === 'object' && 'enum' in (as as object))) {
      return { code: val }
    }
    const key = typeof as === 'string' ? as : undefined
    if (!key) return undefined
    return sources?.[key]?.[String(val)]
  }

  function hydrateNode(
    node: { value?: string | number; params?: unknown[] } | undefined,
    as: unknown
  ): HydratedNode {
    if (!node) {
      return { value: undefined, params: [] }
    }
    const { value: nodeValue, params: nodeParams = [] } = node
    const source = getSourceValue(nodeValue, as) as Record<string, unknown> | undefined
    const sourceParams = (get(source, 'params', []) as unknown[]) || []

    return {
      value: nodeValue,
      source: source ?? null,
      params: sourceParams.map((paramAs, i) =>
        hydrateNode(nodeParams[i] as { value?: string | number; params?: unknown[] }, paramAs)
      )
    }
  }

  return {
    value,
    source: (behaviour as Record<string, unknown>) ?? null,
    params: behaviourParams.map((as, i) =>
      hydrateNode(params[i] as { value?: string | number; params?: unknown[] }, as)
    )
  }
}
