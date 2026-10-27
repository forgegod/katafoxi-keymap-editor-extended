import type { KeyBindingNode, LayoutKey, ParsedKeymap } from './types.js'

// Structural subset of decoded @zmkfirmware/zmk-studio-ts-client 0.0.18.
// No transport dependency: callers supply responses from one current session.
export interface StudioBehaviorBinding {
  /** sint32 on a binding, unlike the uint32 behavior-list/detail IDs. */
  behaviorId: number
  /** Both parameter cells are uint32, even when metadata describes signed ranges. */
  param1: number
  param2: number
}

export interface StudioParameterValue {
  name: string
  nil?: Record<string, never>
  constant?: number
  range?: { min: number; max: number }
  hidUsage?: { keyboardMax: number; consumerMax: number }
  layerId?: Record<string, never>
}

export interface StudioBehaviorDetails {
  id: number
  displayName: string
  metadata: Array<{ param1: StudioParameterValue[]; param2: StudioParameterValue[] }>
}

export interface StudioPhysicalLayouts {
  activeLayoutIndex: number
  layouts: Array<{
    name: string
    keys: Array<{ width: number; height: number; x: number; y: number; r: number; rx: number; ry: number }>
  }>
}

type StudioRpcResponse<T> = T & { requestId?: number }

/** Full RPC response envelopes, not flattened values or devicetree input. */
export interface StudioRpcSessionResponses {
  getLockState: StudioRpcResponse<{ core: { getLockState: number } }>
  listAllBehaviors: StudioRpcResponse<{ behaviors: { listAllBehaviors: { behaviors: number[] } } }>
  getBehaviorDetails: Array<StudioRpcResponse<{ behaviors: { getBehaviorDetails: StudioBehaviorDetails } }>>
  getPhysicalLayouts: StudioRpcResponse<{ keymap: { getPhysicalLayouts: StudioPhysicalLayouts } }>
  getKeymap: StudioRpcResponse<{ keymap: { getKeymap: {
    layers: Array<{ id: number; name: string; bindings: StudioBehaviorBinding[] }>
    availableLayers: number
    maxLayerNameLength: number
  } } }>
}

/** Numeric trees are session-local RPC identities, never file-export bindings. */
export interface StudioRpcSelection {
  source: 'usb'
  layout: LayoutKey[]
  keymap: ParsedKeymap
  studio: {
    layerIds: number[]
    behaviors: StudioBehaviorDetails[]
    physicalLayouts: StudioPhysicalLayouts
    availableLayers: number
    maxLayerNameLength: number
  }
}

export type StudioRpcUnavailable = {
  status: 'unavailable'
  reason: 'missing-session' | 'locked' | 'lock-state-unavailable' | 'missing-response'
  path?: string
}

export type StudioRpcSessionResult =
  | { status: 'ready'; selection: StudioRpcSelection }
  | StudioRpcUnavailable
  | StudioRpcRefusal

export type StudioRpcRefusalReason =
  | 'combos' | 'conditional-layers' | 'encoder-sensor-bindings'
  | 'macro-definitions' | 'custom-behavior-definitions'
  | 'invalid-response' | 'unsupported-field' | 'invalid-active-layout'
  | 'binding-count-mismatch' | 'duplicate-layer-id' | 'duplicate-behavior-id'
  | 'unknown-behavior-id' | 'missing-behavior-details'
  | 'invalid-binding' | 'invalid-location'

export type StudioRpcRefusal = { status: 'refused'; reason: StudioRpcRefusalReason; path: string }

const unsupportedFields = new Map<string, StudioRpcRefusalReason>([
  ['combos', 'combos'],
  ['conditionalLayers', 'conditional-layers'],
  ['sensorBindings', 'encoder-sensor-bindings'],
  ['macros', 'macro-definitions'],
  ['behaviorDefinitions', 'custom-behavior-definitions'],
  ['holdTaps', 'custom-behavior-definitions']
])

function unsupportedContent(input: unknown): StudioRpcRefusal | undefined {
  const physical = member(member(member(input, 'getPhysicalLayouts'), 'keymap'), 'getPhysicalLayouts')
  const layouts = member(physical, 'layouts')
  const activeIndex = member(physical, 'activeLayoutIndex')
  const keys = Array.isArray(layouts) && typeof activeIndex === 'number' && Number.isInteger(activeIndex) && activeIndex >= 0
    ? member(layouts[activeIndex], 'keys') : undefined
  const keyCount = Array.isArray(keys) ? keys.length : undefined
  const pending = [{ value: input, path: '' }]
  const seen = new Set<object>()
  while (pending.length) {
    const { value, path } = pending.pop()!
    if (!value || typeof value !== 'object' || seen.has(value)) continue
    seen.add(value)
    // Firmware-sized binding arrays may contain opaque, unused tail slots.
    const visible = Array.isArray(value) && keyCount !== undefined && /^getKeymap\.keymap\.getKeymap\.layers\.\d+\.bindings$/.test(path)
      ? value.slice(0, keyCount) : value
    for (const [key, child] of Object.entries(visible)) {
      const childPath = path ? `${path}.${key}` : key
      const reason = unsupportedFields.get(key)
      if (reason && child !== undefined) return { status: 'refused', reason, path: childPath }
      pending.push({ value: child, path: childPath })
    }
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function member(value: unknown, key: string): unknown {
  return isRecord(value) && Object.hasOwn(value, key) ? value[key] : undefined
}

class SessionMappingError extends Error {
  constructor(readonly result: StudioRpcUnavailable | StudioRpcRefusal) {
    super(`${result.reason}: ${result.path ?? ''}`)
  }
}

function requireValid(condition: unknown, path: string, reason: StudioRpcRefusalReason = 'invalid-response'): asserts condition {
  if (!condition) throw new SessionMappingError({ status: 'refused', reason, path })
}

function record(value: unknown, keys: readonly string[], path: string): Record<string, unknown> {
  requireValid(isRecord(value), path)
  for (const key of Object.keys(value)) {
    // Generated protobuf objects include inactive optional fields as undefined.
    requireValid(value[key] === undefined || keys.includes(key), path ? `${path}.${key}` : key, 'unsupported-field')
  }
  return value
}

function array(value: unknown, path: string, nonempty = false): unknown[] {
  requireValid(Array.isArray(value) && (!nonempty || value.length > 0), path)
  for (let index = 0; index < value.length; index++) requireValid(Object.hasOwn(value, index), `${path}.${index}`)
  return value
}

function integer(value: unknown, path: string, min = 0, max = 0xffffffff): number {
  requireValid(typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max, path)
  return value
}

function text(value: unknown, path: string): void {
  requireValid(typeof value === 'string', path)
}

function response(value: unknown, subsystem: string, method: string, path = method): unknown {
  const payload = member(member(value, subsystem), method)
  if (payload === undefined) throw new SessionMappingError({ status: 'unavailable', reason: 'missing-response', path })
  const envelope = record(value, ['requestId', subsystem], path)
  if (envelope.requestId !== undefined) integer(envelope.requestId, `${path}.requestId`)
  record(envelope[subsystem], [method], `${path}.${subsystem}`)
  return payload
}

function validateParameter(value: unknown, path: string): void {
  const variants = ['nil', 'constant', 'range', 'hidUsage', 'layerId']
  const entry = record(value, ['name', ...variants], path)
  text(entry.name, `${path}.name`)
  const present = variants.filter(key => entry[key] !== undefined)
  requireValid(present.length === 1, path)
  const kind = present[0]
  const detailPath = `${path}.${kind}`
  if (kind === 'constant') integer(entry.constant, detailPath)
  else if (kind === 'range') {
    const range = record(entry.range, ['min', 'max'], detailPath)
    const min = integer(range.min, `${detailPath}.min`, -0x80000000, 0x7fffffff)
    const max = integer(range.max, `${detailPath}.max`, -0x80000000, 0x7fffffff)
    requireValid(min <= max, detailPath)
  } else if (kind === 'hidUsage') {
    const hid = record(entry.hidUsage, ['keyboardMax', 'consumerMax'], detailPath)
    integer(hid.keyboardMax, `${detailPath}.keyboardMax`)
    integer(hid.consumerMax, `${detailPath}.consumerMax`)
  } else record(entry[kind], [], detailPath)
}

function validateSession(input: unknown): StudioRpcSessionResponses {
  const session = record(input, ['getLockState', 'listAllBehaviors', 'getBehaviorDetails', 'getPhysicalLayouts', 'getKeymap'], '')
  response(session.getLockState, 'core', 'getLockState')
  const behaviorList = record(response(session.listAllBehaviors, 'behaviors', 'listAllBehaviors'), ['behaviors'], 'listAllBehaviors.behaviors.listAllBehaviors')
  const behaviorIds = new Set<number>()
  for (const [i, value] of array(behaviorList.behaviors, 'listAllBehaviors.behaviors.listAllBehaviors.behaviors').entries()) {
    const path = `listAllBehaviors.behaviors.listAllBehaviors.behaviors.${i}`
    const id = integer(value, path)
    requireValid(!behaviorIds.has(id), path, 'duplicate-behavior-id')
    behaviorIds.add(id)
  }
  if (session.getBehaviorDetails === undefined) throw new SessionMappingError({ status: 'unavailable', reason: 'missing-response', path: 'getBehaviorDetails' })
  const detailIds = new Set<number>()
  for (const [i, value] of array(session.getBehaviorDetails, 'getBehaviorDetails').entries()) {
    const path = `getBehaviorDetails.${i}.behaviors.getBehaviorDetails`
    const details = record(response(value, 'behaviors', 'getBehaviorDetails', `getBehaviorDetails.${i}`), ['id', 'displayName', 'metadata'], path)
    const id = integer(details.id, `${path}.id`)
    requireValid(!detailIds.has(id), `${path}.id`, 'duplicate-behavior-id')
    requireValid(behaviorIds.has(id), `${path}.id`, 'unknown-behavior-id')
    detailIds.add(id)
    text(details.displayName, `${path}.displayName`)
    for (const [mi, value] of array(details.metadata, `${path}.metadata`).entries()) {
      const setPath = `${path}.metadata.${mi}`
      const set = record(value, ['param1', 'param2'], setPath)
      for (const key of ['param1', 'param2']) {
        for (const [vi, value] of array(set[key], `${setPath}.${key}`).entries()) validateParameter(value, `${setPath}.${key}.${vi}`)
      }
    }
  }
  requireValid(detailIds.size === behaviorIds.size, 'getBehaviorDetails', 'missing-behavior-details')

  const physicalPath = 'getPhysicalLayouts.keymap.getPhysicalLayouts'
  const physical = record(response(session.getPhysicalLayouts, 'keymap', 'getPhysicalLayouts'), ['activeLayoutIndex', 'layouts'], physicalPath)
  const layouts = array(physical.layouts, `${physicalPath}.layouts`, true)
  requireValid(typeof physical.activeLayoutIndex === 'number' && Number.isInteger(physical.activeLayoutIndex) &&
    physical.activeLayoutIndex >= 0 && physical.activeLayoutIndex < layouts.length, `${physicalPath}.activeLayoutIndex`, 'invalid-active-layout')
  let keyCount = 0
  for (const [i, value] of layouts.entries()) {
    const path = `${physicalPath}.layouts.${i}`
    const layout = record(value, ['name', 'keys'], path)
    text(layout.name, `${path}.name`)
    const keys = array(layout.keys, `${path}.keys`, true)
    if (i === physical.activeLayoutIndex) keyCount = keys.length
    for (const [ki, value] of keys.entries()) {
      const keyPath = `${path}.keys.${ki}`
      const attrs = ['width', 'height', 'x', 'y', 'r', 'rx', 'ry']
      const key = record(value, attrs, keyPath)
      for (const attr of attrs) integer(key[attr], `${keyPath}.${attr}`, attr === 'width' || attr === 'height' ? 1 : -0x80000000, 0x7fffffff)
    }
  }

  const keymapPath = 'getKeymap.keymap.getKeymap'
  const keymap = record(response(session.getKeymap, 'keymap', 'getKeymap'), ['layers', 'availableLayers', 'maxLayerNameLength'], keymapPath)
  integer(keymap.availableLayers, `${keymapPath}.availableLayers`)
  integer(keymap.maxLayerNameLength, `${keymapPath}.maxLayerNameLength`)
  const layerIds = new Set<number>()
  for (const [i, value] of array(keymap.layers, `${keymapPath}.layers`, true).entries()) {
    const path = `${keymapPath}.layers.${i}`
    const layer = record(value, ['id', 'name', 'bindings'], path)
    const id = integer(layer.id, `${path}.id`)
    requireValid(!layerIds.has(id), `${path}.id`, 'duplicate-layer-id')
    layerIds.add(id)
    text(layer.name, `${path}.name`)
    requireValid(Array.isArray(layer.bindings), `${path}.bindings`)
    requireValid(layer.bindings.length >= keyCount, `${path}.bindings`, 'binding-count-mismatch')
    const bindings = array(layer.bindings.slice(0, keyCount), `${path}.bindings`)
    for (const [bi, value] of bindings.entries()) {
      const bindingPath = `${path}.bindings.${bi}`
      const binding = record(value, ['behaviorId', 'param1', 'param2'], bindingPath)
      const behaviorId = integer(binding.behaviorId, `${bindingPath}.behaviorId`, -0x80000000, 0x7fffffff)
      requireValid(behaviorIds.has(behaviorId), `${bindingPath}.behaviorId`, 'unknown-behavior-id')
      integer(binding.param1, `${bindingPath}.param1`)
      integer(binding.param2, `${bindingPath}.param2`)
    }
  }
  // Every visible binding, required field and supported optional metadata has been checked.
  return input as StudioRpcSessionResponses
}

function bindingNode(binding: StudioBehaviorBinding): KeyBindingNode {
  return {
    value: binding.behaviorId,
    params: [binding.param1, binding.param2].map(value => ({ value, params: [] }))
  }
}

/**
 * Map only the active physical layout's key slots, not a complete firmware document. The
 * caller owns session freshness/disconnects; an old unlocked response is not
 * live authorization. Missing reads never become a successful empty selection.
 */
export function mapStudioRpcSession(input: unknown): StudioRpcSessionResult {
  if (input == null) return { status: 'unavailable', reason: 'missing-session' }
  const lockState = member(member(member(input, 'getLockState'), 'core'), 'getLockState')
  if (lockState !== 1) return {
    status: 'unavailable', reason: lockState === 0 ? 'locked' : 'lock-state-unavailable'
  }
  const unsupported = unsupportedContent(input)
  if (unsupported) return unsupported
  try {
    return selectionFromSession(validateSession(input))
  } catch (error) {
    if (error instanceof SessionMappingError) return error.result
    throw error
  }
}

function selectionFromSession(session: StudioRpcSessionResponses): StudioRpcSessionResult {
  const physicalLayouts = structuredClone(session.getPhysicalLayouts.keymap.getPhysicalLayouts)
  const activeLayout = physicalLayouts.layouts[physicalLayouts.activeLayoutIndex]
  const keymap = session.getKeymap.keymap.getKeymap
  const details = new Map(session.getBehaviorDetails.map(response => {
    const details = response.behaviors.getBehaviorDetails
    return [details.id, details] as const
  }))
  return {
    status: 'ready',
    selection: {
      source: 'usb',
      layout: activeLayout.keys.map(key => ({
        x: key.x / 100, y: key.y / 100, w: key.width / 100, h: key.height / 100,
        r: key.r / 100, rx: key.rx / 100, ry: key.ry / 100
      })),
      keymap: {
        layer_names: keymap.layers.map(layer => layer.name),
        layers: keymap.layers.map(layer => layer.bindings.slice(0, activeLayout.keys.length).map(bindingNode))
      },
      studio: {
        layerIds: keymap.layers.map(layer => layer.id),
        behaviors: session.listAllBehaviors.behaviors.listAllBehaviors.behaviors.map(id => structuredClone(details.get(id)!)),
        physicalLayouts,
        availableLayers: keymap.availableLayers,
        maxLayerNameLength: keymap.maxLayerNameLength
      }
    }
  }
}

export interface StudioSetLayerBindingRequest {
  keymap: { setLayerBinding: { layerId: number; keyPosition: number; binding: StudioBehaviorBinding } }
}

export type StudioSetLayerBindingResult =
  | { status: 'encoded'; request: StudioSetLayerBindingRequest }
  | StudioRpcUnavailable
  | StudioRpcRefusal

/**
 * Lossless encoding only, not write authorization. Both wire parameter cells
 * must be present (including zeros); aliases and nested expressions refuse.
 * The caller must check current lock/session identity and metadata acceptance
 * before sending. This function never sends, saves or advances a baseline.
 */
export function buildStudioSetLayerBinding(
  session: unknown,
  layerIndex: number,
  keyPosition: number,
  binding: KeyBindingNode
): StudioSetLayerBindingResult {
  const mapped = mapStudioRpcSession(session)
  if (mapped.status !== 'ready') return mapped
  const { selection } = mapped
  if (!Number.isInteger(layerIndex) || layerIndex < 0 || layerIndex >= selection.studio.layerIds.length ||
      !Number.isInteger(keyPosition) || keyPosition < 0 || keyPosition >= selection.layout.length) {
    return { status: 'refused', reason: 'invalid-location', path: 'layerIndex/keyPosition' }
  }
  let wireBinding: StudioBehaviorBinding
  try {
    const node = record(binding, ['value', 'params'], 'binding')
    const behaviorId = integer(node.value, 'binding.value', -0x80000000, 0x7fffffff)
    const params = array(node.params, 'binding.params')
    requireValid(params.length === 2, 'binding.params')
    const values = params.map((value, index) => {
      const path = `binding.params.${index}`
      const param = record(value, ['value', 'params'], path)
      requireValid(array(param.params, `${path}.params`).length === 0, `${path}.params`)
      return integer(param.value, `${path}.value`)
    })
    wireBinding = { behaviorId, param1: values[0], param2: values[1] }
  } catch (error) {
    if (error instanceof SessionMappingError) return {
      status: 'refused', reason: 'invalid-binding', path: error.result.path ?? 'binding'
    }
    throw error
  }
  if (!selection.studio.behaviors.some(behavior => behavior.id === wireBinding.behaviorId)) {
    return { status: 'refused', reason: 'unknown-behavior-id', path: 'binding.value' }
  }
  return {
    status: 'encoded',
    request: { keymap: { setLayerBinding: {
      layerId: selection.studio.layerIds[layerIndex], keyPosition, binding: wireBinding
    } } }
  }
}
