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
  validateKeymapJson
} from './index.js'

// CHG-011 phase 1: fixture/specification evidence, NOT adapter acceptance.
// The proposed validateLayoutInfoJson seam in layout.ts does not exist yet.
// These cases pin its inputs/outcomes while exercising only existing validators.
// Phase 2 must run them through the real helper and both adapters; phase 3 must
// prove the HTTP error path survives into the browser. No fake helper is used.
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
const layoutCases = [
  ...nonLayouts.map(item => ({ ...item, path: namedPath, kind: 'named', proposed: 'ignore' })),
  ...nonLayouts.map(item => ({ ...item, path: sharedPath, kind: 'shared', proposed: 'error' })),
  ...[namedPath, sharedPath].flatMap(path => invalidLayouts.map(item => ({
    ...item, path, kind: path === namedPath ? 'named' : 'shared', proposed: 'error'
  }))),
  { name: 'valid named', info: validInfo, path: namedPath, kind: 'named', proposed: 'layout' },
  { name: 'valid shared', info: validInfo, path: sharedPath, kind: 'shared', proposed: 'layout' }
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

describe('CHG-011 layout specification fixtures (not selection/path acceptance)', () => {
  it.each(layoutCases)('$kind $name: proposed $proposed at $path', item => {
    const before = structuredClone(item.info)
    if (item.proposed === 'layout') {
      expect(() => validateInfoJson(item.info)).not.toThrow()
    } else {
      expect(validationError(item.info).errors.length).toBeGreaterThan(0)
      // Only named JSON with no own layouts member is proposed as ignorable.
      if (item.proposed === 'ignore') {
        expect(item.kind).toBe('named')
        expect(item.info !== null && typeof item.info === 'object' &&
          Object.hasOwn(item.info, 'layouts')).toBe(false)
      }
    }
    expect(item.info).toEqual(before)
  })

  it('characterizes the missing path field without claiming error transport exists', () => {
    const error = validationError(invalidLayouts[5].info)
    expect(error.name).toBe('InfoValidationError')
    expect(error.message).toBe(error.errors.join('; '))
    expect(error).not.toHaveProperty('path')
    // Proposed: the future file-aware helper throws this error with path equal
    // to namedPath or sharedPath; bare validateInfoJson stays path-free.
  })

  it('keeps the existing filename/reserved-sidecar boundary', () => {
    expect(matchingInfoJsonFilename('specimen.keymap')).toBe('specimen.json')
    for (const name of ['info.keymap', 'keymap.keymap', 'specimen.keymap.template']) {
      expect(matchingInfoJsonFilename(name)).toBeNull()
    }
  })

  it('characterizes rectangle fallback only after an adapter supplies absence', () => {
    const keymap = parseKeymap({ layers: [['&kp A']] })
    const bundle = loadKeyboardBundle({ keymap, infoJson: null })
    expect(bundle.inferredLayout).toBe(true)
    expect(bundle.layout).toEqual(inferRectangularLayout(1))
    expect(bundle.keymap).toBe(keymap)
    expect(() => loadKeyboardBundle({ keymap, infoJson: nonLayouts[0].info }))
      .toThrow(InfoValidationError)
    // Existing bundle-only compatibility; NOT permission for a file adapter
    // to ignore a present empty layouts object at the proposed strict seam.
    expect(loadKeyboardBundle({ keymap, infoJson: { layouts: {} } }).inferredLayout).toBe(true)
  })
})

// Run CHG011_RED=1 to expose these expected failures as ordinary assertions.
const boundary = process.env.CHG011_RED === '1' ? it : it.fails

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

  describe.each(bindingSites.slice(1))('$site raw dependency (proposed)', ({ json }) => {
    boundary.each(missingDeclarations)('requires matching non-override holdTaps: $name', ({ holdTaps }) => {
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

  describe.each(bindingSites)('$site same-label metadata (proposed)', ({ json }) => {
    boundary('requires holdTaps even if a same-label macro is declared', () => {
      expect(isPrimaryKeymapJson({ ...json(code), macros })).toBe(false)
    })

    boundary('requires holdTaps even if a same-label behaviorDefinition is declared', () => {
      expect(isPrimaryKeymapJson({ ...json(code), behaviorDefinitions })).toBe(false)
    })
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
