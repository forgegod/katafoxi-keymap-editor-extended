import { findNamedBlock, iterateChildNodes, scanDts, type DtsChildNode } from './dts-scan.js'
import { HOLD_TAP_FLAVORS } from './dts-behaviors.js'
import { KeymapValidationError } from './errors.js'
import { dominantEol } from './eol.js'
import { applyEdits, collectSourceDefinitions, decimal, literalString, macroReferenceIndex, nodeProperties, parseGroups, rootBlock, sourceCoverageComplete, validateDefinitionGraphChange, validateGraphInvocation, type MacroReferenceSite, type SourceDefinition } from './zmk-macros.js'
import { getBehaviorCatalog } from './catalog.js'
import { parseKeyBinding } from './keymap.js'
import type { ZmkBehaviorDefinition, ZmkMacroStep } from './types.js'

type Schema = {
  arity: number
  cellProperty: ZmkBehaviorDefinition['cellProperty']
  bare: boolean
  count: number
  properties: Record<string, 'uint' | 'flavor' | 'flag'>
  required?: string[]
}

/** Pinned ZMK v0.3.0 editor subset, not arbitrary firmware schemas. */
export const BEHAVIOR_DEFINITION_SCHEMAS: Readonly<Record<string, Schema>> = Object.assign(Object.create(null), {
  'zmk,behavior-sensor-rotate': {
    arity: 0, cellProperty: '#sensor-binding-cells', bare: false, count: 2,
    properties: { 'tap-ms': 'uint' }
  },
  'zmk,behavior-mod-morph': {
    arity: 0, cellProperty: '#binding-cells', bare: false, count: 2,
    properties: { mods: 'uint', 'keep-mods': 'uint' }, required: ['mods']
  },
  'zmk,behavior-tap-dance': {
    arity: 0, cellProperty: '#binding-cells', bare: false, count: 0,
    properties: { 'tapping-term-ms': 'uint' }
  },
  'zmk,behavior-sticky-key': {
    arity: 1, cellProperty: '#binding-cells', bare: true, count: 1,
    properties: { 'release-after-ms': 'uint', 'quick-release': 'flag', lazy: 'flag', 'ignore-modifiers': 'flag' },
    required: ['release-after-ms']
  },
  'zmk,behavior-hold-tap': {
    arity: 2, cellProperty: '#binding-cells', bare: true, count: 2,
    properties: { 'tapping-term-ms': 'uint', 'quick-tap-ms': 'uint', 'require-prior-idle-ms': 'uint', flavor: 'flavor' }
  }
})

type SourceBehavior = {
  definition: ZmkBehaviorDefinition
  node: DtsChildNode
  properties: ReturnType<typeof nodeProperties>['properties']
}

function collect(source: string): { items: SourceBehavior[]; referenceCoverageComplete: boolean } {
  const scan = scanDts(source)
  const root = rootBlock(scan)
  const referenceCoverageComplete = sourceCoverageComplete(scan, source)
  const items: SourceBehavior[] = []
  if (!root) return { items, referenceCoverageComplete }
  const containers = [...iterateChildNodes(scan, { bodyStart: root.open + 1, bodyEnd: root.close })]
    .filter(node => node.name === 'behaviors' && !node.label)
  for (const container of containers) {
    for (const node of iterateChildNodes(scan, { bodyStart: container.openBrace + 1, bodyEnd: container.closeBrace })) {
      if (!node.label) continue
      const read = nodeProperties(source, scan, node, true)
      const compatible = literalString(read.properties.get('compatible')?.value ?? '') ?? ''
      // Macros (including the fixed recipe) retain their existing ownership.
      if (compatible.startsWith('zmk,behavior-macro')) continue
      const schema = BEHAVIOR_DEFINITION_SCHEMAS[compatible]
      const diagnostics = [...read.diagnostics]
      if (reservedCode(`&${node.label}`)) diagnostics.push('Behavior label collides with a stock or reserved label')
      if (!schema) diagnostics.push(`Unsupported behavior compatible: ${compatible || '(missing)'}`)
      if (!referenceCoverageComplete) diagnostics.push('Reference coverage is incomplete for this source')
      if (containers.length !== 1) diagnostics.push('Expected one unique behaviors container')
      const cellProperty = schema?.cellProperty ?? '#binding-cells'
      const arity = decimal(read.properties.get(cellProperty)?.value ?? '') ?? -1
      if (schema && arity !== schema.arity) diagnostics.push(`Expected ${cellProperty} = <${schema.arity}>`)
      const parsed = parseGroups(read.properties.get('bindings')?.value ?? '')
      diagnostics.push(...parsed.diagnostics)
      const bindings = parsed.groups.flat()
      if (schema && (schema.count ? bindings.length !== schema.count : bindings.length === 0)) diagnostics.push('Unsupported child binding count')
      if (schema?.bare && bindings.some(binding => !/^&[A-Za-z_]\w*$/.test(binding))) diagnostics.push('Child bindings require bare phandles without argument cells')
      const properties: ZmkBehaviorDefinition['properties'] = {}
      for (const [name, prop] of read.properties) {
        if (['compatible', cellProperty, 'bindings'].includes(name)) continue
        const kind = schema && Object.hasOwn(schema.properties, name) ? schema.properties[name] : undefined
        if (!kind) { diagnostics.push(`Unsupported behavior property: ${name}`); continue }
        const value = kind === 'flag' ? (prop.value === '' ? true : null) : kind === 'uint' ? decimal(prop.value) : literalString(prop.value)
        if (value === null || (kind === 'flavor' && !HOLD_TAP_FLAVORS.some(flavor => flavor.id === value))) {
          diagnostics.push(`${name} requires ${kind === 'flag' ? `a bare presence-only flag (${name};)` : kind === 'uint' ? 'a decimal uint32 literal' : 'a supported flavor enum'}`)
        } else properties[name] = value
      }
      for (const name of schema?.required ?? []) if (!read.properties.has(name)) diagnostics.push(`Missing required property: ${name}`)
      items.push({ node, properties: read.properties, definition: {
        code: `&${node.label}`, label: node.label, nodeName: node.name, compatible, cellProperty, arity,
        bindings, properties, editable: diagnostics.length === 0, diagnostics
      } })
    }
  }
  return { items, referenceCoverageComplete }
}

export function parseDtsBehaviorDefinitions(source: string): { definitions: ZmkBehaviorDefinition[]; referenceCoverageComplete: boolean } {
  const parsed = collect(source)
  const graph = collectSourceDefinitions(source)
  for (const item of parsed.items) {
    const analyzed = graph.definitions.find(entry => entry.behavior && entry.node.labelStart === item.node.labelStart)
    if (analyzed) {
      item.definition.diagnostics = [...analyzed.definition.diagnostics]
      item.definition.editable = analyzed.definition.editable
    }
  }
  return { definitions: parsed.items.map(item => item.definition), referenceCoverageComplete: parsed.referenceCoverageComplete }
}

/** Adapt forwarding into the macro graph's one-shot input-domain machinery. */
export function behaviorGraphDefinitions(source: string): SourceDefinition[] {
  return collect(source).items.map(item => {
    const definition = item.definition
    const bare = BEHAVIOR_DEFINITION_SCHEMAS[definition.compatible]?.bare
    const steps: ZmkMacroStep[] = definition.bindings.flatMap((binding, index): ZmkMacroStep[] => bare
      ? [{ kind: 'control', control: `param_${index + 1}to1`, values: [] }, { kind: 'behavior', binding: `${binding} 0` }]
      : [{ kind: 'behavior', binding }])
    return {
      ...item, container: 'behaviors', behavior: true, sensor: definition.cellProperty === '#sensor-binding-cells',
      definition: {
        code: definition.code, label: definition.label, nodeName: definition.nodeName, container: 'behaviors',
        arity: definition.arity >= 0 && definition.arity <= 2 ? definition.arity as 0 | 1 | 2 : 0,
        steps, editable: definition.editable, diagnostics: [...definition.diagnostics]
      }
    }
  })
}

export function validateBehaviorInvocation(source: string, binding: string, site: 'ordinary' | 'sensor' = 'ordinary'): string[] {
  const graph = collectSourceDefinitions(source)
  const target = graph.definitions.find(item => item.behavior && item.definition.code === String(parseKeyBinding(binding).value))
  if (!target || Boolean(target.sensor) !== (site === 'sensor')) return ['Behavior has no signature for this invocation site.']
  return validateGraphInvocation(source, binding, graph)
}

/** Preserve imported opaque calls; validate newly written calls to owned schemas. */
export function validateChangedBehaviorInvocations(before: string, output: string): void {
  const graph = collectSourceDefinitions(output)
  // A bad incoming site can itself remove the graph signature. Do not use
  // that loss of editability to exempt the newly written invocation.
  const previousGraph = collectSourceDefinitions(before)
  const owned = new Set(collect(output).items.filter(item => item.definition.editable &&
    !previousGraph.definitions.some(old => old.definition.code === item.definition.code && !old.definition.editable)
  ).map(item => item.definition.code))
  for (const target of graph.definitions.filter(item => item.behavior && owned.has(item.definition.code))) {
    const previous = macroReferenceIndex(before, target.definition.code)
    for (const site of macroReferenceIndex(output, target.definition.code)) {
      if (!['key', 'combo', 'sensor'].includes(site.kind) || !site.binding) continue
      if (previous.some(old => old.path === site.path && old.binding === site.binding)) continue
      const errors = Boolean(target.sensor) !== (site.kind === 'sensor')
        ? ['Behavior invocation uses the wrong ordinary/sensor site.']
        : validateGraphInvocation(output, site.binding, graph)
      if (errors.length) throw new KeymapValidationError([`${site.path}: ${errors.join('; ')}`])
    }
  }
}

export function behaviorDeletePreflight(source: string, code: string): { ok: true; sites: [] } | { ok: false; sites: MacroReferenceSite[]; error: string } {
  const parsed = parseDtsBehaviorDefinitions(source)
  const targets = parsed.definitions.filter(item => item.code === code)
  const sites = macroReferenceIndex(source, code)
  if (!parsed.referenceCoverageComplete) return { ok: false, sites, error: 'Behavior reference coverage is incomplete.' }
  if (targets.length !== 1 || !targets[0]!.editable) return { ok: false, sites, error: 'Behavior is not a uniquely owned editable definition.' }
  if (sites.length) return { ok: false, sites, error: `Behavior has incoming references: ${sites.map(site => site.path).join(', ')}` }
  return { ok: true, sites: [] }
}

function reservedCode(code: string): boolean {
  return code in getBehaviorCatalog().byCode || code === '&reset' || code === '&rgblayer' || code.startsWith('&macro_')
}

export function formatBehavior(definition: ZmkBehaviorDefinition, eol: string): string {
  const lines = [
    `        ${definition.label}: ${definition.nodeName} {`,
    `            compatible = ${JSON.stringify(definition.compatible)};`,
    `            ${definition.cellProperty} = <${definition.arity}>;`,
    ...Object.entries(definition.properties).map(([name, value]) => `            ${name}${value === true ? '' : ` = ${typeof value === 'number' ? `<${value}>` : JSON.stringify(value)}`};`),
    `            bindings = ${definition.bindings.map(binding => `<${binding}>`).join(', ')};`,
    '        };'
  ]
  return lines.join(eol)
}

export function behaviorDefinitionsFingerprint(definitions: readonly ZmkBehaviorDefinition[]): string {
  return JSON.stringify(definitions.map(({ editable: _editable, diagnostics: _diagnostics, ...definition }) => ({
    ...definition, properties: Object.fromEntries(Object.entries(definition.properties).sort(([a], [b]) => a.localeCompare(b)))
  })))
}

/** JSON is data, not edit ownership. Invalid lists never become partial deletions. */
export function normalizeBehaviorDefinitions(raw: unknown): ZmkBehaviorDefinition[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const definitions: ZmkBehaviorDefinition[] = []
  for (const value of raw) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
    const row = value as ZmkBehaviorDefinition
    if (typeof row.label !== 'string' || !/^[A-Za-z_]\w*$/.test(row.label) || row.code !== `&${row.label}` ||
      typeof row.nodeName !== 'string' || !/^[A-Za-z0-9,._+@-]+$/.test(row.nodeName) || typeof row.compatible !== 'string' ||
      !['#binding-cells', '#sensor-binding-cells'].includes(row.cellProperty) || !Number.isInteger(row.arity) ||
      !Array.isArray(row.bindings) || !row.bindings.every(binding => typeof binding === 'string' && !/[;{}<>]/.test(binding)) ||
      !row.properties || typeof row.properties !== 'object' || Array.isArray(row.properties) ||
      !Object.entries(row.properties).every(([name, property]) => /^[A-Za-z_][\w,-]*$/.test(name) &&
        (property === true || typeof property === 'string' || (typeof property === 'number' && Number.isInteger(property) && property >= 0 && property <= 0xffffffff))) ||
      !Array.isArray(row.diagnostics) || !row.diagnostics.every(reason => typeof reason === 'string')) return undefined
    definitions.push({ code: row.code, label: row.label, nodeName: row.nodeName, compatible: row.compatible,
      cellProperty: row.cellProperty, arity: row.arity, bindings: [...row.bindings], properties: { ...row.properties },
      editable: row.editable === true, diagnostics: [...row.diagnostics] })
  }
  return definitions
}


/** Internal model-block splice; buildKeymapCode remains the shared save boundary. */
export function spliceBehaviorDefinitionsIntoDts(
  source: string,
  draft: readonly ZmkBehaviorDefinition[],
  baseline: readonly ZmkBehaviorDefinition[] = parseDtsBehaviorDefinitions(source).definitions,
  options?: { sourceFree?: boolean }
): string {
  const parsed = collect(source)
  const before = parseDtsBehaviorDefinitions(source).definitions
  if (behaviorDefinitionsFingerprint(before) !== behaviorDefinitionsFingerprint(baseline)) throw new KeymapValidationError(['Behavior source baseline is stale.'])
  if (behaviorDefinitionsFingerprint(before) === behaviorDefinitionsFingerprint(draft)) return source
  if (!parsed.referenceCoverageComplete) throw new KeymapValidationError(['Behavior reference coverage is incomplete.'])
  if (new Set(draft.map(item => item.code)).size !== draft.length) throw new KeymapValidationError(['Behavior labels must be unique.'])
  const scan = scanDts(source)
  const declared = new Set([...scan.masked.matchAll(/\b([A-Za-z_]\w*)\s*:/g)].map(match => `&${match[1]}`))
  const assertNewLabel = (next: ZmkBehaviorDefinition): void => {
    if (!/^[A-Za-z_]\w*$/.test(next.label) || next.code !== `&${next.label}` || !/^[A-Za-z0-9,._+@-]+$/.test(next.nodeName)) throw new KeymapValidationError(['Invalid behavior label or node name.'])
    if (reservedCode(next.code) || declared.has(next.code) || (!options?.sourceFree && macroReferenceIndex(source, next.code).length)) throw new KeymapValidationError([`${next.code} collides with a declared, reserved or unresolved reference.`])
  }
  const consumed = new Set<string>()
  const edits: Array<{ start: number; end: number; text: string }> = []
  for (const [index, item] of parsed.items.entries()) {
    const old = before[index]!
    const next = draft.find(candidate => candidate.code === old.code) ?? draft.find(candidate => candidate.nodeName === old.nodeName)
    if (!next || next.code !== old.code) {
      const preflight = behaviorDeletePreflight(source, old.code)
      if (!preflight.ok) throw new KeymapValidationError([preflight.error])
      if (!next) { edits.push({ start: item.node.labelStart, end: item.node.end, text: '' }); continue }
      assertNewLabel(next)
      edits.push({ start: item.node.labelStart, end: item.node.labelStart + old.label.length, text: next.label })
    }
    consumed.add(next.code)
    if (behaviorDefinitionsFingerprint([next]) === behaviorDefinitionsFingerprint([old])) continue
    if (!old.editable) throw new KeymapValidationError([`${old.code} is read-only: ${old.diagnostics.join('; ')}`])
    if (behaviorDefinitionsFingerprint([{ ...next, code: old.code, label: old.label, properties: old.properties, bindings: old.bindings }]) !== behaviorDefinitionsFingerprint([old])) throw new KeymapValidationError(['Behavior node identity and arity cannot change.'])
    if (JSON.stringify(next.bindings) !== JSON.stringify(old.bindings)) {
      const property = item.properties.get('bindings')!
      if (/\/\*|\/\//.test(property.value)) throw new KeymapValidationError(['Child bindings contain comments; refusing regeneration.'])
      if (next.bindings.some(binding => /[;{}<>]/.test(binding))) throw new KeymapValidationError(['Invalid child binding syntax.'])
      edits.push({ ...property.valueSpan, text: next.bindings.map(binding => `<${binding}>`).join(', ') })
    }
    for (const name of new Set([...Object.keys(next.properties), ...Object.keys(old.properties)])) {
      const value = next.properties[name]
      if (old.properties[name] === value) continue
      const property = item.properties.get(name)
      const text = typeof value === 'number' ? `<${value}>` : JSON.stringify(value)
      if (!property) {
        const lineStart = source.lastIndexOf('\n', item.node.closeBrace - 1) + 1
        const indent = /^[ \t]*/.exec(source.slice(lineStart, item.node.closeBrace))?.[0] ?? ''
        if (value !== undefined) edits.push({ start: item.node.closeBrace, end: item.node.closeBrace,
          text: `    ${name}${value === true ? '' : ` = ${text}`};${dominantEol(source)}${indent}` })
      } else if (value === undefined) {
        const start = scan.masked.indexOf(name, property.statement.start)
        edits.push({ start, end: property.statement.end, text: '' })
      } else edits.push({ ...property.valueSpan, text })
    }
  }
  const added = draft.filter(item => !consumed.has(item.code))
  for (const next of added) assertNewLabel(next)
  if (added.length) {
    const root = rootBlock(scan)!
    const container = findNamedBlock(source, scan, 'behaviors')
    const eol = dominantEol(source)
    const text = added.map(item => formatBehavior(item, eol)).join(eol)
    const position = container?.closeBrace ?? root.close
    const lineStart = source.lastIndexOf('\n', position - 1) + 1
    const indent = /^[ \t]*/.exec(source.slice(lineStart, position))?.[0] ?? ''
    edits.push({ start: position, end: position, text: container ? `${eol}${text}${eol}${indent}` : `${eol}    behaviors {${eol}${text}${eol}    };${eol}${indent}` })
  }
  const output = applyEdits(source, edits)
  validateDefinitionGraphChange(source, output)
  const actual = parseDtsBehaviorDefinitions(output).definitions
  if (behaviorDefinitionsFingerprint(actual) !== behaviorDefinitionsFingerprint(draft)) {
    throw new KeymapValidationError(['Behavior edit failed schema revalidation.'])
  }
  return output
}
