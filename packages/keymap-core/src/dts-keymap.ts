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
  findNamedBlock,
  maskDts,
  matchBrace,
  tokenizeBindingsDetailed,
  type DtsNamedBlock
} from './dts-scan.js'
import type { ZmkConditionalLayer, ZmkHoldTap } from './types.js'

const DEFINE_RE = /^#define\s+(\w+)\s+(.+)$/gm

/** Compiled `#define` table: patterns built once per parse/save. */
export interface CompiledMacros {
  macros: Record<string, string>
  /** Longest keys first; each `re` is `\bkey\b` with the `g` flag. */
  entries: { key: string; re: RegExp; value: string }[]
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Compile whole-word replace patterns once for a `#define` map. */
export function compileMacros(macros: Record<string, string>): CompiledMacros {
  const keys = Object.keys(macros).sort((a, b) => b.length - a.length)
  return {
    macros,
    entries: keys.map(key => ({
      key,
      re: new RegExp(`\\b${escapeRegExp(key)}\\b`, 'g'),
      value: macros[key]
    }))
  }
}

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

function expandMacros(text: string, compiled: CompiledMacros): string {
  let out = text
  for (const { re, value } of compiled.entries) {
    re.lastIndex = 0
    out = out.replace(re, value)
  }
  return out
}

/** True if any #define name appears as a whole word in `text`. */
export function macrosAppearInText(
  text: string,
  macros: Record<string, string> | CompiledMacros
): boolean {
  const compiled = isCompiledMacros(macros) ? macros : compileMacros(macros)
  for (const { re } of compiled.entries) {
    re.lastIndex = 0
    if (re.test(text)) return true
  }
  return false
}

function isCompiledMacros(
  value: Record<string, string> | CompiledMacros
): value is CompiledMacros {
  return Array.isArray((value as CompiledMacros).entries)
}

/**
 * Concatenated interiors Save may rewrite with expanded tokens: layer
 * `bindings`, combo `bindings`, and per-layer `sensor-bindings`.
 */
export function keymapBindingsText(source: string): string | null {
  const masked = maskDts(source)
  const parts: string[] = []

  const block = findNamedBlock(source, masked, 'keymap', {
    compatible: 'zmk,keymap',
    requireCompatible: true
  })
  if (block) {
    for (const node of findKeymapLayerNodes(source, block)) {
      parts.push(source.slice(node.bindingsInterior.start, node.bindingsInterior.end))
      const sensor = findAngleProp(
        masked,
        { start: node.openBrace + 1, end: node.closeBrace },
        'sensor-bindings'
      )
      if (sensor) parts.push(source.slice(sensor.start, sensor.end))
    }
  }

  const combosBlock = findCombosBlock(source)
  if (combosBlock) {
    const body = masked.slice(combosBlock.bodyStart, combosBlock.bodyEnd)
    const re = /(\w+)\s*\{/g
    let m: RegExpExecArray | null
    while ((m = re.exec(body)) !== null) {
      const openBraceRel = m.index + m[0].length - 1
      const openBrace = combosBlock.bodyStart + openBraceRel
      const closeBrace = matchBrace(masked, openBrace)
      if (closeBrace < 0 || closeBrace > combosBlock.bodyEnd) {
        re.lastIndex = openBraceRel + 1
        continue
      }
      re.lastIndex = closeBrace - combosBlock.bodyStart + 1
      const bindings = findAngleProp(
        masked,
        { start: openBrace + 1, end: closeBrace },
        'bindings'
      )
      if (bindings) parts.push(source.slice(bindings.start, bindings.end))
    }
  }

  if (parts.length === 0) return null
  return parts.join('\n')
}

/** Split a bindings block into individual bind strings (each starts with &). */
export { tokenizeBindings, tokenizeBindingsDetailed } from './dts-scan.js'

/**
 * Collect simple `#define NAME replacement` aliases. Searches the masked
 * view so defines inside comments are ignored.
 */
export function parseDefines(source: string): Record<string, string> {
  const masked = maskDts(source)
  const macros: Record<string, string> = {}
  let match: RegExpExecArray | null
  const re = new RegExp(DEFINE_RE)
  while ((match = re.exec(masked)) !== null) {
    // Slice the replacement from the original so string interiors stay intact.
    const value = source
      .slice(match.index + match[0].length - match[2].length, match.index + match[0].length)
      .replace(/\/\/.*$/, '')
      .trim()
    macros[match[1]] = value
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
  const compiled = compileMacros(parseDefines(source))
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
  let anyUnparsedFragment = false
  const sensorRows: string[][] = []
  let anySensor = false

  for (const node of layerNodes) {
    const rawBlock = source.slice(node.bindingsInterior.start, node.bindingsInterior.end)
    if (macrosAppearInText(rawBlock, compiled)) {
      anyMacroExpanded = true
    }
    const { binds, hasUnparsedFragment } = tokenizeBindingsDetailed(
      expandMacros(rawBlock, compiled)
    )
    if (hasUnparsedFragment) anyUnparsedFragment = true
    layers.push(binds)
    layer_names.push(node.name === 'default_layer' ? 'default' : node.name)

    const sensorInterior = findAngleProp(
      masked,
      { start: node.openBrace + 1, end: node.closeBrace },
      'sensor-bindings'
    )
    if (!sensorInterior) {
      sensorRows.push([])
      continue
    }
    anySensor = true
    const sensorRaw = source.slice(sensorInterior.start, sensorInterior.end)
    if (macrosAppearInText(sensorRaw, compiled)) anyMacroExpanded = true
    const sensorTok = tokenizeBindingsDetailed(expandMacros(sensorRaw, compiled))
    if (sensorTok.hasUnparsedFragment) anyUnparsedFragment = true
    sensorRows.push(sensorTok.binds)
  }

  if (layers.length === 0) {
    throw new Error('No layers with bindings found in .keymap')
  }

  const combosBlock = findCombosBlock(source)
  const combosRaw = parseDtsCombos(source)
  const combos: DtsComboJson[] = []
  for (const c of combosRaw) {
    if (macrosAppearInText(c.binding, compiled)) {
      anyMacroExpanded = true
      combos.push({ ...c, binding: expandMacros(c.binding, compiled) })
    } else {
      combos.push(c)
    }
  }

  if (anyMacroExpanded) {
    warnings.push('macros_expanded')
  }
  if (anyUnparsedFragment) {
    warnings.push('unparsed_binding_fragment')
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
