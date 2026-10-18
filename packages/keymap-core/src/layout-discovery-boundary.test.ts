import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  assertLayerKeyCounts,
  buildKeymapCode,
  encodeKeymap,
  inferRectangularLayout,
  loadKeyboardBundle,
  parseDtsKeymap,
  parseKeymap,
  validateInfoJson
} from './index.js'
import type { LayoutKey } from './types.js'

// CHG-008 specification evidence only. No metadata resolver is invoked here.
// Proposed discovery outcomes live in the fixture README and cases.json.
type Edit = { old: string; new: string }
type FixtureCase = {
  id: string
  metadata: string | null
  proposedOutcome: 'candidate' | 'fallback' | 'error'
  reason?: string
  metadataEdits?: Edit[]
  keymapEdits?: Edit[]
  bindings?: string[][]
  orderedPositions?: [number, number][]
  normalizedLayout?: LayoutKey[]
  sensorLabels?: string[]
  parts?: {
    id: string
    rows: number
    columns: number
    offset: [number, number]
    events: { local: [number, number]; bindingIndex: number }[]
  }[]
}
const readFixture = (name: string) => readFileSync(
  new URL(`../fixtures/layout-discovery/${name}`, import.meta.url), 'utf8'
)
const corpus = JSON.parse(readFixture('cases.json')) as {
  fixtureSchema: number
  status: string
  keymap: string
  cases: FixtureCase[]
}

// Exact single-site text mutations materialize isolated negative inputs.
// This is a fixture recipe check, not a DTS parser or discovery validator.
function applyEdits(source: string, edits: Edit[] = []): string {
  for (const edit of edits) {
    expect(edit.old.length).toBeGreaterThan(0)
    expect(source.split(edit.old)).toHaveLength(2)
    source = source.replace(edit.old, edit.new)
  }
  return source
}
function inputs(item: FixtureCase) {
  return {
    metadata: item.metadata === null ? null : applyEdits(readFixture(item.metadata), item.metadataEdits),
    source: applyEdits(readFixture(corpus.keymap), item.keymapEdits)
  }
}
const candidates = corpus.cases.filter(item => item.proposedOutcome === 'candidate')

describe('CHG-008 fixture integrity (not discovery acceptance)', () => {
  it('keeps a labeled, uniquely indexed corpus linked from the matrix', () => {
    expect(corpus.fixtureSchema).toBe(1)
    expect(corpus.status).toBe('specification-only')
    expect(corpus.cases.length).toBeGreaterThan(0)
    expect(new Set(corpus.cases.map(item => item.id)).size).toBe(corpus.cases.length)
    const readme = readFixture('README.md')
    for (const item of corpus.cases) expect(readme).toContain(`\`${item.id}\``)
  })

  it.each(corpus.cases)('$id: materializes isolated inputs and parses firmware bindings only', item => {
    const { source, metadata } = inputs(item)
    if (item.metadata === null) expect(metadata).toBeNull()
    else expect(metadata).toContain('/ {')
    expect(['candidate', 'fallback', 'error']).toContain(item.proposedOutcome)
    if (item.proposedOutcome !== 'candidate') expect(item.reason).toBeTruthy()
    const raw = parseDtsKeymap(source)
    const layers = item.bindings ?? raw.layers
    const model = parseKeymap({ ...raw, layers })
    expect(encodeKeymap(model).layers).toEqual(layers)
    expect(encodeKeymap(model).sensorBindings).toEqual(raw.sensorBindings)
    // Deliberately no assertion that metadata produces proposedOutcome.
  })

  it.each(candidates)('$id: hand-authored expected projection has unique positions and matching counts', item => {
    const raw = parseDtsKeymap(inputs(item).source)
    const positions = item.orderedPositions!
    const layout = item.normalizedLayout!
    expect(positions).toHaveLength(raw.layers[0].length)
    expect(new Set(positions.map(pair => pair.join(','))).size).toBe(positions.length)
    expect(layout).toHaveLength(positions.length)
    expect(layout.map(({ row, col }) => [row, col])).toEqual(
      inferRectangularLayout(layout.length).map(({ row, col }) => [row, col])
    )
    expect(() => validateInfoJson({ layouts: { default: { layout } } })).not.toThrow()
    if (item.sensorLabels !== undefined) {
      expect(new Set(item.sensorLabels).size).toBe(item.sensorLabels.length)
      for (const row of raw.sensorBindings ?? []) {
        if (row.length > 0) expect(row).toHaveLength(item.sensorLabels.length)
      }
    }
  })

  it('keymap-metadata-include: adds only the unproved overlay include to the stock preamble', () => {
    const control = inputs(corpus.cases.find(item => item.id === 'unibody')!)
    const item = corpus.cases.find(item => item.id === 'keymap-metadata-include')!
    const { metadata, source } = inputs(item)
    expect(metadata).toBe(control.metadata)
    expect(source).toContain('#include <behaviors.dtsi>\n#include <dt-bindings/zmk/keys.h>\n')
    expect(source.replace('#include "unresolved-layout.dtsi"\n', '')).toBe(control.source)
    // Only fixture shape/preamble preservation is exercised, not include resolution.
    expect(parseDtsKeymap(source)).toEqual(parseDtsKeymap(control.source))
  })

  it('sensor-missing: proposes valid transform geometry without sensor association and retains firmware slots', () => {
    const item = corpus.cases.find(item => item.id === 'sensor-missing')!
    const control = corpus.cases.find(item => item.id === 'unibody')!
    expect(item.proposedOutcome).toBe('candidate')
    expect(item.orderedPositions).toEqual(control.orderedPositions)
    expect(item.normalizedLayout).toEqual(control.normalizedLayout)
    expect(item.normalizedLayout).not.toEqual(inferRectangularLayout(4))
    expect(item.sensorLabels).toBeUndefined()
    expect(item.reason).toBe('sensor association unverified: no zmk,keymap-sensors node')
    const { metadata, source } = inputs(item)
    expect(metadata).not.toContain('compatible = "zmk,keymap-sensors";')
    expect(metadata).not.toContain('sensors {')
    expect(metadata).toContain('spec_encoder_a: encoder_a')
    expect(metadata).toContain('spec_encoder_b: encoder_b')
    const baseline = parseDtsKeymap(readFixture(corpus.keymap)).sensorBindings
    expect(baseline).toHaveLength(2)
    expect(baseline!.every(row => row.length === 2)).toBe(true)
    expect(parseDtsKeymap(source).sensorBindings).toEqual(baseline)
  })

  it('sensor-property-missing: proposes fallback for malformed metadata without losing firmware slots', () => {
    const item = corpus.cases.find(item => item.id === 'sensor-property-missing')!
    expect(item.proposedOutcome).toBe('fallback')
    expect(item.reason).toBe('invalid sensor metadata: present zmk,keymap-sensors node lacks required sensors property')
    expect(item.orderedPositions).toBeUndefined()
    expect(item.normalizedLayout).toBeUndefined()
    expect(item.sensorLabels).toBeUndefined()
    const { metadata, source } = inputs(item)
    expect(metadata).toContain('sensors {\n        compatible = "zmk,keymap-sensors";\n')
    expect(metadata).not.toContain('sensors =')
    expect(source).toBe(readFixture(corpus.keymap))
    const baseline = parseDtsKeymap(readFixture(corpus.keymap)).sensorBindings
    expect(baseline).toHaveLength(2)
    expect(baseline!.every(row => row.length === 2)).toBe(true)
    expect(parseDtsKeymap(source).sensorBindings).toEqual(baseline)
  })

  it('split: hand-authored local events cover global slots exactly once without shifting the map', () => {
    const item = corpus.cases.find(item => item.id === 'split')!
    const indexes: number[] = []
    for (const part of item.parts!) {
      for (const { local: [row, col], bindingIndex } of part.events) {
        expect(row).toBeGreaterThanOrEqual(0)
        expect(row).toBeLessThan(part.rows)
        expect(col).toBeGreaterThanOrEqual(0)
        expect(col).toBeLessThan(part.columns)
        expect([row + part.offset[0], col + part.offset[1]]).toEqual(item.orderedPositions![bindingIndex])
        indexes.push(bindingIndex)
      }
    }
    expect(indexes.sort((a, b) => a - b)).toEqual([0, 1, 2, 3])
  })
})

describe('CHG-008 existing load/write seams (no discovery implementation)', () => {
  it('physical: hand-authored width reaches both fields through bundle load and layout JSON round-trip', () => {
    const item = corpus.cases.find(item => item.id === 'physical')!
    const keymap = parseKeymap(parseDtsKeymap(inputs(item).source))
    const bundle = loadKeyboardBundle({
      infoJson: { layouts: { default: { layout: item.normalizedLayout! } } },
      keymap
    })
    expect(bundle.layout[1]).toMatchObject({ w: 1.25, u: 1.25 })
    expect(bundle.layout.map(({ w, u }) => [w, u])).toEqual([
      [1, 1], [1.25, 1.25], [1, 1], [1, 1]
    ])
    // Layout JSON, not buildKeymapCode's firmware sidecar or a discovery export API.
    const layoutJson = JSON.stringify({ layouts: { default: { layout: bundle.layout } } })
    const reloaded = loadKeyboardBundle({ infoJson: JSON.parse(layoutJson), keymap })
    expect(reloaded.layout).toEqual(bundle.layout)
    expect(reloaded.layout[1]).toMatchObject({ w: 1.25, u: 1.25 })
  })

  it('does not hide invalid supplied nonempty geometry behind the rectangle', () => {
    const keymap = parseKeymap(parseDtsKeymap(readFixture(corpus.keymap)))
    const infoJson = { layouts: { default: { layout: [{ x: 0 }] } } }
    const before = JSON.stringify({ infoJson, keymap })
    expect(() => loadKeyboardBundle({ infoJson, keymap })).toThrow(/include "y" position/)
    expect(JSON.stringify({ infoJson, keymap })).toBe(before)
  })

  it.each(candidates)('$id: explicit hand-authored projection survives a real edited splice and JSON reload', item => {
    const { metadata, source } = inputs(item)
    const originalSource = `${metadata}\n${source}`
    const raw = parseDtsKeymap(originalSource)
    const editedLayers = raw.layers.map(row => [...row])
    editedLayers[0][0] = '&kp Z'
    const keymap = parseKeymap({ ...raw, layers: editedLayers })
    const layout = item.normalizedLayout!
    const infoJson = { id: 'explicit-spec-input', layouts: { default: { layout } } }
    const before = JSON.stringify({ infoJson, keymap })
    const bundle = loadKeyboardBundle({ infoJson, keymap, inferredLayoutWarning: 'spec_inferred_layout' })
    expect(bundle.layout).toEqual(layout)
    expect(bundle.inferredLayout).toBe(false)
    expect(bundle.warnings).toEqual([])
    expect(bundle.keymap).toBe(keymap)
    const built = buildKeymapCode(bundle.layout, bundle.keymap, { originalSource })
    expect(built.mode).toBe('splice')
    expect(built.code.startsWith(`${metadata}\n${source.split('/ {')[0]}`)).toBe(true)
    const reloaded = parseDtsKeymap(built.code)
    expect(reloaded.layers).toEqual(editedLayers)
    expect(reloaded.sensorBindings).toEqual(raw.sensorBindings)
    const jsonReload = encodeKeymap(parseKeymap(JSON.parse(built.json)))
    expect(jsonReload.layers).toEqual(editedLayers)
    expect(jsonReload.sensorBindings).toEqual(raw.sensorBindings)
    expect(JSON.stringify({ infoJson, keymap })).toBe(before)
  })

  it('demonstrates why raw electrical RCs must not become writer coordinates', () => {
    const item = corpus.cases.find(item => item.id === 'unibody')!
    const source = inputs(item).source
    const raw = parseDtsKeymap(source)
    const layers = raw.layers.map(row => [...row])
    layers[0][0] = '&kp Z' // No-op splicing alone would hide the ordering hazard.
    const unsafeLayout = item.normalizedLayout!.map((key, index) => ({
      ...key, row: item.orderedPositions![index][0], col: item.orderedPositions![index][1]
    }))
    const result = buildKeymapCode(unsafeLayout, parseKeymap({ ...raw, layers }), { originalSource: source })
    expect(parseDtsKeymap(result.code).layers[0]).toEqual(['&kp B', '&kp D', '&kp C', '&kp Z'])
    expect(parseDtsKeymap(result.code).layers[0]).not.toEqual(layers[0])
  })

  it.each(['missing', 'sensor-property-missing'])('%s: withholding geometry uses the existing rectangle and preserves firmware slots', id => {
    const item = corpus.cases.find(item => item.id === id)!
    const { source, metadata } = inputs(item)
    // Geometry is withheld by this test, not by an implemented metadata resolver.
    const originalSource = metadata === null ? source : `${metadata}\n${source}`
    const raw = parseDtsKeymap(originalSource)
    const keymap = parseKeymap(raw)
    const bundle = loadKeyboardBundle({ keymap, inferredLayoutWarning: 'spec_inferred_layout' })
    expect(bundle.layout).toEqual(inferRectangularLayout(raw.layers[0].length))
    expect(bundle.inferredLayout).toBe(true)
    expect(bundle.warnings).toEqual(['spec_inferred_layout'])
    expect(bundle.keymap).toBe(keymap)
    const built = buildKeymapCode(bundle.layout, keymap, { originalSource })
    expect(parseDtsKeymap(built.code).layers).toEqual(raw.layers)
    expect(parseDtsKeymap(built.code).sensorBindings).toEqual(raw.sensorBindings)
    expect(encodeKeymap(parseKeymap(JSON.parse(built.json))).sensorBindings).toEqual(raw.sensorBindings)
  })

  it.each(['count-mismatch', 'layer-mismatch'])('%s: existing all-layer guard refuses a mismatching hand-authored layout', id => {
    const item = corpus.cases.find(item => item.id === id)!
    const layout = corpus.cases.find(item => item.id === 'unibody')!.normalizedLayout!
    expect(() => assertLayerKeyCounts(layout, item.bindings!)).toThrow(/layout has/)
  })
})
