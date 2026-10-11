import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import * as core from './index.js'
import type { ParsedKeymap } from './types.js'

const layout = [{ x: 0, y: 0, row: 0, col: 0 }]
const sourceFixture = (extra = '') => `// exterior prefix\n/ {\n  keymap {\n    compatible = "zmk,keymap";\n    base { bindings = <&mo 2>; };\n    // lower travels\n    low_label: lower { display-name = "Lower"; bindings = <&lt 2 A>; };\n    // raise travels\n    raise { bindings = <&tog 2>; };\n    adjust { bindings = <&sl 1>; };\n  };\n  ${extra}\n};\n// exterior suffix\n`
const fixture = (): ParsedKeymap => core.parseKeymap({
  layer_names: ['Base', 'Lower', 'Raise', 'Adjust'],
  layers: [['&mo 2'], ['&lt 2 A'], ['&tog 2'], ['&sl 1']],
  combos: [{ id: 'scoped', keyPositions: [0], binding: '&to 2', layers: [1, 2, 2] }],
  conditionalLayers: [{ id: 'tri', ifLayers: [1, 2, 2], thenLayer: 3 }],
  sensorBindings: [['&mo 2'], [], ['&inc_dec_kp C_VOL_UP C_VOL_DN'], ['&sl 2']]
})

describe('immutable layer operations', () => {
  it('derives forwarding slots from source, never from stale UI parameter hints', () => {
    const source = sourceFixture('behaviors { dual: dual { compatible = "zmk,behavior-hold-tap"; #binding-cells = <2>; bindings = <&kp>, <&mo>; }; };').replace('&lt 2 A', '&dual A 2')
    const keymap = core.parseKeymap(core.parseDtsKeymap(source))
    keymap.holdTaps![0].params = ['layer', 'code']
    const result = core.operateLayers({ keymap, layout, operation: { kind: 'reorder', order: [0, 2, 1, 3] }, provenance: { kind: 'source', originalSource: source, baseline: keymap } })
    expect(result.ok, result.ok ? '' : result.error).toBe(true)
    if (result.ok) expect(core.encodeKeyBinding(result.keymap.layers[2][0])).toBe('&dual A 1')
  })

  it('rejects changes inside canonical recipe strings, including escaped quotes', () => {
    const keymap = fixture()
    keymap.rgbLayerRecipe = true
    const source = core.buildKeymapCode(layout, keymap).code.replace('MOMENTARY_LAYER_WITH_RGB_COLOR', 'MOMENTARY_LAYER_WITH_RGB_\\"COLOR')
    const baseline = core.parseKeymap(core.parseDtsKeymap(source))
    expect(core.operateLayers({ keymap: baseline, layout, operation: { kind: 'duplicate', index: 1 }, provenance: { kind: 'source', originalSource: source, baseline } })).toMatchObject({ ok: false, error: expect.stringContaining('canonical RGB') })
  })

  it.each([
    'combos { compatible = "zmk,combos"; c { key-positions = <0>; bindings = <&kp A>; timeout-ms = <1 4>; }; };',
    'conditional_layers { compatible = "zmk,conditional-layers"; r { if-layers = <1 2>; then-layer = <3 4>; }; };'
  ])('refuses unrepresented scalar cells before append: %s', extra => {
    const source = sourceFixture(extra)
    const baseline = core.parseKeymap(core.parseDtsKeymap(source))
    expect(core.operateLayers({ keymap: baseline, layout, operation: { kind: 'duplicate', index: 1 }, provenance: { kind: 'source', originalSource: source, baseline } }).ok).toBe(false)
  })

  it.each(['macro_param_1to1', 'macro_param_2to2', 'macro_press', 'macro_release', 'macro_tap', 'macro_pause_for_release'])(
    'rejects a canonical recipe whose internal &%s dependency is overridden', label => {
      const keymap = fixture()
      keymap.rgbLayerRecipe = true
      keymap.layers[1][0] = core.parseKeyBinding('&rgblayer 2 RGB_COLOR_HSB(2,3,4)')
      keymap.holdTaps = [{ code: `&${label}`, nodeName: 'replacement', bindings: ['&kp', '&kp'] }]
      const source = core.buildKeymapCode(layout, keymap).code
      const baseline = core.parseKeymap(core.parseDtsKeymap(source))
      for (const operation of [{ kind: 'duplicate', index: 1 }, { kind: 'reorder', order: [0, 2, 1, 3] }] satisfies core.LayerOperation[]) {
        const result = core.operateLayers({ keymap: baseline, layout, operation, provenance: { kind: 'source', originalSource: source, baseline } })
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.error).toContain(label)
      }
    }
  )

  it('rejects sparse permutations and non-numeric operation indexes', () => {
    const keymap = fixture()
    const order = [0, 1, 2, 3]
    delete order[1]
    expect(core.operateLayers({ keymap, layout, operation: { kind: 'reorder', order }, provenance: { kind: 'source-free' } }).ok).toBe(false)
    expect(core.operateLayers({ keymap, layout, operation: { kind: 'duplicate', index: '1' as unknown as number }, provenance: { kind: 'source-free' } }).ok).toBe(false)
  })

  it('keeps trailing same-line comments with the moved source node', () => {
    const source = sourceFixture().replace('bindings = <&lt 2 A>; };', 'bindings = <&lt 2 A>; }; // lower trailing')
    const keymap = core.parseKeymap(core.parseDtsKeymap(source))
    const result = core.operateLayers({ keymap, layout, operation: { kind: 'reorder', order: [0, 2, 1, 3] }, provenance: { kind: 'source', originalSource: source, baseline: keymap } })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.source).toMatch(/low_label: lower \{[\s\S]*?>; }; \/\/ lower trailing\n\s*adjust/)
  })

  it.each([
    'behaviors { mo: custom { compatible = "zmk,behavior-hold-tap"; #binding-cells = <2>; bindings = <&kp>, <&kp>; }; };',
    'behaviors { kp: custom { compatible = "zmk,behavior-hold-tap"; #binding-cells = <2>; bindings = <&mo>, <&to>; }; };'
  ])('rejects an incompatible stock replacement even if its own forwarding schema is simple: %s', extra => {
    const source = sourceFixture(extra)
    const keymap = core.parseKeymap(core.parseDtsKeymap(source))
    expect(core.operateLayers({ keymap, layout, operation: { kind: 'duplicate', index: 1 }, provenance: { kind: 'source', originalSource: source, baseline: keymap } }).ok).toBe(false)
  })

  it('rejects unresolved layer-count expressions even on the append-only path', () => {
    const keymap = fixture()
    keymap.layers[1][0] = core.parseKeyBinding('&external DT_CHILD_NUM(DT_PATH(keymap))')
    expect(core.operateLayers({ keymap, layout, operation: { kind: 'duplicate', index: 1 }, provenance: { kind: 'source-free' } }).ok).toBe(false)
  })

  it('rejects unproven nested payload expressions on reorder without entering their parameters', () => {
    const keymap = fixture()
    keymap.layers[1][0] = core.parseKeyBinding('&kp EXTERNAL(2)')
    expect(core.operateLayers({ keymap, layout, operation: { kind: 'reorder', order: [0, 2, 1, 3] }, provenance: { kind: 'source-free' } }).ok).toBe(false)
  })

  it('round-trips all base-fixed four-layer permutations and their inverse through JSON-first reload', () => {
    for (const order of [[0, 1, 2, 3], [0, 1, 3, 2], [0, 2, 1, 3], [0, 2, 3, 1], [0, 3, 1, 2], [0, 3, 2, 1]]) {
      const keymap = fixture()
      const result = core.operateLayers({ keymap, layout, operation: { kind: 'reorder', order }, provenance: { kind: 'source-free' } })
      expect(result.ok, result.ok ? '' : result.error).toBe(true)
      if (!result.ok) continue
      if (!result.changed) { expect(result.keymap).toBe(keymap); continue }
      const jsonFirst = core.parseKeymap(JSON.parse(core.buildKeymapCode(layout, result.keymap, { originalSource: result.source! }).json))
      const back = core.operateLayers({ keymap: jsonFirst, layout, operation: { kind: 'reorder', order: result.oldToNew }, provenance: { kind: 'source', originalSource: result.source!, baseline: jsonFirst } })
      expect(back.ok, back.ok ? '' : back.error).toBe(true)
      if (back.ok) expect(back.keymap).toEqual(keymap)
    }
  })

  it('preserves target identity in larger seeded permutations', () => {
    fc.assert(fc.property(fc.integer({ min: 2, max: 12 }), fc.integer(), (count, seed) => {
      const order = [0, ...fc.sample(fc.shuffledSubarray(Array.from({ length: count - 1 }, (_, i) => i + 1), { minLength: count - 1, maxLength: count - 1 }), { seed, numRuns: 1 })[0]]
      const keymap = core.parseKeymap({ layers: Array.from({ length: count }, (_, i) => [`&mo ${i}`]), layer_names: Array.from({ length: count }, (_, i) => `Name ${i}`) })
      const result = core.operateLayers({ keymap, layout, operation: { kind: 'reorder', order }, provenance: { kind: 'source-free' } })
      expect(result.ok, result.ok ? '' : result.error).toBe(true)
      if (result.ok) result.keymap.layers.forEach((row, i) => expect(String(row[0].params[0].value)).toBe(String(i)))
    }), { seed: 300302, numRuns: 60 })
  })

  it.each([[1, 0, 2, 3], [0, 1, 1, 3], [0, 1, 2], [0, 1, 2, 4], [0, 1, 2, 2.5], [0, -1, 2, 3]])('rejects invalid order %j atomically', (...order) => {
    const keymap = fixture()
    const before = structuredClone(keymap)
    expect(core.operateLayers({ keymap, layout, operation: { kind: 'reorder', order }, provenance: { kind: 'source-free' } }).ok).toBe(false)
    expect(keymap).toEqual(before)
  })

  it.each(['L2', 'l2', '0x2', '(1+1)', '-1', '1.5', '02', '4', 'NaN'])('rejects unsupported known layer target %s in both operations', value => {
    const keymap = fixture()
    keymap.layers[0][0].params[0].value = value
    for (const operation of [{ kind: 'duplicate', index: 1 }, { kind: 'reorder', order: [0, 2, 1, 3] }] satisfies core.LayerOperation[]) {
      expect(core.operateLayers({ keymap, layout, operation, provenance: { kind: 'source-free' } }).ok).toBe(false)
    }
  })

  it('retains opaque/excess duplication payloads without aliases and rejects uncertain reorder', () => {
    const keymap = fixture()
    keymap.layers[1][0] = core.parseKeyBinding('&external RAW(&mo(2),3) EXTRA(2,3)')
    keymap.sensorBindings![1] = [core.parseKeyBinding('&inc_dec_kp A B EXTRA(2)')]
    const result = core.operateLayers({ keymap, layout, operation: { kind: 'duplicate', index: 1 }, provenance: { kind: 'source-free' } })
    expect(result.ok, result.ok ? '' : result.error).toBe(true)
    if (result.ok) {
      expect(result.keymap.layers[4]).toEqual(keymap.layers[1])
      result.keymap.layers[4][0].params[0].params[0].params[0].value = '99'
      result.keymap.sensorBindings![4][0].params[2].params[0].value = '99'
      expect(core.encodeKeyBinding(result.keymap.layers[1][0])).toBe('&external RAW(&mo(2),3) EXTRA(2,3)')
      expect(core.encodeKeyBinding(keymap.sensorBindings![1][0])).toBe('&inc_dec_kp A B EXTRA(2)')
    }
    expect(core.operateLayers({ keymap, layout, operation: { kind: 'reorder', order: [0, 2, 1, 3] }, provenance: { kind: 'source-free' } }).ok).toBe(false)
  })

  it('preserves non-layer numeric payloads and every explicit combo filter on duplicate', () => {
    const keymap = fixture()
    keymap.layers[1][0] = core.parseKeyBinding('&bt BT_SEL 2')
    keymap.layers[2][0] = core.parseKeyBinding('&uc 2 3')
    keymap.layers[3][0] = core.parseKeyBinding('&kp LC(F2)')
    keymap.combos = [undefined, [], [0, 1, 2, 3], [1, 2]].map((layers, i) => ({ id: `combo_${i}`, keyPositions: [0], binding: core.parseKeyBinding('&kp A'), layers }))
    const result = core.operateLayers({ keymap, layout, operation: { kind: 'duplicate', index: 1 }, provenance: { kind: 'source-free' } })
    expect(result.ok, result.ok ? '' : result.error).toBe(true)
    if (result.ok) {
      expect(result.keymap.combos).toEqual(keymap.combos)
      expect(result.keymap.combos!.map(c => core.comboAppliesToAnyLayer(c, [4]))).toEqual([true, true, false, false])
      const parsed = core.parseKeymap(core.parseDtsKeymap(result.source!))
      expect(parsed.combos!.map(c => core.comboAppliesToAnyLayer(c, [4]))).toEqual([true, true, false, false])
    }
    const moved = core.operateLayers({ keymap, layout, operation: { kind: 'reorder', order: [0, 2, 1, 3] }, provenance: { kind: 'source-free' } })
    expect(moved.ok, moved.ok ? '' : moved.error).toBe(true)
    if (moved.ok) expect(core.encodeKeymap(moved.keymap).layers).toEqual([['&mo 1'], ['&uc 2 3'], ['&bt BT_SEL 2'], ['&kp LC(F2)']])
  })

  it('requires aligned sensors but keeps absent and explicitly empty rows distinct', () => {
    const keymap = fixture()
    keymap.sensorBindings = [[]]
    expect(core.operateLayers({ keymap, layout, operation: { kind: 'duplicate', index: 1 }, provenance: { kind: 'source-free' } }).ok).toBe(false)
    delete keymap.sensorBindings
    const absent = core.operateLayers({ keymap, layout, operation: { kind: 'duplicate', index: 1 }, provenance: { kind: 'source-free' } })
    expect(absent.ok).toBe(true)
    if (absent.ok) expect(absent.keymap.sensorBindings).toBeUndefined()
  })

  it.each(['#include "custom.dtsi"\n', '#include <custom.dtsi>\n', '#define LOWER 1\n', '#if OPTION\n', '&mo { bindings = <&kp>; };\n'])('rejects unproven preamble %s', prefix => {
    const source = prefix + sourceFixture()
    const keymap = core.parseKeymap(core.parseDtsKeymap(source))
    expect(core.operateLayers({ keymap, layout, operation: { kind: 'duplicate', index: 1 }, provenance: { kind: 'source', originalSource: source, baseline: keymap } }).ok).toBe(false)
  })

  it('refuses template precedence, stale correspondence, unknown metadata and absent provenance', () => {
    const source = sourceFixture()
    const keymap = core.parseKeymap(core.parseDtsKeymap(source))
    const stale = structuredClone(keymap)
    stale.layers[0][0] = core.parseKeyBinding('&kp Z')
    for (const provenance of [
      { kind: 'unverified' },
      { kind: 'source', originalSource: source, baseline: stale },
      { kind: 'source', originalSource: source, baseline: keymap, template: '{{rendered_layers}}' },
      { kind: 'source', originalSource: source.replace('lower {', 'lower { layer-mask = <2>;'), baseline: keymap }
    ] satisfies core.LayerOperationProvenance[]) {
      expect(core.operateLayers({ keymap, layout, operation: { kind: 'duplicate', index: 1 }, provenance }).ok).toBe(false)
    }
  })

  it('duplicates supported display metadata, allocates collision suffixes, and never copies DTS labels', () => {
    const source = sourceFixture().replace('raise {', 'layer_4 {').replace('adjust {', 'layer_4_2 {')
    const keymap = core.parseKeymap(core.parseDtsKeymap(source))
    const result = core.operateLayers({ keymap, layout, operation: { kind: 'duplicate', index: 1 }, provenance: { kind: 'source', originalSource: source, baseline: keymap } })
    expect(result.ok, result.ok ? '' : result.error).toBe(true)
    if (!result.ok) return
    expect(result.source).toMatch(/layer_4_3\s*\{\s*display-name = "lower copy";/)
    expect(result.source!.match(/low_label:/g)).toHaveLength(1)
    expect(core.buildKeymapCode(layout, result.keymap, { originalSource: result.source! }).code).toBe(result.source)
  })

  it('refuses source-only excess RGB arguments instead of blessing parser loss', () => {
    const keymap = fixture()
    keymap.layers[1][0] = core.parseKeyBinding('&rgblayer 2 RGB_COLOR_HSB(2,3,4) EXTRA(2)')
    const source = core.buildKeymapCode(layout, keymap).code
    const baseline = core.parseKeymap(core.parseDtsKeymap(source))
    const result = core.operateLayers({ keymap: baseline, layout, operation: { kind: 'duplicate', index: 1 }, provenance: { kind: 'source', originalSource: source, baseline } })
    expect(result.ok).toBe(false)
  })

  it('supports generated preset/recipe provenance without trusting inferred hold-tap params', () => {
    const keymap = fixture()
    keymap.holdTaps = core.ensureHoldTapPreset([], '&hm')
    keymap.layers[1][0] = core.parseKeyBinding('&hm LCTRL A')
    keymap.layers[2][0] = core.parseKeyBinding('&rgblayer 2 RGB_COLOR_HSB(2,3,4)')
    const result = core.operateLayers({ keymap, layout, operation: { kind: 'reorder', order: [0, 2, 1, 3] }, provenance: { kind: 'source-free' } })
    expect(result.ok, result.ok ? '' : result.error).toBe(true)
    if (result.ok) expect(core.encodeKeyBinding(result.keymap.layers[1][0])).toBe('&rgblayer 1 RGB_COLOR_HSB(2,3,4)')
  })

  it.each([
    'combos { compatible = "zmk,combos"; multi { key-positions = <0>; bindings = <&kp A &mo 2>; }; };',
    'combos { compatible = "zmk,combos"; alias { key-positions = <0>; bindings = <&kp A>; layers = <RAISE>; }; };',
    'combos { compatible = "zmk,combos"; leading { key-positions = <0>; bindings = <&kp A>; layers = <02>; }; };',
    'conditional_layers { compatible = "zmk,conditional-layers"; alias { if-layers = <LOWER 2>; then-layer = <3>; }; };',
    'behaviors { macro: macro { compatible = "zmk,behavior-macro"; #binding-cells = <0>; bindings = <&mo 4>; }; };',
    'behaviors { dual: dual { compatible = "zmk,behavior-hold-tap"; #binding-cells = <2>; bindings = <&mo 2>, <&kp>; }; };',
    'behaviors { dual: dual { compatible = "zmk,behavior-hold-tap"; #binding-cells = <2>; bindings = <&dual>, <&kp>; }; };',
    'behaviors { rgblayer: rgb_layer { compatible = "zmk,behavior-macro-two-param"; #binding-cells = <2>; bindings = <&mo 2>; }; };',
    'other { layer-mask = <4>; };'
  ])('rejects incomplete source graph for both operations: %s', extra => {
    const source = sourceFixture(extra)
    const keymap = core.parseKeymap(core.parseDtsKeymap(source))
    const before = structuredClone(keymap)
    for (const operation of [{ kind: 'duplicate', index: 1 }, { kind: 'reorder', order: [0, 2, 1, 3] }] satisfies core.LayerOperation[]) {
      const result = core.operateLayers({ keymap, layout, operation, provenance: { kind: 'source', originalSource: source, baseline: keymap } })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error).toMatch(/source|root|combos|conditional|behaviors/)
      expect(keymap).toEqual(before)
    }
  })

  it('proves forwarding definitions in either/both slots and canonical RGB without rewriting payloads', () => {
    const keymap = fixture()
    keymap.holdTaps = [
      { code: '&dual', nodeName: 'dual', bindings: ['&kp', '&mo'], params: ['code', 'layer'] },
      { code: '&both', nodeName: 'both', bindings: ['&mo', '&to'], params: ['layer', 'layer'] }
    ]
    keymap.layers[1][0] = core.parseKeyBinding('&dual LS(A) 2')
    keymap.layers[2][0] = core.parseKeyBinding('&both 2 1')
    keymap.layers[3][0] = core.parseKeyBinding('&rgblayer 2 RGB_COLOR_HSB(2,3,4)')
    keymap.rgbLayerRecipe = true
    const source = core.buildKeymapCode(layout, keymap).code
    const baseline = core.parseKeymap(core.parseDtsKeymap(source))
    const result = core.operateLayers({ keymap: baseline, layout, operation: { kind: 'reorder', order: [0, 2, 1, 3] }, provenance: { kind: 'source', originalSource: source, baseline } })
    expect(result.ok, result.ok ? '' : result.error).toBe(true)
    if (!result.ok) return
    expect(core.encodeKeymap(result.keymap).layers).toEqual([['&mo 1'], ['&both 1 2'], ['&dual LS(A) 1'], ['&rgblayer 1 RGB_COLOR_HSB(2,3,4)']])
    const parsed = core.parseKeymap(core.parseDtsKeymap(result.source!))
    expect(parsed.combos![0].layers).toEqual([2, 1, 1])
    expect(parsed.conditionalLayers![0].ifLayers).toEqual([1, 1, 2])
    expect(parsed.holdTaps).toEqual(baseline.holdTaps)
    expect(result.source).toContain('bindings = <&kp>, <&mo>;')
    expect(core.buildKeymapCode(layout, result.keymap, { originalSource: result.source! }).code).toBe(result.source)
  })

  it('moves source node labels, metadata and leading comments with their rows, preserving exterior CRLF bytes', () => {
    const source = sourceFixture().replaceAll('\n', '\r\n')
    const keymap = core.parseKeymap(core.parseDtsKeymap(source))
    const result = core.operateLayers({ keymap, layout, operation: { kind: 'reorder', order: [0, 2, 1, 3] }, provenance: { kind: 'source', originalSource: source, baseline: keymap } })
    expect(result.ok, result.ok ? '' : result.error).toBe(true)
    if (!result.ok) return
    const saved = core.buildKeymapCode(layout, result.keymap, { originalSource: result.source! }).code
    expect(saved).toBe(result.source)
    expect(saved.slice(0, saved.indexOf('base {'))).toBe(source.slice(0, source.indexOf('base {')))
    expect(saved.slice(saved.indexOf('  };\r\n'))).toBe(source.slice(source.indexOf('  };\r\n')))
    expect(saved).toContain('// lower travels\r\n    low_label: lower { display-name = "Lower";')
    expect(saved).toContain('// raise travels\r\n    raise {')
    expect(saved.indexOf('// raise travels')).toBeLessThan(saved.indexOf('// lower travels'))
    expect(saved.replaceAll('\r\n', '')).not.toContain('\n')
    expect(core.parseDtsKeymap(saved).layer_names).toEqual(['base', 'raise', 'lower', 'adjust'])
    const back = core.operateLayers({ keymap: result.keymap, layout, operation: { kind: 'reorder', order: [0, 2, 1, 3] }, provenance: { kind: 'source', originalSource: saved, baseline: result.keymap } })
    expect(back.ok, back.ok ? '' : back.error).toBe(true)
    if (back.ok) expect(core.parseDtsKeymap(back.source!).layer_names).toEqual(keymap.layer_names)
  })

  it.each([0, 1, 3])('appends an independent copy of layer %i with unchanged self targets and global graph', index => {
    const keymap = fixture()
    keymap.layer_names = ['Base', '', 'layer1 copy', 'layer1 copy 2']
    keymap.layers[index][0] = core.parseKeyBinding(`&mo ${index}`)
    keymap.combos!.push({ id: 'global', binding: core.parseKeyBinding('&kp A'), keyPositions: [0] })
    const before = structuredClone(keymap)
    const result = core.operateLayers({ keymap, layout, operation: { kind: 'duplicate', index }, provenance: { kind: 'source-free' } })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.keymap.layers).toHaveLength(5)
    expect(result.keymap.layers[4]).toEqual(keymap.layers[index])
    expect(result.keymap.layer_names?.[4]).toBe(index === 1 ? 'layer1 copy 3' : `${keymap.layer_names[index]} copy`)
    expect(result.keymap.combos).toEqual(keymap.combos)
    expect(result.keymap.conditionalLayers).toEqual(keymap.conditionalLayers)
    expect(result.keymap.sensorBindings?.[4]).toEqual(keymap.sensorBindings?.[index])
    expect(result.source).toContain('layer_4 {')
    result.keymap.layers[4][0].params[0].value = '99'
    expect(result.keymap.layers[index][0]).toEqual(before.layers[index][0])
    expect(keymap).toEqual(before)
  })

  it('maps every proven stock edge once and moves row ownership without mutating the input', () => {
    expect(core).toHaveProperty('operateLayers')
    const keymap = fixture()
    const before = structuredClone(keymap)
    const result = core.operateLayers({ keymap, layout, operation: { kind: 'reorder', order: [0, 2, 1, 3] }, provenance: { kind: 'source-free' } })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.error)
    expect(result.oldToNew).toEqual([0, 2, 1, 3])
    expect(core.encodeKeymap(result.keymap).layers).toEqual([['&mo 1'], ['&tog 1'], ['&lt 1 A'], ['&sl 2']])
    expect(result.keymap.layer_names).toEqual(['Base', 'Raise', 'Lower', 'Adjust'])
    expect(result.keymap.combos![0].layers).toEqual([2, 1, 1])
    expect(core.encodeKeyBinding(result.keymap.combos![0].binding)).toBe('&to 1')
    expect(result.keymap.conditionalLayers![0].ifLayers).toEqual([2, 1, 1])
    expect(core.encodeKeymap(result.keymap).sensorBindings).toEqual([['&mo 1'], ['&inc_dec_kp C_VOL_UP C_VOL_DN'], [], ['&sl 1']])
    expect(keymap).toEqual(before)
    expect(result.source).toContain('if-layers = <1 1 2>')
  })
})
