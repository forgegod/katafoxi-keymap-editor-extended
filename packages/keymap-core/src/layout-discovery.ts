import { inferRectangularLayout } from './layout.js'
import { scanDts } from './dts-scan.js'
import type { LayoutKey } from './types.js'

export const LAYOUT_DISCOVERY_LIMITS = {
  sourceBytes: 256 * 1024,
  candidates: 64,
  keys: 512,
  sensors: 16,
  dimension: 255
} as const

export type LayoutDiscoveryFailure = 'missing' | 'unknown-selection' | 'stale-selection' |
  'ambiguous' | 'unsupported' | 'invalid' | 'count-mismatch'

export class LayoutDiscoveryError extends Error {
  constructor(readonly reason: LayoutDiscoveryFailure, message: string) {
    super(message)
    this.name = 'LayoutDiscoveryError'
  }
}

function fail(reason: LayoutDiscoveryFailure, message: string): never {
  throw new LayoutDiscoveryError(reason, message)
}

type Node = { name: string; label?: string; props: Map<string, string[]>; children: Node[] }
const TRANSFORMS = ['zmk,matrix-transform', 'zmk,matrix_transform']
const labelPattern = /^[A-Za-z_]\w*$/

export const LAYOUT_STOCK_PREAMBLE = ['#include <behaviors.dtsi>', '#include <dt-bindings/zmk/keys.h>'] as const

export interface LayoutDiscoveryPart {
  id: string
  rows: number
  columns: number
  offset: [number, number]
  events: { local: [number, number]; bindingIndex: number }[]
}

export interface ParseLayoutMetadataOptions {
  selectedSource?: string
  /** Exact stock lines vouched for by the reviewed catalog closure, not user include hints. */
  stockIncludes?: readonly string[]
  candidate?: { kind: 'transform' | 'physical'; label: string }
  parts?: readonly LayoutDiscoveryPart[]
  selectedPart?: string
}

function checkSize(source: string) {
  if (source.length > LAYOUT_DISCOVERY_LIMITS.sourceBytes ||
      new TextEncoder().encode(source).length > LAYOUT_DISCOVERY_LIMITS.sourceBytes) {
    fail('unsupported', 'Metadata exceeds the 256 KiB source limit')
  }
}

/** Closed DTS structure, not a preprocessor. Every byte/token must be consumed. */
function readTree(source: string): Node[] {
  checkSize(source)
  const tokens: string[] = []
  const token = /\s+|\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:[^"\\\r\n]|\\[^\r\n])*"|[A-Za-z_#][A-Za-z0-9_,.@+?#-]*|\d+|[{};=<>:(),&/+-]/y
  let at = 0
  while (at < source.length) {
    token.lastIndex = at
    const match = token.exec(source)
    if (!match) fail('unsupported', 'Unsupported metadata syntax')
    const value = match[0]
    at = token.lastIndex
    if (!/^\s|^\/\*|^\/\//.test(value)) tokens.push(value)
  }
  let i = 0
  let nodes = 0
  const take = (expected: string) => {
    if (tokens[i++] !== expected) fail('unsupported', `Expected ${expected} in literal metadata`)
  }
  const read = (depth: number): Node => {
    if (depth > 16 || ++nodes > 2048) fail('unsupported', 'Metadata structure limit exceeded')
    let name = tokens[i++]
    let label: string | undefined
    if (tokens[i] === ':') {
      label = name
      if (!labelPattern.test(label)) fail('invalid', 'Invalid metadata label')
      i++
      name = tokens[i++]
    } else if (name === '&') {
      name += tokens[i++]
    }
    if (!/^(?:\/|&?[A-Za-z_][\w,.@+-]*)$/.test(name ?? '')) {
      fail('unsupported', 'Unsupported node declaration')
    }
    take('{')
    const node: Node = { name, label, props: new Map(), children: [] }
    while (i < tokens.length && tokens[i] !== '}') {
      if (tokens[i + 1] === '{' || tokens[i + 1] === ':') {
        node.children.push(read(depth + 1))
        continue
      }
      const prop = tokens[i++]
      if (!/^[A-Za-z_#][\w,#-]*$/.test(prop)) fail('unsupported', 'Unsupported metadata property')
      if (node.props.has(prop)) fail('ambiguous', `Repeated property ${prop}`)
      const values: string[] = []
      if (tokens[i] === '=') {
        i++
        while (i < tokens.length && tokens[i] !== ';') {
          if (['{', '}'].includes(tokens[i])) fail('unsupported', `Malformed ${prop}`)
          values.push(tokens[i++])
        }
      }
      take(';')
      node.props.set(prop, values)
    }
    take('}')
    take(';')
    return node
  }
  const roots: Node[] = []
  while (i < tokens.length) roots.push(read(0))
  return roots
}

function text(node: Node, property: string): string | undefined {
  const value = node.props.get(property)
  if (value === undefined) return undefined
  if (value.length !== 1 || !/^"[^"\\]*"$/.test(value[0])) fail('unsupported', `Expected literal ${property}`)
  return value[0].slice(1, -1)
}

function allowed(node: Node, properties: string[]) {
  for (const key of node.props.keys()) {
    if (!properties.includes(key)) fail('unsupported', `Unsupported ${node.name} property ${key}`)
  }
  if (node.children.length) fail('unsupported', `Nested metadata in ${node.name} is unsupported`)
}

function uint(token: string, max: number): number {
  if (!/^\d+$/.test(token ?? '')) fail('unsupported', 'Expected a decimal integer literal')
  const value = Number(token)
  if (!Number.isSafeInteger(value) || value > max) fail('invalid', 'Integer outside supported extent')
  return value
}

function scalar(node: Node, property: string, max: number, fallback?: number): number {
  const value = node.props.get(property)
  if (value === undefined && fallback !== undefined) return fallback
  if (!value || value.length !== 3 || value[0] !== '<' || value[2] !== '>') {
    fail('unsupported', `Expected one literal cell for ${property}`)
  }
  return uint(value[1], max)
}

function reference(value: string[] | undefined): string {
  const cells = value?.[0] === '<' && value.at(-1) === '>' ? value.slice(1, -1) : value
  if (!cells || cells.length !== 2 || cells[0] !== '&' || !labelPattern.test(cells[1])) {
    fail('invalid', 'Expected one label reference')
  }
  return cells[1]
}

function enabled(node: Node): boolean {
  return [undefined, 'okay', 'ok'].includes(text(node, 'status'))
}

function sensors(nodes: Node[], labels: Map<string, Node>): string[] | undefined {
  const lists = nodes.filter(node => text(node, 'compatible') === 'zmk,keymap-sensors')
  if (lists.length > 1) fail('ambiguous', 'Multiple sensor lists')
  if (!lists.length) return undefined
  const node = lists[0]
  allowed(node, ['compatible', 'status', 'sensors'])
  if (!enabled(node)) fail('invalid', 'Sensor list is disabled')
  const cells = node.props.get('sensors')
  if (!cells || cells[0] !== '<' || cells.at(-1) !== '>') fail('invalid', 'Sensor node requires sensors property')
  const result: string[] = []
  for (let i = 1; i < cells.length - 1; i += 2) {
    if (result.length >= LAYOUT_DISCOVERY_LIMITS.sensors) fail('unsupported', 'Sensor limit exceeded')
    const label = reference(cells.slice(i, i + 2))
    const sensor = labels.get(label)
    if (!sensor || !enabled(sensor) || text(sensor, 'compatible') !== 'alps,ec11') fail('invalid', 'Sensor reference is unresolved, disabled or unsupported')
    if (result.includes(label)) fail('invalid', 'Duplicate sensor label')
    result.push(label)
  }
  return result
}

function physicalKeys(node: Node, labels: Map<string, Node>, slots: LayoutKey[]): LayoutKey[] {
  const cells = node.props.get('keys')!
  const keys: LayoutKey[] = []
  let i = 0
  while (i < cells.length) {
    if (keys.length >= LAYOUT_DISCOVERY_LIMITS.keys) fail('unsupported', 'Physical key limit exceeded')
    if (cells[i++] !== '<' || cells[i++] !== '&') fail('unsupported', 'Expected physical attributes reference')
    const provider = labels.get(cells[i++])
    if (!provider || !enabled(provider) || text(provider, 'compatible') !== 'zmk,key-physical-attrs' ||
        scalar(provider, '#key-cells', 7) !== 7) fail('invalid', 'Unresolved seven-cell physical attributes provider')
    allowed(provider, ['compatible', 'status', '#key-cells'])
    const values: number[] = []
    for (let field = 0; field < 7; field++) {
      let value: number
      if (field >= 4 && cells[i] === '(' && cells[i + 1] === '-') {
        value = -uint(cells[i + 2], 32768)
        if (cells[i + 3] !== ')') fail('unsupported', 'Only parenthesized negative literals are supported')
        i += 4
      } else {
        value = uint(cells[i++], 32767)
      }
      values.push(value / 100)
    }
    if (cells[i++] !== '>') fail('unsupported', 'Physical keys require exactly seven cells')
    const [w, h, x, y, r, rx, ry] = values
    if (w <= 0 || h <= 0) fail('invalid', 'Physical dimensions must be positive')
    const slot = slots[keys.length]
    keys.push({ row: slot?.row, col: slot?.col, x, y, w, u: w, h, r, rx, ry })
    if (i < cells.length && (cells[i++] !== ',' || i === cells.length)) fail('unsupported', 'Expected next physical key')
  }
  if (keys.length !== slots.length) fail('count-mismatch', 'Physical key count differs from map')
  if (new Set(keys.map(key => `${key.x},${key.y}`)).size !== keys.length) fail('invalid', 'Duplicate physical origin')
  return keys
}

export interface DiscoveredLayout {
  layout: LayoutKey[]
  positions: [number, number][]
  transform: string
  compatible: string
  rows: number
  columns: number
  offset: [number, number]
  geometry: 'electrical-inference' | 'source-declared'
  physicalLayout?: string
  sensorLabels?: string[]
}

function documentOverrides(source: string, stockIncludes: readonly string[]): Node[] {
  checkSize(source)
  const masked = scanDts(source).masked
  // Remove only exact, reviewed stock lines; every other directive stays unsupported.
  const directives = [...masked.matchAll(/^[ \t]*#include[^\n]*/gm)]
  for (const match of directives.reverse()) {
    const line = source.slice(match.index, match.index + match[0].length).trim()
    if (!LAYOUT_STOCK_PREAMBLE.some(allowed => allowed === line) || !stockIncludes.includes(line)) {
      fail('unsupported', 'Unproved selected-keymap include; supply explicit layout JSON')
    }
    source = source.slice(0, match.index) + source.slice(match.index + match[0].length)
  }
  const roots = readTree(source)
  const overrides: Node[] = []
  let rootSeen = false
  for (const root of roots) {
    if (root.label) fail('unsupported', 'Selected-document labels are outside the metadata closure')
    if (root.name.startsWith('&')) {
      allowed(root, ['row-offset', 'col-offset'])
      overrides.push(root)
      continue
    }
    if (root.name !== '/' || rootSeen || root.props.size) fail('unsupported', 'Unproved selected-document root')
    rootSeen = true
    const names = new Set<string>()
    for (const node of root.children) {
      if (node.label) fail('unsupported', 'Selected-document labels are outside the metadata closure')
      if (names.has(node.name)) fail('ambiguous', 'Repeated selected-document node')
      names.add(node.name)
      if (node.name === 'chosen') {
        allowed(node, [...TRANSFORMS, 'zmk,physical-layout'])
        overrides.push(node)
      } else if (node.name === 'keymap' && !node.label && text(node, 'compatible') === 'zmk,keymap') {
        if (node.props.size !== 1) fail('unsupported', 'Unproved keymap property')
        for (const layer of node.children) {
          if (layer.label) fail('unsupported', 'Labeled keymap layers are outside discovery closure')
          allowed(layer, ['bindings', 'sensor-bindings', 'display-name', 'label'])
        }
      } else fail('unsupported', `Unproved selected-document node ${node.name}`)
    }
  }
  return overrides
}

function validateParts(result: DiscoveredLayout, options: ParseLayoutMetadataOptions, requiresPartClosure: boolean) {
  const { parts, selectedPart } = options
  if (!parts) {
    if (requiresPartClosure || selectedPart !== undefined) fail('invalid', 'Nonzero or selected-source offsets require a proved part event closure')
    return
  }
  if (!parts.length || parts.length > 32) fail('unsupported', 'Part count limit exceeded')
  const selected = parts.find(part => part.id === selectedPart)
  if (!selected || selected.offset.some((value, i) => value !== result.offset[i])) fail('invalid', 'Selected part offsets disagree with transform')
  const ids = new Set<string>()
  const covered = new Set<number>()
  const bounded = (value: number, max: number) => Number.isInteger(value) && value >= 0 && value <= max
  for (const part of parts) {
    if (!part.id || ids.has(part.id)) fail('invalid', 'Duplicate or empty part ID')
    ids.add(part.id)
    if (!bounded(part.rows, 255) || !part.rows || !bounded(part.columns, 255) || !part.columns ||
        part.offset.length !== 2 || part.offset.some(value => !bounded(value, 254)) || part.events.length > 512) fail('invalid', 'Invalid part extent or offset')
    const local = new Set<string>()
    for (const event of part.events) {
      const [row, col] = event.local
      const position = result.positions[event.bindingIndex]
      if (event.local.length !== 2 || !bounded(row, part.rows - 1) || !bounded(col, part.columns - 1) ||
          !bounded(event.bindingIndex, result.positions.length - 1) || covered.has(event.bindingIndex) || local.has(`${row},${col}`) ||
          !position || row + part.offset[0] !== position[0] || col + part.offset[1] !== position[1]) fail('invalid', 'Part events must cover each global slot exactly once')
      local.add(`${row},${col}`)
      covered.add(event.bindingIndex)
    }
  }
  if (covered.size !== result.positions.length) fail('invalid', 'Part events do not cover the complete map')
}

/** Parses only supplied resolved literals. It performs no I/O or include expansion. */
export function parseLayoutMetadata(source: string, options: ParseLayoutMetadataOptions = {}): DiscoveredLayout {
  const roots = readTree(source)
  if (roots.length !== 1 || roots[0].name !== '/' || roots[0].label || roots[0].props.size) {
    fail('unsupported', 'Metadata must be one resolved root without overlays')
  }
  const nodes = roots[0].children
  const labels = new Map<string, Node>()
  const names = new Set<string>()
  for (const node of nodes) {
    if (names.has(node.name)) fail('ambiguous', `Repeated node ${node.name}`)
    names.add(node.name)
    const compatible = text(node, 'compatible')
    const properties = compatible && ({
      'zmk,matrix-transform': ['rows', 'columns', 'row-offset', 'col-offset', 'map'],
      'zmk,matrix_transform': ['rows', 'columns', 'row-offset', 'col-offset', 'map'],
      'zmk,physical-layout': ['display-name', 'transform', 'keys'],
      'zmk,key-physical-attrs': ['#key-cells'],
      'zmk,keymap-sensors': ['sensors'],
      'alps,ec11': []
    } as Record<string, string[]>)[compatible]
    if (node.name !== 'chosen') {
      if (!Array.isArray(properties)) fail('unsupported', `Unproved metadata node ${node.name}`)
      allowed(node, ['compatible', 'status', ...properties])
    }
    if (node.label) {
      if (labels.has(node.label)) fail('ambiguous', `Duplicate label ${node.label}`)
      labels.set(node.label, node)
    }
  }
  const chosen = nodes.filter(node => node.name === 'chosen')
  if (chosen.length > 1) fail('ambiguous', 'Multiple chosen nodes')
  const props = new Map(chosen[0]?.props)
  if (chosen[0]) allowed(chosen[0], [...TRANSFORMS, 'zmk,physical-layout'])
  const overrides = options.selectedSource === undefined ? [] : documentOverrides(options.selectedSource, options.stockIncludes ?? [])
  for (const override of overrides.filter(node => node.name === 'chosen')) {
    for (const [key, value] of override.props) props.set(key, value)
  }
  const firmwareChosen = TRANSFORMS.some(key => props.has(key)) || props.has('zmk,physical-layout')
  if (!firmwareChosen && options.candidate) {
    props.set(options.candidate.kind === 'physical' ? 'zmk,physical-layout' : 'zmk,matrix-transform', ['&', options.candidate.label])
  }
  const refs = TRANSFORMS.filter(name => props.has(name)).map(name => reference(props.get(name)))
  if (new Set(refs).size > 1) fail('ambiguous', 'Chosen transform spellings disagree')
  const transforms = nodes.filter(node => TRANSFORMS.includes(text(node, 'compatible') ?? ''))
  const physical = nodes.filter(node => text(node, 'compatible') === 'zmk,physical-layout')
  if (!firmwareChosen && physical.length && options.candidate?.kind === 'transform') fail('invalid', 'Select an eligible physical layout, not its underlying transform')
  if (transforms.length + physical.length > LAYOUT_DISCOVERY_LIMITS.candidates) fail('unsupported', 'Candidate limit exceeded')
  let selectedPhysical: Node | undefined
  if (!refs.length) {
    const physicalRef = props.has('zmk,physical-layout') ? reference(props.get('zmk,physical-layout')) : undefined
    if (physicalRef) {
      selectedPhysical = labels.get(physicalRef)
      if (!selectedPhysical || !physical.includes(selectedPhysical) || !enabled(selectedPhysical)) fail('invalid', 'Chosen physical layout is missing or disabled')
    } else if (physical.length) {
      const eligible = physical.filter(enabled)
      if (eligible.length !== 1) fail('ambiguous', 'Select one physical layout')
      selectedPhysical = eligible[0]
    }
    if (selectedPhysical) {
      if (!selectedPhysical.label) fail('invalid', 'Physical layout requires a label')
      allowed(selectedPhysical, ['compatible', 'status', 'display-name', 'transform', 'keys'])
      refs.push(reference(selectedPhysical.props.get('transform')))
    }
  }
  const eligibleTransforms = transforms.filter(enabled)
  const transform = refs.length ? labels.get(refs[0]) : eligibleTransforms.length === 1 ? eligibleTransforms[0] : undefined
  if (!transform || !transforms.includes(transform)) fail(refs.length ? 'invalid' : 'ambiguous', 'Select one existing transform')
  if (options.candidate && (options.candidate.kind === 'physical'
    ? selectedPhysical?.label !== options.candidate.label
    : selectedPhysical !== undefined || transform.label !== options.candidate.label)) fail('ambiguous', 'Preview choice conflicts with firmware selection')
  if (!transform.label) fail('invalid', 'Transform requires a label')
  if (!['okay', 'ok', undefined].includes(text(transform, 'status'))) fail('invalid', 'Selected transform is disabled')
  allowed(transform, ['compatible', 'status', 'rows', 'columns', 'row-offset', 'col-offset', 'map'])
  // Selected-source overrides must not erase the declared closure requirement.
  const declaredOffset: [number, number] = [scalar(transform, 'row-offset', 254, 0), scalar(transform, 'col-offset', 254, 0)]
  const assignments = new Set<string>()
  for (const override of overrides.filter(node => node.name !== 'chosen')) {
    if (override.name !== `&${transform.label}`) fail('unsupported', 'Only the selected transform offset may be overridden')
    for (const [key, value] of override.props) {
      if (assignments.has(key)) fail('ambiguous', 'Repeated offset override')
      assignments.add(key)
      transform.props.set(key, value)
    }
  }
  const rows = scalar(transform, 'rows', 255)
  const columns = scalar(transform, 'columns', 255)
  if (!rows || !columns) fail('invalid', 'Matrix dimensions must be positive')
  const offset: [number, number] = [scalar(transform, 'row-offset', 254, 0), scalar(transform, 'col-offset', 254, 0)]
  if (offset[0] >= rows || offset[1] >= columns) fail('invalid', 'Offset outside matrix extent')
  const map = transform.props.get('map')
  if (!map || map[0] !== '<' || map.at(-1) !== '>') fail('unsupported', 'Expected literal RC map')
  const positions: [number, number][] = []
  for (let i = 1; i < map.length - 1; i += 6) {
    if (positions.length >= LAYOUT_DISCOVERY_LIMITS.keys) fail('unsupported', 'Key limit exceeded')
    if (map[i] !== 'RC' || map[i + 1] !== '(' || map[i + 3] !== ',' || map[i + 5] !== ')') {
      fail('unsupported', 'Only RC(decimal, decimal) map cells are supported')
    }
    const row = uint(map[i + 2], 254)
    const col = uint(map[i + 4], 254)
    if (row >= rows || col >= columns) fail('invalid', 'Matrix position outside declared extent')
    positions.push([row, col])
  }
  if (!positions.length || new Set(positions.map(pair => pair.join(','))).size !== positions.length) {
    fail('invalid', 'Empty map or duplicate matrix position')
  }
  let layout: LayoutKey[] = inferRectangularLayout(positions.length).map(({ row, col }, i) => ({
    row, col, x: positions[i][1], y: positions[i][0]
  }))
  const hasPhysicalKeys = selectedPhysical?.props.has('keys') ?? false
  if (hasPhysicalKeys) layout = physicalKeys(selectedPhysical!, labels, layout)
  const sensorLabels = sensors(nodes, labels)
  const result: DiscoveredLayout = {
    layout, positions, transform: transform.label, compatible: text(transform, 'compatible')!, rows, columns, offset,
    geometry: hasPhysicalKeys ? 'source-declared' : 'electrical-inference',
    ...(selectedPhysical ? { physicalLayout: selectedPhysical.label } : {}),
    ...(sensorLabels !== undefined ? { sensorLabels } : {})
  }
  validateParts(result, options, declaredOffset.some(value => value !== 0) ||
    offset.some(value => value !== 0) || assignments.size > 0)
  return result
}
