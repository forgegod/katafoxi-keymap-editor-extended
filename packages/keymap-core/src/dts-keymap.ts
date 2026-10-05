/**
 * Minimal ZMK .keymap (devicetree bindings=) parser for editor import.
 * Expands simple #define macros and extracts layer bindings arrays.
 * Only layer nodes inside `keymap { compatible = "zmk,keymap"; ... }` become layers.
 * Combos are parsed separately into `combos` (never as layers).
 * Conditional layers are parsed into `conditionalLayers`.
 * Hold-tap nodes are parsed into `holdTaps`. Save rewrites them when the field is set.
 * Per-layer `sensor-bindings` are parsed into `sensorBindings` (encoders).
 */

import {
  findCombosBlock,
  parseDtsCombos,
  type DtsComboJson
} from './dts-combos.js'
import { parseDtsConditionalLayers } from './dts-conditional-layers.js'
import { parseDtsHoldTaps } from './dts-behaviors.js'
import {
  findAngleProp,
  findAnglePropStatement,
  findNamedBlock,
  maskDts,
  matchBrace,
  tokenizeBindings,
  type DtsNamedBlock
} from './dts-scan.js'
import type { ZmkConditionalLayer, ZmkHoldTap } from './types.js'

const DEFINE_RE = /^#define\s+(\w+)\s+(.+)$/gm

/** @deprecated Prefer matchBrace on a maskDts view; kept for callers that already mask. */
export function findMatchingBrace(source: string, openIndex: number): number {
  return matchBrace(source, openIndex)
}

/**
 * Locate the `keymap { ... }` block that contains `compatible = "zmk,keymap"`.
 * Returns absolute indices into `source`: body is exclusive of the braces.
 */
export function findZmkKeymapBlock(source: string): DtsNamedBlock | null {
  const masked = maskDts(source)
  return findNamedBlock(source, masked, 'keymap', {
    compatible: 'zmk,keymap',
    requireCompatible: true
  })
}

/**
 * Absolute range of `bindings = <...>` interior (content between `<` and `>`).
 * `sensor-bindings` is a different property; the token before `bindings` must
 * not be a word character or a hyphen.
 */
export function findBindingsInterior(
  source: string,
  from: number,
  to: number
): { start: number; end: number } | null {
  return findAngleProp(maskDts(source), { start: from, end: to }, 'bindings')
}

export interface DtsLayerNode {
  /** Absolute start of the node id (e.g. `layer_0`). */
  nameStart: number
  /** Absolute end after the closing `};` (or `}`). */
  nodeEnd: number
  name: string
  openBrace: number
  closeBrace: number
  bindingsInterior: { start: number; end: number }
}

/**
 * Layer nodes (with bindings) inside a ZMK keymap block, in document order.
 * `block` is the findZmkKeymapBlock result for `source`.
 */
export function findKeymapLayerNodes(
  source: string,
  block: DtsNamedBlock
): DtsLayerNode[] {
  const masked = maskDts(source)
  const body = masked.slice(block.bodyStart, block.bodyEnd)
  const nodes: DtsLayerNode[] = []
  const re = /(\w+)\s*\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    const name = m[1]
    const openBraceRel = m.index + m[0].length - 1
    const openBrace = block.bodyStart + openBraceRel
    const closeBrace = matchBrace(masked, openBrace)
    if (closeBrace < 0 || closeBrace > block.bodyEnd) {
      // Avoid re-matching the same `{` forever on malformed input
      re.lastIndex = openBraceRel + 1
      continue
    }

    // Skip past this node so nested braces aren't re-scanned as siblings
    re.lastIndex = closeBrace - block.bodyStart + 1

    const bindingsInterior = findAngleProp(
      masked,
      { start: openBrace + 1, end: closeBrace },
      'bindings'
    )
    if (!bindingsInterior) continue

    // Include trailing `;` and following whitespace up to next sibling / end
    let nodeEnd = closeBrace + 1
    if (source[nodeEnd] === ';') nodeEnd++
    while (nodeEnd < block.bodyEnd && /[ \t\r\n]/.test(source[nodeEnd])) {
      nodeEnd++
    }

    nodes.push({
      nameStart: block.bodyStart + m.index,
      nodeEnd,
      name,
      openBrace,
      closeBrace,
      bindingsInterior
    })
  }
  return nodes
}

function expandMacros(text: string, macros: Record<string, string>): string {
  const keys = Object.keys(macros).sort((a, b) => b.length - a.length)
  let out = text
  for (const key of keys) {
    out = out.replace(new RegExp(`\\b${key}\\b`, 'g'), macros[key])
  }
  return out
}

/** True if any #define name appears as a whole word in `text`. */
export function macrosAppearInText(text: string, macros: Record<string, string>): boolean {
  const keys = Object.keys(macros).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (new RegExp(`\\b${key}\\b`).test(text)) return true
  }
  return false
}

/** Concatenated bindings interiors inside the ZMK keymap block (unexpanded). */
export function keymapBindingsText(source: string): string | null {
  const block = findZmkKeymapBlock(source)
  if (!block) return null
  const layers = findKeymapLayerNodes(source, block)
  return layers.map(n => source.slice(n.bindingsInterior.start, n.bindingsInterior.end)).join('\n')
}

/** Bind strings inside one layer's `sensor-bindings`, or null when the property is absent. */
function readSensorBindingStrings(
  source: string,
  masked: string,
  openBrace: number,
  closeBrace: number
): string[] | null {
  const found = findAnglePropStatement(
    masked,
    { start: openBrace + 1, end: closeBrace },
    'sensor-bindings'
  )
  if (!found) return null
  return tokenizeBindings(source.slice(found.interior.start, found.interior.end))
}

/** Split a bindings block into individual bind strings (each starts with &). */
export { tokenizeBindings } from './dts-scan.js'

export function parseDefines(source: string): Record<string, string> {
  const macros: Record<string, string> = {}
  let match: RegExpExecArray | null
  const re = new RegExp(DEFINE_RE)
  while ((match = re.exec(source)) !== null) {
    macros[match[1]] = match[2].replace(/\/\/.*$/, '').trim()
  }
  return macros
}

export interface DtsKeymapJson {
  keyboard: string
  keymap: string
  layout: string
  layer_names: string[]
  layers: string[][]
  /**
   * Raw combo nodes (string bindings); converted in parseKeymap.
   * Omitted when the file has no `combos` block, or when a block is present
   * but yields zero parsed nodes from a non-empty body (`combos_unparsed`).
   * An explicit empty array means the file owns an empty combos list
   * (Save may remove the block).
   */
  combos?: DtsComboJson[]
  /** Omitted when the file has no conditional-layer rules. */
  conditionalLayers?: ZmkConditionalLayer[]
  /** Omitted when the file has no hold-tap nodes or timing blocks. */
  holdTaps?: ZmkHoldTap[]
  /**
   * One string array per layer. Omitted when no layer has `sensor-bindings`.
   * An empty inner array means that layer has no encoder property.
   */
  sensorBindings?: string[][]
  warnings: string[]
  [key: string]: unknown
}

export function parseDtsKeymap(
  source: string,
  meta: { keyboard?: string; keymap?: string; layout?: string } = {}
): DtsKeymapJson {
  const macros = parseDefines(source)
  const layers: string[][] = []
  const layer_names: string[] = []
  const warnings: string[] = []
  const masked = maskDts(source)

  const block = findNamedBlock(source, masked, 'keymap', {
    compatible: 'zmk,keymap',
    requireCompatible: true
  })
  if (!block) {
    throw new Error('No layers with bindings found in .keymap')
  }

  const layerNodes = findKeymapLayerNodes(source, block)
  let anyMacroExpanded = false
  const sensorRows: string[][] = []
  let anySensor = false

  for (const node of layerNodes) {
    const rawBlock = source.slice(node.bindingsInterior.start, node.bindingsInterior.end)
    if (macrosAppearInText(rawBlock, macros)) {
      anyMacroExpanded = true
    }
    const blockExpanded = expandMacros(rawBlock, macros)
    const binds = tokenizeBindings(blockExpanded).map(b => expandMacros(b, macros))
    layers.push(binds)
    layer_names.push(node.name === 'default_layer' ? 'default' : node.name)

    const sensorRaw = readSensorBindingStrings(
      source,
      masked,
      node.openBrace,
      node.closeBrace
    )
    if (!sensorRaw) {
      sensorRows.push([])
      continue
    }
    anySensor = true
    if (macrosAppearInText(sensorRaw.join(' '), macros)) anyMacroExpanded = true
    sensorRows.push(sensorRaw.map(binding => expandMacros(binding, macros)))
  }

  if (layers.length === 0) {
    throw new Error('No layers with bindings found in .keymap')
  }

  const combosBlock = findCombosBlock(source)
  const combosRaw = parseDtsCombos(source)
  const combos: DtsComboJson[] = []
  for (const c of combosRaw) {
    if (macrosAppearInText(c.binding, macros)) {
      anyMacroExpanded = true
      combos.push({ ...c, binding: expandMacros(c.binding, macros) })
    } else {
      combos.push(c)
    }
  }

  if (anyMacroExpanded) {
    warnings.push('macros_expanded')
  }

  let ownedCombos: DtsComboJson[] | undefined
  if (combos.length > 0) {
    ownedCombos = combos
  } else if (combosBlock) {
    const body = source.slice(combosBlock.bodyStart, combosBlock.bodyEnd).trim()
    if (body.length > 0) {
      // Block present but nothing parsed — do not claim ownership with [].
      warnings.push('combos_unparsed')
    } else {
      ownedCombos = []
    }
  }

  const conditionalLayers = parseDtsConditionalLayers(source)
  const holdTaps = parseDtsHoldTaps(source)

  return {
    keyboard: meta.keyboard ?? 'unknown',
    keymap: meta.keymap ?? 'unknown',
    layout: meta.layout ?? 'LAYOUT',
    layer_names,
    layers,
    ...(ownedCombos !== undefined ? { combos: ownedCombos } : {}),
    ...(conditionalLayers.length > 0 ? { conditionalLayers } : {}),
    ...(holdTaps.length > 0 ? { holdTaps } : {}),
    ...(anySensor ? { sensorBindings: sensorRows } : {}),
    warnings
  }
}
