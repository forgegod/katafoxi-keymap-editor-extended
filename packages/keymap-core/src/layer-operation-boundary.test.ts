import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  bindingReferencesLayer,
  buildKeymapCode,
  cloneParsedKeymap,
  comboAppliesToAnyLayer,
  conditionalLayersMatch,
  encodeKeyBinding,
  encodeKeymap,
  parseDtsKeymap,
  parseKeyBinding,
  parseKeymap,
  remapLayerRefBindingAfterDelete,
  spliceBindingsIntoDts,
  toggleComboLayer
} from './index.js'
import type { LayoutKey } from './types.js'

// CHG-003 phase 1: evidence about existing seams, NOT a reorder implementation.
// Set CHG003_RED=1 to expose the expected failures as ordinary failing assertions.
// Keep these probes separate from future operation acceptance tests in the CHG.
const boundary = process.env.CHG003_RED === '1' ? it : it.fails
const layout: LayoutKey[] = [{ x: 0, y: 0, row: 0, col: 0 }]
const layersSource = `    keymap {
        compatible = "zmk,keymap";
        base { bindings = <&kp A>; };
        lower { display-name = "Lower"; bindings = <&kp B>; };
        raise { display-name = "Raise"; bindings = <&kp C>; };
        adjust { bindings = <&kp D>; };
    };`
const sourceWith = (extra = '') => `/ {\n${layersSource}\n${extra}\n};\n`

const opaqueSources = [
  {
    name: 'macro body with a literal layer target',
    extra: 'behaviors { jump: jump { compatible = "zmk,behavior-macro"; #binding-cells = <0>; bindings = <&mo 2>; }; };',
    warning: undefined,
    omitted: undefined
  },
  {
    name: 'combo filter alias even with a numeric sibling',
    extra: 'combos { compatible = "zmk,combos"; symbolic { key-positions = <0>; bindings = <&kp A>; layers = <RAISE>; }; numeric { key-positions = <0>; bindings = <&mo 2>; layers = <2>; }; };',
    warning: 'combos_unparsed',
    omitted: 'combos' as const
  },
  {
    name: 'conditional rule alias even with a numeric sibling',
    extra: 'conditional_layers { compatible = "zmk,conditional-layers"; symbolic { if-layers = <LOWER 2>; then-layer = <3>; }; numeric { if-layers = <1 2>; then-layer = <3>; }; };',
    warning: 'conditional_layers_unparsed',
    omitted: 'conditionalLayers' as const
  },
  {
    name: 'hold-tap behavior body with fixed arguments',
    extra: 'behaviors { dual: dual { compatible = "zmk,behavior-hold-tap"; #binding-cells = <2>; bindings = <&mo 2>, <&kp>; }; };',
    warning: undefined,
    omitted: undefined
  },
  {
    name: 'same-named noncanonical rgblayer definition',
    extra: 'behaviors { rgblayer: rgb_layer { compatible = "zmk,behavior-macro-two-param"; #binding-cells = <2>; bindings = <&mo 2>; }; };',
    warning: undefined,
    omitted: undefined
  }
]

describe('CHG-003 source-only reference inventory (current behavior)', () => {
  it.each(opaqueSources)('preserves $name without proving it remappable', ({ extra, warning, omitted }) => {
    const source = sourceWith(extra)
    const raw = parseDtsKeymap(source)
    if (warning) expect(raw.warnings).toContain(warning)
    else expect(raw.warnings).toEqual([])
    if (omitted) expect(raw[omitted]).toBeUndefined()
    const model = parseKeymap(raw)
    const built = buildKeymapCode(layout, model, { originalSource: source })
    expect(built.mode).toBe('splice')
    expect(built.code).toBe(source)
    // Parse warnings are not model provenance; absence of warnings is not safety.
    expect(model).not.toHaveProperty('warnings')
  })

  it('loses fixed hold-tap arguments while retaining plausible slot hints', () => {
    const model = parseKeymap(parseDtsKeymap(sourceWith(opaqueSources[3].extra)))
    expect(model.holdTaps?.[0].bindings).toEqual(['&mo', '&kp'])
    expect(model.holdTaps?.[0].params).toEqual(['layer', 'code'])
    expect(model.holdTaps?.[0]).not.toHaveProperty('bindingArguments')
  })

  it('does not resolve an included source merely because the local parse is clean', () => {
    const source = '#include "external-behaviors.dtsi"\n' + sourceWith()
    const raw = parseDtsKeymap(source)
    expect(raw.warnings).toEqual([])
    expect(buildKeymapCode(layout, parseKeymap(raw), { originalSource: source }).code).toBe(source)
  })

  it('represents a declared second-slot layer but the delete helper leaves it unchanged', () => {
    const extra = 'behaviors { dual: dual { compatible = "zmk,behavior-hold-tap"; #binding-cells = <2>; bindings = <&kp>, <&mo>; }; };'
    const model = parseKeymap(parseDtsKeymap(sourceWith(extra)))
    expect(model.holdTaps?.[0].bindings).toEqual(['&kp', '&mo'])
    expect(model.holdTaps?.[0].params).toEqual(['code', 'layer'])
    const node = parseKeyBinding('&dual A 2')
    // Correct for this schema-free helper. Declaration-aware remapping belongs
    // to the future operation, not a new expectation on deletion traversal.
    expect(remapLayerRefBindingAfterDelete(node, 1).node).toEqual(node)
  })

  it('omits later combo bindings from the model and drops them when a combo edit forces serialization', () => {
    const source = sourceWith('combos { compatible = "zmk,combos"; multi { key-positions = <0>; bindings = <&kp A &mo 2>; }; };')
    const raw = parseDtsKeymap(source)
    expect(raw.warnings).toEqual([])
    expect(raw.combos?.[0].binding).toBe('&kp A')
    const model = parseKeymap(raw)
    expect(buildKeymapCode(layout, model, { originalSource: source }).code).toBe(source)
    model.combos![0].timeoutMs = 25
    const built = buildKeymapCode(layout, model, { originalSource: source })
    expect(built.mode).toBe('splice')
    expect(built.code).toContain('bindings = <&kp A>;')
    expect(built.code).not.toContain('&mo 2')
    expect(parseDtsKeymap(built.code).combos?.[0].binding).toBe('&kp A')
    expect(parseDtsKeymap(built.code).combos?.[0].timeoutMs).toBe(25)
    // Preflight must inspect every source binding, not just this lossy model.
  })

  it('distinguishes source-only absence from an explicit request to remove combos', () => {
    const source = sourceWith(opaqueSources[1].extra)
    const model = parseKeymap(parseDtsKeymap(source))
    expect(model.combos).toBeUndefined()
    expect(cloneParsedKeymap(model).combos).toBeUndefined()
    expect(buildKeymapCode(layout, { ...model, combos: [] }, { originalSource: source }).code)
      .not.toContain('symbolic {')
  })
})

describe('CHG-003 graph-carrier regressions (not permutation acceptance)', () => {
  it('saves conditional prerequisites in numeric order without removing duplicates', () => {
    const model = parseKeymap({
      layers: [['&kp A'], ['&kp B'], ['&kp C'], ['&kp D']],
      conditionalLayers: [{ id: 'tri', ifLayers: [2, 1, 2], thenLayer: 3 }]
    })
    for (const options of [{}, { originalSource: sourceWith() }]) {
      const built = buildKeymapCode(layout, model, options)
      expect(built.code).toContain('if-layers = <1 2 2>;')
      const reloaded = parseKeymap(parseDtsKeymap(built.code))
      expect(reloaded.conditionalLayers).toEqual([{ id: 'tri', ifLayers: [1, 2, 2], thenLayer: 3 }])
      expect(conditionalLayersMatch(model.conditionalLayers![0], reloaded.conditionalLayers![0])).toBe(true)
      expect(conditionalLayersMatch({ ifLayers: [1, 2], thenLayer: 3 }, reloaded.conditionalLayers![0])).toBe(false)
      expect(buildKeymapCode(layout, reloaded, { originalSource: built.code }).code)
        .toContain('if-layers = <1 2 2>;')
    }
    expect(model.conditionalLayers?.[0].ifLayers).toEqual([2, 1, 2])
    // Fingerprint-equal no-op splices retain original bytes, including order.
    const source = sourceWith('conditional_layers { compatible = "zmk,conditional-layers"; tri { if-layers = <2 1 2>; then-layer = <3>; }; };')
    expect(buildKeymapCode(layout, parseKeymap(parseDtsKeymap(source)), { originalSource: source }).code)
      .toBe(source)
  })

  it('treats absent, empty and editor-collapsed full combo filters as global on a future layer', () => {
    const collapsed = toggleComboLayer({ layers: [0, 1, 2] }, 3, 4)
    expect(collapsed).toBeUndefined()
    for (const layers of [undefined, [], collapsed]) {
      const model = parseKeymap({
        layers: [['&kp A'], ['&kp B'], ['&kp C'], ['&kp D']],
        combos: [{ id: 'global', keyPositions: [0], binding: '&kp B', layers }]
      })
      expect(comboAppliesToAnyLayer(model.combos![0], [4])).toBe(true)
      const reloaded = parseDtsKeymap(buildKeymapCode(layout, model).code)
      expect(reloaded.combos?.[0].layers).toBeUndefined()
      expect(comboAppliesToAnyLayer(reloaded.combos![0], [4])).toBe(true)
    }
    const subset = { layers: [1, 2] }
    expect(comboAppliesToAnyLayer(subset, [4])).toBe(false)
    expect(subset.layers).toEqual([1, 2])
  })

  it('keeps an imported full enumeration scoped through no-op and forced combo serialization', () => {
    const source = sourceWith('combos { compatible = "zmk,combos"; explicit_all { key-positions = <0>; bindings = <&kp B>; layers = <0 1 2 3>; }; };')
    const model = parseKeymap(parseDtsKeymap(source))
    const combo = model.combos![0]
    expect(combo.layers).toEqual([0, 1, 2, 3])
    for (const layer of [0, 1, 2, 3]) {
      expect(comboAppliesToAnyLayer(combo, [layer])).toBe(true)
    }
    expect(comboAppliesToAnyLayer(combo, [4])).toBe(false)
    expect(buildKeymapCode(layout, model, { originalSource: source }).code).toBe(source)

    // Force the existing writer, not merely its fingerprint-equal short circuit.
    // This characterizes filter preservation, not a duplicate operation.
    combo.timeoutMs = 25
    for (const options of [{}, { originalSource: source }]) {
      const built = buildKeymapCode(layout, model, options)
      expect(built.code).toContain('layers = <0 1 2 3>;')
      const reloaded = parseKeymap(parseDtsKeymap(built.code))
      expect(reloaded.combos?.[0].layers).toEqual([0, 1, 2, 3])
      expect(reloaded.combos?.[0].timeoutMs).toBe(25)
      expect(comboAppliesToAnyLayer(reloaded.combos![0], [4])).toBe(false)
    }
    expect(combo.layers).toEqual([0, 1, 2, 3])
  })

  it('allocates appended DTS nodes from layer_N rather than UI copy names', () => {
    const source = sourceWith().replace('lower {', 'layer_4 {').replace('raise {', 'layer_4_2 {')
    const model = parseKeymap(parseDtsKeymap(source))
    model.layers.push([parseKeyBinding('&kp E')])
    model.layer_names!.push('Lower copy')
    const built = buildKeymapCode(layout, model, { originalSource: source })
    expect(parseDtsKeymap(built.code).layer_names).toEqual(['base', 'layer_4', 'layer_4_2', 'adjust', 'layer_4_3'])
    expect(built.code).not.toContain('Lower copy')
  })

  it('round-trips repeated targets in keys, combo outputs/filters, rules, sensors and recipes', () => {
    const model = parseKeymap({
      layer_names: ['Base', 'Lower', 'Raise', 'Adjust'],
      layers: [['&mo 2'], ['&lt 2 A'], ['&tog 2'], ['&rgblayer 2 RGB_COLOR_HSB(2,3,4)']],
      combos: [
        { id: 'scoped', keyPositions: [0], binding: '&to 2', layers: [1, 2], timeoutMs: 25 },
        { id: 'global', keyPositions: [0], binding: '&sl 2' }
      ],
      conditionalLayers: [{ id: 'tri', ifLayers: [1, 2], thenLayer: 3 }],
      sensorBindings: [['&mo 2'], [], ['&inc_dec_kp C_VOL_UP C_VOL_DN'], ['&sl 2']],
      rgbLayerRecipe: true
    })
    const encoded = encodeKeymap(model)
    expect(parseKeymap(encoded)).toEqual(model)
    const copy = cloneParsedKeymap(model)
    expect(copy).toEqual(model)
    copy.layers[0][0].params[0].value = '1'
    copy.sensorBindings![0][0].params[0].value = '1'
    copy.combos![0].layers![0] = 0
    copy.conditionalLayers![0].ifLayers[0] = 0
    expect(encodeKeymap(model)).toEqual(encoded)

    const built = buildKeymapCode(layout, model)
    const reloaded = parseKeymap(parseDtsKeymap(built.code))
    expect(encodeKeymap(reloaded).layers).toEqual(encoded.layers)
    expect(reloaded.combos).toEqual(model.combos)
    expect(reloaded.conditionalLayers).toEqual(model.conditionalLayers)
    expect(reloaded.sensorBindings).toEqual(model.sensorBindings)
    expect(reloaded.combos?.[1].layers).toBeUndefined()
  })

  it('preserves opaque/excess arguments and numeric non-layer payloads through clone and encoding', () => {
    const tokens = ['&external 2 RAW(2,3)', '&reset 2', '&bt BT_SEL 2', '&kp A EXTRA(2,3)', '&inc_dec_cp 2 3']
    const model = parseKeymap({ layers: [tokens] })
    expect(encodeKeymap(cloneParsedKeymap(model)).layers).toEqual([tokens])
    const copy = cloneParsedKeymap(model)
    copy.layers[0][0].params[1].params[0].value = '99'
    expect(encodeKeymap(model).layers).toEqual([tokens])
  })

  it('characterizes every base-fixed four-layer permutation: splicing moves rows, not node identities', () => {
    const source = sourceWith()
    const raw = parseDtsKeymap(source)
    const permutations = [[0, 1, 2, 3], [0, 1, 3, 2], [0, 2, 1, 3], [0, 2, 3, 1], [0, 3, 1, 2], [0, 3, 2, 1]]
    for (const order of permutations) {
      // Deliberately only permute rows: demonstrate why this is NOT a reorder operation.
      const rows = order.map(old => raw.layers[old])
      const built = spliceBindingsIntoDts(source, { layout, layers: rows })
      const reloaded = parseDtsKeymap(built)
      expect(reloaded.layers).toEqual(rows)
      expect(reloaded.layer_names).toEqual(raw.layer_names)
      expect(built).toContain('lower { display-name = "Lower";')
      expect(built).toContain('raise { display-name = "Raise";')
    }
  })

  it('preserves plain opaque numeric parameters through the existing delete helper for generated targets', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 31 }), layer => {
      const node = parseKeyBinding(`&external ${layer} RAW(${layer},0)`)
      const before = encodeKeyBinding(node)
      expect(encodeKeyBinding(remapLayerRefBindingAfterDelete(node, 0).node)).toBe(before)
      expect(encodeKeyBinding(node)).toBe(before)
    }), { seed: 3003, numRuns: 100 })
  })
})

describe('CHG-003 proposed safety assertions against existing unsafe seams', () => {
  boundary('RED: numeric opaque arguments are not proven layer edges by a two-argument shape', () => {
    expect(bindingReferencesLayer(parseKeyBinding('&external 2 A'), 2)).toBe(false)
  })

  boundary('RED: a generic deletion walk must not rewrite an opaque nested subtree', () => {
    const node = { value: '&external', params: [parseKeyBinding('&mo 2')] }
    expect(remapLayerRefBindingAfterDelete(node, 1).node).toEqual(node)
  })

  boundary('RED: row-only splice is not a logical layer move preserving source identity', () => {
    const source = sourceWith()
    const raw = parseDtsKeymap(source)
    const built = spliceBindingsIntoDts(source, {
      layout,
      layers: [raw.layers[0], raw.layers[2], raw.layers[1], raw.layers[3]]
    })
    expect(parseDtsKeymap(built).layer_names).toEqual(['base', 'raise', 'lower', 'adjust'])
  })
})
