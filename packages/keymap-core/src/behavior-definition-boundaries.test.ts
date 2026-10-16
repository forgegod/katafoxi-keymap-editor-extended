import { describe, expect, it } from 'vitest'
import * as core from './index.js'

const layout = [{ x: 0, y: 0 }]
const headers = '#include <behaviors.dtsi>\n#include <dt-bindings/zmk/keys.h>\n#include <dt-bindings/zmk/modifiers.h>\n#include <dt-bindings/zmk/bt.h>\n'
const dance = (label: string, child = '&kp A', name = `${label}-node`) => `${label}: ${name} { compatible = "zmk,behavior-tap-dance"; #binding-cells = <0>; bindings = <${child}>; };`
const sticky = (label: string, child = '&kp') => `${label}: ${label}-node { compatible = "zmk,behavior-sticky-key"; #binding-cells = <1>; release-after-ms = <100>; bindings = <${child}>; };`
const macro = (label: string, child: string) => `${label}: ${label}-node { compatible = "zmk,behavior-macro"; #binding-cells = <0>; bindings = <${child}>; };`
const document = (behaviors: string, extra = '', binding = '&none') => `${headers}/ { behaviors { ${behaviors} }; ${extra} keymap { compatible = "zmk,keymap"; base { bindings = <${binding}>; }; }; };`
const model = (source: string) => core.parseKeymap(core.parseDtsKeymap(source))
const save = (source: string, draft = model(source)) => core.buildKeymapCode(layout, draft, { originalSource: source })

function reloadPair(written: ReturnType<typeof save>): void {
  const reloaded = core.parseKeymap(JSON.parse(written.json))
  expect(save(written.code, reloaded).code).toBe(written.code)
  expect(reloaded.behaviorDefinitions).toEqual(model(written.code).behaviorDefinitions ?? [])
  core.validateKeymapJson(JSON.parse(written.json))
}

describe('CHG-006 domain boundaries', () => {
  it('keeps opaque siblings byte-identical through CRLF property edits and JSON reload', () => {
    const opaqueNode = dance('opaque').replace('bindings =', 'vendor,unknown = <0xDEAD>; /* preserve me */ bindings =')
    const source = document(`${dance('first')}\n${opaqueNode}`).replaceAll('\n', '\r\n')
    const draft = model(source)
    draft.behaviorDefinitions![0]!.properties['tapping-term-ms'] = 0
    const written = save(source, draft)
    expect(written.code).toContain(opaqueNode)
    expect(written.code.replaceAll('\r\n', '')).not.toContain('\n')
    reloadPair(written)
  })

  it('round-trips every optional hold-tap uint at zero and every pinned flavor without defaults', () => {
    const hold = 'first: first-node { compatible = "zmk,behavior-hold-tap"; #binding-cells = <2>; bindings = <&kp>, <&kp>; };'
    const source = document(hold)
    for (const name of ['tapping-term-ms', 'quick-tap-ms', 'require-prior-idle-ms']) {
      const draft = model(source)
      expect(draft.behaviorDefinitions![0]!.properties).toEqual({})
      draft.behaviorDefinitions![0]!.properties[name] = 0
      const written = save(source, draft)
      expect(model(written.code).behaviorDefinitions![0]!.properties).toEqual({ [name]: 0 })
      reloadPair(written)
      const removal = model(written.code)
      delete removal.behaviorDefinitions![0]!.properties[name]
      expect(model(save(written.code, removal).code).behaviorDefinitions![0]!.properties).toEqual({})
    }
    for (const flavor of ['hold-preferred', 'balanced', 'tap-preferred', 'tap-unless-interrupted']) {
      const draft = model(source)
      draft.behaviorDefinitions![0]!.properties.flavor = flavor
      reloadPair(save(source, draft))
    }
  })

  it('isolates all behavior metadata in consumer history snapshots and invalidates a malformed list as a whole', () => {
    const source = document(dance('first'))
    const baseline = model(source)
    const draft = core.cloneParsedKeymap(baseline)
    draft.behaviorDefinitions![0]!.bindings[0] = '&kp B'
    draft.behaviorDefinitions![0]!.properties['tapping-term-ms'] = 0
    draft.behaviorDefinitions![0]!.diagnostics.push('not ownership proof')
    expect(baseline.behaviorDefinitions![0]).toMatchObject({ bindings: ['&kp A'], properties: {}, diagnostics: [] })
    expect(core.diffKeymaps(baseline, draft)).toMatchObject([{ type: 'behavior_definition', id: '&first' }])
    const written = save(source, draft)
    const entries = [{ source, model: baseline }, { source: written.code, model: model(written.code) }]
    for (const entry of [entries[0]!, entries[1]!, entries[0]!, entries[1]!]) expect(save(entry.source, core.cloneParsedKeymap(entry.model)).code).toBe(entry.source)
    const malformed = core.parseKeymap({ ...JSON.parse(written.json), behaviorDefinitions: [...draft.behaviorDefinitions!, { label: 'broken' }] })
    expect(malformed.behaviorDefinitions).toBeUndefined()
    expect(save(written.code, malformed).code).toBe(written.code)
  })

  it.each(['constructor', 'toString', '__proto__'])('does not inherit a compatible schema named %s', (name) => {
    const source = document(dance('first').replace('zmk,behavior-tap-dance', name))
    const parsed = core.parseDtsBehaviorDefinitions(source)
    expect(parsed.definitions[0]).toMatchObject({ editable: false, diagnostics: expect.arrayContaining([`Unsupported behavior compatible: ${name}`]) })
    expect(save(source).code).toBe(source)
  })

  it.each(['constructor', 'toString', '__proto__'])('does not inherit schema properties named %s', (name) => {
    const source = document(dance('first').replace('bindings =', `${name} = "opaque"; bindings =`))
    const parsed = core.parseDtsBehaviorDefinitions(source)
    expect(parsed.definitions[0]).toMatchObject({ editable: false, diagnostics: expect.arrayContaining([`Unsupported behavior property: ${name}`]) })
    expect(save(source).code).toBe(source)
  })

  it('does not let legacy hold-tap metadata bypass referenced-definition deletion preflight', () => {
    const hold = 'first: first-node { compatible = "zmk,behavior-hold-tap"; #binding-cells = <2>; tapping-term-ms = <200>; bindings = <&kp>, <&kp>; };'
    const source = document(hold, '', '&first LSHFT A')
    const draft = model(source)
    draft.holdTaps = []
    expect(() => save(source, draft)).toThrow(/incoming|referenced/i)
  })

  it('requires explicit source-free provenance and preserves requested generated order', () => {
    const draft = model(document(`${dance('first')} ${dance('second')}`, '', '&first'))
    delete draft.behaviorSourceFingerprint
    draft.behaviorDefinitions!.reverse()
    expect(() => core.buildKeymapCode(layout, draft)).toThrow(/source|provenance/i)
    expect(() => core.buildKeymapCode(layout, draft, { allowSourceFreeMacros: true })).toThrow(/source|provenance/i)
    expect(() => core.buildKeymapCode(layout, draft, { template: '/ { {{rendered_layers}} };', allowSourceFreeBehaviors: true })).toThrow(/template/i)
    const written = core.buildKeymapCode(layout, draft, { allowSourceFreeBehaviors: true })
    expect(model(written.code).behaviorDefinitions).toEqual(draft.behaviorDefinitions)
    reloadPair(written)
  })

  it('refuses unrepresentable source-backed order instead of silently reordering JSON or source', () => {
    const source = document(`${dance('first')} ${dance('second')}`)
    const baseline = model(source)
    for (const order of ['reverse', 'interleave'] as const) {
      const draft = core.cloneParsedKeymap(baseline)
      if (order === 'reverse') draft.behaviorDefinitions!.reverse()
      else draft.behaviorDefinitions!.splice(1, 0, { ...structuredClone(draft.behaviorDefinitions![0]!), code: '&third', label: 'third', nodeName: 'third-node' })
      const snapshot = structuredClone(draft)
      expect(() => save(source, draft)).toThrow(/order|revalidation/i)
      expect(draft).toEqual(snapshot)
    }
    const append = core.cloneParsedKeymap(baseline)
    append.behaviorDefinitions!.push({ ...structuredClone(append.behaviorDefinitions![0]!), code: '&third', label: 'third', nodeName: 'third-node' })
    reloadPair(save(source, append))
  })

  it('rejects stale metadata after external deletion and preserves absent versus explicit empty lists', () => {
    const source = document(dance('first'))
    const deleted = document('')
    const draft = model(source)
    expect(() => save(deleted, draft)).toThrow(/baseline/i)
    const missing = core.cloneParsedKeymap(draft)
    delete missing.behaviorSourceFingerprint
    expect(() => save(source, missing)).toThrow(/baseline/i)
    delete missing.behaviorDefinitions
    expect(save(source, missing).code).toBe(source)
    draft.behaviorDefinitions = []
    const written = save(source, draft)
    expect(written.code).toBe(source.replace(dance('first'), ''))
    reloadPair(written)
    const firstAddition = model(deleted)
    firstAddition.behaviorDefinitions = model(source).behaviorDefinitions
    reloadPair(save(deleted, firstAddition))
  })

  it('refuses label rename with repeated incoming sites without rewriting the callers', () => {
    const source = document(dance('first'), 'combos { compatible = "zmk,combos"; pair { key-positions = <0>; bindings = <&first>; }; };', '&first')
    const draft = model(source)
    draft.behaviorDefinitions![0]!.code = '&renamed'
    draft.behaviorDefinitions![0]!.label = 'renamed'
    const preflight = core.behaviorDeletePreflight(source, '&first')
    expect(preflight).toMatchObject({ ok: false, sites: expect.arrayContaining([expect.objectContaining({ kind: 'combo' }), expect.objectContaining({ kind: 'key' })]) })
    expect(() => save(source, draft)).toThrow(/incoming/i)
  })

  it('refuses an ordinary behavior newly used as a sensor rather than laundering it into read-only metadata', () => {
    const source = document(sticky('first'))
    const draft = model(source)
    draft.sensorBindings = [[core.parseKeyBinding('&first 0')]]
    const snapshot = structuredClone(draft)
    expect(() => save(source, draft)).toThrow(/sensor|signature|invocation/i)
    expect(draft).toEqual(snapshot)
  })

  it.each(['&first', '&second'])('validates JSON-first mixed graph references at %s', (binding) => {
    const nodes = `${dance('first', '&second')} ${sticky('leaf')}`
    const source = document(nodes, `macros { ${macro('second', '&leaf A')} };`, binding)
    const draft = model(source)
    expect(draft.behaviorDefinitions!.every(item => item.editable)).toBe(true)
    expect(draft.macros![0]!.editable).toBe(true)
    draft.behaviorDefinitions![0]!.properties['tapping-term-ms'] = 0
    reloadPair(save(source, draft))
  })

  it('keeps stock timing overrides and the fixed recipe under their existing owners', () => {
    const base = document(dance('first'))
    const recipe = core.spliceRgbLayerRecipeIntoDts(base)
    const source = '&mt { tapping-term-ms = <180>; };\n&lt { tapping-term-ms = <190>; };\n' + recipe
    const draft = model(source)
    expect(draft.behaviorDefinitions!.map(item => item.code)).toEqual(['&first'])
    expect(draft.behaviorDefinitions![0]!.editable).toBe(false)
    expect(save(source).code).toBe(source)
    draft.holdTaps = core.replaceHoldTapTiming(draft.holdTaps, '&mt', { tappingTermMs: 0 })
    draft.holdTaps = core.replaceHoldTapTiming(draft.holdTaps, '&lt', { tappingTermMs: 201 })
    const written = save(source, draft)
    expect(written.code).toBe(source.replace('<180>', '<0>').replace('<190>', '<201>'))
    reloadPair(written)
    draft.behaviorDefinitions![0]!.properties['tapping-term-ms'] = 10
    expect(() => save(source, draft)).toThrow(/coverage/i)
  })

  it('saves independent macro and behavior edits together and reconciles both metadata baselines', () => {
    const source = document(dance('first', '&second'), `macros { ${macro('second', '&kp A')} };`)
    const draft = model(source)
    draft.macros![0]!.steps = [{ kind: 'behavior', binding: '&kp B' }]
    draft.behaviorDefinitions![0]!.properties['tapping-term-ms'] = 0
    const written = save(source, draft)
    expect(written.code).toContain('bindings = <&kp B>')
    expect(written.code).toContain('tapping-term-ms = <0>')
    reloadPair(written)
    const next = core.parseKeymap(JSON.parse(written.json))
    next.macros![0]!.tapMs = 0
    next.behaviorDefinitions![0]!.properties['tapping-term-ms'] = 1
    reloadPair(save(written.code, next))
  })

  it('removes only the property token interval when its name also appears in a leading comment', () => {
    const source = document(dance('first').replace('bindings =', '/* tapping-term-ms is optional */ tapping-term-ms = <200>; bindings ='))
    const draft = model(source)
    delete draft.behaviorDefinitions![0]!.properties['tapping-term-ms']
    expect(save(source, draft).code).toBe(source.replace('tapping-term-ms = <200>;', ''))
  })

  it.each([
    ['duplicate labels', `${dance('first')} ${dance('first', '&kp B', 'second-node')}`, /duplicate.*label/i],
    ['duplicate node names', `${dance('first')} ${dance('second', '&kp B', 'first-node')}`, /node name|coverage/i],
    ['external label collision', dance('first'), /duplicate.*label/i]
  ])('preserves %s but refuses edit and deletion', (kind, nodes, reason) => {
    const source = document(nodes, kind === 'external label collision' ? 'first: holder { value = <1>; };' : '')
    const draft = model(source)
    expect(draft.behaviorDefinitions!.every(item => !item.editable)).toBe(true)
    expect(draft.behaviorDefinitions![0]!.diagnostics.join('; ')).toMatch(reason)
    expect(save(source).code).toBe(source)
    expect(core.behaviorDeletePreflight(source, '&first').ok).toBe(false)
    draft.behaviorDefinitions![0]!.properties['tapping-term-ms'] = 0
    expect(() => save(source, draft)).toThrow(/read-only|coverage|unique/i)
  })

  it('rejects duplicate draft identities and unresolved-reference capture for create and rename', () => {
    const source = document(dance('first'), 'holder { raw = <&unresolved>; };')
    const baseline = model(source)
    for (const mode of ['create', 'rename', 'duplicate-label', 'duplicate-node'] as const) {
      const draft = core.cloneParsedKeymap(baseline)
      const next = { ...structuredClone(draft.behaviorDefinitions![0]!), code: '&unresolved', label: 'unresolved', nodeName: 'new-node' }
      if (mode === 'rename') {
        next.nodeName = draft.behaviorDefinitions![0]!.nodeName
        draft.behaviorDefinitions = [next]
      } else if (mode === 'duplicate-label') draft.behaviorDefinitions!.push(structuredClone(draft.behaviorDefinitions![0]!))
      else if (mode === 'duplicate-node') draft.behaviorDefinitions!.push({ ...next, code: '&second', label: 'second', nodeName: 'first-node' })
      else draft.behaviorDefinitions!.push(next)
      const snapshot = structuredClone(draft)
      expect(() => save(source, draft), mode).toThrow(/collid|unique|coverage|node name/i)
      expect(draft).toEqual(snapshot)
    }
  })

  it.each([
    ['behaviors.dtsi', '&kp A', /stock behavior include/i],
    ['dt-bindings/zmk/keys.h', '&kp A', /keys include/i],
    ['dt-bindings/zmk/modifiers.h', '&kp LS(A)', /modifiers include/i],
    ['dt-bindings/zmk/bt.h', '&bt BT_SEL 0', /Bluetooth include/i]
  ])('requires the referenced %s header without dropping opaque source', (header, child, reason) => {
    const source = document(dance('first', child)).replace(`#include <${header}>\n`, '')
    const draft = model(source)
    expect(core.parseDtsBehaviorDefinitions(source).referenceCoverageComplete).toBe(true)
    expect(draft.behaviorDefinitions![0]).toMatchObject({ editable: false, diagnostics: expect.arrayContaining([expect.stringMatching(reason)]) })
    expect(save(source).code).toBe(source)
    draft.behaviorDefinitions![0]!.properties['tapping-term-ms'] = 0
    expect(() => save(source, draft)).toThrow(/read-only/)
  })

  it.each([
    '#include <unknown.dtsi>\n', '#include "local.dtsi"\n', '#define TERM 10\n', '#undef TERM\n',
    '#if ENABLED\n#endif\n', '&external { value = <1>; };\n', '/ { other {}; };\n', 'unaccounted\n'
  ])('refuses edits with incomplete closed-source coverage: %s', (prefix) => {
    const source = prefix + document(dance('first'))
    const draft = model(source)
    expect(core.parseDtsBehaviorDefinitions(source).referenceCoverageComplete).toBe(false)
    expect(save(source).code).toBe(source)
    expect(core.behaviorDeletePreflight(source, '&first').ok).toBe(false)
    if (draft.behaviorDefinitions?.length) {
      draft.behaviorDefinitions[0]!.properties['tapping-term-ms'] = 1
      expect(() => save(source, draft)).toThrow(/coverage/i)
      draft.behaviorDefinitions[0]!.code = '&renamed'
      draft.behaviorDefinitions[0]!.label = 'renamed'
      expect(() => save(source, draft)).toThrow(/coverage/i)
    }
  })

  it('blocks signature changes with opaque incoming references but allows global timing edits', () => {
    const source = document(sticky('first'), 'holder { raw = <&first>; };')
    const draft = model(source)
    expect(core.macroReferenceIndex(source, '&first')).toMatchObject([{ kind: 'opaque' }])
    draft.behaviorDefinitions![0]!.properties['release-after-ms'] = 0
    expect(save(source, draft).code).toBe(source.replace('release-after-ms = <100>', 'release-after-ms = <0>'))
    draft.behaviorDefinitions![0]!.bindings = ['&mo']
    const snapshot = structuredClone(draft)
    expect(() => save(source, draft)).toThrow(/incoming.*source|incoming.*holder|unproven/i)
    expect(draft).toEqual(snapshot)
  })

  it('accepts a compatible macro signature change through a forwarding behavior', () => {
    const forwarding = 'second: second-node { compatible = "zmk,behavior-macro-one-param"; #binding-cells = <1>; bindings = <&macro_param_1to1>, <&kp 0>; };'
    const source = document(sticky('first', '&second'), `macros { ${forwarding} };`)
    const draft = model(source)
    draft.macros![0]!.steps[1] = { kind: 'behavior', binding: '&mo 0' }
    const written = save(source, draft)
    expect(core.validateBehaviorInvocation(written.code, '&first 0')).toEqual([])
    expect(core.validateBehaviorInvocation(written.code, '&first A')).not.toEqual([])
    reloadPair(written)
  })

  it('revalidates behavior callers when a macro changes its forwarded domain', () => {
    const forwarding = 'second: second-node { compatible = "zmk,behavior-macro-one-param"; #binding-cells = <1>; bindings = <&macro_param_1to1>, <&kp 0>; };'
    const source = document(dance('first', '&second A'), `macros { ${forwarding} };`)
    const draft = model(source)
    expect(draft.behaviorDefinitions![0]!.editable).toBe(true)
    draft.macros![0]!.steps[1] = { kind: 'behavior', binding: '&mo 0' }
    expect(() => save(source, draft)).toThrow(/layer|caller|read-only/i)
  })

  it('preserves mutual cycles read-only and refuses an edit that creates one', () => {
    const cyclic = document(`${dance('first', '&second')} ${dance('second', '&first')}`)
    const parsed = core.parseDtsBehaviorDefinitions(cyclic)
    expect(parsed.definitions).toHaveLength(2)
    for (const definition of parsed.definitions) {
      expect(definition).toMatchObject({ editable: false, diagnostics: expect.arrayContaining([expect.stringMatching(/cyclic/i)]) })
      expect(core.behaviorDeletePreflight(cyclic, definition.code).ok).toBe(false)
    }
    expect(save(cyclic).code).toBe(cyclic)
    const source = document(`${dance('first', '&second')} ${dance('second')}`)
    const draft = model(source)
    draft.behaviorDefinitions![1]!.bindings = ['&first']
    const snapshot = structuredClone(draft)
    expect(() => save(source, draft)).toThrow(/cyclic/i)
    expect(draft).toEqual(snapshot)
  })

  it('rejects a macro edit that creates mutual recursion through a behavior', () => {
    const source = document(dance('first', '&second'), `macros { ${macro('second', '&kp A')} };`)
    const draft = model(source)
    expect(draft.behaviorDefinitions![0]!.editable).toBe(true)
    expect(draft.macros![0]!.editable).toBe(true)
    draft.macros![0]!.steps = [{ kind: 'behavior', binding: '&first' }]
    expect(() => save(source, draft)).toThrow(/cyclic|read-only/i)
  })
})
