import {
  behaviorKeycapRole,
  isCompactKeycapLegend,
  isCompactModifierChord,
  isHoldTapBehavior,
  keycapLegend
} from './compose.js'

/** Binding tree used only for keycap size / compactness. */
export interface KeycapNode {
  value?: string | number
  source?: Record<string, unknown> | null
  params?: KeycapNode[]
}

export function keycapNodeLegend(node: KeycapNode | undefined): string {
  if (!node) return ''
  return keycapLegend(
    (node.source?.code ?? node.value) as string | number | undefined,
    node.source?.symbol as string | undefined
  )
}

function isCompactChord(node: KeycapNode | undefined): boolean {
  if (!node) return false
  const kids = node.params ?? []
  if (kids.length !== 1) return false
  const inner = kids[0]
  if ((inner.params ?? []).length > 0) return false
  return isCompactModifierChord(
    String(node.source?.code ?? node.value ?? ''),
    keycapNodeLegend(inner)
  )
}

/** Single glyph or `L1` — the large cap. A chord stays at the normal size. */
export function isSimple(normalized: KeycapNode): boolean {
  const params = normalized.params ?? []
  const [first] = params
  if (params.length !== 1) return false
  if ((first?.params ?? []).length > 0) return false
  return isCompactKeycapLegend(keycapNodeLegend(first))
}

function sideIsCompact(node: KeycapNode | undefined): boolean {
  if (!node) return false
  if (isCompactChord(node)) return true
  if ((node.params ?? []).length > 0) return false
  return isCompactKeycapLegend(keycapNodeLegend(node))
}

/** `&mt` / `&lt` with two short legends — keep in-row, do not shrink the key. */
export function isCompactHoldTap(normalized: KeycapNode): boolean {
  const params = normalized.params ?? []
  if (!isHoldTapBehavior(normalized.value)) return false
  if (params.length !== 2) return false
  return sideIsCompact(params[0]) && sideIsCompact(params[1])
}

export function isComplex(
  normalized: KeycapNode,
  behaviourParams: unknown[]
): boolean {
  if (isCompactHoldTap(normalized)) return false
  const params = normalized.params ?? []
  if (
    behaviorKeycapRole(normalized.value, {
      paramCount: params.length
    }) === 'center'
  ) {
    return String(normalized.value ?? '').length > 4
  }
  const [first] = params
  const symbol = keycapNodeLegend(first)
  // A leftover word (`PG_UP`) shrinks. A short legend that already has a glyph (`SCRL⬇`) does not.
  const isLongSymbol = symbol.length > 4 && /^[\u0000-\u007F]*$/.test(symbol)
  const isMultiParam = behaviourParams.length > 1
  const isNestedParam = (first?.params ?? []).length > 0 && !isCompactChord(first)

  return isLongSymbol || isMultiParam || isNestedParam
}
