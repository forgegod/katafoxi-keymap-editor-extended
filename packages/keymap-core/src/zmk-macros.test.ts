import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  KeymapValidationError,
  buildKeymapCode,
  cloneParsedKeymap,
  diffKeymaps,
  macroDeletePreflight,
  macroReferenceIndex,
  macroQueueWarnings,
  normalizeZmkMacros,
  operateLayers,
  parseDtsKeymap,
  parseDtsMacros,
  parseKeymap,
  spliceMacrosIntoDts,
  textToUsAsciiMacro,
  validateKeymapJson,
  validateMacroInvocation
} from './index.js'
import type { LayerOperation } from './layer-operations.js'
import type { ZmkMacroStep } from './types.js'

const CORPUS = join(dirname(fileURLToPath(import.meta.url)), '../fixtures/corpus')
const supported = readFileSync(join(CORPUS, 'macro-boundary-supported.keymap'), 'utf8')
const opaque = readFileSync(join(CORPUS, 'macro-boundary-opaque.keymap'), 'utf8')

const signatureSource = (incoming: string) => `
#include <behaviors.dtsi>
#include <dt-bindings/zmk/keys.h>
#include <dt-bindings/zmk/modifiers.h>
/ {
  macros {
    target: target {
      compatible = "zmk,behavior-macro-one-param";
      #binding-cells = <1>;
      bindings = <&macro_param_1to1 &kp MACRO_PLACEHOLDER>;
    };
  };
  keymap { compatible = "zmk,keymap"; base { bindings = <&none>; }; };
  ${incoming}
};`

describe('ZMK macro domain parsing', () => {
  it.each(['&kp LS(A)', '&kp LC(LS(A))', '&mt LSHFT A', '&kp LSHFT', '&target LS(A)'])(
    'requires explicit modifiers include proof for %s', binding => {
      const source = signatureSource(`behaviors { caller: caller { compatible = "zmk,behavior-macro"; #binding-cells = <0>; bindings = <${binding}>; }; };`)
      expect(parseDtsMacros(source).definitions.find(item => item.code === '&caller')?.editable).toBe(true)
      const missing = source.replace('#include <dt-bindings/zmk/modifiers.h>', '')
      const baseline = parseDtsMacros(missing).definitions
      expect(baseline.find(item => item.code === '&caller')).toMatchObject({
        editable: false, diagnostics: expect.arrayContaining([expect.stringMatching(/modifiers include/i)])
      })
      const draft = baseline.map(item => item.code === '&caller' ? { ...item, tapMs: 1 } : item)
      expect(() => spliceMacrosIntoDts(missing, draft, baseline)).toThrow(/read-only/i)
      expect(parseDtsMacros(missing.replace(binding, '&kp A')).definitions.find(item => item.code === '&caller')?.editable).toBe(true)
    }
  )

  it.each(['&target LS(A)', '&target LSHFT'])('requires modifiers include proof for proposed invocation %s', binding => {
    const source = signatureSource('')
    expect(validateMacroInvocation(source, binding)).toEqual([])
    expect(validateMacroInvocation(source.replace('#include <dt-bindings/zmk/modifiers.h>', ''), binding)).toEqual([
      expect.stringMatching(/modifiers include/i)
    ])
  })

  it('exposes source-proven macro argument validation for ordinary editors', () => {
    for (const binding of ['&nested A', '&pair_key LSHFT', '&pair_inputs 1 A', '&profile 0', '&profile 4']) {
      expect(validateMacroInvocation(supported, binding)).toEqual([])
    }
    for (const binding of ['&nested', '&nested A B', '&pair_key A', '&pair_inputs 2 A', '&profile 5', '&missing']) {
      expect(validateMacroInvocation(supported, binding).length).toBeGreaterThan(0)
    }
    expect(validateMacroInvocation('#include <external.dtsi>\n' + supported, '&nested A').length).toBeGreaterThan(0)
  })

  it.each(['&nested NOT_A_KEYCODE', '&pair_key A', '&pair_inputs 2 A', '&profile 5'])('validates literal nested macro arguments in %s', binding => {
    const source = supported.replace('bindings = <&kp A>;', `bindings = <${binding}>;`)
    expect(parseDtsMacros(source).definitions.find(item => item.code === '&delete_me')).toMatchObject({
      editable: false, diagnostics: expect.arrayContaining([expect.stringMatching(/operand/i)])
    })
  })

  it.each([
    ['missing stock behavior include', (s: string) => s.replace('#include <behaviors.dtsi>', '')],
    ['missing keys include', (s: string) => s.replace('#include <dt-bindings/zmk/keys.h>', '')],
    ['stock dependency override', (s: string) => s.replace('    behaviors {', '    behaviors { kp: override { compatible = "external"; };')],
    ['duplicate non-macro label', (s: string) => s.replace('    behaviors {', '    behaviors { brackets: unrelated { compatible = "external"; };')],
    ['unknown include', (s: string) => '#include <custom.dtsi>\n' + s],
    ['root fragment', (s: string) => s.replace('/ {', '/ { UNACCOUNTED(foo);')],
    ['unterminated comment', (s: string) => s + '\n/* unterminated']
  ])('withholds authoring ownership for %s', (_reason, mutate) => {
    const source = mutate(supported)
    expect(parseDtsMacros(source).definitions.find(item => item.code === '&brackets')?.editable).toBe(false)
    const baseline = parseDtsMacros(source).definitions
    const draft = baseline.map(item => item.code === '&brackets' ? { ...item, tapMs: 12 } : item)
    expect(() => spliceMacrosIntoDts(source, draft, baseline)).toThrow(KeymapValidationError)
  })

  it('validates effective forwarded operands rather than overwritten single-cell fillers', () => {
    const source = supported.replace('&mt MACRO_PLACEHOLDER MACRO_PLACEHOLDER', '&mt A 999')
    const parsed = parseDtsMacros(source)
    for (const code of ['&repeat_key', '&nested', '&pair_key']) {
      expect(parsed.definitions.find(item => item.code === code)).toMatchObject({ editable: true, diagnostics: [] })
    }
  })
  it('intersects all forwarded input domains through same-file calls', () => {
    const source = supported.replace(
      '<&macro_param_1to1 &kp 0>',
      '<&macro_param_1to1 &mo 0>'
    )
    const parsed = parseDtsMacros(source)
    for (const code of ['&repeat_key', '&nested']) {
      expect(parsed.definitions.find(item => item.code === code)).toMatchObject({
        editable: false,
        diagnostics: expect.arrayContaining([expect.stringMatching(/incompatible|read-only/i)])
      })
    }
  })

  it('models the supported macro fixture without erasing zero timing or grouping', () => {
    const parsed = parseDtsMacros(supported)
    const layerMod = parsed.definitions.find(definition => definition.code === '&layer_mod')
    const zeroTiming = parsed.definitions.find(definition => definition.code === '&zero_timing')

    expect(layerMod).toMatchObject({
      editable: true,
      arity: 2,
      tapMs: 0,
      waitMs: 0,
      container: 'macros'
    })
    expect(layerMod?.steps.filter(step => step.kind === 'behavior')).toHaveLength(4)
    expect(layerMod?.steps.filter(step => step.kind === 'control')).toHaveLength(9)
    expect(zeroTiming).toMatchObject({ editable: true, tapMs: 0, waitMs: 0, container: 'behaviors' })
  })

  it('keeps unsupported definitions read-only with a reason', () => {
    const parsed = parseDtsMacros(opaque)
    const unknown = parsed.definitions.find(definition => definition.code === '&unknown_property')

    expect(unknown?.editable).toBe(false)
    expect(unknown?.diagnostics.join(' ')).toMatch(/unknown macro property/i)
    expect(parsed.referenceCoverageComplete).toBe(false)
  })

  it('rejects unknown keycodes instead of treating arbitrary tokens as macro operands', () => {
    const source = supported.replace('&kp LBKT', '&kp NOT_A_KEYCODE')
    const parsed = parseDtsMacros(source)
    expect(parsed.definitions.find(definition => definition.code === '&brackets')).toMatchObject({
      editable: false,
      diagnostics: expect.arrayContaining([expect.stringMatching(/keycode/i)])
    })
  })

  it('requires every declared macro input to reach an ordinary invocation', () => {
    const source = supported.replace(
      '<&macro_param_1to1 &macro_param_2to2>,\n                       <&lt MACRO_PLACEHOLDER MACRO_PLACEHOLDER>',
      '<&macro_param_1to1>,\n                       <&lt MACRO_PLACEHOLDER A>'
    )
    const parsed = parseDtsMacros(source)
    expect(parsed.definitions.find(definition => definition.code === '&pair_inputs')).toMatchObject({
      editable: false,
      diagnostics: expect.arrayContaining([expect.stringMatching(/input 2/i)])
    })
  })

  it('keeps cyclic same-file macro calls read-only', () => {
    const source = supported.replace('    };\n\n    behaviors {', `        cycle_a: cycle-a {
            compatible = "zmk,behavior-macro";
            #binding-cells = <0>;
            bindings = <&cycle_b>;
        };
        cycle_b: cycle-b {
            compatible = "zmk,behavior-macro";
            #binding-cells = <0>;
            bindings = <&cycle_a>;
        };

    };

    behaviors {`)
    const parsed = parseDtsMacros(source)
    for (const code of ['&cycle_a', '&cycle_b']) {
      expect(parsed.definitions.find(definition => definition.code === code)).toMatchObject({
        editable: false,
        diagnostics: expect.arrayContaining([expect.stringMatching(/cyclic/i)])
      })
    }
  })

  it('rejects forwarding controls with unexpected arguments', () => {
    const source = supported.replace('&macro_param_1to1 &repeat_key', '&macro_param_1to1 9 &repeat_key')
    const parsed = parseDtsMacros(source)
    expect(parsed.definitions.find(definition => definition.code === '&nested')).toMatchObject({
      editable: false,
      diagnostics: expect.arrayContaining([expect.stringMatching(/param_1to1.*arguments/i)])
    })
  })

  it('rejects literal layer operands outside the document layer range', () => {
    const source = supported.replace('<&macro_press &mo 1>', '<&macro_press &mo 2>')
    const parsed = parseDtsMacros(source)
    expect(parsed.definitions.find(definition => definition.code === '&zero_timing')).toMatchObject({
      editable: false,
      diagnostics: expect.arrayContaining([expect.stringMatching(/layer/i)])
    })
  })

  it('rejects overflowing macro timing controls', () => {
    const source = supported.replace('&macro_wait_time 0', '&macro_wait_time 4294967296')
    const parsed = parseDtsMacros(source)
    expect(parsed.definitions.find(definition => definition.code === '&layer_mod')).toMatchObject({
      editable: false,
      diagnostics: expect.arrayContaining([expect.stringMatching(/wait_time.*uint32/i)])
    })
  })

  it('rejects sequences with more than one release pause', () => {
    const source = supported.replace(
      '<&macro_pause_for_release>,\n                       <&macro_release &mo 1>',
      '<&macro_pause_for_release &macro_pause_for_release>,\n                       <&macro_release &mo 1>'
    )
    const parsed = parseDtsMacros(source)
    expect(parsed.definitions.find(definition => definition.code === '&zero_timing')).toMatchObject({
      editable: false,
      diagnostics: expect.arrayContaining([expect.stringMatching(/pause/i)])
    })
  })

  it('requires a modifier operand for literal mod-tap invocations', () => {
    const source = supported.replace('<&macro_param_1to1 &macro_param_1to2>,', '').replace('&mt MACRO_PLACEHOLDER MACRO_PLACEHOLDER', '&mt A B')
    const parsed = parseDtsMacros(source)
    expect(parsed.definitions.find(definition => definition.code === '&pair_key')).toMatchObject({
      editable: false,
      diagnostics: expect.arrayContaining([expect.stringMatching(/modifier/i)])
    })
  })

  it('does not grant edit ownership when source has unaccounted top-level fragments', () => {
    const parsed = parseDtsMacros(`${supported}\nstray_fragment;\n`)
    expect(parsed.referenceCoverageComplete).toBe(false)
  })

  it.each(['&mo MACRO_PLACEHOLDER', '&lt MACRO_PLACEHOLDER A', '&bt BT_SEL MACRO_PLACEHOLDER', '&profile MACRO_PLACEHOLDER', '&pair_inputs MACRO_PLACEHOLDER A'])(
    'validates an unforwarded placeholder as literal zero in %s without rewriting source', binding => {
      const source = supported.replace('bindings = <&kp A>;', `bindings = <${binding}>;`)
      const baseline = parseDtsMacros(source).definitions
      expect(baseline.find(item => item.code === '&delete_me')).toMatchObject({ editable: true, diagnostics: [] })
      expect(spliceMacrosIntoDts(source, baseline)).toBe(source)
      const draft = baseline.map(item => item.code === '&delete_me' ? { ...item, tapMs: 5 } : item)
      expect(spliceMacrosIntoDts(source, draft, baseline)).toContain(`bindings = <${binding}>;`)
      const literal = parseDtsMacros(source.replaceAll('MACRO_PLACEHOLDER', '0')).definitions
      expect(literal.find(item => item.code === '&delete_me')?.editable).toBe(true)
    }
  )

  it('validates placeholder zero through public macro argument domains', () => {
    expect(validateMacroInvocation(supported, '&profile MACRO_PLACEHOLDER')).toEqual([])
    expect(validateMacroInvocation(supported, '&pair_inputs MACRO_PLACEHOLDER A')).toEqual([])
    expect(validateMacroInvocation(supported, '&repeat_key MACRO_PLACEHOLDER')).not.toEqual([])
    expect(validateMacroInvocation(supported, '&pair_key MACRO_PLACEHOLDER')).not.toEqual([])
  })

  it('rejects unforwarded placeholder zero where the ordinary operand requires a keycode', () => {
    const source = supported.replace('&macro_param_1to1 &kp 0', '&kp MACRO_PLACEHOLDER')
    const parsed = parseDtsMacros(source)
    expect(parsed.definitions.find(definition => definition.code === '&repeat_key')).toMatchObject({
      editable: false,
      diagnostics: expect.arrayContaining([expect.stringMatching(/keycode/i)])
    })
  })

  it('rejects macro sequences with more than 256 phandle entries', () => {
    const bindings = Array.from({ length: 257 }, () => '&kp A').join(' ')
    const source = supported.replace('bindings = <&kp A>;', `bindings = <${bindings}>;`)
    const parsed = parseDtsMacros(source)
    expect(parsed.definitions.find(definition => definition.code === '&delete_me')).toMatchObject({
      editable: false,
      diagnostics: expect.arrayContaining([expect.stringMatching(/256/i)])
    })
  })

  it('keeps a macro read-only when it is used directly as a sensor binding', () => {
    const source = supported.replace('sensor-bindings = <&macro_dial>;', 'sensor-bindings = <&brackets>;')
    const parsed = parseDtsMacros(source)
    expect(parsed.definitions.find(definition => definition.code === '&brackets')).toMatchObject({
      editable: false,
      diagnostics: expect.arrayContaining([expect.stringMatching(/sensor/i)])
    })
  })

  it('keeps macro definitions read-only when their root container is repeated', () => {
    const source = supported.replace('    behaviors {', `    macros {
        extra: extra {
            compatible = "zmk,behavior-macro";
            #binding-cells = <0>;
            bindings = <&kp A>;
        };
    };

    behaviors {`)
    const parsed = parseDtsMacros(source)
    expect(parsed.definitions.find(definition => definition.code === '&brackets')).toMatchObject({
      editable: false,
      diagnostics: expect.arrayContaining([expect.stringMatching(/container/i)])
    })
  })

  it('keeps macro definitions read-only when their DTS node name is duplicated', () => {
    const source = supported.replace('delete-me {', 'bracket-sequence {')
    const parsed = parseDtsMacros(source)
    for (const code of ['&brackets', '&delete_me']) {
      expect(parsed.definitions.find(definition => definition.code === code)).toMatchObject({
        editable: false,
        diagnostics: expect.arrayContaining([expect.stringMatching(/node name/i)])
      })
    }
  })

  it('rejects non-literal macro display metadata', () => {
    const source = supported.replace('display-name = "US brackets []{} and braces in strings: };";', 'display-name = DISPLAY_NAME;')
    const parsed = parseDtsMacros(source)
    expect(parsed.definitions.find(definition => definition.code === '&brackets')).toMatchObject({
      editable: false,
      diagnostics: expect.arrayContaining([expect.stringMatching(/display-name.*literal/i)])
    })
  })

})

describe('ZMK macro source ownership', () => {
  it.each([
    ['literal macro caller', 'behaviors { caller: caller { compatible = "zmk,behavior-macro"; #binding-cells = <0>; bindings = <&target A>; }; };'],
    ['forwarded caller constraint', 'behaviors { caller: caller { compatible = "zmk,behavior-macro-one-param"; #binding-cells = <1>; bindings = <&macro_param_1to1 &target 0 &macro_param_1to1 &kp 0>; }; };'],
    ['key caller', 'KEY'],
    ['combo caller', 'combos { compatible = "zmk,combos"; combo { key-positions = <0>; bindings = <&target A>; }; };'],
    ['sensor child caller', 'behaviors { dial: dial { compatible = "zmk,behavior-sensor-rotate"; #sensor-binding-cells = <0>; bindings = <&target A>, <&none>; }; };'],
    ['raw incoming reference', 'holder { raw = <&target>; };'],
    ['hold-tap child', 'behaviors { ht: ht { compatible = "zmk,behavior-hold-tap"; #binding-cells = <2>; bindings = <&target>, <&kp>; }; };'],
    ['opaque macro caller', 'behaviors { caller: caller { compatible = "zmk,behavior-macro"; #binding-cells = <0>; unknown = <1>; bindings = <&target 0>; }; };'],
    ['transitive key caller', 'behaviors { caller: caller { compatible = "zmk,behavior-macro-one-param"; #binding-cells = <1>; bindings = <&macro_param_1to1 &target 0>; }; }; TRANSITIVE']
  ])('rejects a signature edit with an invalid or unproven %s atomically', (_name, incoming) => {
    let source = signatureSource(incoming.replace('KEY', '').replace('TRANSITIVE', ''))
    if (incoming === 'KEY') source = source.replace('bindings = <&none>', 'bindings = <&target A>')
    if (incoming.includes('TRANSITIVE')) source = source.replace('bindings = <&none>', 'bindings = <&caller A>')
    const baseline = parseDtsMacros(source).definitions
    expect(baseline.find(item => item.code === '&target')?.editable).toBe(true)
    const draft = baseline.map(item => item.code === '&target' ? {
      ...item, steps: [
        { kind: 'control' as const, control: 'param_1to1', values: [] },
        { kind: 'behavior' as const, binding: '&mo MACRO_PLACEHOLDER' }
      ]
    } : item)
    const before = structuredClone({ source, baseline, draft })
    expect(() => spliceMacrosIntoDts(source, draft, baseline)).toThrow(/revalidation|incoming|caller/i)
    expect({ source, baseline, draft }).toEqual(before)
  })

  it('allows a compatible signature change and ignores opaque calls for timing-only edits', () => {
    const source = signatureSource('holder { raw = <&target>; };')
    const baseline = parseDtsMacros(source).definitions
    expect(spliceMacrosIntoDts(source, baseline.map(item => ({ ...item, tapMs: 7 })), baseline)).toContain('tap-ms = <7>')
    const compatible = signatureSource('').replace('bindings = <&none>', 'bindings = <&target LSHFT>')
    const definitions = parseDtsMacros(compatible).definitions
    const draft = definitions.map(item => ({ ...item, steps: [
      { kind: 'control' as const, control: 'param_1to1', values: [] },
      { kind: 'behavior' as const, binding: '&mt MACRO_PLACEHOLDER A' }
    ] }))
    expect(validateMacroInvocation(spliceMacrosIntoDts(compatible, draft, definitions), '&target LSHFT')).toEqual([])
  })

  it('indexes typed key, combo, macro and sensor-child sites alongside raw references', () => {
    expect(macroReferenceIndex(supported, '&brackets').map(site => site.kind).sort()).toEqual(['combo', 'key', 'sensor-child'])
    expect(macroReferenceIndex(supported, '&repeat_key').map(site => site.kind).sort()).toEqual(['macro', 'sensor-child'])
    const source = supported.replace('    behaviors {', '    holder { raw = <&delete_me>; };\n    behaviors {')
    expect(macroReferenceIndex(source, '&delete_me')).toMatchObject([{ kind: 'opaque', reference: '&delete_me' }])
    expect(macroReferenceIndex(supported, '&delete_me')).toEqual([])
  })

  it('refuses a stale direct splice baseline instead of overwriting newer source', () => {
    const baseline = parseDtsMacros(supported).definitions
    const current = supported.replace('tap-ms = <40>', 'tap-ms = <41>')
    const draft = baseline.map(item => item.code === '&brackets' ? { ...item, tapMs: 42 } : item)
    expect(() => spliceMacrosIntoDts(current, draft, baseline)).toThrow(/baseline/i)
  })

  it.each(['&kp NOT_A_KEYCODE', '&kp A B', '&missing', '&kp A>; injected = <1'])('rejects invalid proposed sequence %s atomically', binding => {
    const baseline = parseDtsMacros(supported).definitions
    const snapshot = JSON.stringify(baseline)
    const draft = baseline.map(item => item.code === '&delete_me'
      ? { ...item, steps: [{ kind: 'behavior' as const, binding }] } : item)
    expect(() => spliceMacrosIntoDts(supported, draft, baseline)).toThrow(KeymapValidationError)
    expect(JSON.stringify(baseline)).toBe(snapshot)
  })

  it('edits only a supported macro bindings property and preserves every sibling byte', () => {
    const parsed = parseDtsMacros(supported)
    const draft = parsed.definitions.map(definition =>
      definition.code === '&delete_me'
        ? {
            ...definition,
            steps: [
              {
                kind: 'behavior' as const,
                binding: '&kp ENTER'
              }
            ]
          }
        : definition
    )

    const output = spliceMacrosIntoDts(supported, draft, parsed.definitions)
    const before = supported.indexOf('bindings = <&kp A>;')
    const after = output.indexOf('bindings = <&kp A>;')
    expect(before).toBeGreaterThanOrEqual(0)
    expect(after).toBe(-1)
    expect(output).toContain('bindings = <&kp ENTER>;')
    expect(output.slice(0, output.indexOf('delete_me:'))).toBe(supported.slice(0, supported.indexOf('delete_me:')))
    expect(output.slice(output.indexOf('nested:'), output.indexOf('// &delete_me'))).toBe(
      supported.slice(supported.indexOf('nested:'), supported.indexOf('// &delete_me'))
    )
  })

  it('permits deleting an unreferenced definition only with complete coverage', () => {
    const parsed = parseDtsMacros(supported)
    expect(macroDeletePreflight(supported, '&delete_me', parsed.definitions)).toEqual({ ok: true, sites: [] })

    const opaqueParsed = parseDtsMacros(opaque)
    expect(macroDeletePreflight(opaque, '&delete_me', opaqueParsed.definitions)).toMatchObject({
      ok: false
    })
  })

  it('refuses deleting a referenced macro without touching source', () => {
    const parsed = parseDtsMacros(supported)
    expect(macroDeletePreflight(supported, '&brackets', parsed.definitions)).toMatchObject({
      ok: false,
      sites: expect.arrayContaining([expect.objectContaining({ reference: '&brackets' })])
    })
  })

  it('edits a control sequence inside only its bindings value', () => {
    const parsed = parseDtsMacros(supported)
    const draft = parsed.definitions.map(definition =>
      definition.code === '&zero_timing'
        ? { ...definition, steps: [{ kind: 'behavior' as const, binding: '&kp ENTER' }] }
        : definition
    )
    const output = spliceMacrosIntoDts(supported, draft, parsed.definitions)
    expect(output).toBe(supported.replace(
      'bindings = <&macro_tap_time 0 &macro_wait_time 0>,\n                       <&macro_press &mo 1>,\n                       <&macro_pause_for_release>,\n                       <&macro_release &mo 1>;',
      'bindings = <&kp ENTER>;'
    ))
    expect(parseDtsMacros(output).definitions.find(item => item.code === '&zero_timing')?.steps).toEqual([
      { kind: 'behavior', binding: '&kp ENTER' }
    ])
  })

  it('renames an unreferenced macro by changing only its label token', () => {
    const parsed = parseDtsMacros(supported)
    const draft = parsed.definitions.map(definition =>
      definition.code === '&delete_me'
        ? { ...definition, code: '&renamed_macro', label: 'renamed_macro' }
        : definition
    )
    const output = spliceMacrosIntoDts(supported, draft, parsed.definitions)
    expect(output).toContain('renamed_macro: delete-me {')
    expect(output).not.toContain('delete_me: delete-me {')
    expect(output.replace('renamed_macro:', 'delete_me:')).toBe(supported)
  })

  it('removes a timing property without deleting its preceding comments', () => {
    const source = supported.replace('            tap-ms = <40>;', '            // keep this timing note\n            tap-ms = <40>;')
    const parsed = parseDtsMacros(source)
    const draft = parsed.definitions.map(definition =>
      definition.code === '&brackets' ? { ...definition, tapMs: undefined } : definition
    )
    const output = spliceMacrosIntoDts(source, draft, parsed.definitions)
    expect(output).toContain('// keep this timing note')
    expect(output).not.toContain('tap-ms = <40>;')
  })

  it('refuses renaming a macro onto a declared non-macro label', () => {
    const source = supported.replace('    behaviors {', `    behaviors {
        spare: spare { compatible = "zmk,behavior-hold-tap"; #binding-cells = <0>; bindings = <&kp>; };
`)
    const parsed = parseDtsMacros(source)
    const draft = parsed.definitions.map(definition =>
      definition.code === '&delete_me' ? { ...definition, code: '&spare', label: 'spare' } : definition
    )
    expect(() => spliceMacrosIntoDts(source, draft, parsed.definitions)).toThrow(/collides/i)
  })

  it.each([
    { container: false, count: 2, eol: '\n' },
    { container: false, count: 3, eol: '\r\n' },
    { container: true, count: 2, eol: '\n' },
    { container: true, count: 3, eol: '\r\n' }
  ])('adds $count new macros in one container (existing: $container, EOL: $eol)', ({ container, count, eol }) => {
    const original = signatureSource('')
    const source = (container ? original : original.replace(/  macros \{[\s\S]*?\n  \};/, '')).replace(/\n/g, eol)
    const baseline = parseDtsMacros(source).definitions
    const added = Array.from({ length: count }, (_, index) => ({
      code: `&fresh_${index}`, label: `fresh_${index}`, nodeName: `fresh-${index}`,
      container: 'macros' as const, arity: 0 as const,
      steps: [{ kind: 'behavior' as const, binding: `&kp ${index === 0 ? 'A' : 'B'}` }],
      editable: true, diagnostics: []
    }))
    const draft = [...baseline, ...added]
    const before = structuredClone({ source, baseline, draft })
    const output = spliceMacrosIntoDts(source, draft, baseline)
    expect(output.match(/\bmacros\s*\{/g)).toHaveLength(1)
    expect(parseDtsMacros(output).definitions).toEqual(expect.arrayContaining(draft))
    expect(parseDtsMacros(output).definitions).toHaveLength(draft.length)
    const insertion = container ? source.indexOf(`  };${eol}  keymap`) + 2 : source.lastIndexOf('};')
    expect(output.startsWith(source.slice(0, insertion))).toBe(true)
    expect(output.endsWith(source.slice(insertion))).toBe(true)
    if (eol === '\r\n') expect(output.replace(/\r\n/g, '')).not.toContain('\n')

    const keymap = parseKeymap(parseDtsKeymap(source))
    keymap.macros = draft
    expect(buildKeymapCode([{ x: 0, y: 0 }], keymap, { originalSource: source }).code).toBe(output)
    expect({ source, baseline, draft }).toEqual(before)
  })

  it.each(['\n', '\r\n'])('preserves draft order when adding macros to an existing container: %j', eol => {
    const source = signatureSource('').replace(/\n/g, eol)
    const keymap = parseKeymap(parseDtsKeymap(source))
    keymap.macros!.push(...['zebra', 'alpha', 'middle'].map(label => ({
      code: `&${label}`, label, nodeName: label,
      container: 'macros' as const, arity: 0 as const,
      steps: [{ kind: 'behavior' as const, binding: '&kp A' }],
      editable: true, diagnostics: []
    })))
    const before = structuredClone(keymap)
    const layout = [{ x: 0, y: 0 }]
    const written = buildKeymapCode(layout, keymap, { originalSource: source })
    const json = JSON.parse(written.json)

    expect(json.macros).toEqual(keymap.macros)
    expect.soft(parseDtsMacros(written.code).definitions).toEqual(keymap.macros)
    expect.soft(parseDtsMacros(written.code).definitions).toEqual(json.macros)
    if (eol === '\r\n') expect(written.code.replace(/\r\n/g, '')).not.toContain('\n')
    expect(keymap).toEqual(before)
    const reloaded = buildKeymapCode(layout, parseKeymap(json), { originalSource: written.code })
    expect(reloaded.code).toBe(written.code)
    expect(reloaded.json).toBe(written.json)
  })

  describe.each(['\n', '\r\n'])('cross-container macro order: %j', eol => {
    const source = supported.replace(/\n/g, eol)
    const layout = Array.from({ length: 4 }, (_, x) => ({ x, y: 0 }))
    const added = ['zebra', 'alpha'].map(label => ({
      code: `&${label}`, label, nodeName: label,
      container: 'macros' as const, arity: 0 as const,
      steps: [{ kind: 'behavior' as const, binding: '&kp A' }],
      editable: true, diagnostics: []
    }))

    it.each(['append after full list', 'reorder existing definitions', 'interleave new definitions'])(
      'refuses %s rather than publishing a pair that fails JSON-first reload', ordering => {
        const baseline = parseDtsMacros(source).definitions
        expect(baseline.at(-1)).toMatchObject({ code: '&zero_timing', container: 'behaviors', editable: true })
        expect(baseline.slice(0, -1).every(item => item.container === 'macros' && item.editable)).toBe(true)
        const keymap = parseKeymap(parseDtsKeymap(source))
        keymap.macros = ordering === 'append after full list'
          ? [...baseline, ...added]
          : ordering === 'reorder existing definitions'
            ? [...baseline].reverse()
            : [baseline[0], added[0], ...baseline.slice(1, -1), added[1], baseline.at(-1)!]
        const before = structuredClone({ source, baseline, keymap })

        expect.soft(() => spliceMacrosIntoDts(source, keymap.macros!, baseline)).toThrow(KeymapValidationError)
        let written: ReturnType<typeof buildKeymapCode> | undefined
        expect.soft(() => {
          written = buildKeymapCode(layout, keymap, { originalSource: source })
        }).toThrow(KeymapValidationError)
        // If a regression publishes a pair, expose the reload failure too.
        if (written) {
          const published = written
          const json = JSON.parse(published.json)
          expect(json.macros).toEqual(keymap.macros)
          expect.soft(() => buildKeymapCode(layout, parseKeymap(json), {
            originalSource: published.code
          })).not.toThrow()
        }
        expect({ source, baseline, keymap }).toEqual(before)
      }
    )

    it('preserves a representable container-end insertion and JSON-first reload', () => {
      const keymap = parseKeymap(parseDtsKeymap(source))
      const baseline = keymap.macros!
      keymap.macros = [...baseline.slice(0, -1), ...added, baseline.at(-1)!]
      const before = structuredClone(keymap)
      const written = buildKeymapCode(layout, keymap, { originalSource: source })
      const json = JSON.parse(written.json)

      expect(parseDtsMacros(written.code).definitions).toEqual(keymap.macros)
      expect(json.macros).toEqual(keymap.macros)
      const insertion = source.indexOf(`    };${eol}${eol}    behaviors {`) + 4
      expect(insertion).toBeGreaterThan(4)
      expect(written.code.startsWith(source.slice(0, insertion))).toBe(true)
      expect(written.code.endsWith(source.slice(insertion))).toBe(true)
      if (eol === '\r\n') expect(written.code.replace(/\r\n/g, '')).not.toContain('\n')
      const reloaded = buildKeymapCode(layout, parseKeymap(json), { originalSource: written.code })
      expect(reloaded.code).toBe(written.code)
      expect(reloaded.json).toBe(written.json)
      expect(keymap).toEqual(before)
    })
  })

  it('refuses creating a macro with a reserved recipe label', () => {
    const parsed = parseDtsMacros(supported)
    const draft = [...parsed.definitions, {
      code: '&rgblayer', label: 'rgblayer', nodeName: 'replacement', container: 'macros' as const, arity: 0 as const,
      steps: [{ kind: 'behavior' as const, binding: '&kp A' }], editable: true, diagnostics: []
    }]
    expect(() => spliceMacrosIntoDts(supported, draft, parsed.definitions)).toThrow(/collides/i)
  })

  it.each(['bindings = <&fresh>', 'raw = <&fresh>'])('refuses capturing an unresolved imported %s', property => {
    const source = signatureSource(`holder { ${property}; };`)
    const baseline = parseDtsMacros(source).definitions
    const fresh = {
      code: '&fresh', label: 'fresh', nodeName: 'fresh', container: 'macros' as const, arity: 0 as const,
      steps: [{ kind: 'behavior' as const, binding: '&kp A' }], editable: true, diagnostics: []
    }
    const draft = [...baseline, fresh]
    const before = structuredClone({ source, baseline, draft })
    expect(() => spliceMacrosIntoDts(source, draft, baseline)).toThrow(/collides.*unresolved/i)
    const keymap = parseKeymap(parseDtsKeymap(source))
    keymap.macros = draft
    expect(() => buildKeymapCode([{ x: 0, y: 0 }], keymap, {
      originalSource: source, allowSourceFreeMacros: true
    })).toThrow(/collides.*unresolved/i)
    expect({ source, baseline, draft }).toEqual(before)
  })
})

describe('ZMK macro keymap lifecycle', () => {
  it.each([
    { kind: 'duplicate', index: 1 },
    { kind: 'reorder', order: [0, 2, 1] }
  ] satisfies LayerOperation[])('refuses macro layer operations without changing model/source/history: $kind', operation => {
    const source = signatureSource('')
      .replace('&macro_param_1to1 &kp MACRO_PLACEHOLDER', '&macro_param_1to1 &mo MACRO_PLACEHOLDER')
      .replace('base { bindings = <&none>; };', 'base { bindings = <&none>; }; lower { bindings = <&none>; }; upper { bindings = <&none>; };')
    const keymap = parseKeymap(parseDtsKeymap(source))
    expect(keymap.macros?.[0].editable).toBe(true)
    const baseline = cloneParsedKeymap(keymap)
    // Core returns a transaction candidate; history is owned by its consumer.
    const session = { keymap, source, history: [{ keymap: cloneParsedKeymap(keymap), source }] }
    const before = structuredClone({ session, baseline })
    const result = operateLayers({
      keymap: session.keymap, layout: [{ x: 0, y: 0 }], operation,
      provenance: { kind: 'source', originalSource: session.source, baseline }
    })
    if (result.ok && result.changed) {
      session.history.push({ keymap: result.keymap, source: result.source! })
      session.keymap = result.keymap
      session.source = result.source!
    }
    expect({ session, baseline }).toEqual(before)
    expect(result).toMatchObject({ ok: false, error: expect.stringMatching(/macros.*unverified/i) })
    expect(result).not.toHaveProperty('keymap')
    expect(result).not.toHaveProperty('source')
    expect(session.keymap).toBe(keymap)
  })

  it.each([null, undefined, false, true, 0, 1, '', 'invalid', [], {}])('rejects the whole managed macro list for malformed member %j', invalid => {
    const raw = parseDtsKeymap(supported)
    const macros = raw.macros!.map(item => item.code === '&delete_me' ? invalid : item)
    expect(normalizeZmkMacros(macros)).toBeUndefined()
    expect(normalizeZmkMacros([invalid])).toBeUndefined()
    const keymap = parseKeymap({ ...raw, macros })
    expect(keymap.macros).toBeUndefined()
    expect(buildKeymapCode(Array.from({ length: 4 }, (_, x) => ({ x, y: 0 })), keymap, {
      originalSource: supported
    }).code).toBe(supported)
    expect(normalizeZmkMacros([])).toEqual([])
  })

  it('rejects holes instead of converting a sparse macro list to a deletion', () => {
    expect(normalizeZmkMacros(new Array(1))).toBeUndefined()
  })

  it.each([
    { code: '&forged', editable: true },
    { code: '&forged', label: 'forged', nodeName: 'forged', container: 'macros', arity: 0, steps: [{ kind: 'behavior', binding: '&external' }], editable: true, diagnostics: [] }
  ])('does not authorize JSON labels from unvalidated editable metadata %#', macro => {
    expect(() => validateKeymapJson({ layers: [['&forged']], macros: [macro] })).toThrow(KeymapValidationError)
  })

  it('rebases serialized macro metadata onto the written source for JSON-first reload', () => {
    const layout = Array.from({ length: 4 }, (_, x) => ({ x, y: 0 }))
    const draft = parseKeymap(parseDtsKeymap(supported))
    draft.macros!.find(item => item.code === '&brackets')!.tapMs = 17
    const written = buildKeymapCode(layout, draft, { originalSource: supported })
    const reloaded = parseKeymap(JSON.parse(written.json))
    expect(buildKeymapCode(layout, reloaded, { originalSource: written.code }).code).toBe(written.code)
    expect(draft.macroSourceFingerprint).not.toBe(reloaded.macroSourceFingerprint)
  })

  it('carries source-backed definitions through parse, JSON, clone, diff, and a no-op save', () => {
    const keymap = parseKeymap(parseDtsKeymap(supported))
    expect(keymap.macros?.some(definition => definition.code === '&brackets')).toBe(true)

    const built = buildKeymapCode(
      Array.from({ length: 4 }, (_, x) => ({ x, y: 0 })),
      keymap,
      { originalSource: supported }
    )
    expect(built.code).toBe(supported)
    expect(JSON.parse(built.json).macros).toEqual(keymap.macros)
    expect(() => validateKeymapJson(JSON.parse(built.json))).not.toThrow()

    const changed = cloneParsedKeymap(keymap)
    changed.macros!.find(definition => definition.code === '&zero_timing')!.tapMs = 1
    expect(diffKeymaps(keymap, changed)).toContainEqual(expect.objectContaining({
      type: 'macro', id: '&zero_timing'
    }))
    expect(keymap.macros!.find(definition => definition.code === '&zero_timing')!.tapMs).toBe(0)
  })

  it('refuses a macro mutation when JSON metadata does not match the source baseline', () => {
    const keymap = parseKeymap(parseDtsKeymap(supported))
    keymap.macroSourceFingerprint = 'stale'
    keymap.macros!.find(definition => definition.code === '&zero_timing')!.tapMs = 1
    expect(() => buildKeymapCode(
      Array.from({ length: 4 }, (_, x) => ({ x, y: 0 })),
      keymap,
      { originalSource: supported }
    )).toThrow(KeymapValidationError)
  })

  it.each(['', '  macros {};'])('refuses restoring an externally deleted macro with stale metadata: %j', replacement => {
    const source = signatureSource('')
    const keymap = parseKeymap(parseDtsKeymap(source))
    const current = source.replace(/  macros \{[\s\S]*?\n  \};/, replacement)
    expect(parseDtsKeymap(current).macros).toBeUndefined()
    expect(keymap.macroSourceFingerprint).toBeTypeOf('string')
    const before = structuredClone({ keymap, current })

    expect(() => buildKeymapCode([{ x: 0, y: 0 }], keymap, {
      originalSource: current
    })).toThrow(/macro metadata.*source baseline/i)
    expect({ keymap, current }).toEqual(before)
  })

  it.each([undefined, ''])('adds the first macro with an absent or matching empty fingerprint: %j', fingerprint => {
    const source = signatureSource('')
    const current = source.replace(/  macros \{[\s\S]*?\n  \};/, '')
    const keymap = parseKeymap(parseDtsKeymap(current))
    keymap.macros = parseDtsMacros(source).definitions
    keymap.macroSourceFingerprint = fingerprint

    const output = buildKeymapCode([{ x: 0, y: 0 }], keymap, { originalSource: current })
    expect(parseDtsMacros(output.code).definitions).toEqual(keymap.macros)
    expect(buildKeymapCode([{ x: 0, y: 0 }], parseKeymap(JSON.parse(output.json)), {
      originalSource: output.code
    }).code).toBe(output.code)
  })

  it('refuses a missing macro source fingerprint when source definitions already exist', () => {
    const source = signatureSource('')
    const keymap = parseKeymap(parseDtsKeymap(source))
    delete keymap.macroSourceFingerprint
    expect(() => buildKeymapCode([{ x: 0, y: 0 }], keymap, {
      originalSource: source
    })).toThrow(/macro metadata.*source baseline/i)
  })

  it('treats malformed macro JSON as unmanaged and preserves source definitions', () => {
    const raw = parseDtsKeymap(supported)
    raw.macros = raw.macros!.map(definition =>
      definition.code === '&delete_me' ? { code: definition.code, label: definition.label } as never : definition
    )
    const keymap = parseKeymap(raw)
    expect(keymap.macros).toBeUndefined()
    expect(buildKeymapCode(
      Array.from({ length: 4 }, (_, x) => ({ x, y: 0 })), keymap, { originalSource: supported }
    ).code).toBe(supported)
  })

  it('drops an injected JSON macro binding instead of emitting DTS syntax', () => {
    const raw = parseDtsKeymap(supported)
    raw.macros = raw.macros!.map(definition =>
      definition.code === '&delete_me'
        ? { ...definition, steps: [{ kind: 'behavior', binding: '&kp A>; }; injected = <1>' }] } as never
        : definition
    )
    expect(parseKeymap(raw).macros).toBeUndefined()
  })

  it.each([2, 3])('generates %i new source-free macros in one container', count => {
    const macros = Array.from({ length: count }, (_, index) => ({
      code: `&fresh_${index}`, label: `fresh_${index}`, nodeName: `fresh-${index}`,
      container: 'macros', arity: 0,
      steps: [{ kind: 'behavior', binding: '&kp A' }], editable: true, diagnostics: []
    }))
    const layout = macros.map((_, x) => ({ x, y: 0 }))
    const keymap = parseKeymap({ layers: [macros.map(item => item.code)], macros })
    const output = buildKeymapCode(layout, keymap, { allowSourceFreeMacros: true })
    expect(output.code.match(/\bmacros\s*\{/g)).toHaveLength(1)
    expect(parseDtsMacros(output.code).definitions).toEqual(macros)
    expect(buildKeymapCode(layout, parseKeymap(JSON.parse(output.json)), {
      originalSource: output.code
    }).code).toBe(output.code)
  })

  it.each(['&kp H', '&kp LS(H)', '&mt LSHFT H'])('creates a source-free macro only with explicit source-free provenance: %s', binding => {
    const keymap = parseKeymap({
      layers: [['&hello']],
      macros: [{
        code: '&hello', label: 'hello', nodeName: 'hello', container: 'macros', arity: 0,
        steps: [{ kind: 'behavior', binding }], editable: true, diagnostics: []
      }]
    })
    const layout = [{ x: 0, y: 0 }]
    expect(() => buildKeymapCode(layout, keymap)).toThrow(KeymapValidationError)
    const output = buildKeymapCode(layout, keymap, { allowSourceFreeMacros: true }).code
    expect(output).toContain('hello: hello {')
    expect(output).toContain('#include <dt-bindings/zmk/keys.h>')
    if (binding !== '&kp H') expect(output).toContain('#include <dt-bindings/zmk/modifiers.h>')
    expect(parseDtsMacros(output).definitions[0]?.editable).toBe(true)
  })
})

describe('macro queue-budget warnings', () => {
  const taps = (count: number): ZmkMacroStep[] => Array.from({ length: count }, () => ({ kind: 'behavior', binding: '&kp A' }))
  const control = (control: string): ZmkMacroStep => ({ kind: 'control', control, values: [] })

  it('exposes a domain warning without treating the budget as an authoring error', () => {
    expect(macroQueueWarnings).toBeTypeOf('function')
    expect(macroQueueWarnings(taps(24))).toEqual([])
    expect(macroQueueWarnings(taps(25))).toEqual([expect.stringMatching(/Press.*50.*48.*not.*runtime safety/i)])
    const source = signatureSource('').replace('zmk,behavior-macro-one-param', 'zmk,behavior-macro')
      .replace('#binding-cells = <1>', '#binding-cells = <0>')
      .replace('&macro_param_1to1 &kp MACRO_PLACEHOLDER', Array.from({ length: 25 }, () => '&kp A').join(' '))
    expect(parseDtsMacros(source).definitions[0].editable).toBe(true)
  })

  it.each([[32, 64, 'fills'], [33, 66, 'exceeds']] as const)('warns that %i taps use %i entries and %s the default queue', (count, entries, verb) => {
    expect(macroQueueWarnings(taps(count))).toEqual([
      expect.stringMatching(new RegExp(`Press.*${entries}.*48.*${verb}.*64`))
    ])
  })

  it.each(['press', 'release'])('counts one event per ordinary invocation in %s mode', mode => {
    expect(macroQueueWarnings([control(mode), ...taps(48)])).toEqual([])
    expect(macroQueueWarnings([control(mode), ...taps(49)])).toEqual([
      expect.stringMatching(/Press.*49.*48/)
    ])
  })

  it('counts activation segments separately across the pause while retaining mode', () => {
    expect(macroQueueWarnings([control('press'), ...taps(40), control('pause_for_release'), ...taps(40)])).toEqual([])
    expect(macroQueueWarnings([control('press'), ...taps(40), control('pause_for_release'), control('tap'), ...taps(25)])).toEqual([
      expect.stringMatching(/Release.*50.*48/)
    ])
  })

  it('counts neither forwarding nor timing controls as queue entries', () => {
    expect(macroQueueWarnings([
      ...taps(24), control('param_1to1'), { kind: 'control', control: 'wait_time', values: ['999'] }
    ])).toEqual([])
  })

  it('does not invent a runtime estimate for nested or unknown invocations', () => {
    expect(macroQueueWarnings([...taps(24), { kind: 'behavior', binding: '&nested A' }])).toEqual([
      expect.stringMatching(/nested.*unknown.*not.*runtime.*estimate/i)
    ])
  })
})

describe('US ASCII text macro conversion', () => {
  it('maps every printable ASCII character and retains whitespace and repeated characters', () => {
    const punctuation = [
      [' ', 'SPACE'], ['!', 'LS(N1)'], ['"', 'LS(SQT)'], ['#', 'LS(N3)'], ['$', 'LS(N4)'], ['%', 'LS(N5)'],
      ['&', 'LS(N7)'], ["'", 'SQT'], ['(', 'LS(N9)'], [')', 'LS(N0)'], ['*', 'LS(N8)'], ['+', 'LS(EQUAL)'],
      [',', 'COMMA'], ['-', 'MINUS'], ['.', 'DOT'], ['/', 'FSLH'], [':', 'LS(SEMI)'], [';', 'SEMI'],
      ['<', 'LS(COMMA)'], ['=', 'EQUAL'], ['>', 'LS(DOT)'], ['?', 'LS(FSLH)'], ['@', 'LS(N2)'],
      ['[', 'LBKT'], ['\\', 'BSLH'], [']', 'RBKT'], ['^', 'LS(N6)'], ['_', 'LS(MINUS)'], ['`', 'GRAVE'],
      ['{', 'LS(LBKT)'], ['|', 'LS(BSLH)'], ['}', 'LS(RBKT)'], ['~', 'LS(GRAVE)']
    ]
    const mapping = [
      ...Array.from('abcdefghijklmnopqrstuvwxyz', letter => [letter, letter.toUpperCase()]),
      ...Array.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ', letter => [letter, `LS(${letter})`]),
      ...Array.from('0123456789', digit => [digit, `N${digit}`]), ...punctuation
    ]
    expect(new Set(mapping.map(([char]) => char)).size).toBe(95)
    for (const [text, code] of mapping) expect(textToUsAsciiMacro(text)).toMatchObject({
      ok: true, changed: true, steps: [{ kind: 'behavior', binding: `&kp ${code}` }]
    })
    expect(textToUsAsciiMacro(' aa \n\t')).toMatchObject({ steps: [
      { kind: 'behavior', binding: '&kp SPACE' }, { kind: 'behavior', binding: '&kp A' },
      { kind: 'behavior', binding: '&kp A' }, { kind: 'behavior', binding: '&kp SPACE' },
      { kind: 'behavior', binding: '&kp ENTER' }, { kind: 'behavior', binding: '&kp TAB' }
    ] })
  })

  it.each(['\r', '\r\n', '\u0000', '\u007f', 'é', 'я', '\u0301', '😀', '\ud800', '\udfff'])(
    'rejects unsupported text %j atomically with positions and code points', text => {
      const result = textToUsAsciiMacro(`a${text}b`)
      const point = text.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')
      expect(result).toEqual({ ok: false, errors: [`Position 2: U+${point} is not supported by US ASCII.`] })
      expect(result).not.toHaveProperty('steps')
    }
  )

  it('serializes the proposal with 40ms defaults and allows zero without changing its sequence', () => {
    const proposal = textToUsAsciiMacro('A')
    if (!proposal.ok || !proposal.changed) throw new Error('Expected a proposal')
    const macro = {
      code: '&hello', label: 'hello', nodeName: 'hello', container: 'macros' as const,
      arity: proposal.arity, steps: proposal.steps, tapMs: proposal.tapMs, waitMs: proposal.waitMs,
      editable: true, diagnostics: []
    }
    const keymap = parseKeymap({ layers: [['&hello']], macros: [macro] })
    const written = buildKeymapCode([{ x: 0, y: 0 }], keymap, { allowSourceFreeMacros: true })
    expect(parseDtsMacros(written.code).definitions[0]).toMatchObject({ tapMs: 40, waitMs: 40, steps: proposal.steps })
    const reloaded = parseKeymap(JSON.parse(written.json))
    reloaded.macros![0].tapMs = 0
    reloaded.macros![0].waitMs = 0
    const edited = buildKeymapCode([{ x: 0, y: 0 }], reloaded, { originalSource: written.code })
    expect(parseDtsMacros(edited.code).definitions[0]).toMatchObject({ tapMs: 0, waitMs: 0, steps: proposal.steps })
  })

  it('returns an explicit no-change result for empty text, not an empty replacement macro', () => {
    expect(textToUsAsciiMacro('')).toEqual({ ok: true, changed: false, steps: [] })
  })

  it('proposes a new US ASCII zero-parameter tap macro with editable 40ms defaults and queue headroom explanation', () => {
    const result = textToUsAsciiMacro('a'.repeat(24))
    expect(result).toMatchObject({
      ok: true, changed: true, mapping: 'US QWERTY / ASCII', arity: 0,
      tapMs: 40, waitMs: 40, queueEntries: 48,
      warnings: [expect.stringMatching(/24.*48.*16.*64.*32.*64/)]
    })
    if (!result.ok) throw new Error('Expected a proposal')
    expect(result.steps).toHaveLength(24)
    expect(result).toMatchObject({ warnings: [expect.stringMatching(/not.*guarantee.*concurrent.*nested.*firmware.*Caps Lock.*host/i)] })
  })

  it.each([25, 32, 33])('refuses %i characters atomically with the queue-budget explanation', count => {
    const result = textToUsAsciiMacro('a'.repeat(count))
    expect(result).toMatchObject({ ok: false, errors: [expect.stringMatching(/24.*48.*16.*64.*32.*64/)] })
    expect(result).not.toHaveProperty('steps')
  })

  it('maps brackets, braces, backslash, bar, LF, and tab with explicit US keycodes', () => {
    expect(textToUsAsciiMacro('[]{}\\|\n\t')).toMatchObject({
      ok: true,
      steps: [
        { kind: 'behavior', binding: '&kp LBKT' },
        { kind: 'behavior', binding: '&kp RBKT' },
        { kind: 'behavior', binding: '&kp LS(LBKT)' },
        { kind: 'behavior', binding: '&kp LS(RBKT)' },
        { kind: 'behavior', binding: '&kp BSLH' },
        { kind: 'behavior', binding: '&kp LS(BSLH)' },
        { kind: 'behavior', binding: '&kp ENTER' },
        { kind: 'behavior', binding: '&kp TAB' }
      ]
    })
  })

  it('rejects all invalid text atomically instead of silently substituting', () => {
    const converted = textToUsAsciiMacro('oké')
    expect(converted).toMatchObject({ ok: false, errors: ['Position 3: U+00E9 is not supported by US ASCII.'] })
    expect(textToUsAsciiMacro('x'.repeat(25))).toMatchObject({ ok: false })
  })

  it('rejects attempts to splice a changed read-only definition', () => {
    const parsed = parseDtsMacros(opaque)
    const changed = parsed.definitions.map(definition => ({ ...definition, tapMs: 1 }))
    expect(() => spliceMacrosIntoDts(opaque, changed, parsed.definitions)).toThrow(KeymapValidationError)
  })
})
