/**
 * Parse and surgically rewrite ZMK `conditional_layers { … }` nodes.
 * A then-layer is active exactly while every if-layer is active.
 */

import {
  findNamedBlock,
  maskDts,
  matchBrace,
  readUintAngleProp,
  readUintAngleScalar
} from './dts-scan.js'
import {
  collapseExtraBlankLines,
  dominantEol,
  eatPrecedingEol,
  type LineEnding
} from './eol.js'
import type { LegendHover, ZmkConditionalLayer } from './types.js'

/** A conditional layer needs at least two held layers. */
export const CONDITIONAL_LAYER_MIN_IF = 2

function findConditionalBlock(source: string) {
  const masked = maskDts(source)
  return findNamedBlock(source, masked, 'conditional_layers', {
    compatible: 'zmk,conditional-layers'
  })
}

export interface DtsConditionalLayersParse {
  rules: ZmkConditionalLayer[]
  /**
   * True when a child node was skipped, had a DTS label, or if/then layers
   * were not fully numeric. Save must omit `conditionalLayers`.
   */
  unparsed: boolean
}

/**
 * Parse conditional-layer nodes. Missing block → [].
 * A node without `if-layers` or `then-layer` is skipped (and marked unparsed).
 */
export function parseDtsConditionalLayers(source: string): ZmkConditionalLayer[] {
  return parseDtsConditionalLayersDetailed(source).rules
}

export function parseDtsConditionalLayersDetailed(source: string): DtsConditionalLayersParse {
  const masked = maskDts(source)
  const block = findNamedBlock(source, masked, 'conditional_layers', {
    compatible: 'zmk,conditional-layers'
  })
  if (!block) return { rules: [], unparsed: false }

  const rules: ZmkConditionalLayer[] = []
  let unparsed = false
  const body = masked.slice(block.bodyStart, block.bodyEnd)
  const re = /(?:([A-Za-z_]\w*)\s*:\s*)?([A-Za-z_]\w*)\s*\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    const label = m[1]
    const name = m[2]
    const openBraceRel = m.index + m[0].length - 1
    const openBrace = block.bodyStart + openBraceRel
    const closeBrace = matchBrace(masked, openBrace)
    if (closeBrace < 0 || closeBrace > block.bodyEnd) {
      re.lastIndex = openBraceRel + 1
      continue
    }
    re.lastIndex = closeBrace - block.bodyStart + 1

    if (label) unparsed = true

    const range = { start: openBrace + 1, end: closeBrace }
    const ifLayers = readUintAngleProp(masked, range, 'if-layers')
    const thenLayer = readUintAngleScalar(masked, range, 'then-layer')
    if (ifLayers.kind !== 'ok' || ifLayers.values.length === 0 || thenLayer.kind !== 'ok') {
      unparsed = true
      continue
    }
    rules.push({ id: name, ifLayers: ifLayers.values, thenLayer: thenLayer.value })
  }
  return { rules, unparsed }
}

function sanitizeNodeId(id: string): string {
  let cleaned = id.replace(/[^A-Za-z0-9_]/g, '_')
  if (!/^[A-Za-z_]/.test(cleaned)) cleaned = `when_${cleaned}`
  cleaned = cleaned.replace(/_+/g, '_').replace(/^_|_$/g, '')
  return cleaned.length > 0 ? cleaned : 'when_layers'
}

function formatRuleNode(
  rule: ZmkConditionalLayer,
  indent = '        ',
  eol: LineEnding = '\n'
): string {
  const inner = indent + '    '
  const ifLayers = [...rule.ifLayers].sort((a, b) => a - b)
  return [
    `${indent}${sanitizeNodeId(rule.id)} {`,
    `${inner}if-layers = <${ifLayers.join(' ')}>;`,
    `${inner}then-layer = <${rule.thenLayer}>;`,
    `${indent}};`
  ].join(eol)
}

function formatConditionalLayersBlock(
  rules: readonly ZmkConditionalLayer[],
  indent = '    ',
  eol: LineEnding = '\n'
): string {
  const child = indent + '    '
  const nodes = rules.map(rule => formatRuleNode(rule, child, eol)).join(eol)
  return (
    `${indent}conditional_layers {${eol}` +
    `${child}compatible = "zmk,conditional-layers";${eol}` +
    (nodes ? `${nodes}${eol}` : '') +
    `${indent}};`
  )
}

/**
 * Replace or insert the `conditional_layers` block.
 * An empty list removes an existing block. Outside the block stays byte-stable
 * aside from the inserted or removed region.
 */
export function spliceConditionalLayersIntoDts(
  original: string,
  rules: readonly ZmkConditionalLayer[]
): string {
  const eol = dominantEol(original)
  const block = findConditionalBlock(original)

  if (rules.length === 0) {
    if (!block) return original
    let from = block.keywordStart
    let to = block.closeBrace + 1
    if (original[to] === ';') to++
    while (from > 0 && (original[from - 1] === ' ' || original[from - 1] === '\t')) {
      from--
    }
    from = eatPrecedingEol(original, from)
    return collapseExtraBlankLines(original.slice(0, from) + original.slice(to), eol)
  }

  const formatted = formatConditionalLayersBlock(rules, '    ', eol)
  if (block) {
    let to = block.closeBrace + 1
    if (original[to] === ';') to++
    return original.slice(0, block.keywordStart) + formatted + original.slice(to)
  }

  const masked = maskDts(original)
  const root = /\/\s*\{/.exec(masked)
  if (root) {
    const openBrace = root.index + root[0].length - 1
    const closeBrace = matchBrace(masked, openBrace)
    if (closeBrace >= 0) {
      return original.slice(0, closeBrace) + `${eol}${formatted}${eol}` + original.slice(closeBrace)
    }
  }

  return `${original.trimEnd()}${eol}${eol}/ {${eol}${formatted}${eol}};${eol}`
}

function sanitizeName(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

/** DTS node id from the held layer names (`Lower` + `Raise` → `when_lower_raise`). */
export function nextConditionalLayerId(
  ifLayers: readonly number[],
  names: readonly string[],
  existing: readonly { id: string }[]
): string {
  const parts = [...ifLayers]
    .sort((a, b) => a - b)
    .map(index => sanitizeName(names[index] ?? ''))
    .filter(part => part.length > 0)
  const stem = `when_${parts.join('_') || 'layers'}`.replace(/_+/g, '_')
  const used = new Set(existing.map(rule => rule.id))
  if (!used.has(stem)) return stem
  let n = 2
  while (used.has(`${stem}_${n}`)) n++
  return `${stem}_${n}`
}

function sortedIf(layers: readonly number[]): number[] {
  return [...layers].sort((a, b) => a - b)
}

/** Same held set and same shown layer. Order of if-layers does not matter. */
export function conditionalLayersMatch(
  a: { ifLayers: readonly number[]; thenLayer: number },
  b: { ifLayers: readonly number[]; thenLayer: number }
): boolean {
  if (a.thenLayer !== b.thenLayer) return false
  const left = sortedIf(a.ifLayers)
  const right = sortedIf(b.ifLayers)
  if (left.length !== right.length) return false
  return left.every((layer, index) => layer === right[index])
}

/**
 * Drop or renumber rules after a layer is removed.
 * A rule dies when its shown layer is removed, or when fewer than two held layers remain.
 */
export function remapConditionalLayersAfterDelete(
  rules: readonly ZmkConditionalLayer[],
  deleted: number
): ZmkConditionalLayer[] {
  const shift = (index: number) => (index > deleted ? index - 1 : index)
  const out: ZmkConditionalLayer[] = []
  for (const rule of rules) {
    if (rule.thenLayer === deleted) continue
    const ifLayers = rule.ifLayers.filter(index => index !== deleted).map(shift)
    if (ifLayers.length < CONDITIONAL_LAYER_MIN_IF) continue
    out.push({
      id: rule.id,
      ifLayers,
      thenLayer: shift(rule.thenLayer)
    })
  }
  return out
}

function layerName(names: readonly string[], index: number): string {
  const name = names[index]
  return typeof name === 'string' && name.length > 0 ? name : `L${index}`
}

/** `When Lower and Raise are held, show Adjust`. */
export function conditionalLayerSentence(
  rule: { ifLayers: readonly number[]; thenLayer: number },
  names: readonly string[]
): string {
  const held = rule.ifLayers.map(index => layerName(names, index))
  const shown = layerName(names, rule.thenLayer)
  let list = 'nothing'
  if (held.length === 1) list = held[0]
  else if (held.length > 1) {
    list = `${held.slice(0, -1).join(', ')} and ${held[held.length - 1]}`
  }
  const verb = held.length === 1 ? 'is held' : 'are held'
  return `When ${list} ${verb}, show ${shown}`
}

/** Compact row mark: `when Lower + Raise`. Several rules join with a comma. */
export function conditionalLayerWhenText(
  rules: readonly { ifLayers: readonly number[]; thenLayer: number }[],
  thenLayer: number,
  names: readonly string[]
): string | null {
  const parts = rules
    .filter(rule => rule.thenLayer === thenLayer)
    .map(rule => rule.ifLayers.map(index => layerName(names, index)).join(' + '))
  if (parts.length === 0) return null
  return `when ${parts.join(', ')}`
}

/** Title for the row mark: one sentence per rule. */
export function conditionalLayerWhenTitle(
  rules: readonly { ifLayers: readonly number[]; thenLayer: number }[],
  thenLayer: number,
  names: readonly string[]
): string | null {
  const mine = rules.filter(rule => rule.thenLayer === thenLayer)
  if (mine.length === 0) return null
  return mine.map(rule => conditionalLayerSentence(rule, names)).join(' ')
}

/**
 * The shown layer should sit above every held layer, or a held layer can cover it.
 * Returns a short warning, or null when the order is fine.
 */
export function conditionalLayerCoverWarning(rule: {
  ifLayers: readonly number[]
  thenLayer: number
}): string | null {
  if (rule.ifLayers.length === 0) return null
  const highestHeld = Math.max(...rule.ifLayers)
  if (rule.thenLayer > highestHeld) return null
  return 'This layer sits below a held layer, so keys on the held layer can cover it.'
}

/**
 * Hover for a layer row. A then-layer previews the keys that hold its if-layers
 * (`layers`) and any key bound directly to itself (`source`).
 */
export function conditionalLayerHover(
  index: number,
  rules: readonly ZmkConditionalLayer[]
): LegendHover {
  const mine = rules.filter(rule => rule.thenLayer === index && rule.ifLayers.length > 0)
  if (mine.length === 0) return { kind: 'layer', layer: index }
  const layers = [...new Set(mine.flatMap(rule => rule.ifLayers))].sort((a, b) => a - b)
  return { kind: 'layers', layers, source: index }
}

/** True when this layer row should glow because the hovered row is its partner. */
export function conditionalLayerRowPeer(
  index: number,
  hover: LegendHover | null,
  rules: readonly ZmkConditionalLayer[]
): boolean {
  if (!hover || rules.length === 0) return false
  if (hover.kind === 'layers' && hover.source != null) {
    return rules.some(rule => rule.thenLayer === hover.source && rule.ifLayers.includes(index))
  }
  if (hover.kind === 'layer') {
    return rules.some(rule => rule.ifLayers.includes(hover.layer) && rule.thenLayer === index)
  }
  return false
}

/** Stable dirty-check fingerprint. If-layer order does not matter. */
export function encodeConditionalLayerFingerprint(rule: ZmkConditionalLayer): string {
  return `${sortedIf(rule.ifLayers).join('+')}->${rule.thenLayer}`
}

function isRule(value: unknown): value is ZmkConditionalLayer {
  if (!value || typeof value !== 'object') return false
  const row = value as { id?: unknown; ifLayers?: unknown; thenLayer?: unknown }
  if (typeof row.id !== 'string' || row.id.length === 0) return false
  if (!Array.isArray(row.ifLayers) || row.ifLayers.length === 0) return false
  if (!row.ifLayers.every(layer => Number.isInteger(layer) && layer >= 0)) return false
  return Number.isInteger(row.thenLayer) && (row.thenLayer as number) >= 0
}

/** Keep well-formed rules from keymap JSON. Non-arrays become undefined. */
export function normalizeConditionalLayers(raw: unknown): ZmkConditionalLayer[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const rules: ZmkConditionalLayer[] = []
  for (const item of raw) {
    if (!isRule(item)) continue
    rules.push({
      id: item.id,
      ifLayers: item.ifLayers.map(layer => Number(layer)),
      thenLayer: Number(item.thenLayer)
    })
  }
  return rules
}
