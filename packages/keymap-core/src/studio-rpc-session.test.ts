import { describe, expect, it } from 'vitest'
import * as core from './index.js'
import type { KeyBindingNode } from './types.js'

// Synthetic decoded responses, not a hardware capture. Shapes match Studio's
// Keyboard.tsx and @zmkfirmware/zmk-studio-ts-client 0.0.18 (including zero cells).
function sessionFixture() {
  return {
    getLockState: { requestId: 1, core: { getLockState: 1 } },
    listAllBehaviors: { requestId: 2, behaviors: { listAllBehaviors: { behaviors: [37, 0] } } },
    getBehaviorDetails: [
      { requestId: 3, behaviors: { getBehaviorDetails: {
        id: 37, displayName: 'Not a devicetree alias',
        metadata: [{ param1: [{ name: 'Value', range: { min: 0, max: 2147483647 } }], param2: [] }]
      } } },
      { requestId: 4, behaviors: { getBehaviorDetails: { id: 0, displayName: '', metadata: [] } } }
    ],
    getPhysicalLayouts: { requestId: 5, keymap: { getPhysicalLayouts: {
      activeLayoutIndex: 1,
      layouts: [
        { name: 'Other', keys: [{ width: 100, height: 100, x: 0, y: 0, r: 0, rx: 0, ry: 0 }] },
        { name: 'Selected', keys: [
          { width: 125, height: 100, x: 250, y: -50, r: -1500, rx: 0, ry: 0 },
          { width: 100, height: 200, x: 0, y: 100, r: 0, rx: 0, ry: 0 }
        ] }
      ]
    } } },
    getKeymap: { requestId: 6, keymap: { getKeymap: {
      layers: [
        { id: 9, name: 'Base', bindings: [
          { behaviorId: 37, param1: 4294967295, param2: 0 },
          { behaviorId: 0, param1: 0, param2: 0 }
        ] },
        { id: 2, name: '', bindings: [
          { behaviorId: 0, param1: 0, param2: 0 },
          { behaviorId: 37, param1: 0, param2: 2147483648 }
        ] }
      ], availableLayers: 3, maxLayerNameLength: 16
    } } }
  } satisfies core.StudioRpcSessionResponses
}

function changedFixture(path: string, value: unknown): unknown {
  const fixture = sessionFixture()
  const parts = path.split('.')
  let target = fixture as unknown as Record<string, unknown>
  for (const part of parts.slice(0, -1)) target = target[part] as Record<string, unknown>
  target[parts.at(-1)!] = value
  return fixture
}

function hiddenTailFixture() {
  const fixture = sessionFixture()
  fixture.listAllBehaviors.behaviors.listAllBehaviors.behaviors = [37]
  fixture.getBehaviorDetails = fixture.getBehaviorDetails.slice(0, 1)
  for (const layer of fixture.getKeymap.keymap.getKeymap.layers) {
    for (const binding of layer.bindings) binding.behaviorId = 37
    layer.bindings.push(
      { behaviorId: 0, param1: 0, param2: 0 },
      { behaviorId: 99, param1: 123, param2: 456 }
    )
  }
  return fixture
}

describe('mapStudioRpcSession', () => {
  it.each([null, undefined])('returns unavailable for a missing session: %s', session => {
    expect(core.mapStudioRpcSession(session)).toEqual({ status: 'unavailable', reason: 'missing-session' })
  })

  it.each([0, -1, 2, '1', true, null, undefined])('requires the exact unlocked enum, not truthiness: %s', state => {
    const fixture = { ...sessionFixture(), getLockState: { core: { getLockState: state } } }
    expect(core.mapStudioRpcSession(fixture)).toEqual({
      status: 'unavailable', reason: state === 0 ? 'locked' : 'lock-state-unavailable'
    })
  })

  it.each([undefined, {}, { core: {} }, { meta: { noResponse: true } }])('does not read keymap data without an unlock response: %j', getLockState => {
    const fixture = { getLockState, get getKeymap() { throw new Error('Keymap read before unlock') } }
    expect(core.mapStudioRpcSession(fixture)).toEqual({ status: 'unavailable', reason: 'lock-state-unavailable' })
  })

  it('maps the active layout and ordered layers without inventing file or host identities', () => {
    expect(core).toHaveProperty('mapStudioRpcSession')
    const fixture = sessionFixture()
    const before = structuredClone(fixture)
    const result = core.mapStudioRpcSession(fixture)
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') throw new Error(JSON.stringify(result))
    expect(result.selection).toEqual({
      source: 'usb',
      layout: [
        { w: 1.25, h: 1, x: 2.5, y: -0.5, r: -15, rx: 0, ry: 0 },
        { w: 1, h: 2, x: 0, y: 1, r: 0, rx: 0, ry: 0 }
      ],
      keymap: {
        layer_names: ['Base', ''],
        layers: [
          [{ value: 37, params: [{ value: 4294967295, params: [] }, { value: 0, params: [] }] },
            { value: 0, params: [{ value: 0, params: [] }, { value: 0, params: [] }] }],
          [{ value: 0, params: [{ value: 0, params: [] }, { value: 0, params: [] }] },
            { value: 37, params: [{ value: 0, params: [] }, { value: 2147483648, params: [] }] }]
        ]
      },
      studio: {
        layerIds: [9, 2], availableLayers: 3, maxLayerNameLength: 16,
        physicalLayouts: fixture.getPhysicalLayouts.keymap.getPhysicalLayouts,
        behaviors: fixture.getBehaviorDetails.map(response => response.behaviors.getBehaviorDetails)
      }
    })
    result.selection.layout[0].x = 99
    result.selection.studio.behaviors[0].metadata[0].param1[0].name = 'changed'
    result.selection.studio.physicalLayouts.layouts[1].keys[0].x = 99
    result.selection.keymap.layers[0][0].params[0].value = 1
    expect(fixture).toEqual(before)
  })

  it('maps only visible keys when firmware includes unlisted zero-filled tail bindings', () => {
    const fixture = hiddenTailFixture()
    const before = structuredClone(fixture)
    const visible = structuredClone(fixture)
    for (const layer of visible.getKeymap.keymap.getKeymap.layers) layer.bindings.length = 2
    const result = core.mapStudioRpcSession(fixture)
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') throw new Error(JSON.stringify(result))
    expect(result).toEqual(core.mapStudioRpcSession(visible))
    expect(result.selection.keymap.layers.map(layer => layer.length)).toEqual([2, 2])
    expect(result.selection.layout).toHaveLength(2)
    const binding = result.selection.keymap.layers[0][0]
    expect(core.buildStudioSetLayerBinding(fixture, 0, 0, binding)).toEqual({
      status: 'encoded', request: { keymap: { setLayerBinding: {
        layerId: 9, keyPosition: 0, binding: before.getKeymap.keymap.getKeymap.layers[0].bindings[0]
      } } }
    })
    for (const keyPosition of [2, 3]) {
      expect(core.buildStudioSetLayerBinding(fixture, 0, keyPosition, binding)).toEqual({
        status: 'refused', reason: 'invalid-location', path: 'layerIndex/keyPosition'
      })
    }
    for (const value of [0, 99]) {
      expect(core.buildStudioSetLayerBinding(fixture, 0, 0, { ...binding, value })).toEqual({
        status: 'refused', reason: 'unknown-behavior-id', path: 'binding.value'
      })
    }
    expect(fixture).toEqual(before)
  })

  it.each([
    [{ behaviorId: 0, param1: 0, param2: 0 }, 'unknown-behavior-id', '.behaviorId'],
    [{ behaviorId: 37, param1: -1, param2: 0 }, 'invalid-response', '.param1'],
    [{ behaviorId: 37, param1: 0, param2: 0, param3: 1 }, 'unsupported-field', '.param3'],
    [{ macros: [] }, 'macro-definitions', '.macros'],
    [undefined, 'invalid-response', '']
  ])('ignores hidden data but retains its named refusal when visible: %j', (value, reason, suffix) => {
    const fixture = hiddenTailFixture()
    const bindings: unknown[] = fixture.getKeymap.keymap.getKeymap.layers[0].bindings
    bindings[2] = value
    expect(core.mapStudioRpcSession(fixture).status).toBe('ready')
    bindings[1] = value
    expect(core.mapStudioRpcSession(fixture)).toEqual({
      status: 'refused', reason, path: `getKeymap.keymap.getKeymap.layers.0.bindings.1${suffix}`
    })
  })

  it('still refuses a nonempty layer shorter than the active layout', () => {
    const fixture = hiddenTailFixture()
    fixture.getKeymap.keymap.getKeymap.layers[1].bindings.length = 1
    expect(core.mapStudioRpcSession(fixture)).toEqual({
      status: 'refused', reason: 'binding-count-mismatch', path: 'getKeymap.keymap.getKeymap.layers.1.bindings'
    })
  })

  it.each([
    ['combos', 'combos'],
    ['conditionalLayers', 'conditional-layers'],
    ['sensorBindings', 'encoder-sensor-bindings'],
    ['macros', 'macro-definitions'],
    ['behaviorDefinitions', 'custom-behavior-definitions'],
    ['holdTaps', 'custom-behavior-definitions']
  ])('names unsupported %s instead of returning a partial selection', (field, reason) => {
    for (const prefix of ['', 'getKeymap.keymap.getKeymap.', 'getKeymap.keymap.getKeymap.layers.0.']) {
      const path = `${prefix}${field}`
      // Even an explicitly empty extension is not part of this RPC contract.
      for (const value of [[{ opaque: true }], [], null]) {
        const fixture = changedFixture(path, value)
        expect(core.mapStudioRpcSession(fixture)).toEqual({ status: 'refused', reason, path })
      }
    }
  })

  it('refuses definitions attached to behavior details, not ordinary behavior IDs', () => {
    const path = 'getBehaviorDetails.0.behaviors.getBehaviorDetails.behaviorDefinitions'
    expect(core.mapStudioRpcSession(changedFixture(path, [{ code: '&custom' }]))).toEqual({
      status: 'refused', reason: 'custom-behavior-definitions', path
    })
  })

  it.each([
    'listAllBehaviors', 'getBehaviorDetails', 'getPhysicalLayouts', 'getKeymap',
    'listAllBehaviors.behaviors.listAllBehaviors',
    'getBehaviorDetails.0.behaviors.getBehaviorDetails',
    'getPhysicalLayouts.keymap.getPhysicalLayouts', 'getKeymap.keymap.getKeymap'
  ])('returns unavailable for an absent response at %s', path => {
    const result = core.mapStudioRpcSession(changedFixture(path, undefined))
    expect(result).toMatchObject({ status: 'unavailable', reason: 'missing-response' })
    expect(result).not.toHaveProperty('selection')
  })

  it('treats an RPC error envelope as unavailable, never an empty keymap', () => {
    expect(core.mapStudioRpcSession(changedFixture('getKeymap', { requestId: 6, meta: { noResponse: true } })))
      .toMatchObject({ status: 'unavailable', reason: 'missing-response' })
  })

  it.each([
    ['getKeymap.keymap.getKeymap.layers', []],
    ['getKeymap.keymap.getKeymap.layers', {}],
    ['getKeymap.keymap.getKeymap.layers.0.name', 1],
    ['getKeymap.keymap.getKeymap.layers.0.id', -1],
    ['getKeymap.keymap.getKeymap.availableLayers', 0.5],
    ['getKeymap.keymap.getKeymap.maxLayerNameLength', undefined],
    ['getKeymap.keymap.getKeymap.layers.0.bindings.0.param1', -1],
    ['getKeymap.keymap.getKeymap.layers.0.bindings.0.param1', 4294967296],
    ['getKeymap.keymap.getKeymap.layers.0.bindings.0.param1', '123'],
    ['getKeymap.keymap.getKeymap.layers.0.bindings.0.param1', 1.5],
    ['getKeymap.keymap.getKeymap.layers.0.bindings.0.param1', NaN],
    ['getKeymap.keymap.getKeymap.layers.0.bindings.0.param2', undefined],
    ['getPhysicalLayouts.keymap.getPhysicalLayouts.layouts', []],
    ['getPhysicalLayouts.keymap.getPhysicalLayouts.layouts.1.keys', []],
    ['getPhysicalLayouts.keymap.getPhysicalLayouts.layouts.1.keys.0.width', 0],
    ['getPhysicalLayouts.keymap.getPhysicalLayouts.layouts.1.keys.0.x', Infinity],
    ['getPhysicalLayouts.keymap.getPhysicalLayouts.layouts.1.keys.0.y', 0.1],
    ['getPhysicalLayouts.keymap.getPhysicalLayouts.layouts.1.keys.0.rx', undefined],
    ['getPhysicalLayouts.keymap.getPhysicalLayouts.layouts.0.keys.0.r', 2147483648],
    ['getBehaviorDetails.0.behaviors.getBehaviorDetails.metadata', undefined],
    ['getBehaviorDetails.0.behaviors.getBehaviorDetails.metadata.0.param1.0.range', { min: 2, max: 1 }],
    ['getBehaviorDetails.0.behaviors.getBehaviorDetails.metadata.0.param1.0.range', null],
    ['getBehaviorDetails.0.behaviors.getBehaviorDetails.metadata.0.param1.0.range', { min: 0, max: 2147483648 }],
    ['getBehaviorDetails.0.behaviors.getBehaviorDetails.metadata.0.param1.0.range', { min: -2147483649, max: 0 }],
    ['getBehaviorDetails.0.behaviors.getBehaviorDetails.metadata.0.param1', [{ name: 'Unknown type' }]],
    ['getBehaviorDetails.0.behaviors.getBehaviorDetails.metadata.0.param1', [{ name: 'Conflicting', nil: {}, constant: 0 }]],
    ['listAllBehaviors.behaviors.listAllBehaviors.behaviors', [37, '0']]
  ])('refuses malformed decoded data at %s (%j)', (path, value) => {
    expect(core.mapStudioRpcSession(changedFixture(path, value)))
      .toMatchObject({ status: 'refused', reason: 'invalid-response' })
  })

  it.each([
    ['getPhysicalLayouts.keymap.getPhysicalLayouts.activeLayoutIndex', 2, 'invalid-active-layout'],
    ['getPhysicalLayouts.keymap.getPhysicalLayouts.activeLayoutIndex', -1, 'invalid-active-layout'],
    ['getKeymap.keymap.getKeymap.layers.1.bindings', [], 'binding-count-mismatch'],
    ['getKeymap.keymap.getKeymap.layers.1.id', 9, 'duplicate-layer-id'],
    ['listAllBehaviors.behaviors.listAllBehaviors.behaviors', [37, 37], 'duplicate-behavior-id'],
    ['getBehaviorDetails.1.behaviors.getBehaviorDetails.id', 37, 'duplicate-behavior-id'],
    ['getBehaviorDetails.1.behaviors.getBehaviorDetails.id', 99, 'unknown-behavior-id'],
    ['getKeymap.keymap.getKeymap.layers.0.bindings.0.behaviorId', 99, 'unknown-behavior-id'],
    ['getBehaviorDetails', [], 'missing-behavior-details']
  ])('refuses ambiguous/incomplete identity at %s', (path, value, reason) => {
    expect(core.mapStudioRpcSession(changedFixture(path, value))).toMatchObject({ status: 'refused', reason })
  })

  it.each([
    'futureFeature', 'getKeymap.futureFeature',
    'getKeymap.keymap.getKeymap.layers.0.bindings.0.param3',
    'getBehaviorDetails.0.behaviors.getBehaviorDetails.metadata.0.param1.0.futureConstraint',
    'getPhysicalLayouts.keymap.getPhysicalLayouts.layouts.0.futureFeature'
  ])('does not silently discard unrecognized fields: %s', path => {
    expect(core.mapStudioRpcSession(changedFixture(path, 1))).toEqual({
      status: 'refused', reason: 'unsupported-field', path
    })
  })

  it('retains all existing metadata variants and follows listed IDs, not response arrival order', () => {
    const variants: core.StudioParameterValue[] = [
      { name: 'None', nil: {} }, { name: 'Zero', constant: 0 },
      { name: 'Range', range: { min: -2147483648, max: 2147483647 } },
      { name: 'HID', hidUsage: { keyboardMax: 255, consumerMax: 4095 } },
      { name: 'Layer', layerId: {} }
    ]
    const fixture: core.StudioRpcSessionResponses = sessionFixture()
    fixture.getBehaviorDetails[0].behaviors.getBehaviorDetails.metadata = [{ param1: variants, param2: variants }]
    fixture.getBehaviorDetails.reverse()
    const result = core.mapStudioRpcSession(fixture)
    expect(result.status).toBe('ready')
    if (result.status !== 'ready') throw new Error(JSON.stringify(result))
    expect(result.selection.studio.behaviors.map(behavior => behavior.id)).toEqual([37, 0])
    expect(result.selection.studio.behaviors[0].metadata).toEqual([{ param1: variants, param2: variants }])
  })

  it('refuses an advertised uint32 behavior ID that cannot fit a binding sint32', () => {
    const fixture = sessionFixture()
    fixture.listAllBehaviors.behaviors.listAllBehaviors.behaviors[0] = 2147483648
    fixture.getBehaviorDetails[0].behaviors.getBehaviorDetails.id = 2147483648
    for (const layer of fixture.getKeymap.keymap.getKeymap.layers) {
      for (const binding of layer.bindings) if (binding.behaviorId === 37) binding.behaviorId = 2147483648
    }
    expect(core.mapStudioRpcSession(fixture)).toMatchObject({ status: 'refused', reason: 'invalid-response' })
  })
})

describe('buildStudioSetLayerBinding', () => {
  it('round-trips every numeric binding using the firmware layer ID, not its array index', () => {
    expect(core).toHaveProperty('buildStudioSetLayerBinding')
    const fixture = sessionFixture()
    const before = structuredClone(fixture)
    const result = core.mapStudioRpcSession(fixture)
    if (result.status !== 'ready') throw new Error(JSON.stringify(result))
    for (const [layerIndex, layer] of result.selection.keymap.layers.entries()) {
      for (const [keyPosition, binding] of layer.entries()) {
        expect(core.buildStudioSetLayerBinding(fixture, layerIndex, keyPosition, binding)).toEqual({
          status: 'encoded',
          request: { keymap: { setLayerBinding: {
            layerId: fixture.getKeymap.keymap.getKeymap.layers[layerIndex].id,
            keyPosition,
            binding: fixture.getKeymap.keymap.getKeymap.layers[layerIndex].bindings[keyPosition]
          } } }
        })
      }
    }
    const edit: KeyBindingNode = { value: 37, params: [{ value: 42, params: [] }, { value: 0, params: [] }] }
    const encoded = core.buildStudioSetLayerBinding(fixture, 1, 0, edit)
    expect(encoded).toEqual({
      status: 'encoded', request: { keymap: { setLayerBinding: {
        layerId: 2, keyPosition: 0, binding: { behaviorId: 37, param1: 42, param2: 0 }
      } } }
    })
    edit.params[0].value = 99
    if (encoded.status !== 'encoded') throw new Error(JSON.stringify(encoded))
    expect(encoded.request.keymap.setLayerBinding.binding.param1).toBe(42)
    expect(fixture).toEqual(before)
  })

  it.each([
    { value: '&kp', params: [{ value: 'A', params: [] }] },
    { value: '37', params: [{ value: 0, params: [] }, { value: 0, params: [] }] },
    { value: 37, params: [] },
    { value: 37, params: [{ value: 0, params: [] }] },
    { value: 37, params: [0, 0, 0].map(value => ({ value, params: [] })) },
    { value: 37, params: [{ value: '0', params: [] }, { value: 0, params: [] }] },
    { value: 37, params: [{ value: -1, params: [] }, { value: 0, params: [] }] },
    { value: 37, params: [{ value: 0.5, params: [] }, { value: 0, params: [] }] },
    { value: 37, params: [{ value: 4294967296, params: [] }, { value: 0, params: [] }] },
    { value: 37, params: [{ value: 0, params: [{ value: 1, params: [] }] }, { value: 0, params: [] }] }
  ])('refuses lossy or symbolic conversion: %j', binding => {
    expect(core.buildStudioSetLayerBinding(sessionFixture(), 0, 0, binding))
      .toMatchObject({ status: 'refused', reason: 'invalid-binding' })
  })

  it('refuses behavior IDs not enumerated by this session', () => {
    const binding = { value: 99, params: [{ value: 0, params: [] }, { value: 0, params: [] }] }
    expect(core.buildStudioSetLayerBinding(sessionFixture(), 0, 0, binding))
      .toMatchObject({ status: 'refused', reason: 'unknown-behavior-id' })
  })

  it('does not encode an advertised uint32 behavior ID outside the binding sint32 range', () => {
    const fixture = sessionFixture()
    fixture.listAllBehaviors.behaviors.listAllBehaviors.behaviors.push(2147483648)
    fixture.getBehaviorDetails.push({ requestId: 7, behaviors: { getBehaviorDetails: {
      id: 2147483648, displayName: 'Cannot fit a binding', metadata: []
    } } })
    const binding = { value: 2147483648, params: [{ value: 0, params: [] }, { value: 0, params: [] }] }
    expect(core.buildStudioSetLayerBinding(fixture, 0, 0, binding))
      .toMatchObject({ status: 'refused', reason: 'invalid-binding' })
  })

  it.each([[-1, 0], [2, 0], [0.5, 0], [0, -1], [0, 2], [0, NaN]])('refuses invalid locations %s/%s', (layerIndex, keyPosition) => {
    const binding = { value: 37, params: [{ value: 0, params: [] }, { value: 0, params: [] }] }
    expect(core.buildStudioSetLayerBinding(sessionFixture(), layerIndex, keyPosition, binding))
      .toMatchObject({ status: 'refused', reason: 'invalid-location' })
  })

  it('rechecks the supplied session rather than trusting an earlier unlocked selection', () => {
    const fixture = sessionFixture()
    const loaded = core.mapStudioRpcSession(fixture)
    if (loaded.status !== 'ready') throw new Error(JSON.stringify(loaded))
    const binding = loaded.selection.keymap.layers[0][0]
    fixture.getLockState.core.getLockState = 0
    expect(core.buildStudioSetLayerBinding(fixture, 0, 0, binding)).toEqual({ status: 'unavailable', reason: 'locked' })
    expect(core.buildStudioSetLayerBinding(null, 0, 0, binding)).toEqual({ status: 'unavailable', reason: 'missing-session' })
    expect(core.buildStudioSetLayerBinding(changedFixture('macros', []), 0, 0, binding))
      .toMatchObject({ status: 'refused', reason: 'macro-definitions' })
  })
})
