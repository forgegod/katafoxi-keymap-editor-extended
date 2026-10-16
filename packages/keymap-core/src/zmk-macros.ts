import { dominantEol } from './eol.js'
import { behaviorDefinitionsFingerprint, behaviorGraphDefinitions, formatBehavior, normalizeBehaviorDefinitions, parseDtsBehaviorDefinitions } from './behavior-definitions.js'
import keycodesData from '../data/zmk-keycodes.json' with { type: 'json' }
import { KeymapValidationError } from './errors.js'
import {
  findNamedBlock,
  hasPreprocessorConditional,
  iterateChildNodes,
  matchBrace,
  scanDts,
  tokenizeBindingsDetailed,
  type DtsChildNode,
  type DtsScan
} from './dts-scan.js'
import { encodeKeyBinding, loadBehaviorsData, parseKeyBinding } from './keymap.js'
import { normalizeZmkKeycodes } from './keycodes.js'
import { isModifierWrapCode, modifierHoldForKey } from './modifiers.js'
import type { KeyBindingNode, KeycodeDef, ZmkBehaviorDefinition, ZmkMacroDefinition, ZmkMacroStep } from './types.js'

const MACRO_COMPATIBLES: Record<string, number> = Object.assign(Object.create(null), {
  'zmk,behavior-macro': 0,
  'zmk,behavior-macro-one-param': 1,
  'zmk,behavior-macro-two-param': 2
})
const ALLOWED_INCLUDES = new Set([
  'behaviors.dtsi',
  'behaviors/macros.dtsi',
  'dt-bindings/zmk/keys.h',
  'dt-bindings/zmk/modifiers.h',
  'dt-bindings/zmk/bt.h'
])
const ORDINARY_ARITY: Record<string, number> = {
  '&kp': 1,
  '&kt': 1,
  '&mo': 1,
  '&to': 1,
  '&tog': 1,
  '&sl': 1,
  '&mt': 2,
  '&lt': 2,
  '&none': 0,
  '&trans': 0
}
const CONTROL_CODES = new Set([
  '&macro_press', '&macro_release', '&macro_tap', '&macro_pause_for_release',
  '&macro_tap_time', '&macro_wait_time',
  '&macro_param_1to1', '&macro_param_1to2', '&macro_param_2to1', '&macro_param_2to2'
])
const KEYCODES = new Set(normalizeZmkKeycodes(keycodesData as KeycodeDef[]).flatMap(key => [key.code, ...key.aliases]))

type Span = { start: number; end: number }
type Property = { value: string; valueSpan: Span; statement: Span }
export type SourceDefinition = {
  definition: ZmkMacroDefinition
  node: DtsChildNode
  container: 'macros' | 'behaviors'
  properties: Map<string, Property>
  /** Schema adapter into the shared graph; never serialized as a macro. */
  behavior?: true
  sensor?: boolean
}

export interface MacroReferenceSite {
  reference: string
  start: number
  end: number
  path: string
  kind: 'key' | 'combo' | 'macro' | 'sensor-child' | 'hold-tap' | 'behavior-child' | 'sensor' | 'opaque'
  /** Complete ordinary invocation, when the site has a proven schema. */
  binding?: string
}

export interface MacroParseResult {
  definitions: ZmkMacroDefinition[]
  referenceCoverageComplete: boolean
}


export function literalString(value: string): string | null {
  const trimmed = value.trim()
  if (!/^"(?:[^"\\]|\\.)*"$/.test(trimmed)) return null
  try {
    const decoded: unknown = JSON.parse(trimmed)
    return typeof decoded === 'string' ? decoded : null
  } catch {
    return null
  }
}

export function decimal(value: string): number | null {
  const match = /^<\s*(0|[1-9][0-9]*)\s*>$/.exec(value.trim())
  if (!match) return null
  const number = Number(match[1])
  return Number.isSafeInteger(number) && number <= 0xffffffff ? number : null
}

function uint32Token(value: string): boolean {
  return /^(0|[1-9][0-9]*)$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) <= 0xffffffff
}

export function nodeProperties(source: string, scan: DtsScan, child: DtsChildNode, allowFlags = false): {
  properties: Map<string, Property>
  diagnostics: string[]
} {
  const start = child.openBrace + 1
  const end = child.closeBrace
  const mask = scan.masked.slice(start, end)
  const diagnostics: string[] = []
  const properties = new Map<string, Property>()
  let offset = 0
  for (const statement of mask.split(';')) {
    const trimmed = statement.trim()
    if (!trimmed) {
      offset += statement.length + 1
      continue
    }
    const match = /^\s*([#A-Za-z_][\w,-]*)\s*=\s*([\s\S]*?)\s*$/.exec(statement)
    const flag = allowFlags && /^\s*([A-Za-z_][\w,-]*)\s*$/.exec(statement)
    if (flag) {
      const name = flag[1]!
      if (properties.has(name)) diagnostics.push(`Repeated property: ${name}`)
      const position = start + offset + statement.indexOf(name)
      properties.set(name, { value: '', valueSpan: { start: position, end: position + name.length },
        statement: { start: position, end: start + offset + statement.length + 1 } })
      offset += statement.length + 1
      continue
    }
    if (!match) {
      diagnostics.push(`Unsupported macro property or child node: ${trimmed.slice(0, 80)}`)
      offset += statement.length + 1
      continue
    }
    const name = match[1]!
    if (properties.has(name)) diagnostics.push(`Repeated macro property: ${name}`)
    const equals = statement.indexOf('=')
    const afterEquals = start + offset + equals + 1
    const beforeValue = statement.slice(equals + 1).search(/\S/)
    const valueStart = afterEquals + Math.max(0, beforeValue)
    const valueEnd = start + offset + statement.length - (statement.length - statement.trimEnd().length)
    properties.set(name, {
      value: source.slice(valueStart, valueEnd),
      valueSpan: { start: valueStart, end: valueEnd },
      statement: { start: offset + start, end: offset + statement.length + 1 + start }
    })
    offset += statement.length + 1
  }
  return { properties, diagnostics }
}

export function parseGroups(raw: string): { groups: string[][]; diagnostics: string[] } {
  const mask = scanDts(raw).masked
  const groups: string[][] = []
  const diagnostics: string[] = []
  let i = 0
  const whitespace = () => {
    while (i < mask.length && /\s/.test(mask[i]!)) i++
  }
  while (true) {
    whitespace()
    if (i >= mask.length) break
    if (mask[i] !== '<') {
      diagnostics.push('Macro bindings must contain only comma-separated <...> groups')
      break
    }
    const start = ++i
    let depth = 1
    while (i < mask.length && depth > 0) {
      if (mask[i] === '<') depth++
      if (mask[i] === '>') depth--
      i++
    }
    if (depth !== 0) {
      diagnostics.push('Macro bindings contain an unbalanced angle group')
      break
    }
    const content = mask.slice(start, i - 1)
    const tokens = tokenizeBindingsDetailed(content)
    if (tokens.hasUnparsedFragment || tokens.binds.length === 0) {
      diagnostics.push('Macro bindings contain an unsupported fragment')
      break
    }
    groups.push(tokens.binds)
    whitespace()
    if (i >= mask.length) break
    if (mask[i] !== ',') {
      diagnostics.push('Macro bindings groups must be separated by commas')
      break
    }
    i++
  }
  return { groups, diagnostics }
}

function stepsFromGroups(groups: string[][]): { steps: ZmkMacroStep[]; diagnostics: string[] } {
  const steps: ZmkMacroStep[] = []
  const diagnostics: string[] = []
  for (const group of groups) {
    for (const binding of group) {
      const parsed = parseKeyBinding(binding)
      const code = String(parsed.value)
      if (CONTROL_CODES.has(code)) {
        const values = parsed.params.map(param => String(param.value))
        if ((code === '&macro_tap_time' || code === '&macro_wait_time') &&
          (values.length !== 1 || !uint32Token(values[0]!))) {
          diagnostics.push(`${code} requires one non-negative decimal uint32 argument`)
        }
        if (['&macro_press', '&macro_release', '&macro_tap', '&macro_pause_for_release'].includes(code) && values.length !== 0) {
          diagnostics.push(`${code} does not accept arguments`)
        }
        if (/^&macro_param_[12]to[12]$/.test(code) && values.length !== 0) {
          diagnostics.push(`${code} does not accept arguments`)
        }
        steps.push({ kind: 'control', control: code.slice('&macro_'.length), values })
        continue
      }
      steps.push({ kind: 'behavior', binding })
    }
  }
  return { steps, diagnostics }
}

function keycodeOperand(node: KeyBindingNode | undefined): boolean {
  if (!node) return false
  if (node.params.length === 0) return KEYCODES.has(String(node.value))
  return ['LS', 'RS', 'LC', 'RC', 'LA', 'RA', 'LG', 'RG'].includes(String(node.value)) &&
    node.params.length === 1 && keycodeOperand(node.params[0])
}

function modifierOperand(node: KeyBindingNode | undefined): boolean {
  return Boolean(node && node.params.length === 0 &&
    modifierHoldForKey(String(node.value)))
}

function usesModifiers(node: KeyBindingNode): boolean {
  return Boolean(modifierHoldForKey(node.value)) || isModifierWrapCode(node.value) || node.params.some(usesModifiers)
}

function layerOperand(node: KeyBindingNode | undefined, layerCount: number | undefined): boolean {
  if (!node || node.params.length !== 0 || layerCount === undefined) return false
  const value = String(node.value)
  return /^(0|[1-9][0-9]*)$/.test(value) && Number(value) < layerCount
}

/** Resolve the stock alias for validation only; never rewrite the stored step. */
function literalPlaceholder(node: KeyBindingNode): KeyBindingNode {
  return { ...node, value: node.value === 'MACRO_PLACEHOLDER' ? '0' : node.value, params: node.params.map(literalPlaceholder) }
}

function validateInvocation(binding: string, knownMacros: Map<string, number>, layerCount: number | undefined): string | null {
  const parsed = literalPlaceholder(parseKeyBinding(binding))
  const code = String(parsed.value)
  const args = parsed.params
  const expected = ORDINARY_ARITY[code] ?? knownMacros.get(code)
  if ((code === '&kp' || code === '&kt') && !keycodeOperand(args[0])) {
    return `${code} requires a catalog keycode operand`
  }
  if (code === '&mt' && (!modifierOperand(args[0]) || !keycodeOperand(args[1]))) {
    return '&mt requires a modifier and a catalog keycode operand'
  }
  if (code === '&lt' && !keycodeOperand(args[1])) {
    return '&lt requires a catalog keycode operand'
  }
  if (['&mo', '&to', '&tog', '&sl', '&lt'].includes(code) && !layerOperand(args[0], layerCount)) {
    return `${code} requires a bounded literal or forwarded layer operand`
  }
  if (code === '&bt') {
    const command = String(args[0]?.value ?? '')
    const profile = args[1]
    if (!['BT_SEL', 'BT_DISC', 'BT_CLR', 'BT_CLR_ALL', 'BT_NXT', 'BT_PRV'].includes(command)) {
      return `Unsupported &bt command ${command || '(missing)'}`
    }
    if (['BT_SEL', 'BT_DISC'].includes(command)) {
      const profileValue = String(profile?.value ?? '')
      if (args.length !== 2 || !/^[0-4]$/.test(profileValue)) {
        return `${command} requires one profile 0–4 or a forwarded placeholder`
      }
    } else if (args.length !== 1) return `${command} has no explicit extra argument`
    return null
  }
  if (expected === undefined) return `Unsupported macro invocation ${code}`
  if (args.length !== expected) return `${code} requires ${expected} argument${expected === 1 ? '' : 's'}`
  return null
}

function invocationCellCount(binding: string, knownMacros: Map<string, number>): number | undefined {
  const parsed = parseKeyBinding(binding)
  const code = String(parsed.value)
  if (code === '&bt') return parsed.params.length
  return ORDINARY_ARITY[code] ?? knownMacros.get(code)
}

type InputDomain = 'code' | 'modifier' | 'layer' | 'profile'

function intersectDomain(left: InputDomain | undefined, right: InputDomain): InputDomain | null {
  if (left === undefined || left === right) return right
  if ((left === 'code' && right === 'modifier') || (left === 'modifier' && right === 'code')) return 'modifier'
  return null
}

function leafDomains(binding: string): Array<InputDomain | undefined> {
  const node = parseKeyBinding(binding)
  switch (node.value) {
    case '&kp': case '&kt': return ['code']
    case '&mt': return ['modifier', 'code']
    case '&lt': return ['layer', 'code']
    case '&mo': case '&to': case '&tog': case '&sl': return ['layer']
    case '&bt': return ['BT_SEL', 'BT_DISC'].includes(String(node.params[0]?.value)) ? [undefined, 'profile'] : [undefined]
    default: return []
  }
}

/** Infer every effective use, resolving callees before callers. */
function domainAccepts(domain: InputDomain, node: KeyBindingNode | undefined, layerCount: number | undefined): boolean {
  if (!node) return false
  node = literalPlaceholder(node)
  switch (domain) {
    case 'code': return keycodeOperand(node)
    case 'modifier': return modifierOperand(node)
    case 'layer': return layerOperand(node, layerCount)
    case 'profile': return node.params.length === 0 && /^[0-4]$/.test(String(node.value))
  }
}

function inferDomains(definitions: SourceDefinition[], layerCount: number | undefined): Map<string, InputDomain[]> {
  const byCode = new Map(definitions.map(item => [item.definition.code, item.definition]))
  const signatures = new Map<string, InputDomain[]>()
  const visited = new Set<string>()
  const infer = (definition: ZmkMacroDefinition): void => {
    if (visited.has(definition.code)) return
    visited.add(definition.code)
    if (!definition.editable) return
    const inputs: Array<InputDomain | undefined> = Array.from({ length: definition.arity })
    const pending: Array<number | undefined> = []
    for (const step of definition.steps) {
      if (step.kind === 'control') {
        const match = /^param_([12])to([12])$/.exec(step.control)
        if (match) pending[Number(match[2]) - 1] = Number(match[1]) - 1
        continue
      }
      const invocation = parseKeyBinding(step.binding)
      const code = String(invocation.value)
      const callee = byCode.get(code)
      if (callee) infer(callee)
      const domains = callee ? signatures.get(code) : leafDomains(step.binding)
      if (!domains) definition.diagnostics.push(`${code} is a read-only macro dependency`)
      else {
        for (const [destination, input] of pending.entries()) {
          if (input === undefined) continue
          const domain = domains[destination]
          const merged = domain ? intersectDomain(inputs[input], domain) : null
          if (merged === null) definition.diagnostics.push(`Macro input ${input + 1} has incompatible operand domains`)
          else inputs[input] = merged
        }
        if (callee) for (const [index, domain] of domains.entries()) {
          if (domain && pending[index] === undefined && !domainAccepts(domain, invocation.params[index], layerCount)) {
            definition.diagnostics.push(`${code} operand ${index + 1} requires ${domain}`)
          }
        }
      }
      pending.length = 0
    }
    definition.editable = definition.diagnostics.length === 0
    if (definition.editable) signatures.set(definition.code, inputs as InputDomain[])
  }
  for (const item of definitions) infer(item.definition)
  return signatures
}

/** Model ZMK's one-shot forwarding state without simulating firmware events. */
function validateForwarding(
  steps: readonly ZmkMacroStep[],
  arity: 0 | 1 | 2,
  knownMacros: Map<string, number>
): string[] {
  const diagnostics: string[] = []
  const pending: Array<1 | 2 | undefined> = [undefined, undefined]
  const uses = [0, 0]
  for (const step of steps) {
    if (step.kind === 'control') {
      const forwarding = /^param_([12])to([12])$/.exec(step.control)
      if (forwarding) {
        const input = Number(forwarding[1]) as 1 | 2
        const destination = Number(forwarding[2]) as 1 | 2
        if (input > arity) diagnostics.push(`${step.control} references missing macro input ${input}`)
        else pending[destination - 1] = input
      }
      continue
    }
    const cells = invocationCellCount(step.binding, knownMacros)
    if (cells !== undefined) {
      for (const [destination, input] of pending.entries()) {
        if (input === undefined) continue
        if (destination >= cells) diagnostics.push(`${step.binding} has no target cell ${destination + 1} for ${input === 1 ? 'param_1' : 'param_2'}`)
        else uses[input - 1]++
      }
    }
    pending[0] = undefined
    pending[1] = undefined
  }
  for (const [destination, input] of pending.entries()) {
    if (input !== undefined) diagnostics.push(`${input === 1 ? 'param_1' : 'param_2'} forwarding to cell ${destination + 1} has no following invocation`)
  }
  for (let input = 1; input <= arity; input++) {
    if (uses[input - 1] === 0) diagnostics.push(`Macro input ${input} has no effective forwarding use`)
  }
  return diagnostics
}

function sourceDefinition(
  source: string,
  scan: DtsScan,
  container: 'macros' | 'behaviors',
  child: DtsChildNode,
  knownMacros: Map<string, number>,
  layerCount: number | undefined
): SourceDefinition | null {
  if (!child.label || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(child.label)) return null
  const { properties, diagnostics } = nodeProperties(source, scan, child)
  const compatible = literalString(properties.get('compatible')?.value ?? '')
  const arity = compatible ? MACRO_COMPATIBLES[compatible] as 0 | 1 | 2 | undefined : undefined
  if (arity === undefined) return null
  const allowed = new Set(['compatible', '#binding-cells', 'bindings', 'tap-ms', 'wait-ms', 'label', 'display-name'])
  for (const property of properties.keys()) if (!allowed.has(property)) diagnostics.push(`Unknown macro property: ${property}`)
  if (decimal(properties.get('#binding-cells')?.value ?? '') !== arity) {
    diagnostics.push(`Expected #binding-cells = <${arity}>`)
  }
  const bindings = properties.get('bindings')
  if (!bindings) diagnostics.push('Missing bindings')
  const parsedGroups = bindings ? parseGroups(bindings.value) : { groups: [], diagnostics: [] }
  diagnostics.push(...parsedGroups.diagnostics)
  const parsedSteps = stepsFromGroups(parsedGroups.groups)
  diagnostics.push(...parsedSteps.diagnostics)
  if (parsedSteps.steps.filter(step => step.kind === 'control' && step.control === 'pause_for_release').length > 1) {
    diagnostics.push('Macro sequence may contain at most one pause_for_release control')
  }
  if (parsedSteps.steps.length > 256) diagnostics.push('Macro sequence may contain at most 256 phandle entries')
  diagnostics.push(...validateForwarding(parsedSteps.steps, arity, knownMacros))
  if (parsedSteps.steps.length === 0) diagnostics.push('Macro sequence must not be empty')
  const tap = properties.get('tap-ms')
  const wait = properties.get('wait-ms')
  const tapMs = tap ? decimal(tap.value) : undefined
  const waitMs = wait ? decimal(wait.value) : undefined
  const safeTapMs = tapMs ?? undefined
  const safeWaitMs = waitMs ?? undefined
  if (tap && tapMs === null) diagnostics.push('tap-ms must be a non-negative decimal uint32 literal')
  if (wait && waitMs === null) diagnostics.push('wait-ms must be a non-negative decimal uint32 literal')
  const labelText = properties.get('label') ? literalString(properties.get('label')!.value) : undefined
  const displayName = properties.get('display-name') ? literalString(properties.get('display-name')!.value) : undefined
  if (properties.get('label') && labelText === null) diagnostics.push('label must be a literal string')
  if (properties.get('display-name') && displayName === null) diagnostics.push('display-name must be a literal string')
  const forwarded = new Set<number>()
  for (const step of parsedSteps.steps) {
    if (step.kind === 'control') {
      const match = /^param_[12]to([12])$/.exec(step.control)
      if (match) forwarded.add(Number(match[1]) - 1)
      continue
    }
    const invocation = parseKeyBinding(step.binding)
    for (const destination of forwarded) {
      const filler = invocation.params[destination]
      if (!filler) continue
      if (!(keycodeOperand(filler) || (filler.params.length === 0 &&
        (filler.value === 'MACRO_PLACEHOLDER' || uint32Token(String(filler.value)))))) {
        diagnostics.push(`${step.binding} requires a supported single-cell forwarding filler`)
      }
      // A typed representative validates source arity/command shape; inferDomains
      // separately intersects the actual input constraints across every use.
      const domain = leafDomains(step.binding)[destination]
      if (domain) invocation.params[destination] = { value: domain === 'modifier' ? 'LSHFT' : domain === 'code' ? 'A' : '0', params: [] }
    }
    forwarded.clear()
    const error = validateInvocation(encodeKeyBinding(invocation), knownMacros, layerCount)
    if (error) diagnostics.push(error)
  }
  if (child.label === 'rgblayer') diagnostics.push('&rgblayer is a fixed recipe, not a general editable macro')
  const definition: ZmkMacroDefinition = {
    code: `&${child.label}`,
    label: child.label,
    nodeName: child.name,
    container,
    arity,
    steps: parsedSteps.steps,
    editable: diagnostics.length === 0,
    diagnostics: [...new Set(diagnostics)],
    ...(safeTapMs === undefined ? {} : { tapMs: safeTapMs }),
    ...(safeWaitMs === undefined ? {} : { waitMs: safeWaitMs }),
    ...(typeof labelText === 'string' ? { labelText } : {}),
    ...(typeof displayName === 'string' ? { displayName } : {})
  }
  return { definition, node: child, container, properties }
}

export function rootBlock(scan: DtsScan): { open: number; close: number } | null {
  const roots = [...scan.masked.matchAll(/\/\s*\{/g)]
  if (roots.length !== 1) return null
  const open = roots[0]!.index! + roots[0]![0].length - 1
  const close = matchBrace(scan, open)
  return close < 0 ? null : { open, close }
}

function declaredLabelCodes(scan: DtsScan): Set<string> {
  const labels = new Set<string>()
  for (const match of scan.masked.matchAll(/(?:^|[;{}])\s*([A-Za-z_]\w*)\s*:/gm)) labels.add(`&${match[1]}`)
  return labels
}

function completeNodeBody(scan: DtsScan, start: number, end: number): boolean {
  let remaining = ''
  let cursor = start
  const names = new Set<string>()
  for (const child of iterateChildNodes(scan, { bodyStart: start, bodyEnd: end })) {
    if (names.has(child.name) || !completeNodeBody(scan, child.openBrace + 1, child.closeBrace)) return false
    names.add(child.name)
    remaining += scan.masked.slice(cursor, child.labelStart)
    const terminator = /^\s*;/.exec(scan.masked.slice(child.closeBrace + 1, end))
    if (!terminator) return false
    cursor = child.closeBrace + 1 + terminator[0].length
  }
  remaining += scan.masked.slice(cursor, end)
  const property = /\s*[#A-Za-z_][\w,\-]*\s*(?:=\s*(?:"[^"]*"|<[^<>]*>|\[[0-9a-fA-F\s]*\])(?:\s*,\s*(?:"[^"]*"|<[^<>]*>))*)?\s*;/y
  let offset = 0
  while (remaining.slice(offset).trim()) {
    property.lastIndex = offset
    const match = property.exec(remaining)
    if (!match) return false
    let depth = 0
    for (const char of match[0]) {
      if (char === '(') depth++
      if (char === ')' && --depth < 0) return false
    }
    if (depth !== 0) return false
    offset = property.lastIndex
  }
  return true
}

export function sourceCoverageComplete(scan: DtsScan, source: string): boolean {
  const root = rootBlock(scan)
  if (!root || hasPreprocessorConditional(scan.masked)) return false
  // scanDts masks unterminated comments/strings too; coverage must not.
  const lexical = /\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:[^"\\]|\\[\s\S])*"|[^/"\s]+|\/(?!\*)|\s+/gy
  let end = 0
  for (let token = lexical.exec(source); token; token = lexical.exec(source)) end = lexical.lastIndex
  if (end !== source.length || !completeNodeBody(scan, root.open + 1, root.close)) return false
  if (/^\s*#(?:define|undef|include\s+")/m.test(scan.masked)) return false
  for (const include of scan.masked.matchAll(/^\s*#include\s+<([^>]+)>/gm)) {
    if (!ALLOWED_INCLUDES.has(include[1]!)) return false
  }
  if (/\/(?:delete-node|delete-property)\//.test(scan.masked)) return false
  const rootStart = scan.masked.lastIndexOf('/', root.open)
  const beforeRoot = scan.masked.slice(0, rootStart).replace(/^\s*#include\s+<[^>]+>\s*$/gm, '')
  const afterRoot = scan.masked.slice(root.close + 1).replace(/^\s*;/, '')
  if (/\S/.test(beforeRoot) || /\S/.test(afterRoot)) return false
  return true
}

export function collectSourceDefinitions(source: string): { definitions: SourceDefinition[]; coverage: boolean; signatures: Map<string, InputDomain[]>; layerCount?: number } {
  const scan = scanDts(source)
  const root = rootBlock(scan)
  if (!root) return { definitions: [], coverage: false, signatures: new Map() }
  const containers: Array<{ name: 'macros' | 'behaviors'; child: DtsChildNode }> = []
  const keymaps: DtsChildNode[] = []
  for (const child of iterateChildNodes(scan, { bodyStart: root.open + 1, bodyEnd: root.close })) {
    if (!child.label && (child.name === 'macros' || child.name === 'behaviors')) {
      containers.push({ name: child.name, child })
    }
    if (!child.label && child.name === 'keymap') keymaps.push(child)
  }
  const layerCount = keymaps.length === 1
    ? [...iterateChildNodes(scan, { bodyStart: keymaps[0]!.openBrace + 1, bodyEnd: keymaps[0]!.closeBrace })].length
    : undefined
  const labels = new Map<string, number>()
  for (const container of containers) {
    for (const child of iterateChildNodes(scan, { bodyStart: container.child.openBrace + 1, bodyEnd: container.child.closeBrace })) {
      if (!child.label) continue
      const props = nodeProperties(source, scan, child).properties
      const compatible = literalString(props.get('compatible')?.value ?? '')
      const arity = compatible ? MACRO_COMPATIBLES[compatible] as 0 | 1 | 2 | undefined : undefined
      if (arity !== undefined) labels.set(`&${child.label}`, arity)
    }
  }
  const additions = behaviorGraphDefinitions(source)
  for (const item of additions) labels.set(item.definition.code, item.definition.arity)
  const definitions: SourceDefinition[] = [...additions]
  for (const item of additions) {
    const pending = new Set<number>()
    for (const step of item.definition.steps) {
      if (step.kind === 'control') {
        const match = /^param_[12]to([12])$/.exec(step.control)
        if (match) pending.add(Number(match[1]) - 1)
        continue
      }
      const invocation = parseKeyBinding(step.binding)
      for (const slot of pending) {
        const domain = leafDomains(step.binding)[slot]
        invocation.params[slot] = { value: domain === 'code' ? 'A' : domain === 'modifier' ? 'LSHFT' : '0', params: [] }
      }
      pending.clear()
      const error = validateInvocation(encodeKeyBinding(invocation), labels, layerCount)
      if (error) item.definition.diagnostics.push(error)
    }
  }
  for (const container of containers) {
    for (const child of iterateChildNodes(scan, { bodyStart: container.child.openBrace + 1, bodyEnd: container.child.closeBrace })) {
      const definition = sourceDefinition(source, scan, container.name, child, labels, layerCount)
      if (definition) definitions.push(definition)
    }
  }
  const repeatedContainers = new Set(
    containers.filter(container => containers.filter(other => other.name === container.name).length > 1).map(container => container.name)
  )
  for (const definition of definitions) {
    if (!repeatedContainers.has(definition.container)) continue
    definition.definition.editable = false
    definition.definition.diagnostics = [...definition.definition.diagnostics, `Repeated ${definition.container} container`]
  }
  const duplicateCodes = new Set<string>()
  for (const definition of definitions) {
    if (definitions.filter(other => other.definition.code === definition.definition.code).length > 1) duplicateCodes.add(definition.definition.code)
  }
  for (const definition of definitions) {
    if (duplicateCodes.has(definition.definition.code)) {
      definition.definition.editable = false
      definition.definition.diagnostics = [...definition.definition.diagnostics, 'Duplicate macro label']
    }
  }
  const duplicateNodeNames = new Set<string>()
  for (const definition of definitions) {
    if (definitions.filter(other => other.definition.nodeName === definition.definition.nodeName).length > 1) {
      duplicateNodeNames.add(definition.definition.nodeName)
    }
  }
  for (const definition of definitions) {
    if (!duplicateNodeNames.has(definition.definition.nodeName)) continue
    definition.definition.editable = false
    definition.definition.diagnostics = [...definition.definition.diagnostics, 'Duplicate macro node name']
  }
  const byCode = new Map(definitions.map(item => [item.definition.code, item]))
  for (const match of scan.masked.matchAll(/\bsensor-bindings\s*=\s*<([^>]*)>/g)) {
    const bindings = tokenizeBindingsDetailed(match[1]!)
    if (bindings.hasUnparsedFragment) continue
    for (const binding of bindings.binds) {
      const macro = byCode.get(String(parseKeyBinding(binding).value))
      if (!macro || macro.sensor) continue
      macro.definition.editable = false
      macro.definition.diagnostics = [...macro.definition.diagnostics, 'Macros cannot be used directly as sensor bindings']
    }
  }
  const edges = new Map<string, string[]>()
  for (const item of definitions) {
    edges.set(item.definition.code, item.definition.steps.flatMap(step => {
      if (step.kind !== 'behavior') return []
      const callee = String(parseKeyBinding(step.binding).value)
      return byCode.has(callee) ? [callee] : []
    }))
  }
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const cyclic = new Set<string>()
  const visit = (code: string, trail: string[]): void => {
    if (visiting.has(code)) {
      for (const entry of trail.slice(trail.indexOf(code))) cyclic.add(entry)
      return
    }
    if (visited.has(code)) return
    visiting.add(code)
    for (const callee of edges.get(code) ?? []) visit(callee, [...trail, code])
    visiting.delete(code)
    visited.add(code)
  }
  for (const code of byCode.keys()) visit(code, [])
  for (const code of cyclic) {
    const item = byCode.get(code)!
    item.definition.editable = false
    item.definition.diagnostics = [...item.definition.diagnostics, 'Cyclic same-file macro call']
  }
  const coverage = sourceCoverageComplete(scan, source)
  const includes = new Set([...scan.masked.matchAll(/^\s*#include\s+<([^>]+)>/gm)].map(match => match[1]))
  const declarations = [...scan.masked.matchAll(/\b([A-Za-z_]\w*)\s*:/g)].map(match => `&${match[1]}`)
  for (const { definition } of definitions) {
    if (!coverage) definition.diagnostics.push('Reference coverage is incomplete for this source')
    if (declarations.filter(code => code === definition.code).length !== 1) definition.diagnostics.push('Duplicate macro label')
    for (const step of definition.steps) {
      const code = step.kind === 'control' ? `&macro_${step.control}` : String(parseKeyBinding(step.binding).value)
      if (byCode.get(code)?.sensor) definition.diagnostics.push(`${code} is a sensor adapter, not an ordinary child invocation`)
      const stock = CONTROL_CODES.has(code) || code in ORDINARY_ARITY || code === '&bt'
      if (stock && declarations.includes(code)) definition.diagnostics.push(`${code} stock dependency is overridden`)
      if (stock && !includes.has('behaviors.dtsi') && !(CONTROL_CODES.has(code) && includes.has('behaviors/macros.dtsi'))) {
        definition.diagnostics.push(`${code} requires a verified stock behavior include`)
      }
      if (step.kind === 'behavior' && ['&kp', '&kt', '&mt', '&lt'].includes(code) && !includes.has('dt-bindings/zmk/keys.h')) {
        definition.diagnostics.push(`${code} requires the stock keys include`)
      }
      if (step.kind === 'behavior' && usesModifiers(parseKeyBinding(step.binding)) && !includes.has('dt-bindings/zmk/modifiers.h')) {
        definition.diagnostics.push(`${code} requires the stock modifiers include`)
      }
      if (code === '&bt' && !includes.has('dt-bindings/zmk/bt.h')) definition.diagnostics.push('&bt requires the stock Bluetooth include')
    }
    definition.diagnostics = [...new Set(definition.diagnostics)]
    definition.editable = definition.diagnostics.length === 0
  }
  const signatures = inferDomains(definitions, layerCount)
  return { definitions, coverage, signatures, layerCount }
}

/** Exact ordinary invocation validation, never a sensor-callback signature. */
export function validateMacroInvocation(source: string, binding: string): string[] {
  const parsed = collectSourceDefinitions(source)
  return validateGraphInvocation(source, binding, parsed)
}

/** Shared typed invocation check for macro and behavior schema adapters. */
export function validateGraphInvocation(source: string, binding: string, parsed: ReturnType<typeof collectSourceDefinitions>): string[] {
  const invocation = parseKeyBinding(binding)
  const domains = parsed.signatures.get(String(invocation.value))
  if (!parsed.coverage || !domains) return ['Macro has no source-proven editable signature.']
  if (usesModifiers(invocation) && !/^\s*#include\s+<dt-bindings\/zmk\/modifiers\.h>/m.test(scanDts(source).masked)) {
    return ['Macro invocation requires the stock modifiers include.']
  }
  if (invocation.params.length !== domains.length) return [`${invocation.value} requires ${domains.length} arguments.`]
  return domains.flatMap((domain, index) => domainAccepts(domain, invocation.params[index], parsed.layerCount)
    ? [] : [`${invocation.value} operand ${index + 1} requires ${domain}.`])
}

/** Parse macro definitions without granting edit ownership to unsupported source. */
export function parseDtsMacros(source: string): MacroParseResult {
  const parsed = collectSourceDefinitions(source)
  return {
    definitions: parsed.definitions.filter(item => !item.behavior).map(item => ({ ...item.definition, steps: item.definition.steps.map(cloneStep), diagnostics: [...item.definition.diagnostics] })),
    referenceCoverageComplete: parsed.coverage
  }
}

function cloneStep(step: ZmkMacroStep): ZmkMacroStep {
  return step.kind === 'behavior' ? { ...step } : { ...step, values: [...step.values] }
}

function macroFingerprint(definition: ZmkMacroDefinition): string {
  return JSON.stringify({
    code: definition.code,
    label: definition.label,
    nodeName: definition.nodeName,
    container: definition.container,
    arity: definition.arity,
    tapMs: definition.tapMs,
    waitMs: definition.waitMs,
    labelText: definition.labelText,
    displayName: definition.displayName,
    steps: definition.steps
  })
}

/** Stable semantic fingerprint for JSON reload, clone, and dirty tracking. */
export function encodeMacroFingerprint(definition: ZmkMacroDefinition): string {
  return macroFingerprint(definition)
}

/** Semantic source baseline for rejecting stale JSON/source macro mutations. */
export function macroDefinitionsFingerprint(definitions: readonly ZmkMacroDefinition[]): string {
  return definitions.map(encodeMacroFingerprint).join('\n')
}

/** Validate persisted macro metadata without trusting it to grant source ownership. */
export function normalizeZmkMacros(raw: unknown): ZmkMacroDefinition[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: ZmkMacroDefinition[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return undefined
    const row = item as Record<string, unknown>
    const code = typeof row.code === 'string' ? row.code : ''
    const label = typeof row.label === 'string' ? row.label : ''
    const nodeName = typeof row.nodeName === 'string' ? row.nodeName : ''
    const container = row.container === 'macros' || row.container === 'behaviors' ? row.container : undefined
    const arity = row.arity === 0 || row.arity === 1 || row.arity === 2 ? row.arity : undefined
    if (!/^&[A-Za-z_][A-Za-z0-9_]*$/.test(code) || code !== `&${label}` ||
      !/^[A-Za-z_][A-Za-z0-9_]*$/.test(label) || !/^[A-Za-z0-9,._+@-]+$/.test(nodeName) ||
      !container || arity === undefined || !Array.isArray(row.steps) || !Array.isArray(row.diagnostics)) return undefined
    const steps: ZmkMacroStep[] = []
    let invalid = false
    for (const step of row.steps) {
      if (!step || typeof step !== 'object') { invalid = true; break }
      const value = step as Record<string, unknown>
      if (value.kind === 'behavior' && typeof value.binding === 'string') {
        try {
          if (/[;{}<>]/.test(value.binding)) { invalid = true; break }
          if (encodeKeyBinding(parseKeyBinding(value.binding)) !== value.binding) { invalid = true; break }
          steps.push({ kind: 'behavior', binding: value.binding })
        } catch {
          invalid = true
          break
        }
      } else if (value.kind === 'control' && typeof value.control === 'string' &&
        CONTROL_CODES.has(`&macro_${value.control}`) && Array.isArray(value.values) &&
        value.values.every(part => typeof part === 'string' && /^(0|[1-9][0-9]*)$/.test(part))) {
        steps.push({ kind: 'control', control: value.control, values: [...value.values] })
      } else {
        invalid = true
        break
      }
    }
    if (invalid) return undefined
    const number = (value: unknown): number | undefined =>
      typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffffffff ? value : undefined
    out.push({
      code,
      label,
      nodeName,
      container,
      arity,
      steps,
      editable: row.editable === true,
      diagnostics: row.diagnostics.filter((value): value is string => typeof value === 'string'),
      ...(number(row.tapMs) !== undefined ? { tapMs: number(row.tapMs) } : {}),
      ...(number(row.waitMs) !== undefined ? { waitMs: number(row.waitMs) } : {}),
      ...(typeof row.labelText === 'string' ? { labelText: row.labelText } : {}),
      ...(typeof row.displayName === 'string' ? { displayName: row.displayName } : {})
    })
  }
  return out
}

function sitePath(source: string, index: number): string {
  const line = source.slice(0, index).split(/\r?\n/).length
  return `source line ${line}`
}

function bindingSites(source: string, scan: DtsScan): MacroReferenceSite[] {
  const root = rootBlock(scan)
  if (!root) return []
  const sites: MacroReferenceSite[] = []
  const walk = (start: number, end: number, parents: string[]): void => {
    for (const child of iterateChildNodes(scan, { bodyStart: start, bodyEnd: end })) {
      const path = [...parents, child.name]
      const read = nodeProperties(source, scan, child)
      const properties = read.properties
      const compatible = literalString(properties.get('compatible')?.value ?? '')
      const bindings = properties.get('bindings')
      if (bindings && ![...iterateChildNodes(scan, { bodyStart: child.openBrace + 1, bodyEnd: child.closeBrace })].length &&
        parseGroups(bindings.value).diagnostics.length === 0) {
        const groups = [...scan.masked.slice(bindings.valueSpan.start, bindings.valueSpan.end).matchAll(/<([^<>]*)>/g)]
        const count = groups.reduce((sum, group) => sum + tokenizeBindingsDetailed(group[1]!).binds.length, 0)
        let kind: MacroReferenceSite['kind'] = 'opaque'
        if (parents.length === 1 && parents[0] === 'keymap') kind = 'key'
        if (parents.length === 1 && parents[0] === 'combos') kind = 'combo'
        if (parents.length === 1 && ['macros', 'behaviors'].includes(parents[0]!) && compatible && compatible in MACRO_COMPATIBLES) kind = 'macro'
        if (compatible === 'zmk,behavior-hold-tap' || compatible === 'zmk,behavior-sticky-key') kind = 'hold-tap'
        if (compatible === 'zmk,behavior-tap-dance' || compatible === 'zmk,behavior-mod-morph') kind = 'behavior-child'
        const adapterProperties = new Set(['compatible', '#sensor-binding-cells', 'bindings', 'tap-ms', 'label', 'display-name'])
        if (parents.length === 1 && parents[0] === 'behaviors' && child.label && compatible === 'zmk,behavior-sensor-rotate' &&
          decimal(properties.get('#sensor-binding-cells')?.value ?? '') === 0 && count === 2 && read.diagnostics.length === 0 &&
          [...properties.keys()].every(name => adapterProperties.has(name)) &&
          (!properties.has('tap-ms') || decimal(properties.get('tap-ms')!.value) !== null) &&
          ['label', 'display-name'].every(name => !properties.has(name) || literalString(properties.get(name)!.value) !== null)) kind = 'sensor-child'
        let ordinal = 0
        for (const group of groups) {
          const content = group[1]!
          const refs = [...content.matchAll(/&[A-Za-z_]\w*/g)]
          for (let i = 0; i < refs.length; i++) {
            const ref = refs[i]!
            const localStart = ref.index!
            const text = content.slice(localStart, refs[i + 1]?.index ?? content.length).trimEnd()
            const absolute = bindings.valueSpan.start + group.index! + 1 + localStart
            sites.push({ reference: ref[0], start: absolute, end: absolute + text.length, kind,
              path: `${path.join('.')}.bindings[${ordinal++}]`, binding: text.replace(/\s+/g, ' ') })
          }
        }
      }
      const sensor = properties.get('sensor-bindings')
      if (sensor && parents.length === 1 && parents[0] === 'keymap' && parseGroups(sensor.value).diagnostics.length === 0) {
        const text = scan.masked.slice(sensor.valueSpan.start, sensor.valueSpan.end)
        let ordinal = 0
        for (const group of text.matchAll(/<([^<>]*)>/g)) {
          const refs = [...group[1]!.matchAll(/&[A-Za-z_]\w*/g)]
          for (const [index, ref] of refs.entries()) {
            const binding = group[1]!.slice(ref.index!, refs[index + 1]?.index ?? group[1]!.length).trimEnd()
            const start = sensor.valueSpan.start + group.index! + 1 + ref.index!
            sites.push({ reference: ref[0], start, end: start + binding.length, kind: 'sensor',
              path: `${path.join('.')}.sensor-bindings[${ordinal++}]`, binding: binding.replace(/\s+/g, ' ') })
          }
        }
      }
      walk(child.openBrace + 1, child.closeBrace, path)
    }
  }
  walk(root.open + 1, root.close, [])
  return sites
}

export function macroReferenceIndex(source: string, target: string): MacroReferenceSite[] {
  const scan = scanDts(source)
  const definitions = collectSourceDefinitions(source).definitions
  const typedSites = bindingSites(source, scan)
  const definition = definitions.find(item => item.definition.code === target)
  const re = new RegExp(`&${target.slice(1).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g')
  const sites: MacroReferenceSite[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(scan.masked)) !== null) {
    const start = match.index
    if (definition && start >= definition.node.labelStart && start < definition.node.end) continue
    const typed = typedSites.find(site => site.start === start)
    sites.push(typed ?? { reference: target, start, end: start + target.length, path: sitePath(source, start), kind: 'opaque' })
  }
  return sites
}

export function macroDeletePreflight(
  source: string,
  code: string,
  definitions: readonly ZmkMacroDefinition[] = parseDtsMacros(source).definitions
): { ok: true; sites: [] } | { ok: false; sites: MacroReferenceSite[]; error: string } {
  const parsed = collectSourceDefinitions(source)
  const target = parsed.definitions.find(item => item.definition.code === code)
  if (!target || !target.definition.editable || !definitions.some(definition => definition.code === code)) {
    return { ok: false, sites: [], error: 'Macro is not a uniquely owned editable definition.' }
  }
  if (!parsed.coverage) {
    return { ok: false, sites: [], error: 'Reference coverage is incomplete for this source.' }
  }
  const sites = macroReferenceIndex(source, code)
  if (sites.length > 0) return { ok: false, sites, error: 'Macro has incoming references.' }
  return { ok: true, sites: [] }
}

/** Revalidate the shared graph and every incoming site of a changed signature. */
export function validateDefinitionGraphChange(source: string, output: string): void {
  const before = collectSourceDefinitions(source)
  const after = collectSourceDefinitions(output)
  for (const item of after.definitions) {
    const old = before.definitions.find(previous => previous.definition.code === item.definition.code)
    if ((!old || old.definition.editable) && !item.definition.editable) {
      throw new KeymapValidationError([`${item.definition.code} failed graph revalidation: ${item.definition.diagnostics.join('; ')}`])
    }
  }
  for (const [code, domains] of after.signatures) {
    if (JSON.stringify(before.signatures.get(code)) === JSON.stringify(domains)) continue
    const target = after.definitions.find(item => item.definition.code === code)!
    for (const site of macroReferenceIndex(output, code)) {
      const owner = after.definitions.find(item => site.start > item.node.openBrace && site.end <= item.node.closeBrace)
      if (owner?.definition.editable && ['macro', 'behavior-child', 'hold-tap', 'sensor-child'].includes(site.kind)) continue
      if (site.kind === 'sensor-child' && site.binding && !target.sensor &&
        validateGraphInvocation(output, site.binding, after).length === 0) continue
      if (!owner && site.binding && ['key', 'combo', 'sensor'].includes(site.kind) &&
        Boolean(target.sensor) === (site.kind === 'sensor') && validateGraphInvocation(output, site.binding, after).length === 0) continue
      throw new KeymapValidationError([`${code} signature change leaves an invalid or unproven incoming caller at ${site.path}.`])
    }
  }
}

export function applyEdits(source: string, edits: Array<{ start: number; end: number; text: string }>): string {
  const ordered = [...edits].sort((left, right) => right.start - left.start || right.end - left.end)
  for (let index = 1; index < ordered.length; index++) {
    if (ordered[index - 1]!.start < ordered[index]!.end) throw new KeymapValidationError(['Macro source edits overlap.'])
  }
  let output = source
  for (const edit of ordered) output = output.slice(0, edit.start) + edit.text + output.slice(edit.end)
  return output
}

function formatSteps(steps: readonly ZmkMacroStep[]): string {
  return steps.map(step => {
    if (step.kind === 'behavior') return `<${step.binding}>`
    const args = step.values.length > 0 ? ` ${step.values.join(' ')}` : ''
    return `<&macro_${step.control}${args}>`
  }).join(', ')
}

function propertyEdit(
  source: string,
  item: SourceDefinition,
  name: 'tap-ms' | 'wait-ms' | 'label' | 'display-name',
  next: number | string | undefined
): Array<{ start: number; end: number; text: string }> {
  const current = item.properties.get(name)
  const old = item.definition[name === 'tap-ms' ? 'tapMs' : name === 'wait-ms' ? 'waitMs' : name === 'label' ? 'labelText' : 'displayName']
  if (old === next) return []
  if (current) {
    if (next === undefined) {
      const nameStart = source.lastIndexOf(name, current.valueSpan.start)
      if (nameStart < current.statement.start) throw new KeymapValidationError([`Cannot remove ${name} without a verified property token.`])
      return [{ start: nameStart, end: current.statement.end, text: '' }]
    }
    const text = typeof next === 'number' ? `<${next}>` : JSON.stringify(next)
    return [{ start: current.valueSpan.start, end: current.valueSpan.end, text }]
  }
  if (next === undefined) return []
  const bindings = item.properties.get('bindings')
  if (!bindings) throw new KeymapValidationError([`${item.definition.code} has no writable bindings property.`])
  const lineStart = source.lastIndexOf('\n', bindings.statement.start - 1) + 1
  const indent = /^[ \t]*/.exec(source.slice(lineStart, bindings.statement.start))?.[0] ?? '    '
  const text = typeof next === 'number' ? `<${next}>` : JSON.stringify(next)
  return [{ start: bindings.statement.start, end: bindings.statement.start, text: `${indent}${name} = ${text};${dominantEol(source)}` }]
}

function formatDefinition(definition: ZmkMacroDefinition, indent: string, eol: string): string {
  const inner = `${indent}    `
  const compatible = Object.entries(MACRO_COMPATIBLES).find(([, arity]) => arity === definition.arity)?.[0]
  if (!compatible) throw new KeymapValidationError([`Unsupported macro arity for ${definition.code}.`])
  const lines = [
    `${indent}${definition.label}: ${definition.nodeName} {`,
    `${inner}compatible = "${compatible}";`,
    `${inner}#binding-cells = <${definition.arity}>;`
  ]
  if (definition.labelText !== undefined) lines.push(`${inner}label = ${JSON.stringify(definition.labelText)};`)
  if (definition.displayName !== undefined) lines.push(`${inner}display-name = ${JSON.stringify(definition.displayName)};`)
  if (definition.tapMs !== undefined) lines.push(`${inner}tap-ms = <${definition.tapMs}>;`)
  if (definition.waitMs !== undefined) lines.push(`${inner}wait-ms = <${definition.waitMs}>;`)
  lines.push(`${inner}bindings = ${formatSteps(definition.steps)};`, `${indent}};`)
  return lines.join(eol)
}

/** Internal default-template path only: validate both families as one graph.
 * Never use this to regenerate a source-backed document or bypass its splices.
 */
export function appendGeneratedDefinitions(source: string, macros: readonly ZmkMacroDefinition[], behaviors: readonly ZmkBehaviorDefinition[]): string {
  const scan = scanDts(source)
  const root = rootBlock(scan)
  if (!root || findNamedBlock(source, scan, 'macros') || findNamedBlock(source, scan, 'behaviors')) {
    throw new KeymapValidationError(['Generated definitions require an empty definition namespace.'])
  }
  const reserved = new Set([...Object.keys(ORDINARY_ARITY), ...CONTROL_CODES, '&bt', '&rgblayer'])
  for (const item of macros) {
    if (!item.editable || item.container !== 'macros' || reserved.has(item.code) ||
        !/^[A-Za-z_]\w*$/.test(item.label) || item.code !== `&${item.label}` || !/^[A-Za-z0-9,._+@-]+$/.test(item.nodeName)) {
      throw new KeymapValidationError(['Invalid generated macro identity.'])
    }
  }
  for (const item of behaviors) {
    if (!item.editable || !/^[A-Za-z_]\w*$/.test(item.label) || item.code !== `&${item.label}` || !/^[A-Za-z0-9,._+@-]+$/.test(item.nodeName)) {
      throw new KeymapValidationError(['Invalid generated behavior identity.'])
    }
  }
  const eol = dominantEol(source)
  const text = (macros.length ? `${eol}    macros {${eol}${macros.map(item => formatDefinition(item, '        ', eol)).join(eol)}${eol}    };${eol}` : '') +
    (behaviors.length ? `${eol}    behaviors {${eol}${behaviors.map(item => formatBehavior(item, eol)).join(eol)}${eol}    };${eol}` : '')
  const output = applyEdits(source, [{ start: root.close, end: root.close, text }])
  const graph = collectSourceDefinitions(output)
  if (!graph.coverage) throw new KeymapValidationError(['Generated definition reference coverage is incomplete.'])
  validateDefinitionGraphChange(source, output)
  if (macroDefinitionsFingerprint(parseDtsMacros(output).definitions) !== macroDefinitionsFingerprint(macros) ||
      behaviorDefinitionsFingerprint(parseDtsBehaviorDefinitions(output).definitions) !== behaviorDefinitionsFingerprint(behaviors)) {
    throw new KeymapValidationError(['Generated definitions failed schema revalidation.'])
  }
  return output
}

/** Source-free generation cannot preserve unresolved external calls. */
export function validateGeneratedDefinitionReferences(source: string): void {
  const masked = scanDts(source).masked
  const known = new Set([
    ...loadBehaviorsData().map(item => item.code), ...CONTROL_CODES, '&reset', '&rgblayer',
    ...[...masked.matchAll(/\b([A-Za-z_]\w*)\s*:/g)].map(match => `&${match[1]}`)
  ])
  for (const [code] of masked.matchAll(/&[A-Za-z_]\w*/g)) {
    if (!known.has(code)) throw new KeymapValidationError([`Unresolved generated definition reference ${code}. Remove its incoming references before renaming or deleting it.`])
  }
}

/** JSON metadata proves only its own bounded semantic graph, never source ownership. */
export function macroMetadataSignatures(raw: unknown, layerCount: number, rawBehaviors?: unknown): Map<string, InputDomain[]> {
  const definitions = normalizeZmkMacros(raw) ?? []
  const behaviors = normalizeBehaviorDefinitions(rawBehaviors) ?? []
  const source = `${[...ALLOWED_INCLUDES].map(header => `#include <${header}>`).join('\n')}
/ {
  macros { ${definitions.filter(item => item.editable).map(item => formatDefinition(item, '', '\n')).join('\n')} };
  behaviors { ${behaviors.filter(item => item.editable).map(item => formatBehavior(item, '\n')).join('\n')} };
  keymap { ${Array.from({ length: layerCount }, (_, index) => `layer_${index} { bindings = <&none>; };`).join('\n')} };
};`
  const graph = collectSourceDefinitions(source)
  for (const item of graph.definitions) if (item.sensor) graph.signatures.delete(item.definition.code)
  return graph.signatures
}

/**
 * Apply macro model changes against the captured source. Existing unsupported
 * definitions are never regenerated; a changed bindings value with comments is
 * refused rather than losing comment attachment.
 */
export function spliceMacrosIntoDts(
  source: string,
  draft: readonly ZmkMacroDefinition[],
  baseline: readonly ZmkMacroDefinition[] = parseDtsMacros(source).definitions,
  options?: { sourceFree?: boolean }
): string {
  const parsed = collectSourceDefinitions(source)
  if (!parsed.coverage) {
    throw new KeymapValidationError(['Macro source reference coverage is incomplete; macro edits are disabled.'])
  }
  parsed.definitions = parsed.definitions.filter(item => !item.behavior)
  const sourceByCode = new Map(parsed.definitions.map(item => [item.definition.code, item]))
  if (macroDefinitionsFingerprint(baseline) !== macroDefinitionsFingerprint(parsed.definitions.map(item => item.definition))) {
    throw new KeymapValidationError(['Macro source baseline is stale. Reload before editing macros.'])
  }
  const baseByCode = new Map(baseline.map(definition => [definition.code, definition]))
  const draftByCode = new Map(draft.map(definition => [definition.code, definition]))
  if (draftByCode.size !== draft.length) throw new KeymapValidationError(['Macro labels must be unique.'])
  const declaredCodes = declaredLabelCodes(scanDts(source))
  const reservedCodes = new Set([...Object.keys(ORDINARY_ARITY), ...CONTROL_CODES, '&bt', '&rgblayer'])
  const canDeclareCode = (code: string, allowModelReferences = false) =>
    !declaredCodes.has(code) && !reservedCodes.has(code) && (allowModelReferences || macroReferenceIndex(source, code).length === 0)
  const edits: Array<{ start: number; end: number; text: string }> = []
  const consumedDraftCodes = new Set<string>()
  for (const [code, item] of sourceByCode) {
    const old = baseByCode.get(code) ?? item.definition
    const renameCandidates = draft.filter(candidate =>
      candidate.code !== code && candidate.nodeName === old.nodeName &&
      candidate.container === old.container && candidate.arity === old.arity
    )
    if (renameCandidates.length > 1) throw new KeymapValidationError([`${code} has ambiguous rename candidates.`])
    const next = draftByCode.get(code) ?? renameCandidates[0]
    const renamed = next !== undefined && next.code !== code
    if (!next) {
      const preflight = macroDeletePreflight(source, code, baseline)
      if (!preflight.ok) throw new KeymapValidationError([preflight.error])
      edits.push({ start: item.node.labelStart, end: item.node.end, text: '' })
      continue
    }
    const changed = macroFingerprint(next) !== macroFingerprint(old)
    if (!changed) continue
    if (!item.definition.editable || !old.editable || !next.editable) {
      throw new KeymapValidationError([`${code} is read-only: ${item.definition.diagnostics.join('; ')}`])
    }
    if (renamed) {
      const preflight = macroDeletePreflight(source, code, baseline)
      if (!preflight.ok) throw new KeymapValidationError([preflight.error])
      if (!canDeclareCode(next.code)) {
        throw new KeymapValidationError([`${next.code} collides with an existing or unresolved source reference.`])
      }
      edits.push({ start: item.node.labelStart, end: item.node.labelStart + old.label.length, text: next.label })
      consumedDraftCodes.add(next.code)
    }
    if ((!renamed && (next.code !== code || next.label !== item.definition.label)) ||
      next.nodeName !== item.definition.nodeName || next.container !== item.definition.container || next.arity !== item.definition.arity) {
      throw new KeymapValidationError([`${code} cannot change identity, container, or arity.`])
    }
    const bindings = item.properties.get('bindings')
    if (!bindings) throw new KeymapValidationError([`${code} has no bindings property.`])
    const stepsChanged = JSON.stringify(next.steps) !== JSON.stringify(old.steps)
    if (stepsChanged) {

      if (/\/\*|\/\//.test(source.slice(bindings.valueSpan.start, bindings.valueSpan.end))) {
        throw new KeymapValidationError([`${code} bindings contain comments and cannot be safely regenerated.`])
      }
      edits.push({ start: bindings.valueSpan.start, end: bindings.valueSpan.end, text: formatSteps(next.steps) })
    }
    edits.push(...propertyEdit(source, item, 'tap-ms', next.tapMs))
    edits.push(...propertyEdit(source, item, 'wait-ms', next.waitMs))
    edits.push(...propertyEdit(source, item, 'label', next.labelText))
    edits.push(...propertyEdit(source, item, 'display-name', next.displayName))
  }
  const scan = scanDts(source)
  const root = rootBlock(scan)
  if (!root) throw new KeymapValidationError(['Cannot add a macro without one balanced root node.'])
  const newDefinitions = draft.filter(definition => !sourceByCode.has(definition.code) && !consumedDraftCodes.has(definition.code))
  const macros = findNamedBlock(source, scan, 'macros')
  const eol = dominantEol(source)
  for (const definition of newDefinitions) {
    if (!canDeclareCode(definition.code, options?.sourceFree === true)) throw new KeymapValidationError([`${definition.code} collides with an existing or unresolved source reference.`])
    if (!definition.editable || definition.container !== 'macros' || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(definition.label) || !/^[A-Za-z0-9,._+@-]+$/.test(definition.nodeName)) {
      throw new KeymapValidationError([`New macro ${definition.code} is not a valid managed definition.`])
    }
  }
  if (macros && newDefinitions.length > 0) {
    const lineStart = source.lastIndexOf('\n', macros.closeBrace - 1) + 1
    const indent = /^[ \t]*/.exec(source.slice(lineStart, macros.closeBrace))?.[0] ?? '    '
    const definitions = newDefinitions.map(definition => formatDefinition(definition, `${indent}    `, eol)).join(eol)
    edits.push({ start: macros.closeBrace, end: macros.closeBrace, text: `${definitions}${eol}${indent}` })
  }
  if (!macros && newDefinitions.length > 0) {
    const lineStart = source.lastIndexOf('\n', root.close - 1) + 1
    const indent = /^[ \t]*/.exec(source.slice(lineStart, root.close))?.[0] ?? ''
    const definitions = newDefinitions.map(definition => formatDefinition(definition, `${indent}        `, eol)).join(eol)
    edits.push({ start: root.close, end: root.close, text: `${eol}${indent}    macros {${eol}${definitions}${eol}${indent}    };${eol}${indent}` })
  }
  const output = applyEdits(source, edits)
  const reparsed = collectSourceDefinitions(output)
  if (!reparsed.coverage) throw new KeymapValidationError(['Macro edit produced incomplete source coverage.'])
  for (const next of draft) {
    const previous = sourceByCode.get(next.code)?.definition
    // Unchanged editable callers still need validation against the new graph.
    if (previous && !previous.editable && macroFingerprint(previous) === macroFingerprint(next)) continue
    const actual = reparsed.definitions.filter(item => item.definition.code === next.code)
    if (actual.length !== 1 || !actual[0]!.definition.editable ||
      macroFingerprint(actual[0]!.definition) !== macroFingerprint(next)) {
      throw new KeymapValidationError([`${next.code} failed macro edit revalidation: ${actual[0]?.definition.diagnostics.join('; ') ?? 'definition mismatch'}`])
    }
  }
  validateDefinitionGraphChange(source, output)
  if (macroDefinitionsFingerprint(reparsed.definitions.filter(item => !item.behavior).map(item => item.definition)) !== macroDefinitionsFingerprint(draft)) {
    throw new KeymapValidationError(['Requested macro order cannot be represented without moving existing source definitions.'])
  }
  return output
}

/**
 * Advisory counts for validated sequences, split at pause_for_release. Count
 * only known leaf events; do not simulate timings, draining or nested macros.
 * An empty warning list is not a runtime safety guarantee.
 */
export function macroQueueWarnings(steps: readonly ZmkMacroStep[]): string[] {
  const entries: [number, number] = [0, 0]
  let segment: 0 | 1 = 0
  let mode = 'tap'
  let unknown = false
  for (const step of steps) {
    if (step.kind === 'control') {
      if (['tap', 'press', 'release'].includes(step.control)) mode = step.control
      if (step.control === 'pause_for_release') segment = 1
      continue
    }
    const code = String(parseKeyBinding(step.binding).value)
    if (code in ORDINARY_ARITY || code === '&bt') entries[segment] += mode === 'tap' ? 2 : 1
    else unknown = true
  }
  const warnings = entries.flatMap((count, index) => {
    if (count <= 48) return []
    const capacity = count >= 64 ? ` This ${count === 64 ? 'fills' : 'exceeds'} the pinned default queue size of 64.` : ''
    return [`${index === 0 ? 'Press' : 'Release'} activation segment has ${count} known leaf queue entries, exceeding the 48-entry budget.${capacity} This is not a runtime safety estimate; concurrent activity and firmware configuration can change available capacity.`]
  })
  if (unknown) warnings.push('Nested or unknown invocations add uncounted work; known leaf counts are not a runtime queue estimate.')
  return warnings
}

const US_PUNCTUATION: Record<string, string> = {
  ' ': 'SPACE', '!': 'LS(N1)', '"': 'LS(SQT)', '#': 'LS(N3)', '$': 'LS(N4)', '%': 'LS(N5)', '&': 'LS(N7)', "'": 'SQT', '(': 'LS(N9)', ')': 'LS(N0)', '*': 'LS(N8)', '+': 'LS(EQUAL)', ',': 'COMMA', '-': 'MINUS', '.': 'DOT', '/': 'FSLH', ':': 'LS(SEMI)', ';': 'SEMI', '<': 'LS(COMMA)', '=': 'EQUAL', '>': 'LS(DOT)', '?': 'LS(FSLH)', '@': 'LS(N2)', '[': 'LBKT', '\\': 'BSLH', ']': 'RBKT', '^': 'LS(N6)', '_': 'LS(MINUS)', '`': 'GRAVE', '{': 'LS(LBKT)', '|': 'LS(BSLH)', '}': 'LS(RBKT)', '~': 'LS(GRAVE)'
}

export type TextToUsAsciiMacroResult =
  | { ok: true; changed: false; steps: [] }
  | {
      ok: true
      changed: true
      mapping: 'US QWERTY / ASCII'
      arity: 0
      steps: ZmkMacroStep[]
      tapMs: number
      waitMs: number
      queueEntries: number
      warnings: string[]
    }
  | { ok: false; errors: string[] }

const TEXT_QUEUE_EXPLANATION = 'US ASCII macro text is limited to 24 characters / 48 queue entries, reserving 16 entries against the pinned default queue size of 64. A 32-tap sequence can fill all 64 entries. This margin is not a runtime safety guarantee: concurrent activity can exceed it, nested macros add work, and firmware configuration, Caps Lock/modifiers and the host can affect output. The proposed 40ms timings remain editable, including zero; they do not guarantee transport timing.'

/** Propose a new tap macro, never append into an existing press/release state. */
export function textToUsAsciiMacro(text: string): TextToUsAsciiMacroResult {
  const errors: string[] = []
  const characters = Array.from(text)
  if (characters.length === 0) return { ok: true, changed: false, steps: [] }
  if (characters.length > 24) return { ok: false, errors: [TEXT_QUEUE_EXPLANATION] }
  const steps: ZmkMacroStep[] = []
  let position = 0
  for (const character of characters) {
    position++
    const point = character.codePointAt(0)!
    let keycode: string | undefined
    if (character === '\n') keycode = 'ENTER'
    else if (character === '\t') keycode = 'TAB'
    else if (/^[a-z]$/.test(character)) keycode = character.toUpperCase()
    else if (/^[A-Z]$/.test(character)) keycode = `LS(${character})`
    else if (/^[0-9]$/.test(character)) keycode = `N${character}`
    else keycode = US_PUNCTUATION[character]
    if (!keycode) {
      errors.push(`Position ${position}: U+${point.toString(16).toUpperCase().padStart(4, '0')} is not supported by US ASCII.`)
      continue
    }
    steps.push({ kind: 'behavior', binding: `&kp ${keycode}` })
  }
  return errors.length > 0 ? { ok: false, errors } : {
    ok: true, changed: true, mapping: 'US QWERTY / ASCII', arity: 0, steps,
    tapMs: 40, waitMs: 40, queueEntries: characters.length * 2, warnings: [TEXT_QUEUE_EXPLANATION]
  }
}
