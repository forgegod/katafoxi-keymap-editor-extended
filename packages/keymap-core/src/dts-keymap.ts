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
  parseDtsCombosDetailed,
  type DtsComboJson
} from './dts-combos.js'
import { parseDtsConditionalLayersDetailed } from './dts-conditional-layers.js'
import { parseDtsHoldTapsDetailed } from './dts-behaviors.js'
import {
  findAngleProp,
  findNamedBlock,
  findNamedBlocks,
  hasPreprocessorConditional,
  escapeRegExp,
  iterateChildNodes,
  maskDts,
  matchBrace,
  tokenizeBindings,
  tokenizeBindingsDetailed,
  type DtsNamedBlock
} from './dts-scan.js'
import { KeymapValidationError } from './errors.js'
import type { ZmkConditionalLayer, ZmkHoldTap } from './types.js'

const DEFINE_RE = /^#define[ \t]+(\w+)(?:[ \t]+(.+))?$/gm
const MAX_MACRO_EXPAND_DEPTH = 32

/** Compiled `#define` table: patterns built once per parse/save. */
export interface CompiledMacros {
  macros: Record<string, string>
  /** Longest keys first; each `re` is `\bkey\b` with the `g` flag. */
  entries: { key: string; re: RegExp; value: string; multiBinding: boolean }[]
}

/** Compile whole-word replace patterns once for a `#define` map. */
export function compileMacros(macros: Record<string, string>): CompiledMacros {
  const keys = Object.keys(macros).sort((a, b) => b.length - a.length)
  return {
    macros,
    entries: keys.map(key => ({
      key,
      re: new RegExp(`\\b${escapeRegExp(key)}\\b`, 'g'),
      value: macros[key],
      multiBinding: tokenizeBindings(macros[key]).length > 1
    }))
  }
}

/** @deprecated Prefer matchBrace on a maskDts view; kept for callers that already mask. */
export function findMatchingBrace(source: string, openIndex: number): number {
  return matchBrace(source, openIndex)
}

const ZMK_KEYMAP_BLOCK = {
  compatible: 'zmk,keymap',
  requireCompatible: true
} as const

/**
 * Locate `keymap { compatible = "zmk,keymap"; … }` blocks. Search uses a
 * DTS-name lookbehind so `my-keymap {` is not a hit.
 */
export function findZmkKeymapBlocks(source: string): DtsNamedBlock[] {
  const masked = maskDts(source)
  return findNamedBlocks(source, masked, 'keymap', ZMK_KEYMAP_BLOCK)
}

/**
 * Locate the `keymap { ... }` block that contains `compatible = "zmk,keymap"`.
 * Returns absolute indices into `source`: body is exclusive of the braces.
 * Several such nodes → the first (Save refuses via assertCanSpliceKeymap).
 */
export function findZmkKeymapBlock(source: string): DtsNamedBlock | null {
  return findZmkKeymapBlocks(source)[0] ?? null
}

/** Throw when Save must not rewrite layers (preprocessor or several keymap nodes). */
export function assertCanSpliceKeymap(source: string): DtsNamedBlock {
  const masked = maskDts(source)
  const blocks = findNamedBlocks(source, masked, 'keymap', ZMK_KEYMAP_BLOCK)
  if (blocks.length === 0) {
    throw new KeymapValidationError([
      'Cannot splice: no keymap block with compatible = "zmk,keymap" found'
    ])
  }
  if (blocks.length > 1) {
    throw new KeymapValidationError(['Cannot splice: multiple keymap nodes'])
  }
  const block = blocks[0]!
  if (hasPreprocessorConditional(masked, { start: block.bodyStart, end: block.bodyEnd })) {
    throw new KeymapValidationError([
      'Cannot splice: preprocessor conditionals in the keymap block'
    ])
  }
  return block
}

function addWarning(warnings: string[], code: string): void {
  if (!warnings.includes(code)) warnings.push(code)
}

export interface DtsLayerNode {
  /** Absolute start of `label:` when present, otherwise the node name. */
  labelStart: number
  /** Absolute start of the node id (e.g. `layer_0`). */
  nameStart: number
  /** Absolute end after the closing `};` plus a trailing newline. */
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
  const nodes: DtsLayerNode[] = []
  for (const child of iterateChildNodes(masked, block)) {
    const bindingsInterior = findAngleProp(
      masked,
      { start: child.openBrace + 1, end: child.closeBrace },
      'bindings'
    )
    if (!bindingsInterior) continue

    nodes.push({
      labelStart: child.labelStart,
      nameStart: child.nameStart,
      nodeEnd: child.end,
      name: child.name,
      openBrace: child.openBrace,
      closeBrace: child.closeBrace,
      bindingsInterior
    })
  }
  return nodes
}

function expandMacros(
  text: string,
  compiled: CompiledMacros,
  warnings: string[]
): string {
  let out = text
  for (let depth = 0; depth < MAX_MACRO_EXPAND_DEPTH; depth++) {
    let changed = false
    for (const { re, value, multiBinding } of compiled.entries) {
      if (multiBinding) {
        re.lastIndex = 0
        if (re.test(out)) addWarning(warnings, 'macros_multi_binding')
        continue
      }
      re.lastIndex = 0
      const next = out.replace(re, () => value)
      if (next !== out) {
        out = next
        changed = true
      }
    }
    if (!changed) break
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
      parts.push(masked.slice(node.bindingsInterior.start, node.bindingsInterior.end))
      const sensor = findAngleProp(
        masked,
        { start: node.openBrace + 1, end: node.closeBrace },
        'sensor-bindings'
      )
      if (sensor) parts.push(masked.slice(sensor.start, sensor.end))
    }
  }

  const combosBlock = findCombosBlock(source)
  if (combosBlock) {
    for (const child of iterateChildNodes(masked, combosBlock)) {
      const bindings = findAngleProp(
        masked,
        { start: child.openBrace + 1, end: child.closeBrace },
        'bindings'
      )
      if (bindings) parts.push(masked.slice(bindings.start, bindings.end))
    }
  }

  if (parts.length === 0) return null
  return parts.join('\n')
}

/** Split a bindings block into individual bind strings (each starts with &). */
export { tokenizeBindings, tokenizeBindingsDetailed } from './dts-scan.js'

/** Join `\` + EOL so a continued `#define` is one logical line. */
function joinBackslashEol(text: string): string {
  return text.replace(/\\(?:\r\n|\n|\r)/g, '')
}

/**
 * Collect simple `#define NAME replacement` aliases. Searches the masked
 * view so defines inside comments are ignored. Values come from the mask
 * (comments already spaces). `[ \t]+` does not steal the next line.
 */
export function parseDefines(source: string): Record<string, string> {
  const masked = maskDts(joinBackslashEol(source))
  const macros: Record<string, string> = {}
  let match: RegExpExecArray | null
  const re = new RegExp(DEFINE_RE)
  while ((match = re.exec(masked)) !== null) {
    const raw = match[2]
    if (raw == null) continue
    const value = raw.replace(/[ \t]+/g, ' ').trim()
    if (!value) continue
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
   * but not fully parsed (`combos_unparsed`: skipped node, DTS label, or
   * non-numeric token). An explicit empty array means the file owns an empty
   * combos list (Save may remove the block).
   */
  combos?: DtsComboJson[]
  /**
   * Omitted when the file has no conditional-layer rules, or when a rule is
   * not fully parsed (`conditional_layers_unparsed`).
   */
  conditionalLayers?: ZmkConditionalLayer[]
  /**
   * Omitted when the file has no hold-tap nodes, or when timing is not fully
   * numeric (`hold_tap_timing_unparsed`).
   */
  holdTaps?: ZmkHoldTap[]
  /**
   * One string array per layer. Omitted when no layer has `sensor-bindings`.
   * An empty inner array means that layer has no encoder property.
   */
  sensorBindings?: string[][]
  warnings: string[]
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

  const keymapBlocks = findNamedBlocks(source, masked, 'keymap', ZMK_KEYMAP_BLOCK)
  if (keymapBlocks.length > 1) {
    addWarning(warnings, 'multiple_keymap_nodes')
  }
  const block = keymapBlocks[0]
  if (!block) {
    throw new KeymapValidationError(['No layers with bindings found in .keymap'])
  }
  if (hasPreprocessorConditional(masked, { start: block.bodyStart, end: block.bodyEnd })) {
    addWarning(warnings, 'preprocessor_conditional')
  }

  const layerNodes = findKeymapLayerNodes(source, block)
  let anyMacroExpanded = false
  let anyUnparsedFragment = false
  const sensorRows: string[][] = []
  let anySensor = false

  for (const node of layerNodes) {
    const rawBlock = masked.slice(node.bindingsInterior.start, node.bindingsInterior.end)
    if (macrosAppearInText(rawBlock, compiled)) {
      anyMacroExpanded = true
    }
    const { binds, hasUnparsedFragment } = tokenizeBindingsDetailed(
      expandMacros(rawBlock, compiled, warnings)
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
    const sensorRaw = masked.slice(sensorInterior.start, sensorInterior.end)
    if (macrosAppearInText(sensorRaw, compiled)) anyMacroExpanded = true
    const sensorTok = tokenizeBindingsDetailed(
      expandMacros(sensorRaw, compiled, warnings)
    )
    if (sensorTok.hasUnparsedFragment) anyUnparsedFragment = true
    sensorRows.push(sensorTok.binds)
  }

  if (layers.length === 0) {
    throw new KeymapValidationError(['No layers with bindings found in .keymap'])
  }

  const combosBlock = findCombosBlock(source)
  const combosParsed = parseDtsCombosDetailed(source)
  const combos: DtsComboJson[] = []
  for (const c of combosParsed.combos) {
    if (macrosAppearInText(c.binding, compiled)) {
      anyMacroExpanded = true
      combos.push({ ...c, binding: expandMacros(c.binding, compiled, warnings) })
    } else {
      combos.push(c)
    }
  }

  if (anyMacroExpanded) {
    addWarning(warnings, 'macros_expanded')
  }
  if (anyUnparsedFragment) {
    addWarning(warnings, 'unparsed_binding_fragment')
  }

  let ownedCombos: DtsComboJson[] | undefined
  if (combosParsed.preprocessorConditional) {
    addWarning(warnings, 'preprocessor_conditional')
  } else if (combosParsed.unparsed) {
    addWarning(warnings, 'combos_unparsed')
  } else if (combos.length > 0) {
    ownedCombos = combos
  } else if (combosBlock) {
    const body = source.slice(combosBlock.bodyStart, combosBlock.bodyEnd).trim()
    if (body.length > 0) {
      // Block present but nothing parsed — do not claim ownership with [].
      addWarning(warnings, 'combos_unparsed')
    } else {
      ownedCombos = []
    }
  }

  const conditionalParsed = parseDtsConditionalLayersDetailed(source)
  let ownedConditional: ZmkConditionalLayer[] | undefined
  if (conditionalParsed.unparsed) {
    addWarning(warnings, 'conditional_layers_unparsed')
  } else if (conditionalParsed.rules.length > 0) {
    ownedConditional = conditionalParsed.rules
  }

  const holdParsed = parseDtsHoldTapsDetailed(source)
  let ownedHoldTaps: ZmkHoldTap[] | undefined
  if (holdParsed.preprocessorConditional) {
    addWarning(warnings, 'preprocessor_conditional')
  } else if (holdParsed.unparsed) {
    addWarning(warnings, 'hold_tap_timing_unparsed')
  } else if (holdParsed.holdTaps.length > 0) {
    ownedHoldTaps = holdParsed.holdTaps
  }

  return {
    keyboard: meta.keyboard ?? 'unknown',
    keymap: meta.keymap ?? 'unknown',
    layout: meta.layout ?? 'LAYOUT',
    layer_names,
    layers,
    ...(ownedCombos !== undefined ? { combos: ownedCombos } : {}),
    ...(ownedConditional !== undefined ? { conditionalLayers: ownedConditional } : {}),
    ...(ownedHoldTaps !== undefined ? { holdTaps: ownedHoldTaps } : {}),
    ...(anySensor ? { sensorBindings: sensorRows } : {}),
    warnings
  }
}
