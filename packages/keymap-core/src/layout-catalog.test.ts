import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { buildLayoutCatalog, resolveCatalogLayout } from './layout-catalog.js'
import { parseDtsKeymap } from './dts-keymap.js'
import { buildKeymapCode, encodeKeymap, parseKeymap } from './keymap.js'
import type { LayoutCatalogEntryInput } from './layout-catalog.js'
import type { LayoutDiscoveryPart } from './layout-discovery.js'
import type { LayoutKey } from './types.js'
import { loadKeyboardBundle } from './keyboard-bundle.js'
import { inferRectangularLayout } from './layout.js'

const fixture = (name: string) => readFileSync(new URL(`../fixtures/layout-discovery/${name}`, import.meta.url), 'utf8')
const entry = (id: string) => ({
  id, board: 'spec_unibody', revision: '1',
  metadata: fixture('unibody.dtsi'),
  attribution: { url: 'https://example.invalid/synthetic', commit: 'a'.repeat(40), license: 'MIT', notice: 'Synthetic test input', path: 'unibody.dtsi' },
  stockIncludes: []
})
const source = { id: 'document-1', revision: 'revision-1', code: fixture('bindings.keymap').replace(/^#include[^\n]*\n/gm, '') }
const keymap = parseKeymap(parseDtsKeymap(source.code))

type Case = {
  id: string; metadata: string | null; proposedOutcome: string
  metadataEdits?: { old: string; new: string }[]
  keymapEdits?: { old: string; new: string }[]
  bindings?: string[][]; parts?: LayoutDiscoveryPart[]
  orderedPositions?: [number, number][]; normalizedLayout?: LayoutKey[]; sensorLabels?: string[]
}
const corpus = JSON.parse(fixture('cases.json')).cases as Case[]
const edit = (text: string, edits: Case['metadataEdits'] = []) => edits.reduce((source, item) => source.replace(item.old, item.new), text)

describe('resolved layout catalog', () => {
  it.each(corpus)('$id: exercises the real resolver, fallback and edited writer (not fixture integrity)', async item => {
    const metadata = item.metadata === null ? null : edit(fixture(item.metadata), item.metadataEdits)
    // Catalog tests do not invent stock-source closure evidence. The parser suite
    // separately proves exact stock preamble gating; unknown includes remain here.
    const code = edit(fixture('bindings.keymap'), item.keymapEdits).replace(/^#include <(?:behaviors.dtsi|dt-bindings\/zmk\/keys.h)>\n/gm, '')
    const parts = item.metadata === 'split.dtsi' ? corpus.find(value => value.id === 'split')!.parts : undefined
    const catalog = await buildLayoutCatalog('test', [{ ...entry('fixture'), metadata, ...(parts ? { parts, part: 'right' } : {}) }])
    const source = { id: 'fixture', revision: '1', code }
    const discovery = { catalog, source, selection: { entryId: 'fixture', sourceId: source.id, sourceRevision: source.revision, catalogRevision: catalog.revision } }
    const raw = parseDtsKeymap(code)
    const keymap = parseKeymap({ ...raw, layers: item.bindings ?? raw.layers })
    const before = JSON.stringify(keymap)
    if (item.proposedOutcome === 'error') {
      expect(() => loadKeyboardBundle({ keymap, discovery })).toThrow(/layer|count/i)
      expect(JSON.stringify(keymap)).toBe(before)
      return
    }
    const bundle = loadKeyboardBundle({ keymap, discovery })
    expect(bundle.keymap).toBe(keymap)
    if (item.proposedOutcome === 'candidate') {
      expect(bundle.discovery?.status).toBe('candidate')
      if (bundle.discovery?.status !== 'candidate') throw new Error(JSON.stringify(bundle.discovery))
      expect(bundle.discovery.layout.positions).toEqual(item.orderedPositions)
      expect(bundle.layout).toEqual(item.normalizedLayout)
      expect(bundle.discovery.layout.sensorLabels).toEqual(item.sensorLabels)
    } else {
      expect(bundle.discovery?.status).toBe('unavailable')
      expect(bundle.layout).toEqual(inferRectangularLayout(keymap.layers[0].length))
    }
    expect(JSON.stringify(keymap)).toBe(before)
    // A real edit, not no-op preservation, proves normalized writer order.
    const layers = encodeKeymap(keymap).layers.map(row => [...row])
    layers[0][0] = '&kp Z'
    const edited = parseKeymap({ ...encodeKeymap(keymap), layers })
    const originalSource = item.proposedOutcome === 'candidate' ? `${metadata}\n${code}` : code
    const built = buildKeymapCode(bundle.layout, edited, { originalSource })
    if (item.proposedOutcome === 'candidate') expect(built.code.startsWith(`${metadata}\n`)).toBe(true)
    expect(parseDtsKeymap(built.code).layers).toEqual(layers)
    expect(parseDtsKeymap(built.code).sensorBindings).toEqual(raw.sensorBindings)
    expect(encodeKeymap(parseKeymap(JSON.parse(built.json))).layers).toEqual(layers)
    expect(encodeKeymap(parseKeymap(JSON.parse(built.json))).sensorBindings).toEqual(raw.sensorBindings)
    const reloaded = loadKeyboardBundle({ keymap: edited, infoJson: JSON.parse(JSON.stringify({ layouts: { default: { layout: bundle.layout } } })) })
    expect(reloaded.layout).toEqual(bundle.layout)
    if (item.id === 'physical') expect(reloaded.layout[1]).toMatchObject({ w: 1.25, u: 1.25 })
  })

  it('content-addresses changed sources, licenses and versions and captures immutable inputs', async () => {
    const input: LayoutCatalogEntryInput = entry('a')
    const before = structuredClone(input)
    const pending = buildLayoutCatalog('v1', [input])
    input.metadata = 'changed while hashing'
    const original = await pending
    expect(original.entries[0].metadata).toBe(before.metadata)
    const changedSource = await buildLayoutCatalog('v1', [{ ...before, metadata: before.metadata + '\n' }])
    const changedLicense = await buildLayoutCatalog('v1', [{ ...before, attribution: { ...before.attribution, license: 'BSD-2-Clause' } }])
    const changedVersion = await buildLayoutCatalog('v2', [before])
    expect(new Set([original, changedSource, changedLicense, changedVersion].map(value => value.revision)).size).toBe(4)
    expect(Object.isFrozen(original.entries[0].normalized)).toBe(true)
  })

  it('rejects stale identity/version choices and unvalidated serialized catalogs', async () => {
    const catalog = await buildLayoutCatalog('v1', [entry('a')])
    const selection = { entryId: 'a', sourceId: source.id, sourceRevision: source.revision, catalogRevision: catalog.revision }
    for (const property of ['sourceId', 'sourceRevision', 'catalogRevision'] as const) {
      expect(resolveCatalogLayout({ catalog, source, keymap, selection: { ...selection, [property]: 'stale' } })).toMatchObject({ status: 'unavailable', reason: 'stale-selection' })
    }
    expect(resolveCatalogLayout({ catalog: structuredClone(catalog), source, keymap, selection })).toMatchObject({ status: 'unavailable', reason: 'invalid' })
    expect(resolveCatalogLayout({ catalog, source: { ...source, firmwareCommit: entry('a').attribution.commit }, keymap, selection })).toMatchObject({ provenance: { firmwareCompatibility: 'revision-matched' } })
  })

  it.each([
    { attribution: { ...entry('a').attribution, commit: 'main' } },
    { attribution: { ...entry('a').attribution, license: '' } },
    { attribution: { ...entry('a').attribution, path: '../escape.dtsi' } },
    { stockIncludes: [{ line: '#include "remote.dtsi"', path: 'remote.dtsi', sha256: 'a'.repeat(64), review: 'not stock' }] }
  ])('refuses unversioned or unproved manifest data: %j', async change => {
    await expect(buildLayoutCatalog('v1', [{ ...entry('a'), ...change }])).rejects.toThrow()
  })

  it('previews discovery only without explicit JSON and preserves fallback bindings', async () => {
    const catalog = await buildLayoutCatalog('catalog-1', [entry('a')])
    const selection = { entryId: 'a', sourceId: source.id, sourceRevision: source.revision, catalogRevision: catalog.revision }
    const discovery = { catalog, selection, source }
    const bundle = loadKeyboardBundle({ keymap, discovery })
    expect(bundle.layout.map(key => [key.x, key.y])).toEqual([[1, 1], [0, 0], [0, 1], [1, 0]])
    expect(bundle.discovery?.status).toBe('candidate')
    const layout = inferRectangularLayout(4)
    const explicit = loadKeyboardBundle({ keymap, discovery, infoJson: { layouts: { default: { layout } } } })
    expect(explicit.layout).toEqual(layout)
    expect(explicit.discovery).toBeUndefined()
    const fallback = loadKeyboardBundle({ keymap, discovery: { ...discovery, selection: { ...selection, entryId: 'unknown' } } })
    expect(fallback.layout).toEqual(layout)
    expect(fallback.discovery).toMatchObject({ status: 'unavailable', reason: 'unknown-selection' })
    expect(fallback.keymap).toBe(keymap)
    expect(fallback.warnings).toContain('layout_discovery_unknown-selection')
    expect(() => loadKeyboardBundle({ keymap, discovery, infoJson: { layouts: { default: { layout: layout.slice(1) } } } })).toThrow(/count|layout has/i)
  })

  it.each([
    ['row-offset', 1], ['col-offset', 1],
    ['row-offset', 0], ['col-offset', 0]
  ])('does not promote unproved %s declared as %i after a zero override', async (property, declared) => {
    const metadata = entry('a').metadata.replace('rows = <2>;', `rows = <2>; ${property} = <${declared}>;`)
    const catalog = await buildLayoutCatalog('v1', [{ ...entry('a'), metadata }])
    expect(catalog.entries[0].normalized.status).toBe(declared ? 'unavailable' : 'candidate')
    const selectedSource = { ...source, code: `${source.code}\n&spec_transform { ${property} = <0>; };` }
    const keymap = parseKeymap(parseDtsKeymap(selectedSource.code))
    const before = structuredClone(keymap)
    const selection = { entryId: 'a', sourceId: source.id, sourceRevision: source.revision, catalogRevision: catalog.revision }
    const discovery = { catalog, source: selectedSource, selection }
    expect(resolveCatalogLayout({ ...discovery, keymap })).toMatchObject({ status: 'unavailable', reason: 'invalid' })
    expect(keymap).toEqual(before)
    const bundle = loadKeyboardBundle({ keymap, discovery })
    expect(bundle.discovery).toMatchObject({ status: 'unavailable', reason: 'invalid' })
    expect(bundle.layout).toEqual(inferRectangularLayout(keymap.layers[0].length))
    expect(bundle.warnings).toContain('layout_discovery_invalid')
    expect(bundle.keymap).toBe(keymap)
    expect(bundle.keymap.layers).toEqual(before.layers)
    expect(bundle.keymap.sensorBindings).toEqual(before.sensorBindings)
    expect(bundle.keymap).toEqual(before)
  })

  it('emits deterministic sorted attributable artifacts without changing map order', async () => {
    const first = await buildLayoutCatalog('catalog-1', [entry('z'), entry('a')])
    const { id, ...rest } = entry('a')
    const reversedKeys = { ...rest, id }
    const second = await buildLayoutCatalog('catalog-1', [reversedKeys, entry('z')])
    expect(first).toEqual(second)
    expect(JSON.stringify(first)).toBe(JSON.stringify(second))
    expect(first.entries.map(item => item.id)).toEqual(['a', 'z'])
    expect(first.entries[0].sourceSha256).toBe(createHash('sha256').update(entry('a').metadata).digest('hex'))
    expect(first.entries[0].normalized.status).toBe('candidate')
    const selection = { entryId: 'a', sourceId: source.id, sourceRevision: source.revision, catalogRevision: first.revision }
    const result = resolveCatalogLayout({ catalog: first, selection, source, keymap })
    expect(result.status).toBe('candidate')
    if (result.status !== 'candidate') throw new Error(result.message)
    expect(result.layout.positions).toEqual([[1, 1], [0, 0], [1, 0], [0, 1]])
    expect(result.provenance.firmwareCompatibility).toBe('unverified')
    expect(result.provenance.board).toBe('spec_unibody')
    expect(result.provenance.sourceId).toBe(source.id)
  })
})
