/**
 * No-op Save on vendored .keymap fixtures: parse → buildKeymapCode with
 * originalSource must leave the file byte-identical (ADR 0002 splice path).
 *
 * The Lark fixture expands `#define` aliases in bindings on Save (ADR 0002
 * “lossy accept”). That is the only allowed whole-file mismatch: text outside
 * layer `bindings = <…>` interiors stays byte-identical, and interiors differ
 * only by those expansions (plus the splice table rewrite that follows).
 *
 * Locality properties edit one (or two) keys on the same fixtures. Lark is
 * compared against the already-expanded no-op Save so `#define` interiors
 * do not look like extra splice damage.
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  findKeymapLayerNodes,
  findZmkKeymapBlock,
  parseDtsKeymap
} from './dts-keymap.js'
import { findNamedBlock, scanDts, tokenizeBindings } from './dts-scan.js'
import {
  buildKeymapCode,
  cloneParsedKeymap,
  diffKeymaps,
  encodeKeyBinding,
  parseKeymap,
  type LayoutKey,
  type ParsedKeymap
} from './index.js'
import { bindingArb } from './testing/binding-arbitraries.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../fixtures')
const CATALOG = join(ROOT, 'demo/catalog.json')
const LARK_ID = 'lark'

interface DemoCatalog {
  demos: Array<{ id: string }>
}

interface InfoJson {
  layouts: Record<string, { layout: LayoutKey[] }>
}

interface FixtureCase {
  id: string
  dir: string
}

function fixtureDirFor(id: string): string {
  return id === LARK_ID ? join(ROOT, 'lark') : join(ROOT, 'demo', id)
}

function loadCases(): FixtureCase[] {
  const catalog = JSON.parse(readFileSync(CATALOG, 'utf8')) as DemoCatalog
  const byId = new Map<string, FixtureCase>()
  byId.set(LARK_ID, { id: LARK_ID, dir: fixtureDirFor(LARK_ID) })
  for (const demo of catalog.demos) {
    byId.set(demo.id, { id: demo.id, dir: fixtureDirFor(demo.id) })
  }
  return [...byId.values()]
}

function layoutFromInfo(info: InfoJson): LayoutKey[] {
  const named = info.layouts.LAYOUT
  if (named) return named.layout
  const first = Object.values(info.layouts)[0]
  if (!first) throw new Error('info.json has no layouts')
  return first.layout
}

function loadFixture(c: FixtureCase): { source: string; layout: LayoutKey[] } {
  const source = readFileSync(join(c.dir, `${c.id}.keymap`), 'utf8')
  const info = JSON.parse(readFileSync(join(c.dir, 'info.json'), 'utf8')) as InfoJson
  return { source, layout: layoutFromInfo(info) }
}

function firstDiff(a: string, b: string): string {
  const n = Math.min(a.length, b.length)
  let i = 0
  while (i < n && a[i] === b[i]) i++
  const slice = (s: string) => JSON.stringify(s.slice(Math.max(0, i - 24), i + 48))
  return `at ${i} (a ${a.length} b ${b.length}) a=${slice(a)} b=${slice(b)}`
}

function bindingExteriors(source: string): string {
  const scan = scanDts(source)
  const block = findZmkKeymapBlock(source, scan)
  if (!block) return source
  const nodes = findKeymapLayerNodes(source, block, scan)
  let out = source
  for (let i = nodes.length - 1; i >= 0; i--) {
    const { start, end } = nodes[i]!.bindingsInterior
    out = `${out.slice(0, start)}\n/*layer-${i}*/\n${out.slice(end)}`
  }
  return out
}

function layerInteriors(source: string): string[] {
  const scan = scanDts(source)
  const block = findZmkKeymapBlock(source, scan)
  if (!block) return []
  return findKeymapLayerNodes(source, block, scan).map(node =>
    source.slice(node.bindingsInterior.start, node.bindingsInterior.end)
  )
}

const LARK_BINDING_ALIASES: Array<[alias: string, expansion: string]> = [
  ['BT0', 'BT_SEL 0'],
  ['BT1', 'BT_SEL 1'],
  ['BT2', 'BT_SEL 2'],
  ['BT3', 'BT_SEL 3'],
  ['BT4', 'BT_SEL 4'],
  ['PAUSE', 'PAUSE_BREAK'],
  ['VU', 'C_VOL_UP'],
  ['VD', 'C_VOL_DN']
]

function expectLarkMacroExpansionDiff(
  source: string,
  code: string,
  parsedLayers: string[][]
): void {
  expect(bindingExteriors(code), firstDiff(bindingExteriors(source), bindingExteriors(code))).toBe(
    bindingExteriors(source)
  )

  const sourceInteriors = layerInteriors(source)
  const codeInteriors = layerInteriors(code)
  expect(codeInteriors.map(tokenizeBindings)).toEqual(parsedLayers)
  expect(codeInteriors).not.toEqual(sourceInteriors)

  const sourceText = sourceInteriors.join('\n')
  const codeText = codeInteriors.join('\n')
  const used = LARK_BINDING_ALIASES.filter(([alias]) =>
    new RegExp(`\\b${alias}\\b`).test(sourceText)
  )
  expect(used.length).toBeGreaterThan(0)
  for (const [alias, expansion] of used) {
    expect(codeText).toContain(expansion)
    expect(codeText).not.toMatch(new RegExp(`\\b${alias}\\b`))
  }
}

const cases = loadCases()

describe('no-op Save round-trip on fixtures', () => {
  it('covers fixtures/lark and every catalog demo', () => {
    const catalog = JSON.parse(readFileSync(CATALOG, 'utf8')) as DemoCatalog
    expect(cases.some(c => c.id === LARK_ID)).toBe(true)
    expect(cases.map(c => c.id).sort()).toEqual(
      [...new Set([LARK_ID, ...catalog.demos.map(d => d.id)])].sort()
    )
  })

  it.each(cases)('$id: no-op splice is byte-identical (LF and CRLF)', ({ id, dir }) => {
    const { source, layout } = loadFixture({ id, dir })
    expectNoOpRoundTrip(id, source, layout)

    const crlf = source.replace(/\n/g, '\r\n')
    expect(crlf.includes('\r\n')).toBe(true)
    expectNoOpRoundTrip(id, crlf, layout)
    const { built } = roundTrip(layout, crlf)
    expect(built.code.includes('\r\n')).toBe(true)
  })
})

function roundTrip(layout: LayoutKey[], source: string) {
  const parsed = parseKeymap(parseDtsKeymap(source))
  const built = buildKeymapCode(layout, parsed, { originalSource: source })
  return { parsed, built }
}

function expectNoOpRoundTrip(id: string, source: string, layout: LayoutKey[]): void {
  const { parsed, built } = roundTrip(layout, source)
  expect(built.mode).toBe('splice')

  const fromJson = parseKeymap(JSON.parse(built.json) as { layers: string[][] })
  expect(fromJson.layers.map(layer => layer.map(encodeKeyBinding))).toEqual(
    parsed.layers.map(layer => layer.map(encodeKeyBinding))
  )

  if (built.code === source) return

  const expanded = parsed.layers.map(layer => layer.map(encodeKeyBinding))
  if (id === LARK_ID && built.warnings.includes('macros_expanded')) {
    expectLarkMacroExpansionDiff(source, built.code, expanded)
    return
  }

  expect(built.code, firstDiff(source, built.code)).toBe(source)
}

interface LoadedFixture {
  id: string
  layout: LayoutKey[]
  /**
   * Locality baseline: original source, except Lark uses the expanded no-op
   * Save so `#define` interiors are already token-equal to the model.
   */
  baseline: string
  parsed: ParsedKeymap
}

function loadForEdit(c: FixtureCase): LoadedFixture {
  const { source, layout } = loadFixture(c)
  const parsed = parseKeymap(parseDtsKeymap(source))
  let baseline = source
  if (c.id === LARK_ID) {
    const built = buildKeymapCode(layout, parsed, { originalSource: source })
    expect(built.mode).toBe('splice')
    baseline = built.code
  }
  return { id: c.id, layout, baseline, parsed }
}

function layerNodes(source: string) {
  const scan = scanDts(source)
  const block = findZmkKeymapBlock(source, scan)
  if (!block) throw new Error('no zmk,keymap block')
  return findKeymapLayerNodes(source, block, scan)
}

function namedBlockSlice(
  source: string,
  keyword: string,
  compatible?: string
): string | null {
  const block = findNamedBlock(source, scanDts(source), keyword, {
    ...(compatible ? { compatible } : {})
  })
  if (!block) return null
  let end = block.closeBrace + 1
  if (source[end] === ';') end++
  return source.slice(block.keywordStart, end)
}

function expectSiblingBlocksUntouched(before: string, after: string): void {
  expect(namedBlockSlice(after, 'combos', 'zmk,combos')).toBe(
    namedBlockSlice(before, 'combos', 'zmk,combos')
  )
  expect(namedBlockSlice(after, 'conditional_layers', 'zmk,conditional-layers')).toBe(
    namedBlockSlice(before, 'conditional_layers', 'zmk,conditional-layers')
  )
  expect(namedBlockSlice(after, 'behaviors')).toBe(namedBlockSlice(before, 'behaviors'))
}

function commonPrefixLen(a: string, b: string): number {
  const n = Math.min(a.length, b.length)
  let i = 0
  while (i < n && a[i] === b[i]) i++
  return i
}

function commonSuffixLen(a: string, b: string, prefixLen: number): number {
  const n = Math.min(a.length - prefixLen, b.length - prefixLen)
  let i = 0
  while (i < n && a[a.length - 1 - i] === b[b.length - 1 - i]) i++
  return i
}

/** True when the single prefix/suffix gap sits inside `interior`. */
function spanInsideInterior(
  text: string,
  prefix: number,
  suffix: number,
  interior: { start: number; end: number }
): boolean {
  const from = prefix
  const to = text.length - suffix
  if (from > to) return false
  return from >= interior.start && to <= interior.end
}

function assertFc(label: string, property: Parameters<typeof fc.assert>[0], numRuns = 100): void {
  try {
    fc.assert(property, { numRuns })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const seed = msg.match(/seed:\s*(-?\d+)/)?.[1] ?? 'unknown'
    throw new Error(`${label} failed (seed ${seed}):\n${msg}`)
  }
}

const loadedFixtures = cases.map(loadForEdit)
const fixtureArb = fc.constantFrom(...loadedFixtures)

describe('fixture splice locality', () => {
  it('one binding edit rewrites one interval inside that layer and reparses', () => {
    const editArb = fixtureArb.chain(fx =>
      fc.record({
        fx: fc.constant(fx),
        layer: fc.integer({ min: 0, max: fx.parsed.layers.length - 1 }),
        index: fc.integer({ min: 0, max: fx.layout.length - 1 }),
        binding: bindingArb
      })
    )

    assertFc(
      'one-key locality',
      fc.property(editArb, ({ fx, layer, index, binding }) => {
        const before = encodeKeyBinding(fx.parsed.layers[layer]![index]!)
        const after = encodeKeyBinding(binding)
        fc.pre(before !== after)

        const draft = cloneParsedKeymap(fx.parsed)
        draft.layers[layer]![index] = binding
        const built = buildKeymapCode(fx.layout, draft, { originalSource: fx.baseline })
        expect(built.mode).toBe('splice')
        expect(built.code).not.toBe(fx.baseline)

        const prefix = commonPrefixLen(fx.baseline, built.code)
        const suffix = commonSuffixLen(fx.baseline, built.code, prefix)
        const srcInterior = layerNodes(fx.baseline)[layer]!.bindingsInterior
        const codeInterior = layerNodes(built.code)[layer]!.bindingsInterior
        expect(
          spanInsideInterior(fx.baseline, prefix, suffix, srcInterior),
          `changed span in source [${prefix}, ${fx.baseline.length - suffix}) not inside layer ${layer} bindings`
        ).toBe(true)
        expect(
          spanInsideInterior(built.code, prefix, suffix, codeInterior),
          `changed span in code [${prefix}, ${built.code.length - suffix}) not inside layer ${layer} bindings`
        ).toBe(true)

        const reparsed = parseKeymap(parseDtsKeymap(built.code))
        expect(diffKeymaps(draft, reparsed)).toEqual([])
        expectSiblingBlocksUntouched(fx.baseline, built.code)

        const srcInteriors = layerInteriors(fx.baseline)
        const codeInteriors = layerInteriors(built.code)
        for (let i = 0; i < srcInteriors.length; i++) {
          if (i === layer) continue
          expect(codeInteriors[i], `unedited layer ${i} interior changed`).toBe(srcInteriors[i])
        }
        expect(tokenizeBindings(codeInteriors[layer]!)[index]).toBe(after)
      })
    )
  })

  it('two binding edits on different layers both land and leave the rest', () => {
    const twoEditArb = fixtureArb.chain(fx => {
      const lastLayer = fx.parsed.layers.length - 1
      const lastKey = fx.layout.length - 1
      return fc.record({
        fx: fc.constant(fx),
        layers: fc.uniqueArray(fc.integer({ min: 0, max: lastLayer }), {
          minLength: 2,
          maxLength: 2
        }),
        indexA: fc.integer({ min: 0, max: lastKey }),
        indexB: fc.integer({ min: 0, max: lastKey }),
        bindingA: bindingArb,
        bindingB: bindingArb
      })
    })

    assertFc(
      'two-layer locality',
      fc.property(
        twoEditArb,
        ({ fx, layers, indexA, indexB, bindingA, bindingB }) => {
          fc.pre(fx.parsed.layers.length >= 2)
          const [layerA, layerB] = layers
          const encodedA = encodeKeyBinding(bindingA)
          const encodedB = encodeKeyBinding(bindingB)
          fc.pre(encodedA !== encodeKeyBinding(fx.parsed.layers[layerA!]![indexA]!))
          fc.pre(encodedB !== encodeKeyBinding(fx.parsed.layers[layerB!]![indexB]!))

          const draft = cloneParsedKeymap(fx.parsed)
          draft.layers[layerA!]![indexA] = bindingA
          draft.layers[layerB!]![indexB] = bindingB
          const built = buildKeymapCode(fx.layout, draft, { originalSource: fx.baseline })
          expect(built.mode).toBe('splice')

          const srcInteriors = layerInteriors(fx.baseline)
          const codeInteriors = layerInteriors(built.code)
          const edited = new Set([layerA, layerB])
          for (let i = 0; i < srcInteriors.length; i++) {
            if (edited.has(i)) continue
            expect(codeInteriors[i], `unedited layer ${i} interior changed`).toBe(srcInteriors[i])
          }
          expect(tokenizeBindings(codeInteriors[layerA!]!)[indexA]).toBe(encodedA)
          expect(tokenizeBindings(codeInteriors[layerB!]!)[indexB]).toBe(encodedB)
          expect(bindingExteriors(built.code)).toBe(bindingExteriors(fx.baseline))

          const reparsed = parseKeymap(parseDtsKeymap(built.code))
          expect(diffKeymaps(draft, reparsed)).toEqual([])
          expectSiblingBlocksUntouched(fx.baseline, built.code)
        }
      )
    )
  })
})
