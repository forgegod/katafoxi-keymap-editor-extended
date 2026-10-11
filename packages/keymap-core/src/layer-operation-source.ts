import { assertCanSpliceKeymap, findKeymapLayerNodes, parseDtsKeymap } from './dts-keymap.js'
import { encodeKeyBinding, encodeKeymap, loadBehaviorsData, parseKeyBinding, parseKeymap } from './keymap.js'
import { findNamedBlock, iterateChildNodes, scanDts, tokenizeBindingsDetailed, type DtsChildNode, type DtsScan } from './dts-scan.js'
import { spliceRgbLayerRecipeIntoDts } from './behavior-recipes.js'
import { dominantEol } from './eol.js'
import type { ParsedKeymap } from './types.js'

function fail(path: string, detail: string): never {
  throw new Error(`${path}: ${detail}. Review the source or definition externally.`)
}

type Property = { value: string; start: number; end: number }
// Closed, explicit stock/module policy. Quoted/local includes never qualify.
const stockIncludes = new Set([
  'behaviors.dtsi', 'behaviors/unicode.dtsi',
  'dt-bindings/zmk/keys.h', 'dt-bindings/zmk/modifiers.h', 'dt-bindings/zmk/bt.h',
  'dt-bindings/zmk/outputs.h', 'dt-bindings/zmk/rgb.h', 'dt-bindings/zmk/backlight.h',
  'dt-bindings/zmk/ext_power.h', 'dt-bindings/zmk/pointing.h'
])
const stock = new Map(loadBehaviorsData().map(def => [def.code, def]))
/** A deliberately closed source subset: every non-comment byte needs an owner. */
function properties(source: string, scan: DtsScan, start: number, end: number, children: DtsChildNode[], allowed: string[], path: string): Map<string, Property> {
  const chars = scan.masked.slice(start, end).split('')
  for (const child of children) chars.fill(' ', child.labelStart - start, child.end - start)
  const masked = chars.join('')
  const out = new Map<string, Property>()
  let offset = 0
  for (const statement of masked.split(';')) {
    if (!statement.trim()) { offset += statement.length + 1; continue }
    const match = /^\s*([#A-Za-z_][\w-]*)\s*(?:=\s*([\s\S]*?))?\s*$/.exec(statement)
    if (!match || !allowed.includes(match[1]) || out.has(match[1]) || offset + statement.length >= masked.length) {
      fail(path, `unsupported or repeated source property/token ${statement.trim().slice(0, 100)}`)
    }
    const absolute = start + offset
    const equals = statement.indexOf('=')
    out.set(match[1], { value: equals < 0 ? '' : source.slice(absolute + equals + 1, absolute + statement.length).trim(), start: absolute, end: absolute + statement.length + 1 })
    offset += statement.length + 1
  }
  return out
}

function stringValue(prop: Property | undefined, path: string): string {
  try {
    const value: unknown = JSON.parse(prop?.value ?? '')
    if (typeof value === 'string') return value
  } catch { /* unsupported DTS string syntax is not guessed */ }
  return fail(path, 'expected one literal string')
}

function bindingValues(prop: Property | undefined, path: string, single = false) {
  const text = prop ? scanDts(prop.value).masked : ''
  if (!/^<[^<>]*>$/.test(text)) fail(path, 'unrepresented binding fragment')
  const tokens = tokenizeBindingsDetailed(text.slice(1, -1))
  if (tokens.hasUnparsedFragment || (single && tokens.binds.length !== 1)) fail(path, 'every source binding must be represented (one output per combo)')
  for (const token of tokens.binds) {
    if (encodeKeyBinding(parseKeyBinding(token)).replace(/\s/g, '') !== token.replace(/\s/g, '')) fail(path, 'binding token cannot round-trip')
  }
}

function uintValues(prop: Property | undefined, path: string) {
  if (!prop) return
  const value = scanDts(prop.value).masked
  if (!/^<[^<>]*>$/.test(value) || value.slice(1, -1).trim().split(/\s+/).filter(Boolean).some(token => !/^(0|[1-9][0-9]*)$/.test(token))) fail(path, 'unsupported integer spelling or expression')
}

function canonicalNode(source: string): string {
  const masked = scanDts(source).masked
  const strings = [...masked.matchAll(/"[^"]*"/g)].map(match => source.slice(match.index, match.index! + match[0].length))
  return masked.replace(/\s/g, '') + JSON.stringify(strings)
}

function canonicalRgbNode(): string {
  const source = spliceRgbLayerRecipeIntoDts('/ {};')
  const scan = scanDts(source)
  const block = findNamedBlock(source, scan, 'behaviors')!
  const node = [...iterateChildNodes(scan, block)][0]
  return canonicalNode(source.slice(node.labelStart, node.end))
}

export function sourceModelFingerprint(keymap: ParsedKeymap): string {
  const encoded = encodeKeymap(keymap)
  const graph = {
    layers: encoded.layers,
    combos: (encoded.combos ?? []).map(c => ({ ...c, layers: c.layers?.length ? c.layers : undefined })),
    conditionalLayers: (encoded.conditionalLayers ?? []).map(r => ({ ...r, ifLayers: [...r.ifLayers].sort((a, b) => a - b) })),
    holdTaps: (encoded.holdTaps ?? []).map(({ params: _params, ...holdTap }) => ({
      ...holdTap,
      nodeName: holdTap.override ? undefined : holdTap.nodeName || holdTap.code.slice(1),
      bindings: holdTap.override ? undefined : holdTap.bindings?.length ? holdTap.bindings : ['&kp', '&kp']
    })),
    sensorBindings: encoded.sensorBindings ?? encoded.layers.map(() => [])
  }
  const stable = (value: unknown): unknown => Array.isArray(value) ? value.map(stable) :
    value && typeof value === 'object' ? Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, stable(v)])) : value
  return JSON.stringify(stable(graph))
}

export function inspectLayerOperationSource(source: string): { model: ParsedKeymap; schemas: Map<string, readonly string[]> } {
  const scan = scanDts(source)
  const dependency = /\b(?:DT_[A-Z0-9_]+|(?:ZMK_)?(?:KEYMAP_)?LAYER(?:S)?_(?:COUNT|LEN))\b/.exec(scan.masked)
  if (dependency) fail(`source token ${dependency[0]}`, 'unresolved devicetree/layer-count dependency')
  const roots = [...scan.masked.matchAll(/\/\s*\{/g)]
  if (roots.length !== 1) fail('source', 'expected exactly one root node')
  const root = roots[0]
  const open = root.index! + root[0].length - 1
  const close = scan.braceIndex[open]
  if (close < 0) fail('source', 'unclosed root')
  const exterior = (scan.masked.slice(0, root.index) + scan.masked.slice(close + 1).replace(/^\s*;/, '')).replace(/^\s*#include\s+<([^>]+)>[^\S\n]*$/gm, (line, name: string) => stockIncludes.has(name) ? '' : line)
  if (exterior.trim()) fail('source', `unverified include, overlay or token ${exterior.trim().slice(0, 100)}`)
  const rootChildren = [...iterateChildNodes(scan, { bodyStart: open + 1, bodyEnd: close })]
  properties(source, scan, open + 1, close, rootChildren, [], 'root')
  const schemas = new Map<string, readonly string[]>()
  const recipeDependencies = new Set<string>()
  const names = new Set<string>()
  for (const child of rootChildren) {
    if (child.label || names.has(child.name) || !['keymap', 'combos', 'conditional_layers', 'behaviors'].includes(child.name)) fail(`root.${child.name}`, 'unverified or repeated source node')
    names.add(child.name)
    if (child.name === 'keymap') continue
    const children = [...iterateChildNodes(scan, { bodyStart: child.openBrace + 1, bodyEnd: child.closeBrace })]
    const props = properties(source, scan, child.openBrace + 1, child.closeBrace, children, child.name === 'behaviors' ? [] : ['compatible'], child.name)
    if (child.name !== 'behaviors' && stringValue(props.get('compatible'), child.name) !== `zmk,${child.name.replace('_', '-')}`) fail(child.name, 'unknown compatible')
    const childNames = new Set<string>()
    for (const node of children) {
      const path = `${child.name}.${node.label ?? node.name}`
      if (childNames.has(node.name)) fail(path, 'duplicate node name')
      childNames.add(node.name)
      if (child.name === 'behaviors') {
        const code = `&${node.label ?? node.name}`
        if (schemas.has(code)) fail(path, 'duplicate behavior label')
        if (code === '&rgblayer') {
          if (canonicalNode(source.slice(node.labelStart, node.end)) !== canonicalRgbNode()) fail(path, 'not the canonical RGB layer recipe')
          // The body is proven canonical; its forwarding controls must also
          // retain stock semantics, regardless of declaration order.
          for (const ref of scan.masked.slice(node.openBrace + 1, node.closeBrace).match(/&[A-Za-z_]\w*/g) ?? []) recipeDependencies.add(ref)
          schemas.set(code, ['layer', 'hsb'])
          continue
        }
        const p = properties(source, scan, node.openBrace + 1, node.closeBrace, [], ['compatible', '#binding-cells', 'bindings', 'tapping-term-ms', 'quick-tap-ms', 'require-prior-idle-ms', 'flavor', 'label'], path)
        if (!node.label || stringValue(p.get('compatible'), path) !== 'zmk,behavior-hold-tap' || !/^<\s*2\s*>$/.test(p.get('#binding-cells')?.value ?? '')) fail(path, 'unproven behavior definition')
        const refs = /^<\s*(&[A-Za-z_]\w*)\s*>\s*,\s*<\s*(&[A-Za-z_]\w*)\s*>$/.exec(scanDts(p.get('bindings')?.value ?? '').masked)
        if (!refs) fail(path, 'hold-tap must forward exactly two unfixed arguments')
        const schema = refs.slice(1).map(ref => {
          const params = stock.get(ref)?.params
          if (!params || params.length !== 1 || !['code', 'layer'].includes(String(params[0]))) fail(path, `unproven forwarding child ${ref}`)
          return String(params[0])
        })
        const standard = stock.get(code)?.params
        if (standard && (standard.length !== schema.length || standard.some((kind, i) => (kind === 'layer') !== (schema[i] === 'layer')))) fail(path, 'stock behavior replacement is not compatible')
        schemas.set(code, schema)
      } else {
        if (node.label) fail(path, 'labeled combo/rule is not represented')
        const combo = child.name === 'combos'
        const p = properties(source, scan, node.openBrace + 1, node.closeBrace, [], combo ? ['bindings', 'key-positions', 'layers', 'timeout-ms', 'require-prior-idle-ms', 'slow-release'] : ['if-layers', 'then-layer'], path)
        if (combo) bindingValues(p.get('bindings'), `${path}.bindings`, true)
        for (const [name, prop] of p) if (name !== 'bindings' && name !== 'slow-release') uintValues(prop, `${path}.${name}`)
        if (p.has('slow-release') && p.get('slow-release')!.value !== '') fail(path, 'slow-release must be boolean')
      }
    }
  }
  const block = assertCanSpliceKeymap(source, scan)
  const children = [...iterateChildNodes(scan, block)]
  const top = properties(source, scan, block.bodyStart, block.bodyEnd, children, ['compatible'], 'keymap')
  if (stringValue(top.get('compatible'), 'keymap.compatible') !== 'zmk,keymap') fail('keymap', 'unknown compatible')
  const nodes = findKeymapLayerNodes(source, block, scan)
  if (children.length !== nodes.length || !nodes.length) fail('keymap', 'unrepresented layer node')
  if (new Set(nodes.map(node => node.name)).size !== nodes.length) fail('keymap', 'duplicate node names')
  for (const node of nodes) {
    const props = properties(source, scan, node.openBrace + 1, node.closeBrace, [], ['bindings', 'sensor-bindings', 'display-name'], `layer ${node.name}`)
    for (const name of ['bindings', 'sensor-bindings']) {
      const prop = props.get(name)
      if (name === 'bindings' && !prop) fail(`layer ${node.name}`, 'missing bindings')
      if (prop) bindingValues(prop, `layer ${node.name}.${name}`)
    }
    if (props.has('display-name')) stringValue(props.get('display-name'), `layer ${node.name}.display-name`)
  }
  const raw = parseDtsKeymap(source)
  if (raw.warnings.length) fail('source', raw.warnings.join(', '))
  const model = parseKeymap(raw)
  const encoded = encodeKeymap(model)
  const rawBindings = [...raw.layers.flat(), ...(raw.sensorBindings ?? []).flat(), ...(raw.combos ?? []).map(combo => combo.binding)]
  const parsedBindings = [...encoded.layers.flat(), ...(encoded.sensorBindings ?? []).flat(), ...(encoded.combos ?? []).map(combo => combo.binding)]
  rawBindings.forEach((binding, index) => {
    if (encodeKeyBinding(parseKeyBinding(binding)) !== parsedBindings[index]) fail(`source binding ${binding}`, 'parser normalization loses or changes arguments')
  })
  // A named definition replacing a stock forwarding child invalidates proof.
  for (const holdTap of raw.holdTaps ?? []) for (const ref of holdTap.bindings ?? []) {
    if (schemas.has(ref)) fail(holdTap.code, `forwarding child ${ref} is overridden`)
  }
  for (const ref of recipeDependencies) {
    if (schemas.has(ref)) fail('behaviors.rgblayer', `recipe dependency ${ref} is overridden`)
  }
  return { model, schemas }
}

/** Copy only the explicitly supported source-only metadata, never a DTS label. */
export function copyLayerDisplayName(original: string, result: string, index: number, name: string): string {
  const nodes = findKeymapLayerNodes(original, assertCanSpliceKeymap(original))
  const selected = nodes[index]
  const props = properties(original, scanDts(original), selected.openBrace + 1, selected.closeBrace, [], ['bindings', 'sensor-bindings', 'display-name'], selected.name)
  if (!props.has('display-name')) return result
  const nextNodes = findKeymapLayerNodes(result, assertCanSpliceKeymap(result))
  const appended = nextNodes[nextNodes.length - 1]
  const insertion = `${dominantEol(result)}        display-name = ${JSON.stringify(name)};`
  return result.slice(0, appended.openBrace + 1) + insertion + result.slice(appended.openBrace + 1)
}

/** Layer zero remains in place. A following leading comment belongs to its node. */
export function moveLayerSourceNodes(source: string, order: number[]): string {
  const block = assertCanSpliceKeymap(source)
  const nodes = findKeymapLayerNodes(source, block)
  const masked = scanDts(source).masked
  const ends = nodes.map(node => {
    if (source[node.nodeEnd - 1] === '\n') return node.nodeEnd
    const eol = source.indexOf('\n', node.nodeEnd)
    return eol >= 0 && !masked.slice(node.nodeEnd, eol).trim() ? eol + 1 : node.nodeEnd
  })
  const chunks = nodes.map((node, index) => source.slice(index === 0 ? node.labelStart : ends[index - 1], ends[index]))
  return source.slice(0, nodes[0].labelStart) + order.map(old => chunks[old]).join('') + source.slice(ends[ends.length - 1])
}
