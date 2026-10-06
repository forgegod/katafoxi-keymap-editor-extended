import { getBehaviorCatalog, getBehaviourParams } from '@keymap-editor/keymap-core'
import { get } from './utils'

export { getBehaviourParams }

export interface HydratedNode {
  value: string | number | undefined
  source?: Record<string, unknown> | null
  params: HydratedNode[]
}

function ownGet<T>(
  record: Record<string, T> | undefined | null,
  key: string
): T | undefined {
  if (!record || !Object.hasOwn(record, key)) return undefined
  return record[key]
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
function subtreeSize(node: HydratedNode | undefined): number {
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

export function hydrateTree(
  value: string | number,
  params: Array<{ value?: string | number; params?: unknown[] }>,
  sources: Record<string, Record<string, unknown>>
): HydratedNode {
  const bind = String(value)
  const behaviour = (ownGet(sources.behaviours, bind) ??
    ownGet(getBehaviorCatalog().byCode, bind)) as
    | { commands?: Array<{ code: string }>; params?: unknown[] }
    | undefined
  const behaviourParams = getBehaviourParams(params, behaviour)
  const commands = keyBy(
    (behaviour?.commands ?? []) as Array<Record<string, unknown>>,
    'code'
  )

  function getSourceValue(val: string | number | undefined, as: unknown) {
    if (as === 'command') return ownGet(commands, String(val))
    if (as === 'raw' || (as && typeof as === 'object' && 'enum' in (as as object))) {
      return { code: val }
    }
    const key = typeof as === 'string' ? as : undefined
    if (!key) return undefined
    return ownGet(ownGet(sources, key), String(val))
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
