import { buildKeymapCode, encodeKeyBinding, loadBehaviorsData, parseKeyBinding } from './keymap.js'
import { BEHAVIOR_DEFINITION_SCHEMAS, behaviorDefinitionsFingerprint } from './behavior-definitions.js'
import { RGB_LAYER_RECIPE } from './behavior-recipes.js'
import { cloneParsedKeymap, cloneSensorBinding } from './keymap-clone.js'
import { copyLayerDisplayName, inspectLayerOperationSource, moveLayerSourceNodes, sourceModelFingerprint } from './layer-operation-source.js'
import { isModifierWrapCode } from './modifiers.js'
import type { KeyBindingNode, LayoutKey, ParsedKeymap } from './types.js'

export type LayerOperation = { kind: 'reorder'; order: number[] } | { kind: 'duplicate'; index: number }
export type LayerOperationProvenance =
  | { kind: 'source'; originalSource: string; baseline: ParsedKeymap; template?: string }
  | { kind: 'source-free' }
  | { kind: 'unverified' }
export interface LayerOperationInput {
  keymap: ParsedKeymap
  layout: LayoutKey[]
  operation: LayerOperation
  provenance: LayerOperationProvenance
}
export type LayerOperationResult =
  | { ok: true; changed: boolean; keymap: ParsedKeymap; source: string | null; oldToNew: number[] }
  | { ok: false; error: string }

type Schema = readonly string[]
const stock = new Map(loadBehaviorsData().map(def => [def.code, def]))

function reject(path: string, reason: string): never {
  throw new Error(`${path}: ${reason}. Review the source or behavior definition externally.`)
}

function target(value: string | number, count: number, path: string): number {
  if (typeof value === 'string' && !/^(0|[1-9][0-9]*)$/.test(value)) reject(path, `unsupported layer target ${value}`)
  const n = Number(value)
  if (!Number.isSafeInteger(n) || n < 0 || n >= count) reject(path, `layer target ${value} is outside 0..${count - 1}`)
  return n
}

/** Walk only typed arguments, never recursively search arbitrary parameter trees. */
function mapBinding(node: KeyBindingNode, map: number[], path: string, schemas: Map<string, Schema>, reorder: boolean): KeyBindingNode {
  const code = String(node.value)
  const def = stock.get(code)
  let schema = schemas.get(code) ?? def?.params as Schema | undefined
  if (schema?.[0] === 'command') {
    const command = def?.commands?.find(command => command.code === node.params[0]?.value)
    if (!command && reorder) reject(path, `unproven command ${String(node.params[0]?.value)}`)
    if (command) schema = [...schema, ...(command.additionalParams ?? []).map(() => 'payload')]
  }
  if (!schema) {
    if (reorder) reject(path, `unproven behavior ${code}`)
    return cloneSensorBinding(node)
  }
  if (reorder && node.params.length !== schema.length) reject(path, `${code} has unproven arity or excess arguments`)
  const out = cloneSensorBinding(node)
  schema.forEach((kind, index) => {
    const arg = node.params[index]
    if (kind === 'layer') {
      if (!arg || arg.params.length) reject(`${path}.params[${index}]`, 'expected a layer leaf')
      const old = target(arg.value, map.length, `${path}.params[${index}]`)
      out.params[index].value = typeof arg.value === 'number' ? map[old] : String(map[old])
    } else if (reorder && arg && !provenPayload(arg, kind)) {
      reject(`${path}.params[${index}]`, 'opaque nested payload is not a proven non-layer argument')
    }
  })
  return out
}

function provenPayload(node: KeyBindingNode, kind: string): boolean {
  if (!node.params.length) return /^(?:[A-Za-z_][A-Za-z0-9_]*|[0-9]+|0x[0-9a-fA-F]+)$/.test(String(node.value))
  if ((kind === 'code' || kind === 'mod') && isModifierWrapCode(node.value) && node.params.length === 1) return provenPayload(node.params[0], kind)
  return kind === 'hsb' && node.value === 'RGB_COLOR_HSB' && node.params.length === 3 && node.params.every(arg => !arg.params.length && /^\d+$/.test(String(arg.value)))
}

function transformGraph(keymap: ParsedKeymap, map: number[], schemas: Map<string, Schema>, reorder: boolean): ParsedKeymap {
  const next = cloneParsedKeymap(keymap)
  if (keymap.layer_names === undefined) delete next.layer_names
  const binding = (node: KeyBindingNode, path: string) => mapBinding(node, map, path, schemas, reorder)
  next.layers = keymap.layers.map((row, layer) => row.map((node, key) => binding(node, `layers[${layer}][${key}]`)))
  if (keymap.sensorBindings) next.sensorBindings = keymap.sensorBindings.map((row, layer) => row.map((node, encoder) => binding(node, `sensorBindings[${layer}][${encoder}]`)))
  next.combos?.forEach((combo, i) => {
    combo.binding = binding(keymap.combos![i].binding, `combos[${i}].binding`)
    if (combo.layers) combo.layers = combo.layers.map((n, j) => map[target(n, map.length, `combos[${i}].layers[${j}]`)])
  })
  next.conditionalLayers?.forEach((rule, i) => {
    rule.ifLayers = rule.ifLayers.map((n, j) => map[target(n, map.length, `conditionalLayers[${i}].ifLayers[${j}]`)])
    rule.thenLayer = map[target(rule.thenLayer, map.length, `conditionalLayers[${i}].thenLayer`)]
  })
  next.behaviorDefinitions?.forEach((definition, i) => {
    if (!BEHAVIOR_DEFINITION_SCHEMAS[definition.compatible]?.bare) {
      definition.bindings = definition.bindings.map((child, j) => encodeKeyBinding(binding(parseKeyBinding(child), `behaviorDefinitions[${i}].bindings[${j}]`)))
    }
  })
  return next
}

/** All checks and serialization finish before the caller commits a transaction. */
export function operateLayers(input: LayerOperationInput): LayerOperationResult {
  try {
    const { keymap, layout, operation, provenance } = input
    const count = keymap.layers.length
    const oldToNew = Array.from({ length: count }, (_, index) => index)
    if (!count) reject('layers', 'at least one layer is required')
    if (operation.kind === 'reorder') {
      if (operation.order.length !== count || new Set(operation.order).size !== count ||
        Array.from(operation.order).some(n => !Number.isInteger(n) || n < 0 || n >= count)) reject('order', 'expected a complete permutation')
      if (operation.order[0] !== 0) reject('order[0]', 'the default layer zero cannot move')
      if (operation.order.every((old, index) => old === index)) {
        return { ok: true, changed: false, keymap, source: provenance.kind === 'source' ? provenance.originalSource : null, oldToNew }
      }
      operation.order.forEach((old, index) => { oldToNew[old] = index })
    } else {
      if (!Number.isInteger(operation.index)) reject('duplicate.index', 'expected an integer layer index')
      target(operation.index, count, 'duplicate.index')
    }
    if (keymap.layers.some(row => row.length !== layout.length)) reject('layers', 'key counts must match the layout')
    if (keymap.sensorBindings && keymap.sensorBindings.length !== count) reject('sensorBindings', 'rows must align with layers')
    if (provenance.kind === 'unverified') reject('source', 'the actual save path must be verified')
    let original: string | undefined
    let generatedRecipe = false
    let schemas = new Map<string, readonly string[]>()
    if (provenance.kind === 'source') {
      if (provenance.template) reject('template', 'template precedence has no verified operation-aware save path')
      const proof = inspectLayerOperationSource(provenance.originalSource)
      if (sourceModelFingerprint(proof.model) !== sourceModelFingerprint(provenance.baseline)) reject('source', 'stale model/source correspondence')
      if (proof.model.layers.length !== count) reject('layers', 'source correspondence changed; reload the saved document first')
      original = buildKeymapCode(layout, keymap, { originalSource: provenance.originalSource }).code
      const current = inspectLayerOperationSource(original)
      if (sourceModelFingerprint(current.model) !== sourceModelFingerprint(keymap)) reject('source', 'serialization does not represent the complete model')
      schemas = current.schemas
    } else {
      const built = buildKeymapCode(layout, keymap, { allowSourceFreeBehaviors: true, allowSourceFreeMacros: true })
      generatedRecipe = built.generatedDefinitionSource !== undefined
      original = built.generatedDefinitionSource ?? built.code
      const generated = inspectLayerOperationSource(original)
      if (sourceModelFingerprint(generated.model) !== sourceModelFingerprint(keymap)) reject('source-free', 'generated source does not represent the complete model')
      schemas = generated.schemas
      if (generatedRecipe) schemas.set(RGB_LAYER_RECIPE.code, RGB_LAYER_RECIPE.params)
    }
    const next = transformGraph(keymap, oldToNew, schemas, operation.kind === 'reorder')
    const names = keymap.layers.map((_, index) => keymap.layer_names?.[index] || `layer${index}`)
    let source: string
    if (operation.kind === 'reorder') {
      next.layers = operation.order.map(old => next.layers[old])
      next.layer_names = operation.order.map(old => names[old])
      if (next.sensorBindings) next.sensorBindings = operation.order.map(old => next.sensorBindings![old])
      source = buildKeymapCode(layout, next, original ? { originalSource: moveLayerSourceNodes(original, operation.order) } : undefined).code
    } else {
      const stem = `${names[operation.index]} copy`
      let name = stem
      for (let suffix = 2; names.includes(name); suffix++) name = `${stem} ${suffix}`
      next.layer_names = [...names, name]
      next.layers.push(next.layers[operation.index].map(cloneSensorBinding))
      if (next.sensorBindings) next.sensorBindings.push(next.sensorBindings[operation.index].map(cloneSensorBinding))
      source = buildKeymapCode(layout, next, { originalSource: original ?? buildKeymapCode(layout, keymap).code }).code
      source = copyLayerDisplayName(original!, source, operation.index, name)
    }
    if (sourceModelFingerprint(inspectLayerOperationSource(source).model) !== sourceModelFingerprint(next)) reject('source', 'operation output does not represent the complete model')
    if (next.behaviorDefinitions !== undefined) {
      next.behaviorSourceFingerprint = behaviorDefinitionsFingerprint(next.behaviorDefinitions)
    }
    // The shared splice reapplies the owned recipe; its header must not enter
    // definition proof. Imported source never takes this generated-only path.
    if (generatedRecipe) source = `${RGB_LAYER_RECIPE.includes.join('\n')}\n${source}`
    return { ok: true, changed: true, keymap: next, source, oldToNew }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Layer operation could not be verified.' }
  }
}
