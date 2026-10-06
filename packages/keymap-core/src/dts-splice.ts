/**
 * Surgical bindings replacement inside an existing ZMK .keymap file.
 * Preserves preamble, behavior property blocks, combos, and layer node ids.
 */

import {
  findKeymapLayerNodes,
  findZmkKeymapBlock
} from './dts-keymap.js'
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
  index: number,
  interior: string,
  indent: string,
  eol: LineEnding
): string {
  const inner = indent + '    '
  return (
    `${indent}layer_${index} {${eol}` +
    `${inner}bindings = <${eol}` +
    `${interior}${eol}` +
    `${inner}>;${eol}` +
    `${indent}};`
  )
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
 * Layer node ids are preserved by index (UI layer names do not rename DTS nodes).
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
  const block = findZmkKeymapBlock(original)
  if (!block) {
    throw new KeymapValidationError([
      'Cannot splice: no keymap block with compatible = "zmk,keymap" found'
    ])
  }

  const existing = findKeymapLayerNodes(original, block)
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
    const newNodes: string[] = []
    for (let i = existing.length; i < layers.length; i++) {
      const interior = renderBindingsInterior(layout, layers[i], columnWidths, eol)
      newNodes.push(formatNewLayerNode(i, interior, indent, eol))
    }
    const insertion = eol + newNodes.join(eol) + eol
    result = result.slice(0, insertAt) + insertion + result.slice(insertAt)
  }

  return result
}
