import { getBehaviourParams } from '@keymap-editor/keymap-core'

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

export function isSimple(normalized: HydratedNode): boolean {
  const [first] = normalized.params
  const symbol = String(
    get(first, 'source.symbol', get(first, 'source.code', '')) ?? ''
  )
  const shortSymbol = symbol.length === 1
  const singleParam = normalized.params.length === 1
  return singleParam && shortSymbol
}

export function isComplex(
  normalized: HydratedNode,
  behaviourParams: unknown[]
): boolean {
  const [first] = normalized.params
  const symbol = String(
    get(first, 'source.symbol', get(first, 'value', '')) ?? ''
  )
  const isLongSymbol = symbol.length > 4
  const isMultiParam = behaviourParams.length > 1
  const isNestedParam = ((get(first, 'params', []) as unknown[]) || []).length > 0

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
