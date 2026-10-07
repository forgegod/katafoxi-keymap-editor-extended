/**
 * Surgical bindings replacement inside an existing ZMK .keymap file.
 * Preserves preamble, behavior property blocks, combos, and layer node ids.
 */

import {
  assertCanSpliceKeymap,
  findKeymapLayerNodes,
  findZmkKeymapBlock
} from './dts-keymap.js'
import { scanDts, tokenizeBindings, uniqueDtsNodeId } from './dts-scan.js'
import { dominantEol, type LineEnding } from './eol.js'
import { KeymapValidationError } from './errors.js'
import { bindingColumnWidths, renderTable } from './layout.js'
import type { LayoutKey } from './types.js'

export function assertLayerKeyCounts(layout: LayoutKey[], layers: string[][]): void {
  for (let i = 0; i < layers.length; i++) {
    if (layers[i].length !== layout.length) {
      throw new KeymapValidationError([
        `Layer ${i} has ${layers[i].length} keys but layout has ${layout.length}`
      ])
    }
  }
}

function renderBindingsInterior(
  layout: LayoutKey[],
  layer: string[],
  columnWidths: number[],
  eol: LineEnding
): string {
  return renderTable(layout, layer, {
    linePrefix: '',
    columnSeparator: ' ',
    columnWidths,
    eol
  })
}

function formatNewLayerNode(
  name: string,
  interior: string,
  indent: string,
  eol: LineEnding
): string {
  const inner = indent + '    '
  return (
    `${indent}${name} {${eol}` +
    `${inner}bindings = <${eol}` +
    `${interior}${eol}` +
    `${inner}>;${eol}` +
    `${indent}};`
  )
}

/** Keep original interior bytes when tokens already match (no-op Save). */
function bindingInteriorUnchanged(
  source: string,
  node: { bindingsInterior: { start: number; end: number } },
  layer: string[]
): boolean {
  const tokens = tokenizeBindings(
    source.slice(node.bindingsInterior.start, node.bindingsInterior.end)
  )
  return tokens.length === layer.length && tokens.every((token, i) => token === layer[i])
}

function inferLayerIndent(source: string, layerNodes: ReturnType<typeof findKeymapLayerNodes>): string {
  if (layerNodes.length > 0) {
    const lineStart = source.lastIndexOf('\n', layerNodes[0].labelStart - 1) + 1
    const prefix = source.slice(lineStart, layerNodes[0].labelStart)
    if (/^[ \t]*$/.test(prefix)) return prefix
  }
  return '        '
}

/** Cut from the node header (label or name), including same-line indent. */
function layerNodeCutStart(source: string, labelStart: number): number {
  let from = labelStart
  while (from > 0 && (source[from - 1] === ' ' || source[from - 1] === '\t')) from--
  return from
}

/**
 * Replace bindings interiors (and add/remove trailing layer nodes by index)
 * inside `keymap { compatible = "zmk,keymap"; ... }`. Outside that block is byte-stable.
 * Unchanged interiors (token-equal to the encoded layer) are left byte-identical
 * so a no-op Save does not re-pad the table. Layer node ids are preserved by
 * index (UI layer names do not rename DTS nodes).
 */
export function spliceBindingsIntoDts(
  original: string,
  input: {
    layout: LayoutKey[]
    layers: string[][]
  }
): string {
  const { layout, layers } = input
  assertLayerKeyCounts(layout, layers)

  const eol = dominantEol(original)
  const scan = scanDts(original)
  const block = assertCanSpliceKeymap(original, scan)

  const existing = findKeymapLayerNodes(original, block, scan)
  const indent = inferLayerIndent(original, existing)
  const columnWidths = bindingColumnWidths(layout, layers, { columnSeparator: ' ' })

  // Build from the end so earlier absolute indices stay valid
  let result = original

  if (layers.length < existing.length) {
    // Drop trailing layer nodes (from the end)
    for (let i = existing.length - 1; i >= layers.length; i--) {
      const node = existing[i]
      result = result.slice(0, layerNodeCutStart(result, node.labelStart)) + result.slice(node.nodeEnd)
    }
    // Re-find remaining nodes after removals
    const blockAfter = findZmkKeymapBlock(result)
    if (!blockAfter) {
      throw new KeymapValidationError([
        'Cannot splice: keymap block lost while removing layers'
      ])
    }
    const remaining = findKeymapLayerNodes(result, blockAfter)
    for (let i = remaining.length - 1; i >= 0; i--) {
      const node = remaining[i]
      if (bindingInteriorUnchanged(result, node, layers[i])) continue
      const interior = renderBindingsInterior(layout, layers[i], columnWidths, eol)
      result =
        result.slice(0, node.bindingsInterior.start) +
        eol +
        interior +
        eol +
        result.slice(node.bindingsInterior.end)
    }
    return result
  }

  // Same or more layers: replace existing interiors, then append new nodes
  for (let i = existing.length - 1; i >= 0; i--) {
    const node = existing[i]
    if (bindingInteriorUnchanged(result, node, layers[i])) continue
    const interior = renderBindingsInterior(layout, layers[i], columnWidths, eol)
    result =
      result.slice(0, node.bindingsInterior.start) +
      eol +
      interior +
      eol +
      result.slice(node.bindingsInterior.end)
  }

  if (layers.length > existing.length) {
    const blockAfter = findZmkKeymapBlock(result)
    if (!blockAfter) {
      throw new KeymapValidationError([
        'Cannot splice: keymap block lost while updating bindings'
      ])
    }
    const insertAt = blockAfter.closeBrace
    const usedNames = new Set(existing.map(node => node.name))
    const newNodes: string[] = []
    for (let i = existing.length; i < layers.length; i++) {
      const interior = renderBindingsInterior(layout, layers[i], columnWidths, eol)
      const name = uniqueDtsNodeId(`layer_${i}`, usedNames)
      newNodes.push(formatNewLayerNode(name, interior, indent, eol))
    }
    const insertion = eol + newNodes.join(eol) + eol
    result = result.slice(0, insertAt) + insertion + result.slice(insertAt)
  }

  return result
}
