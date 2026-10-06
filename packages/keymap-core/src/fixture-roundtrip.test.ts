/**
 * No-op Save on vendored .keymap fixtures: parse → buildKeymapCode with
 * originalSource must leave the file byte-identical (ADR 0002 splice path).
 *
 * The Lark fixture expands `#define` aliases in bindings on Save (ADR 0002
 * “lossy accept”). That is the only allowed whole-file mismatch: text outside
 * layer `bindings = <…>` interiors stays byte-identical, and interiors differ
 * only by those expansions (plus the splice table rewrite that follows).
 */

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  findKeymapLayerNodes,
  findZmkKeymapBlock,
  parseDtsKeymap
} from './dts-keymap.js'
import { scanDts, tokenizeBindings } from './dts-scan.js'
import {
  buildKeymapCode,
  encodeKeyBinding,
  parseKeymap,
  type LayoutKey
} from './index.js'

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
