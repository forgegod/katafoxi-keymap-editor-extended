import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as core from './index.js'

const supported = fs.readFileSync(new URL('../fixtures/corpus/behavior-boundary-supported.keymap', import.meta.url), 'utf8')
const opaque = fs.readFileSync(new URL('../fixtures/corpus/behavior-boundary-opaque.keymap', import.meta.url), 'utf8')

function definitionSource(body: string, label = 'custom'): string {
  return `#include <behaviors.dtsi>
#include <dt-bindings/zmk/keys.h>
#include <dt-bindings/zmk/modifiers.h>
/ { behaviors { ${label}: custom-node { ${body} }; };
keymap { compatible = "zmk,keymap"; base { bindings = <&none>; }; }; };`
}
const holdBody = 'compatible = "zmk,behavior-hold-tap"; #binding-cells = <2>; bindings = <&kp>, <&kp>;'

describe.each([['LF', '\n'], ['CRLF', '\r\n']])('behavior addition locality (%s)', (_name, eol) => {
  it('preserves the exact sticky_shift closer and exterior bytes when adding lazy', () => {
    const closer = '\t  }; // sticky closer stays untouched'
    const source = supported.replace('            bindings = <&kp>;\n        };', `            bindings = <&kp>;\n${closer}`).replaceAll('\n', eol)
    const baseline = core.parseDtsBehaviorDefinitions(source).definitions
    const draft = structuredClone(baseline)
    draft.find(item => item.code === '&sticky_shift')!.properties.lazy = true

    const output = core.spliceBehaviorDefinitionsIntoDts(source, draft, baseline)
    expect(output).toBe(source.replace(closer, `\t      lazy;${eol}${closer}`))
    expect(core.parseDtsBehaviorDefinitions(output).definitions).toEqual(draft)
  })

  it.each([true, false])('preserves the exact closer and exterior bytes when adding a definition (existing container: %s)', (existingContainer) => {
    const closer = '\t  }; // insertion closer stays untouched'
    const source = [
      '#include <behaviors.dtsi>',
      '#include <dt-bindings/zmk/keys.h>',
      '/ {',
      ...(existingContainer ? ['    behaviors {', closer] : []),
      '    keymap { compatible = "zmk,keymap"; base { bindings = <&none>; }; };',
      existingContainer ? '};' : closer,
      '// trailing source stays untouched',
      ''
    ].join(eol)
    const baseline = core.parseDtsBehaviorDefinitions(source).definitions
    const added: core.ZmkBehaviorDefinition = {
      code: '&fresh', label: 'fresh', nodeName: 'fresh-node',
      compatible: 'zmk,behavior-tap-dance', cellProperty: '#binding-cells', arity: 0,
      bindings: ['&kp A'], properties: {}, editable: true, diagnostics: []
    }
    const definition = [
      '        fresh: fresh-node {',
      '            compatible = "zmk,behavior-tap-dance";',
      '            #binding-cells = <0>;',
      '            bindings = <&kp A>;',
      '        };'
    ].join(eol)
    const insertion = existingContainer ? definition : `    behaviors {${eol}${definition}${eol}    };`
    const draft = [...baseline, added]

    const output = core.spliceBehaviorDefinitionsIntoDts(source, draft, baseline)
    expect(output).toBe(source.replace(closer, `\t  ${eol}${insertion}${eol}${closer}`))
    expect(core.parseDtsBehaviorDefinitions(output).definitions).toEqual(draft)
  })
})

describe('bounded behavior definitions', () => {
  it.each(['key', 'combo', 'sensor', 'behavior-child', 'macro-child'] as const)('refuses source-free referenced behavior rename at the writer (%s)', site => {
    const sensor = site === 'sensor'
    const draft = core.parseKeymap(core.parseDtsKeymap(definitionSource(sensor
      ? 'compatible = "zmk,behavior-sensor-rotate"; #sensor-binding-cells = <0>; bindings = <&kp A>, <&kp B>;'
      : 'compatible = "zmk,behavior-tap-dance"; #binding-cells = <0>; bindings = <&kp A>;')))
    draft.rgbLayerRecipe = true
    if (site === 'key') draft.layers[0][0] = core.parseKeyBinding('&custom')
    if (site === 'combo') draft.combos = [{ id: 'chord', keyPositions: [0], binding: core.parseKeyBinding('&custom') }]
    if (sensor) draft.sensorBindings = [[core.parseKeyBinding('&custom')]]
    if (site === 'behavior-child') draft.behaviorDefinitions!.push({ ...draft.behaviorDefinitions![0], code: '&caller', label: 'caller', nodeName: 'caller', bindings: ['&custom'] })
    if (site === 'macro-child') draft.macros = [{ code: '&caller', label: 'caller', nodeName: 'caller', container: 'macros', arity: 0, editable: true, diagnostics: [], steps: [{ kind: 'behavior', binding: '&custom' }] }]
    const layout = [{ x: 0, y: 0 }]
    const options = { allowSourceFreeBehaviors: true, allowSourceFreeMacros: true }
    const baseline = core.buildKeymapCode(layout, draft, options)
    const renamed = core.parseKeymap(JSON.parse(baseline.json))
    Object.assign(renamed.behaviorDefinitions![0], { code: '&renamed', label: 'renamed' })
    const before = structuredClone(renamed)
    expect(() => core.buildKeymapCode(layout, renamed, options)).toThrow(/reference|signature|schema|invocation/i)
    expect(renamed).toEqual(before)
  })

  it.each(['key', 'combo', 'sensor', 'behavior-child', 'macro-child'] as const)('refuses source-free referenced macro rename at the writer (%s)', site => {
    const draft = core.parseKeymap({ layers: [['&none']], behaviorDefinitions: [], macros: [{
      code: '&sequence', label: 'sequence', nodeName: 'sequence', container: 'macros', arity: 0,
      editable: true, diagnostics: [], steps: [{ kind: 'behavior', binding: '&kp A' }]
    }] })
    draft.rgbLayerRecipe = true
    if (site === 'key') draft.layers[0][0] = core.parseKeyBinding('&sequence')
    if (site === 'combo') draft.combos = [{ id: 'chord', keyPositions: [0], binding: core.parseKeyBinding('&sequence') }]
    if (site === 'behavior-child') draft.behaviorDefinitions = [{ code: '&caller', label: 'caller', nodeName: 'caller', compatible: 'zmk,behavior-tap-dance', cellProperty: '#binding-cells', arity: 0, bindings: ['&sequence'], properties: {}, editable: true, diagnostics: [] }]
    if (site === 'macro-child') draft.macros!.push({ ...draft.macros![0], code: '&caller', label: 'caller', nodeName: 'caller', steps: [{ kind: 'behavior', binding: '&sequence' }] })
    const layout = [{ x: 0, y: 0 }]
    const options = { allowSourceFreeBehaviors: true, allowSourceFreeMacros: true }
    const baseline = core.buildKeymapCode(layout, draft, options)
    const renamed = core.parseKeymap(JSON.parse(baseline.json))
    Object.assign(renamed.macros![0], { code: '&renamed', label: 'renamed' })
    // Direct macro sensor calls are never valid, even when their old label vanished.
    if (site === 'sensor') renamed.sensorBindings = [[core.parseKeyBinding('&sequence')]]
    const before = structuredClone(renamed)
    expect(() => core.buildKeymapCode(layout, renamed, options)).toThrow(/reference|signature|schema|invocation/i)
    expect(renamed).toEqual(before)
  })

  it.each([false, true])('keeps the generated RGB recipe outside managed definition ownership (macros: %s)', withMacros => {
    const draft = core.parseKeymap(core.parseDtsKeymap(supported))
    draft.rgbLayerRecipe = true
    draft.layers[0][1] = core.parseKeyBinding('&rgblayer 1 RGB_COLOR_HSB(2,3,4)')
    if (withMacros) draft.macros = [{ code: '&sequence', label: 'sequence', nodeName: 'sequence', container: 'macros', arity: 0,
      steps: [{ kind: 'behavior', binding: '&tap_pair' }], editable: true, diagnostics: [] }]
    const layout = Array.from({ length: 4 }, (_, x) => ({ x, y: 0 }))
    const options = { allowSourceFreeBehaviors: true, allowSourceFreeMacros: true }
    const built = core.buildKeymapCode(layout, draft, options)
    expect(built.code.match(/#include <dt-bindings\/zmk\/rgb.h>/g)).toHaveLength(1)
    expect(built.code.match(/rgblayer:/g)).toHaveLength(1)
    expect(built.code).toContain('&rgblayer 1 RGB_COLOR_HSB(2,3,4)')
    const reload = core.parseKeymap(JSON.parse(built.json))
    expect(reload.behaviorDefinitions?.every(item => item.editable)).toBe(true)
    expect(reload.macros?.some(item => item.code === '&rgblayer')).not.toBe(true)
    expect(core.buildKeymapCode(layout, reload, options).code).toBe(built.code)
    expect(core.parseDtsBehaviorDefinitions(built.code).referenceCoverageComplete).toBe(false)
    const invalid = core.cloneParsedKeymap(draft)
    invalid.layers[0][0] = core.parseKeyBinding('&home_row UNKNOWN A')
    expect(() => core.buildKeymapCode(layout, invalid, options)).toThrow()
  })

  it('does not silently drop stock overrides while assembling source-free definitions', () => {
    const draft = core.parseKeymap(core.parseDtsKeymap(definitionSource(holdBody)))
    draft.holdTaps!.push({ code: '&mt', override: true, tappingTermMs: 180 })
    const before = structuredClone(draft)
    expect(() => core.buildKeymapCode([{ x: 0, y: 0 }], draft, { allowSourceFreeBehaviors: true })).toThrow(/override|coverage/i)
    expect(draft).toEqual(before)
  })

  it.each([false, true])('generates Demo behaviors alongside both named presets (macros: %s)', withMacros => {
    const draft = core.parseKeymap({ layers: [['&hm LSHFT A', '&as LS(B) B', '&dance']] })
    draft.holdTaps = core.ensureHoldTapPreset(core.ensureHoldTapPreset(undefined, '&hm'), '&as')
    draft.behaviorDefinitions = [{ code: '&dance', label: 'dance', nodeName: 'dance',
      compatible: 'zmk,behavior-tap-dance', cellProperty: '#binding-cells', arity: 0,
      bindings: [withMacros ? '&sequence' : '&hm LSHFT A'], properties: {}, editable: true, diagnostics: [] }]
    if (withMacros) draft.macros = [{ code: '&sequence', label: 'sequence', nodeName: 'sequence', container: 'macros', arity: 0,
      steps: [{ kind: 'behavior', binding: '&hm LSHFT A' }], editable: true, diagnostics: [] }]
    const layout = Array.from({ length: 3 }, (_, x) => ({ x, y: 0 }))
    const options = { allowSourceFreeBehaviors: true, allowSourceFreeMacros: true }
    const before = structuredClone(draft)
    const built = core.buildKeymapCode(layout, draft, options)
    const actual = core.parseKeymap(core.parseDtsKeymap(built.code))
    expect(actual.behaviorDefinitions?.map(item => item.code).sort()).toEqual(['&as', '&dance', '&hm'])
    expect(actual.behaviorDefinitions?.every(item => item.editable)).toBe(true)
    // UI parameter hints are not DTS semantics (Homerow's mod is a kp code).
    expect(actual.holdTaps?.map(({ params, ...item }) => item)).toEqual(draft.holdTaps.map(({ params, ...item }) => item))
    const reload = core.parseKeymap(JSON.parse(built.json))
    expect(reload.behaviorDefinitions).toEqual(actual.behaviorDefinitions)
    expect(core.buildKeymapCode(layout, reload, options).code).toBe(built.code)
    expect(core.buildKeymapCode(layout, reload, { originalSource: built.code }).code).toBe(built.code)
    expect(draft).toEqual(before)
  })

  it.each(['quick-release', 'lazy', 'ignore-modifiers'])('reports the bare presence-only requirement for valued flag %s', (name) => {
    const source = definitionSource(`compatible = "zmk,behavior-sticky-key"; #binding-cells = <1>; release-after-ms = <1200>; bindings = <&kp>; ${name} = <1>;`)
    const parsed = core.parseDtsBehaviorDefinitions(source)
    expect(parsed.referenceCoverageComplete).toBe(true)
    expect(parsed.definitions[0]).toMatchObject({
      editable: false,
      diagnostics: [`${name} requires a bare presence-only flag (${name};)`]
    })
    expect(parsed.definitions[0]!.properties).not.toHaveProperty(name)
    expect(core.spliceBehaviorDefinitionsIntoDts(source, parsed.definitions)).toBe(source)
  })

  it('generates explicitly source-free definitions and rejects invalid new key/combo/sensor calls', () => {
    const layout = Array.from({ length: 4 }, (_, x) => ({ x, y: 0 }))
    const draft = core.parseKeymap(core.parseDtsKeymap(supported))
    delete draft.behaviorSourceFingerprint
    expect(draft.holdTaps?.[0]).toMatchObject({ code: '&home_row', nodeName: 'home-row' })
    const written = core.buildKeymapCode(layout, draft, { allowSourceFreeBehaviors: true })
    expect(core.parseDtsBehaviorDefinitions(written.code).definitions).toEqual(draft.behaviorDefinitions)
    expect(core.buildKeymapCode(layout, core.parseKeymap(JSON.parse(written.json)), { originalSource: written.code }).code).toBe(written.code)
    for (const site of ['key', 'combo', 'sensor'] as const) {
      const invalid = core.parseKeymap(core.parseDtsKeymap(supported))
      if (site === 'key') invalid.layers[0]![0] = core.parseKeyBinding('&home_row UNKNOWN A')
      if (site === 'combo') invalid.combos = [{ id: 'bad', keyPositions: [0, 1], binding: core.parseKeyBinding('&sticky_nav 2') }]
      if (site === 'sensor') invalid.sensorBindings![0] = [core.parseKeyBinding('&dial_volume 1')]
      expect(() => core.buildKeymapCode(layout, invalid, { originalSource: supported }), site).toThrow(/invocation|operand|argument/i)
    }
  })
  it('carries definitions through shared save, JSON reload, clone, diff and history snapshots', () => {
    const layout = Array.from({ length: 4 }, (_, x) => ({ x, y: 0 }))
    const baseline = core.parseKeymap(core.parseDtsKeymap(supported))
    expect(baseline.behaviorDefinitions).toHaveLength(6)
    const draft = core.cloneParsedKeymap(baseline)
    draft.behaviorDefinitions![0]!.properties.flavor = 'tap-preferred'
    draft.behaviorDefinitions![0]!.properties['quick-tap-ms'] = 0
    delete draft.behaviorDefinitions![0]!.properties['require-prior-idle-ms']
    expect(core.diffKeymaps(baseline, draft)).toContainEqual(expect.objectContaining({ type: 'behavior_definition', id: '&home_row' }))
    expect(baseline.behaviorDefinitions![0]!.properties.flavor).toBe('balanced')
    const written = core.buildKeymapCode(layout, draft, { originalSource: supported })
    expect(written.mode).toBe('splice')
    expect(written.code).toContain('flavor = "tap-preferred"')
    expect(written.code).toContain('quick-tap-ms = <0>')
    const reload = core.parseKeymap(JSON.parse(written.json))
    expect(() => core.validateKeymapJson(JSON.parse(written.json))).not.toThrow()
    expect(core.buildKeymapCode(layout, reload, { originalSource: written.code }).code).toBe(written.code)
    expect(core.parseKeymap(core.parseDtsKeymap(written.code)).behaviorDefinitions).toEqual(reload.behaviorDefinitions)
    const history = [{ keymap: core.cloneParsedKeymap(baseline), source: supported }, { keymap: core.cloneParsedKeymap(reload), source: written.code }]
    for (const entry of [history[0]!, history[1]!, history[0]!, history[1]!]) {
      expect(core.buildKeymapCode(layout, entry.keymap, { originalSource: entry.source }).code).toBe(entry.source)
    }
    expect(() => core.buildKeymapCode(layout, draft, { originalSource: supported.replace('tapping-term-ms = <280>', 'tapping-term-ms = <281>') })).toThrow(/baseline/i)
    expect(() => core.buildKeymapCode(layout, draft)).toThrow(/source/i)
    expect(() => core.buildKeymapCode(layout, draft, { template: '/ { {{rendered_layers}} };' })).toThrow(/template/i)
  })
  it('generates source-free mixed macro/behavior graphs atomically and still refuses invalid graphs', () => {
    const source = definitionSource(holdBody, 'home_row').replace('keymap {', `
      macros { sequence: sequence { compatible = "zmk,behavior-macro"; #binding-cells = <0>; bindings = <&home_row LSHFT A>; }; };
      keymap {`)
    const draft = core.parseKeymap(core.parseDtsKeymap(source))
    // A behavior -> macro -> behavior chain needs both families before validation.
    draft.behaviorDefinitions!.push({ code: '&dance', label: 'dance', nodeName: 'dance',
      compatible: 'zmk,behavior-tap-dance', cellProperty: '#binding-cells', arity: 0,
      bindings: ['&sequence'], properties: {}, editable: true, diagnostics: [] })
    draft.layers[0]![0] = core.parseKeyBinding('&dance')
    const layout = [{ x: 0, y: 0 }]
    const options = { allowSourceFreeMacros: true, allowSourceFreeBehaviors: true }
    const before = core.cloneParsedKeymap(draft)
    const built = core.buildKeymapCode(layout, draft, options)
    const reloaded = core.parseKeymap(JSON.parse(built.json))
    expect(core.parseKeymap(core.parseDtsKeymap(built.code)).behaviorDefinitions).toEqual(reloaded.behaviorDefinitions)
    expect(core.parseKeymap(core.parseDtsKeymap(built.code)).macros).toEqual(reloaded.macros)
    expect(core.buildKeymapCode(layout, reloaded, { originalSource: built.code }).code).toBe(built.code)
    expect(core.buildKeymapCode(layout, reloaded, options).code).toBe(built.code)
    expect(draft).toEqual(before)
    expect(() => core.buildKeymapCode(layout, draft, { allowSourceFreeBehaviors: true })).toThrow(/source/i)
    for (const binding of ['&dance', '&missing', '&home_row UNKNOWN A']) {
      const invalid = core.cloneParsedKeymap(draft)
      invalid.macros![0]!.steps = [{ kind: 'behavior', binding }]
      expect(() => core.buildKeymapCode(layout, invalid, options), binding).toThrow()
    }
    const collision = core.cloneParsedKeymap(draft)
    collision.behaviorDefinitions![1]!.label = 'sequence'
    collision.behaviorDefinitions![1]!.code = '&sequence'
    expect(() => core.buildKeymapCode(layout, collision, options)).toThrow()
  })
  it('keeps stock-label collisions read-only rather than granting named ownership', () => {
    for (const label of ['mt', 'lt', 'kp', 'sys_reset', 'macro_tap', 'rgblayer']) {
      const source = definitionSource(holdBody, label)
      const parsed = core.parseDtsBehaviorDefinitions(source)
      expect(parsed.definitions[0], label).toMatchObject({ editable: false, diagnostics: expect.arrayContaining([expect.stringMatching(/reserved|stock.*label/i)]) })
      expect(core.spliceBehaviorDefinitionsIntoDts(source, parsed.definitions)).toBe(source)
    }
  })

  it.each([
    ['vendor,extra = <1>;', /vendor,extra/],
    ['tapping_term_ms = <1>;', /tapping_term_ms/],
    ['quick_tap_ms = <1>;', /quick_tap_ms/],
    ['global-quick-tap;', /global-quick-tap/],
    ['hold-while-undecided;', /hold-while-undecided/],
    ['hold-while-undecided-linger;', /hold-while-undecided-linger/],
    ['retro-tap;', /retro-tap/],
    ['hold-trigger-key-positions = <1 2>;', /hold-trigger-key-positions/],
    ['hold-trigger-on-release;', /hold-trigger-on-release/],
    ['tapping-term-ms = <0x10>;', /uint32/],
    ['tapping-term-ms = <-1>;', /uint32/],
    ['tapping-term-ms = <4294967296>;', /uint32/],
    ['tapping-term-ms = <EXPR_TERM>;', /uint32/],
    ['tapping-term-ms = <(1+2)>;', /uint32/],
    ['flavor = "unknown";', /flavor/],
    ['flavor = "balanced"; flavor = "balanced";', /Repeated/],
    ['nested { value = <1>; };', /child node/]
  ])('isolates coverage-clean unsupported property %s', (property, diagnostic) => {
    const source = definitionSource(`${holdBody} ${property}`)
    const parsed = core.parseDtsBehaviorDefinitions(source)
    expect(parsed.referenceCoverageComplete).toBe(true)
    expect(parsed.definitions[0]).toMatchObject({ editable: false, diagnostics: expect.arrayContaining([expect.stringMatching(diagnostic)]) })
    expect(core.spliceBehaviorDefinitionsIntoDts(source, parsed.definitions)).toBe(source)
  })

  it('distinguishes file coverage refusal from isolated opaque-node diagnostics', () => {
    const original = core.parseDtsBehaviorDefinitions(opaque)
    expect(original.referenceCoverageComplete).toBe(false)
    expect(original.definitions.every(item => !item.editable && item.diagnostics.some(reason => /coverage/.test(reason)))).toBe(true)
    expect(core.spliceBehaviorDefinitionsIntoDts(opaque, original.definitions)).toBe(opaque)
    const clean = opaque.replace('#define EXPR_TERM 280', '')
    const isolated = core.parseDtsBehaviorDefinitions(clean)
    expect(isolated.referenceCoverageComplete).toBe(true)
    for (const [index, reason] of [/uint32/, /binding-cells/, /release-after-ms/, /vendor,extra/, /uint32/, /sensor-binding-cells/].entries()) {
      expect(isolated.definitions[index]).toMatchObject({ editable: false, diagnostics: expect.arrayContaining([expect.stringMatching(reason)]) })
    }
  })

  it.each([
    [holdBody.replace('<&kp>, <&kp>', '<&kp A>, <&kp>'), /bare phandles/],
    [holdBody.replace('<2>', '<1>'), /binding-cells/],
    [holdBody.replace('<&kp>, <&kp>', '<&kp>'), /count/],
    [holdBody.replace('zmk,behavior-hold-tap', 'vendor,behavior'), /compatible/],
    ['compatible = "zmk,behavior-sticky-key"; #binding-cells = <1>; release-after-ms = <0>; bindings = <&kp A>;', /bare phandles/],
    ['compatible = "zmk,behavior-sensor-rotate"; #sensor-binding-cells = <0>; label = "OLD"; bindings = <&kp A>, <&kp B>;', /label/],
    ['compatible = "zmk,behavior-tap-dance"; #binding-cells = <0>; bindings = <&custom>;', /Cyclic/]
  ])('preserves unsupported shape or cycle %#', (body, reason) => {
    const source = definitionSource(body)
    const parsed = core.parseDtsBehaviorDefinitions(source)
    expect(parsed.definitions[0]).toMatchObject({ editable: false, diagnostics: expect.arrayContaining([expect.stringMatching(reason)]) })
    expect(core.spliceBehaviorDefinitionsIntoDts(source, parsed.definitions)).toBe(source)
    const draft = structuredClone(parsed.definitions)
    draft[0]!.properties['tapping-term-ms'] = 1
    expect(() => core.spliceBehaviorDefinitionsIntoDts(source, draft)).toThrow(/read-only/)
  })
  it('creates, renames only the label, and deletes only unreferenced definitions', () => {
    const baseline = core.parseDtsBehaviorDefinitions(supported).definitions
    const added = { ...structuredClone(baseline.find(item => item.code === '&tap_pair')!), code: '&fresh', label: 'fresh', nodeName: 'fresh-node' }
    const draft = [...baseline, added]
    const output = core.spliceBehaviorDefinitionsIntoDts(supported, draft, baseline)
    expect(core.parseDtsBehaviorDefinitions(output).definitions).toEqual(draft)
    const renamed = structuredClone(draft)
    renamed.at(-1)!.code = '&renamed'
    renamed.at(-1)!.label = 'renamed'
    const renameOutput = core.spliceBehaviorDefinitionsIntoDts(output, renamed, draft)
    expect(renameOutput).toBe(output.replace('fresh: fresh-node', 'renamed: fresh-node'))
    expect(core.behaviorDeletePreflight(renameOutput, '&renamed')).toEqual({ ok: true, sites: [] })
    const deleted = core.spliceBehaviorDefinitionsIntoDts(renameOutput, baseline, renamed)
    expect(core.parseDtsBehaviorDefinitions(deleted).definitions).toEqual(baseline)
    expect(core.behaviorDeletePreflight(supported, '&sticky_nav')).toMatchObject({ ok: false, sites: [{ kind: 'key', path: 'keymap.lower.bindings[0]' }] })
    expect(() => core.spliceBehaviorDefinitionsIntoDts(supported, baseline.filter(item => item.code !== '&sticky_nav'), baseline)).toThrow(/incoming.*keymap.lower/i)
    for (const label of ['kp', 'sys_reset', 'reset', 'inc_dec_kp', 'macro_tap', 'rgblayer', 'home_row']) {
      expect(() => core.spliceBehaviorDefinitionsIntoDts(supported, [...baseline, { ...added, code: `&${label}`, label }], baseline), label).toThrow(/collid|unique|reserved/i)
    }
  })
  it('edits children and revalidates transitive incoming signatures without mutation on refusal', () => {
    const source = supported.replace('<&kp A>, <&kp B>', '<&sticky_shift A>, <&kp B>')
    const baseline = core.parseDtsBehaviorDefinitions(source).definitions
    const valid = structuredClone(baseline)
    valid.find(item => item.code === '&tap_pair')!.bindings = ['&kp C', '&kp B']
    expect(core.spliceBehaviorDefinitionsIntoDts(source, valid, baseline)).toBe(source.replace('<&sticky_shift A>, <&kp B>', '<&kp C>, <&kp B>'))
    const draft = structuredClone(baseline)
    draft.find(item => item.code === '&sticky_shift')!.bindings = ['&mo']
    const snapshot = structuredClone({ baseline, draft, source })
    expect(() => core.spliceBehaviorDefinitionsIntoDts(source, draft, baseline)).toThrow(/layer|incoming|caller/i)
    expect({ baseline, draft, source }).toEqual(snapshot)
    const cycle = structuredClone(baseline)
    cycle.find(item => item.code === '&tap_pair')!.bindings = ['&tap_pair']
    expect(() => core.spliceBehaviorDefinitionsIntoDts(source, cycle, baseline)).toThrow(/cyclic/i)
  })
  it('validates typed forwarded and complete invocations through the shared graph', () => {
    expect(core.validateBehaviorInvocation(supported, '&home_row LSHFT A')).toEqual([])
    expect(core.validateBehaviorInvocation(supported, '&sticky_nav 1')).toEqual([])
    for (const binding of ['&home_row A', '&home_row A B C', '&home_row UNKNOWN A', '&sticky_nav A', '&sticky_nav 2', '&tap_pair A', '&dial_volume']) {
      expect(core.validateBehaviorInvocation(supported, binding), binding).not.toEqual([])
    }
    expect(core.validateBehaviorInvocation(supported, '&dial_volume', 'sensor')).toEqual([])
    expect(core.validateBehaviorInvocation(supported, '&sticky_nav 1', 'sensor')).not.toEqual([])
    const invalid = supported.replace('<&kp A>, <&kp B>', '<&sticky_nav A>, <&kp B>')
    expect(core.parseDtsBehaviorDefinitions(invalid).definitions.find(item => item.code === '&tap_pair')).toMatchObject({ editable: false, diagnostics: expect.arrayContaining([expect.stringMatching(/layer/)]) })
    const nested = supported.replace('<&kp A>, <&kp B>', '<&sticky_nav 1>, <&kp B>')
    expect(core.parseDtsBehaviorDefinitions(nested).definitions.every(item => item.editable)).toBe(true)
  })
  it('round-trips sensor-rotate zero timing with its distinct cell property', () => {
    const baseline = core.parseDtsBehaviorDefinitions(supported).definitions
    expect(baseline.find(item => item.code === '&dial_volume')).toMatchObject({
      arity: 0, cellProperty: '#sensor-binding-cells', editable: true,
      bindings: ['&kp C_VOL_UP', '&kp C_VOL_DN'], properties: { 'tap-ms': 5 }
    })
    const draft = structuredClone(baseline)
    draft.find(item => item.code === '&dial_volume')!.properties['tap-ms'] = 0
    expect(core.spliceBehaviorDefinitionsIntoDts(supported, draft, baseline)).toBe(supported.replace('tap-ms = <5>', 'tap-ms = <0>'))
  })
  it('round-trips mod-morph required zero and optional keep-mods absence', () => {
    const baseline = core.parseDtsBehaviorDefinitions(supported).definitions
    expect(baseline.find(item => item.code === '&shift_pair')).toMatchObject({
      arity: 0, editable: true, bindings: ['&kp C', '&kp D'], properties: { mods: 34 }
    })
    const draft = structuredClone(baseline)
    const morph = draft.find(item => item.code === '&shift_pair')!
    expect(morph.properties).not.toHaveProperty('keep-mods')
    morph.properties.mods = 0
    morph.properties['keep-mods'] = 0
    const output = core.spliceBehaviorDefinitionsIntoDts(supported, draft, baseline)
    expect(output).toContain('mods = <0>;')
    expect(output).toContain('keep-mods = <0>;')
    expect(core.parseDtsBehaviorDefinitions(output).definitions).toEqual(draft)
    delete morph.properties['keep-mods']
    expect(core.spliceBehaviorDefinitionsIntoDts(output, draft)).not.toContain('keep-mods')
    delete morph.properties.mods
    expect(() => core.spliceBehaviorDefinitionsIntoDts(output, draft)).toThrow(core.KeymapValidationError)
  })
  it('round-trips tap-dance complete children and removes optional timing', () => {
    const baseline = core.parseDtsBehaviorDefinitions(supported).definitions
    expect(baseline.find(item => item.code === '&tap_pair')).toMatchObject({
      arity: 0, editable: true, bindings: ['&kp A', '&kp B']
    })
    const draft = structuredClone(baseline)
    delete draft.find(item => item.code === '&tap_pair')!.properties['tapping-term-ms']
    const output = core.spliceBehaviorDefinitionsIntoDts(supported, draft, baseline)
    expect(output).toBe(supported.replace('tapping-term-ms = <200>;', ''))
    expect(core.parseDtsBehaviorDefinitions(output).definitions).toEqual(draft)
  })
  it('edits sticky-key and sticky-layer flags without materializing defaults', () => {
    const baseline = core.parseDtsBehaviorDefinitions(supported).definitions
    for (const [code, child] of [['&sticky_shift', '&kp'], ['&sticky_nav', '&mo']]) {
      expect(baseline.find(item => item.code === code)).toMatchObject({
        compatible: 'zmk,behavior-sticky-key', arity: 1, bindings: [child], editable: true,
        properties: { 'quick-release': true }
      })
    }
    const draft = structuredClone(baseline)
    const sticky = draft.find(item => item.code === '&sticky_shift')!
    sticky.properties['release-after-ms'] = 0
    delete sticky.properties['quick-release']
    sticky.properties.lazy = true
    sticky.properties['ignore-modifiers'] = true
    const output = core.spliceBehaviorDefinitionsIntoDts(supported, draft, baseline)
    expect(output).toContain('release-after-ms = <0>;')
    expect(core.parseDtsBehaviorDefinitions(output).definitions).toEqual(draft)
    expect(output.slice(output.indexOf('sticky_nav:'))).toBe(supported.slice(supported.indexOf('sticky_nav:')))
    expect(baseline.find(item => item.code === '&sticky_nav')!.properties).not.toHaveProperty('lazy')
  })
  it('round-trips hold-tap identity and edits only an owned scalar value', () => {
    const parsed = core.parseDtsBehaviorDefinitions(supported)
    const hold = parsed.definitions.find(item => item.code === '&home_row')!
    expect(hold).toMatchObject({
      label: 'home_row', nodeName: 'home-row', compatible: 'zmk,behavior-hold-tap',
      cellProperty: '#binding-cells', arity: 2, bindings: ['&kp', '&kp'],
      properties: { 'tapping-term-ms': 280, 'quick-tap-ms': 175, 'require-prior-idle-ms': 150, flavor: 'balanced' },
      editable: true, diagnostics: []
    })
    const draft = structuredClone(parsed.definitions)
    draft.find(item => item.code === '&home_row')!.properties['tapping-term-ms'] = 0
    const output = core.spliceBehaviorDefinitionsIntoDts(supported, draft, parsed.definitions)
    expect(output).toBe(supported.replace('tapping-term-ms = <280>', 'tapping-term-ms = <0>'))
    expect(core.parseDtsBehaviorDefinitions(output).definitions.find(item => item.code === '&home_row')!.properties['tapping-term-ms']).toBe(0)
  })
})
