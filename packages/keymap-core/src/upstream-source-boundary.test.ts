import { describe, expect, it } from 'vitest'
import {
  encodeKeymap,
  ensureHoldTapPreset,
  inferRectangularLayout,
  InfoValidationError,
  isPrimaryKeymapJson,
  KeymapValidationError,
  loadBehaviorsData,
  loadKeyboardBundle,
  matchingInfoJsonFilename,
  parseDtsBehaviorDefinitions,
  parseDtsMacros,
  parseKeymap,
  validateInfoJson,
  validateLayoutInfoJson,
  validateKeymapJson
} from './index.js'

// Core selection/path regressions; adapters have separate transport tests.
// Browser error presentation remains CHG-011 phase 3 work.
const namedPath = 'config/specimen.json'
const sharedPath = 'config/info.json'
const validInfo = { layouts: { default: { layout: [{ x: 0, y: 0 }] } } }
const nonLayouts = [
  { name: 'unrelated object', info: { settings: true } },
  { name: 'firmware JSON', info: { layers: [['&kp A']] } },
  { name: 'null', info: null },
  { name: 'array', info: [] },
  { name: 'scalar', info: 'settings' }
]
const invalidLayouts = [
  { name: 'null layouts', info: { layouts: null } },
  { name: 'scalar layouts', info: { layouts: false } },
  { name: 'array layouts', info: { layouts: [] } },
  { name: 'empty layouts', info: { layouts: {} } },
  { name: 'missing layout array', info: { layouts: { default: {} } } },
  { name: 'invalid geometry', info: { layouts: { default: { layout: [{ x: 'bad', y: 0 }] } } } }
]
const layoutCases: Array<{
  name: string; info: unknown; path: string; kind: 'named' | 'shared'; outcome: string
}> = [
  ...nonLayouts.map(item => ({ ...item, path: namedPath, kind: 'named' as const, outcome: 'ignore' })),
  ...nonLayouts.map(item => ({ ...item, path: sharedPath, kind: 'shared' as const, outcome: 'error' })),
  ...[namedPath, sharedPath].flatMap(path => invalidLayouts.map(item => ({
    ...item, path, kind: path === namedPath ? 'named' as const : 'shared' as const, outcome: 'error'
  }))),
  { name: 'valid named', info: validInfo, path: namedPath, kind: 'named', outcome: 'layout' },
  { name: 'valid shared', info: validInfo, path: sharedPath, kind: 'shared', outcome: 'layout' }
]

function validationError(info: unknown): InfoValidationError {
  try {
    validateInfoJson(info)
  } catch (error) {
    if (error instanceof InfoValidationError) return error
    throw error
  }
  throw new Error('Fixture must fail the existing strict info validator')
}

describe('CHG-011 file-aware layout validation', () => {
  it.each(layoutCases)('$kind $name: $outcome at $path', item => {
    const before = structuredClone(item.info)
    if (item.outcome === 'error') {
      expect(() => validateLayoutInfoJson(item.info, item)).toThrow(InfoValidationError)
      expect(() => validateLayoutInfoJson(item.info, item)).toThrow(expect.objectContaining({ path: item.path }))
    } else {
      expect(validateLayoutInfoJson(item.info, item)).toBe(item.outcome === 'ignore' ? null : item.info)
    }
    expect(item.info).toEqual(before)
  })

  it('keeps bare validation path-free and preserves the existing error contract', () => {
    const error = validationError(invalidLayouts[5].info)
    expect(error.name).toBe('InfoValidationError')
    expect(error.message).toBe(error.errors.join('; '))
    expect(error.path).toBeUndefined()
    expect(() => validateLayoutInfoJson(invalidLayouts[5].info, { kind: 'named', path: namedPath }))
      .toThrow(expect.objectContaining({ name: error.name, message: error.message, errors: error.errors, path: namedPath }))
  })

  it('requires an own layouts member and rejects present undefined and array containers', () => {
    expect(validateLayoutInfoJson(Object.create(validInfo), { kind: 'named', path: namedPath })).toBeNull()
    for (const info of [
      { layouts: undefined },
      { layouts: [validInfo.layouts.default] },
      Object.assign([], validInfo)
    ]) {
      expect(() => validateLayoutInfoJson(info, { kind: 'named', path: namedPath }))
        .toThrow(expect.objectContaining({ name: 'InfoValidationError', path: namedPath }))
    }
  })

  it('keeps the existing filename/reserved-sidecar boundary', () => {
    expect(matchingInfoJsonFilename('specimen.keymap')).toBe('specimen.json')
    for (const name of ['info.keymap', 'keymap.keymap', 'specimen.keymap.template']) {
      expect(matchingInfoJsonFilename(name)).toBeNull()
    }
  })

  it('enables rectangle inference for ignored named files without relaxing bundle validation', () => {
    const keymap = parseKeymap({ layers: [['&kp A']] })
    const infoJson = validateLayoutInfoJson(nonLayouts[0].info, { kind: 'named', path: namedPath })
    const bundle = loadKeyboardBundle({ keymap, infoJson })
    expect(bundle.inferredLayout).toBe(true)
    expect(bundle.layout).toEqual(inferRectangularLayout(1))
    expect(bundle.keymap).toBe(keymap)
    expect(() => loadKeyboardBundle({ keymap, infoJson: nonLayouts[0].info }))
      .toThrow(InfoValidationError)
    // Existing bundle-only compatibility does not relax file validation.
    expect(loadKeyboardBundle({ keymap, infoJson: { layouts: {} } }).inferredLayout).toBe(true)
  })
})

// Raw JSON sites from upstream f74a94d, not parsed KeyBindingNode values.
const bindingSites = [
  { site: 'layers', json: (binding: string) => ({ layers: [['&kp B'], [binding]] }) },
  { site: 'combos[].binding', json: (binding: string) => ({
    layers: [['&kp B']],
    combos: [{ id: 'probe', keyPositions: [0], binding }]
  }) },
  { site: 'sensorBindings', json: (binding: string) => ({
    layers: [['&kp B'], ['&kp C']], sensorBindings: [[], [binding]]
  }) }
]

describe.each([
  { code: '&hm', binding: '&hm LCTRL A', other: '&as' },
  { code: '&as', binding: '&as 0 A', other: '&hm' }
])('CHG-011 $code primary JSON dependency', ({ code, binding, other }) => {
  const missingDeclarations = [
    { name: 'missing', holdTaps: undefined },
    { name: 'empty', holdTaps: [] },
    { name: 'wrong label', holdTaps: [{ code: other }] },
    { name: 'override only', holdTaps: [{ code, override: true }] }
  ]
  it.each(missingDeclarations)('rejects $name holdTaps without promoting a preset to stock', ({ holdTaps }) => {
    const json = { layers: [['&kp B'], [binding]], ...(holdTaps === undefined ? {} : { holdTaps }) }
    expect(() => validateKeymapJson(json)).toThrow(KeymapValidationError)
    expect(isPrimaryKeymapJson(json)).toBe(false)
    expect(loadBehaviorsData().some(item => item.code === code)).toBe(false)
  })

  describe.each(bindingSites.slice(1))('$site raw dependency', ({ json }) => {
    it.each(missingDeclarations)('requires matching non-override holdTaps: $name', ({ holdTaps }) => {
      expect(isPrimaryKeymapJson({ ...json(binding), ...(holdTaps === undefined ? {} : { holdTaps }) }))
        .toBe(false)
    })
  })

  it.each(bindingSites)('accepts the matching declared preset in $site and retains binding/metadata', ({ json: atSite }) => {
    const json = { ...atSite(binding), holdTaps: ensureHoldTapPreset(undefined, code) }
    const before = structuredClone(json)
    expect(json.holdTaps.map(item => item.code)).toEqual([code])
    expect(() => validateKeymapJson(json)).not.toThrow()
    expect(isPrimaryKeymapJson(json)).toBe(true)
    expect(encodeKeymap(parseKeymap(json))).toMatchObject(json)
    expect(json).toEqual(before)
  })

  const label = code.slice(1)
  const macros = parseDtsMacros(`#include <behaviors.dtsi>
#include <dt-bindings/zmk/keys.h>
/ { macros { ${label}: ${label} {
    compatible = "zmk,behavior-macro";
    #binding-cells = <0>;
    bindings = <&kp A>;
}; }; };`).definitions
  const behaviorDefinitions = parseDtsBehaviorDefinitions(`#include <behaviors.dtsi>
#include <dt-bindings/zmk/keys.h>
/ { behaviors { ${label}: ${label} {
    compatible = "zmk,behavior-tap-dance";
    #binding-cells = <0>;
    tapping-term-ms = <200>;
    bindings = <&kp A>, <&kp B>;
}; }; };`).definitions

  it('uses real editable same-label macro and behavior definitions for dependency probes', () => {
    expect(macros).toHaveLength(1)
    expect(macros[0]).toMatchObject({ code, editable: true })
    expect(behaviorDefinitions).toHaveLength(1)
    expect(behaviorDefinitions[0]).toMatchObject({ code, editable: true })
    expect(() => validateKeymapJson({ layers: [[code]], macros })).not.toThrow()
    expect(() => validateKeymapJson({ layers: [[code]], behaviorDefinitions })).not.toThrow()
  })

  describe.each(bindingSites)('$site same-label metadata', ({ json }) => {
    it('requires holdTaps even if a same-label macro is declared', () => {
      expect(isPrimaryKeymapJson({ ...json(code), macros })).toBe(false)
    })

    it('requires holdTaps even if a same-label behaviorDefinition is declared', () => {
      expect(isPrimaryKeymapJson({ ...json(code), behaviorDefinitions })).toBe(false)
    })
  })

  it.each(bindingSites)('checks only the exact leading label in $site', ({ json }) => {
    expect(isPrimaryKeymapJson(json(`${code}\t0 A`))).toBe(false)
    expect(isPrimaryKeymapJson(json(`&reset ${code} opaque`))).toBe(true)
    expect(() => validateKeymapJson(json(binding), { allowUnknownBehaviors: true })).not.toThrow()
    expect(isPrimaryKeymapJson({ ...json(binding), holdTaps: [{ code, override: false }] })).toBe(true)
  })
})

describe('CHG-011 unchanged catalog and explicit-import boundaries', () => {
  it.each(['&external_unknown', '&hm_extra', '&as_extra', '&HM', '&AS', '&hm!', '&as!', '&1hm', '&'])
  ('rejects undeclared unknown/lookalike/malformed %s despite other declarations', binding => {
    const holdTaps = ensureHoldTapPreset(ensureHoldTapPreset(undefined, '&hm'), '&as')
    const json = { layers: [[binding]], holdTaps }
    expect(() => validateKeymapJson(json)).toThrow(KeymapValidationError)
    expect(isPrimaryKeymapJson(json)).toBe(false)
  })

  it('preserves explicit source-import and declared-model allowances without making unknown JSON primary', () => {
    const json = { layers: [['&external_unknown WRAP(1,2) 3']] }
    expect(() => validateKeymapJson(json, { allowUnknownBehaviors: true })).not.toThrow()
    expect(isPrimaryKeymapJson(json)).toBe(false)
    expect(isPrimaryKeymapJson({ ...json, holdTaps: [{ code: '&external_unknown' }] })).toBe(true)
    expect(isPrimaryKeymapJson({ layers: [['&reset WRAP(1,2) 3', '&sys_reset', '&studio_unlock']] })).toBe(true)
  })
})
