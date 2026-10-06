/**
 * Read ZMK hold-tap nodes from a .keymap.
 * Named nodes (`hm: hm { compatible = "zmk,behavior-hold-tap"; … }`) become
 * extra behaviour codes. `&mt { tapping-term-ms = <…>; }` blocks are timing
 * overrides of a behaviour that already exists.
 * Save rewrites timing in those nodes and inserts nodes the model added.
 */

import {
  findNamedBlock,
  hasPreprocessorConditional,
  maskDts,
  matchBrace,
  readUintAngleScalar
} from './dts-scan.js'
import {
  dominantEol,
  eatFollowingEol,
  eatPrecedingEol,
  type LineEnding
} from './eol.js'
import type { ZmkHoldTap } from './types.js'

const HOLD_TAP_COMPATIBLE = 'zmk,behavior-hold-tap'

/** Param slot for each behaviour referenced by `bindings = <&kp>, <&kp>`. */
const PARAM_FOR_BINDING: Record<string, string> = {
  '&kp': 'code',
  '&mo': 'layer',
  '&to': 'layer',
  '&tog': 'layer',
  '&sl': 'layer',
  '&sk': 'code'
}

/** Flavor ids the hold-tap form can write. */
export const HOLD_TAP_FLAVORS: ReadonlyArray<{ id: string; label: string }> = [
  { id: 'tap-preferred', label: 'tap preferred' },
  { id: 'hold-preferred', label: 'hold preferred' },
  { id: 'balanced', label: 'balanced' },
  { id: 'tap-unless-interrupted', label: 'tap unless interrupted' }
]

const FLAVOR_LABELS: Record<string, string> = Object.fromEntries(
  HOLD_TAP_FLAVORS.map(flavor => [flavor.id, flavor.label])
)

/** `&mt` and `&lt` are the stock hold-taps a keymap can reconfigure. */
export function isStockHoldTap(code: string): boolean {
  return code === '&mt' || code === '&lt'
}

/** Timing knobs the key editor shows for one behaviour. */
export type HoldTapField = 'tappingTermMs' | 'flavor' | 'quickTapMs' | 'requirePriorIdleMs'

/**
 * Ready-made hold-taps. The editor offers these two and does not invent others.
 * Homerow is modifier + key. Autoshift is one key: hold sends it shifted.
 */
export interface HoldTapPreset {
  code: '&hm' | '&as'
  name: string
  description: string
  params: string[]
  bindings: string[]
  defaults: {
    tappingTermMs: number
    flavor: string
    quickTapMs?: number
    requirePriorIdleMs?: number
  }
  fields: readonly HoldTapField[]
}

export const HOLD_TAP_PRESETS: readonly HoldTapPreset[] = [
  {
    code: '&hm',
    name: 'Homerow',
    description: 'Hold a modifier, tap a key. Timing applies to every &hm.',
    params: ['mod', 'code'],
    bindings: ['&kp', '&kp'],
    defaults: {
      tappingTermMs: 280,
      flavor: 'balanced',
      quickTapMs: 175,
      requirePriorIdleMs: 150
    },
    fields: ['tappingTermMs', 'flavor', 'quickTapMs', 'requirePriorIdleMs']
  },
  {
    code: '&as',
    name: 'Autoshift',
    description: 'Hold sends the shifted key. Tap sends the key. The term applies to every &as.',
    params: ['code', 'code'],
    bindings: ['&kp', '&kp'],
    defaults: {
      tappingTermMs: 135,
      flavor: 'tap-preferred',
      quickTapMs: 0
    },
    fields: ['tappingTermMs']
  }
]

export function holdTapPresetFor(code: string): HoldTapPreset | undefined {
  return HOLD_TAP_PRESETS.find(preset => preset.code === code)
}

/** `&as LS(Q) Q` — hold is the shifted key, tap is the key. */
export function autoshiftBindingParams(keycode: string): Array<{
  value: string
  params: Array<{ value: string; params: [] }>
}> {
  return [
    { value: 'LS', params: [{ value: keycode, params: [] }] },
    { value: keycode, params: [] }
  ]
}

function readFlavor(source: string, masked: string, from: number, to: number): string | undefined {
  const slice = masked.slice(from, to)
  const match = /flavor\s*=\s*"/.exec(slice)
  if (!match) return undefined
  const contentStart = from + match.index + match[0].length
  const contentEnd = masked.indexOf('"', contentStart)
  if (contentEnd < 0 || contentEnd > to) return undefined
  const flavor = source.slice(contentStart, contentEnd).trim()
  return flavor ? flavor : undefined
}

function readBindingRefs(body: string): string[] {
  const match = /bindings\s*=\s*([^;]*);/.exec(body)
  if (!match) return []
  return [...match[1].matchAll(/&[A-Za-z_][\w]*/g)].map(hit => hit[0])
}

function readBindingCells(body: string): number | undefined {
  const match = /#binding-cells\s*=\s*<\s*(\d+)\s*>/.exec(body)
  if (!match) return undefined
  const n = Number(match[1])
  return n > 0 ? n : undefined
}

function paramsForHoldTapBindings(bindings: string[], cells?: number): string[] {
  if (bindings.length > 0) {
    return bindings.map(code => PARAM_FOR_BINDING[code] ?? 'code')
  }
  const count = cells != null && cells > 0 ? cells : 2
  return Array.from({ length: count }, () => 'code')
}

type HoldTapTimingFields = Pick<
  ZmkHoldTap,
  'tappingTermMs' | 'quickTapMs' | 'requirePriorIdleMs' | 'flavor'
>

function readTiming(
  source: string,
  masked: string,
  from: number,
  to: number
): { timing: HoldTapTimingFields; unparsed: boolean } {
  const range = { start: from, end: to }
  const timing: HoldTapTimingFields = {}
  let unparsed = false
  const tappingTermMs = readUintAngleScalar(masked, range, 'tapping-term-ms')
  const quickTapMs = readUintAngleScalar(masked, range, 'quick-tap-ms')
  const requirePriorIdleMs = readUintAngleScalar(masked, range, 'require-prior-idle-ms')
  if (tappingTermMs.kind === 'unparsed') unparsed = true
  else if (tappingTermMs.kind === 'ok') timing.tappingTermMs = tappingTermMs.value
  if (quickTapMs.kind === 'unparsed') unparsed = true
  else if (quickTapMs.kind === 'ok') timing.quickTapMs = quickTapMs.value
  if (requirePriorIdleMs.kind === 'unparsed') unparsed = true
  else if (requirePriorIdleMs.kind === 'ok') timing.requirePriorIdleMs = requirePriorIdleMs.value
  const flavor = readFlavor(source, masked, from, to)
  if (flavor) timing.flavor = flavor
  return { timing, unparsed }
}

function hasTiming(timing: HoldTapTimingFields): boolean {
  return (
    timing.tappingTermMs != null ||
    timing.quickTapMs != null ||
    timing.requirePriorIdleMs != null ||
    timing.flavor != null
  )
}

function nodeOpenBrace(masked: string, inside: number): number {
  let depth = 0
  for (let i = inside; i >= 0; i--) {
    const ch = masked[i]
    if (ch === '}') depth++
    else if (ch === '{') {
      if (depth === 0) return i
      depth--
    }
  }
  return -1
}

function readNodeHeader(
  source: string,
  openBrace: number
): { label?: string; name: string } | null {
  let lineEnd = openBrace
  let lineStart = source.lastIndexOf('\n', openBrace - 1) + 1
  let header = source.slice(lineStart, lineEnd).trim()
  if (!header) {
    const prevEnd = lineStart - 1
    if (prevEnd <= 0) return null
    const prevStart = source.lastIndexOf('\n', prevEnd - 1) + 1
    header = source.slice(prevStart, prevEnd).trim()
  }
  const match = /^(?:([A-Za-z_][\w]*)\s*:\s*)?([A-Za-z_][\w]*)$/.exec(header)
  if (!match) return null
  return { label: match[1], name: match[2] }
}

function pack(partial: ZmkHoldTap): ZmkHoldTap {
  const out: ZmkHoldTap = { code: partial.code }
  if (partial.override) out.override = true
  if (partial.nodeName) out.nodeName = partial.nodeName
  if (partial.tappingTermMs != null) out.tappingTermMs = partial.tappingTermMs
  if (partial.quickTapMs != null) out.quickTapMs = partial.quickTapMs
  if (partial.requirePriorIdleMs != null) out.requirePriorIdleMs = partial.requirePriorIdleMs
  if (partial.flavor) out.flavor = partial.flavor
  if (partial.bindings?.length) out.bindings = [...partial.bindings]
  if (partial.params?.length) out.params = [...partial.params]
  return out
}

function parseNamedHoldTaps(
  source: string,
  masked: string
): { nodes: ZmkHoldTap[]; unparsed: boolean } {
  const out: ZmkHoldTap[] = []
  let unparsed = false
  const re = /compatible\s*=\s*"/g
  let match: RegExpExecArray | null
  while ((match = re.exec(masked)) !== null) {
    const contentStart = match.index + match[0].length
    const contentEnd = masked.indexOf('"', contentStart)
    if (contentEnd < 0) continue
    if (source.slice(contentStart, contentEnd) !== HOLD_TAP_COMPATIBLE) continue
    const openBrace = nodeOpenBrace(masked, match.index - 1)
    if (openBrace < 0) continue
    const closeBrace = matchBrace(masked, openBrace)
    if (closeBrace < 0) continue
    const header = readNodeHeader(source, openBrace)
    if (!header) {
      unparsed = true
      re.lastIndex = closeBrace + 1
      continue
    }
    const body = masked.slice(openBrace + 1, closeBrace)
    const bindings = readBindingRefs(body)
    const cells = readBindingCells(body)
    const { timing, unparsed: timingUnparsed } = readTiming(
      source,
      masked,
      openBrace + 1,
      closeBrace
    )
    if (timingUnparsed) unparsed = true
    out.push(
      pack({
        code: `&${header.label ?? header.name}`,
        nodeName: header.name,
        ...timing,
        bindings,
        params: paramsForHoldTapBindings(bindings, cells)
      })
    )
    re.lastIndex = closeBrace + 1
  }
  return { nodes: out, unparsed }
}

function parseHoldTapOverrides(
  source: string,
  masked: string,
  defined: Set<string>
): { nodes: ZmkHoldTap[]; unparsed: boolean } {
  const out: ZmkHoldTap[] = []
  let unparsed = false
  const re = /(?<![A-Za-z0-9_])&([A-Za-z_][\w]*)\s*\{/g
  let match: RegExpExecArray | null
  while ((match = re.exec(masked)) !== null) {
    const openBrace = match.index + match[0].length - 1
    const closeBrace = matchBrace(masked, openBrace)
    if (closeBrace < 0) continue
    const body = masked.slice(openBrace + 1, closeBrace)
    if (/compatible\s*=/.test(body)) continue
    const { timing, unparsed: timingUnparsed } = readTiming(
      source,
      masked,
      openBrace + 1,
      closeBrace
    )
    if (timingUnparsed) unparsed = true
    if (!hasTiming(timing) && !timingUnparsed) continue
    if (!hasTiming(timing)) {
      re.lastIndex = closeBrace + 1
      continue
    }
    const code = `&${match[1]}`
    out.push(pack({ code, override: !defined.has(code), ...timing }))
    re.lastIndex = closeBrace + 1
  }
  return { nodes: out, unparsed }
}

function applyTiming(target: ZmkHoldTap, timing: ZmkHoldTap): ZmkHoldTap {
  return pack({
    ...target,
    tappingTermMs: timing.tappingTermMs ?? target.tappingTermMs,
    quickTapMs: timing.quickTapMs ?? target.quickTapMs,
    requirePriorIdleMs: timing.requirePriorIdleMs ?? target.requirePriorIdleMs,
    flavor: timing.flavor ?? target.flavor
  })
}

export interface DtsHoldTapsParse {
  holdTaps: ZmkHoldTap[]
  /**
   * True when a timing property was not a decimal integer (e.g. `#define` token)
   * or a hold-tap node could not be fully read. Save must omit `holdTaps`.
   */
  unparsed: boolean
  /**
   * True when `#if` / `#ifdef` / `#else` wrap or sit inside hold-tap nodes.
   * Save must omit `holdTaps` (`preprocessor_conditional`).
   */
  preprocessorConditional: boolean
}

/**
 * Hold-tap nodes in source order. Named nodes first; a later `&code { … }`
 * block fills in timing on that code. Overrides of built-ins stay `override`.
 * No hold-tap nodes → [].
 */
export function parseDtsHoldTaps(source: string): ZmkHoldTap[] {
  return parseDtsHoldTapsDetailed(source).holdTaps
}

export function parseDtsHoldTapsDetailed(source: string): DtsHoldTapsParse {
  const masked = maskDts(source)
  const named = parseNamedHoldTaps(source, masked)
  const defined = new Set(named.nodes.map(node => node.code))
  const overrides = parseHoldTapOverrides(source, masked, defined)
  const byCode = new Map<string, ZmkHoldTap>()
  const order: string[] = []
  for (const node of named.nodes) {
    if (!byCode.has(node.code)) order.push(node.code)
    byCode.set(node.code, node)
  }
  for (const node of overrides.nodes) {
    const prev = byCode.get(node.code)
    if (prev) {
      byCode.set(node.code, applyTiming(prev, node))
      continue
    }
    order.push(node.code)
    byCode.set(node.code, node)
  }
  return {
    holdTaps: order.map(code => byCode.get(code)!),
    unparsed: named.unparsed || overrides.unparsed,
    preprocessorConditional: holdTapRegionsHavePreprocessor(source, masked)
  }
}

function readOptionalInt(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) return undefined
  return value
}

/**
 * JSON / model round-trip. Invalid rows are dropped.
 * A missing value stays missing. An array, including `[]`, is kept so a
 * keymap.json that already recorded "no hold-tap nodes" is not read again.
 */
export function normalizeHoldTaps(raw: unknown): ZmkHoldTap[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: ZmkHoldTap[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    if (typeof row.code !== 'string' || !/^&[A-Za-z_][\w]*$/.test(row.code)) continue
    const bindings = Array.isArray(row.bindings)
      ? row.bindings.filter((code): code is string => typeof code === 'string' && code.startsWith('&'))
      : []
    const params = Array.isArray(row.params)
      ? row.params.filter((param): param is string => typeof param === 'string' && param.length > 0)
      : []
    out.push(
      pack({
        code: row.code,
        override: row.override === true,
        nodeName: typeof row.nodeName === 'string' ? row.nodeName : undefined,
        tappingTermMs: readOptionalInt(row.tappingTermMs),
        quickTapMs: readOptionalInt(row.quickTapMs),
        requirePriorIdleMs: readOptionalInt(row.requirePriorIdleMs),
        flavor: typeof row.flavor === 'string' && row.flavor.trim() ? row.flavor.trim() : undefined,
        bindings,
        params
      })
    )
  }
  return out
}

/** English timing line for the key editor and the decode card. */
export function holdTapTimingNote(source: object | null | undefined): string | null {
  if (!source) return null
  const row = source as {
    tappingTermMs?: unknown
    quickTapMs?: unknown
    requirePriorIdleMs?: unknown
    flavor?: unknown
  }
  const bits: string[] = []
  if (typeof row.tappingTermMs === 'number') bits.push(`${row.tappingTermMs} ms`)
  if (typeof row.flavor === 'string' && row.flavor.trim()) {
    bits.push(FLAVOR_LABELS[row.flavor] ?? row.flavor)
  }
  if (typeof row.quickTapMs === 'number') bits.push(`quick-tap ${row.quickTapMs} ms`)
  if (typeof row.requirePriorIdleMs === 'number') {
    bits.push(`prior-idle ${row.requirePriorIdleMs} ms`)
  }
  return bits.length > 0 ? bits.join(', ') : null
}

/** New hold-tap node. The label and the node name are the same. */
function namedHoldTapNode(input: {
  code: string
  tappingTermMs: number
  flavor: string
  bindings: string[]
  quickTapMs?: number
  requirePriorIdleMs?: number
  params?: string[]
}): ZmkHoldTap {
  const nodeName = input.code.replace(/^&/, '')
  return pack({
    code: input.code,
    nodeName,
    tappingTermMs: input.tappingTermMs,
    flavor: input.flavor,
    quickTapMs: input.quickTapMs,
    requirePriorIdleMs: input.requirePriorIdleMs,
    bindings: [...input.bindings],
    params: input.params?.length ? [...input.params] : paramsForHoldTapBindings(input.bindings)
  })
}

/** Insert a preset node when the keymap does not already have that code. */
export function ensureHoldTapPreset(
  list: readonly ZmkHoldTap[] | undefined,
  code: string
): ZmkHoldTap[] {
  const preset = holdTapPresetFor(code)
  const current = [...(list ?? [])]
  if (!preset || current.some(node => node.code === preset.code)) {
    return current
  }
  current.push(
    namedHoldTapNode({
      code: preset.code,
      bindings: preset.bindings,
      params: preset.params,
      ...preset.defaults
    })
  )
  return current
}

type HoldTapTimingPatch = Partial<
  Pick<ZmkHoldTap, 'tappingTermMs' | 'flavor' | 'quickTapMs' | 'requirePriorIdleMs'>
>

/**
 * Write timing onto `code`.
 * Only keys present on `timing` change; a missing number clears that property.
 * A stock override with no timing left is dropped. A named node stays.
 */
export function replaceHoldTapTiming(
  list: readonly ZmkHoldTap[] | undefined,
  code: string,
  timing: HoldTapTimingPatch
): ZmkHoldTap[] {
  const current = [...(list ?? [])]
  const index = current.findIndex(item => item.code === code)
  const prev = index >= 0 ? current[index] : undefined
  const merged: ZmkHoldTap = {
    ...(prev ?? {}),
    code,
    override: prev ? Boolean(prev.override) : isStockHoldTap(code)
  }
  if ('tappingTermMs' in timing) merged.tappingTermMs = timing.tappingTermMs
  if ('flavor' in timing) merged.flavor = timing.flavor
  if ('quickTapMs' in timing) merged.quickTapMs = timing.quickTapMs
  if ('requirePriorIdleMs' in timing) merged.requirePriorIdleMs = timing.requirePriorIdleMs
  const next = pack(merged)
  if (next.override && !hasTiming(next)) {
    return current.filter(item => item.code !== code)
  }
  if (index >= 0) {
    current[index] = next
    return current
  }
  if (!hasTiming(next)) return current
  current.push(next)
  return current
}

type HoldTapSpan = {
  code: string
  kind: 'named' | 'override'
  open: number
  close: number
  blockStart: number
  blockEnd: number
}

type TextEdit = { start: number; end: number; text: string }

function blockEndAt(source: string, close: number): number {
  let end = close + 1
  if (source[end] === ';') end++
  return end
}

function headerStartAt(source: string, openBrace: number): number {
  let lineStart = source.lastIndexOf('\n', openBrace - 1) + 1
  if (!source.slice(lineStart, openBrace).trim()) {
    const prevEnd = lineStart - 1
    if (prevEnd > 0) lineStart = source.lastIndexOf('\n', prevEnd - 1) + 1
  }
  return lineStart
}

function collectHoldTapSpans(source: string, masked: string): HoldTapSpan[] {
  const spans: HoldTapSpan[] = []
  const namedRe = /compatible\s*=\s*"/g
  let match: RegExpExecArray | null
  while ((match = namedRe.exec(masked)) !== null) {
    const contentStart = match.index + match[0].length
    const contentEnd = masked.indexOf('"', contentStart)
    if (contentEnd < 0) continue
    if (source.slice(contentStart, contentEnd) !== HOLD_TAP_COMPATIBLE) continue
    const open = nodeOpenBrace(masked, match.index - 1)
    if (open < 0) continue
    const close = matchBrace(masked, open)
    if (close < 0) continue
    const header = readNodeHeader(source, open)
    if (!header) continue
    spans.push({
      code: `&${header.label ?? header.name}`,
      kind: 'named',
      open,
      close,
      blockStart: headerStartAt(source, open),
      blockEnd: blockEndAt(source, close)
    })
    namedRe.lastIndex = close + 1
  }
  const overrideRe = /(?<![A-Za-z0-9_])&([A-Za-z_][\w]*)\s*\{/g
  while ((match = overrideRe.exec(masked)) !== null) {
    const open = match.index + match[0].length - 1
    const close = matchBrace(masked, open)
    if (close < 0) continue
    if (spans.some(span => open >= span.open && close <= span.close)) {
      overrideRe.lastIndex = close + 1
      continue
    }
    const body = masked.slice(open + 1, close)
    const { timing } = readTiming(source, masked, open + 1, close)
    if (/compatible\s*=/.test(body) || !hasTiming(timing)) {
      overrideRe.lastIndex = close + 1
      continue
    }
    spans.push({
      code: `&${match[1]}`,
      kind: 'override',
      open,
      close,
      blockStart: match.index,
      blockEnd: blockEndAt(source, close)
    })
    overrideRe.lastIndex = close + 1
  }
  return spans
}

function holdTapRegionsHavePreprocessor(source: string, masked: string): boolean {
  const behaviors = findNamedBlock(source, masked, 'behaviors')
  if (
    behaviors &&
    hasPreprocessorConditional(masked, { start: behaviors.bodyStart, end: behaviors.bodyEnd })
  ) {
    return true
  }
  const spans = collectHoldTapSpans(source, masked)
  const byCode = new Map<string, HoldTapSpan[]>()
  for (const span of spans) {
    if (hasPreprocessorConditional(masked, { start: span.open + 1, end: span.close })) {
      return true
    }
    const prev = masked.lastIndexOf('}', span.blockStart - 1)
    const from = prev >= 0 ? prev + 1 : 0
    if (hasPreprocessorConditional(masked, { start: from, end: span.blockStart })) {
      return true
    }
    const list = byCode.get(span.code) ?? []
    list.push(span)
    byCode.set(span.code, list)
  }
  for (const list of byCode.values()) {
    if (list.length < 2) continue
    const start = Math.min(...list.map(span => span.blockStart))
    const end = Math.max(...list.map(span => span.blockEnd))
    if (hasPreprocessorConditional(masked, { start, end })) return true
  }
  return false
}

function innerIndentOf(body: string, fallback: string): string {
  const line = body.split(/\r?\n/).find(row => row.trim().length > 0)
  return line ? (/^[ \t]*/.exec(line)?.[0] ?? fallback) : fallback
}

function contentIndent(source: string, openBrace: number): string {
  const match = /\r?\n([ \t]*)\S/.exec(source.slice(openBrace + 1))
  return match?.[1] ?? '    '
}

function setAssign(
  body: string,
  key: string,
  statement: string | null,
  indent: string,
  eol: LineEnding
): string {
  const re = new RegExp(`^([ \\t]*)${key}\\s*=\\s*[^;\\n]*;`, 'm')
  const found = re.exec(body)
  if (found) {
    if (statement == null) {
      let start = found.index
      let end = found.index + found[0].length
      end = eatFollowingEol(body, end)
      if (end === found.index + found[0].length) {
        start = eatPrecedingEol(body, start)
      }
      return body.slice(0, start) + body.slice(end)
    }
    return (
      body.slice(0, found.index) +
      found[1] +
      statement +
      body.slice(found.index + found[0].length)
    )
  }
  if (statement == null) return body
  const trimmed = body.replace(/[ \t]*$/, '')
  const needsNl = trimmed.length > 0 && !trimmed.endsWith('\n')
  return `${trimmed}${needsNl ? eol : ''}${indent}${statement}${eol}`
}

function patchUintAssign(
  body: string,
  dtsName: string,
  modelValue: number | undefined,
  indent: string,
  eol: LineEnding
): string {
  const masked = maskDts(body)
  const current = readUintAngleScalar(masked, { start: 0, end: masked.length }, dtsName)
  if (current.kind === 'unparsed') {
    if (modelValue == null) return body
    return setAssign(body, dtsName, `${dtsName} = <${modelValue}>;`, indent, eol)
  }
  if (current.kind === 'absent') {
    if (modelValue == null) return body
    return setAssign(body, dtsName, `${dtsName} = <${modelValue}>;`, indent, eol)
  }
  if (modelValue == null) return setAssign(body, dtsName, null, indent, eol)
  if (current.value === modelValue) return body
  return setAssign(body, dtsName, `${dtsName} = <${modelValue}>;`, indent, eol)
}

function patchFlavorAssign(
  body: string,
  modelValue: string | undefined,
  indent: string,
  eol: LineEnding
): string {
  const masked = maskDts(body)
  const current = readFlavor(body, masked, 0, body.length)
  if (modelValue) {
    if (current === modelValue) return body
    return setAssign(body, 'flavor', `flavor = "${modelValue}";`, indent, eol)
  }
  if (!current) return body
  return setAssign(body, 'flavor', null, indent, eol)
}

function patchTiming(
  body: string,
  node: ZmkHoldTap,
  indent: string,
  eol: LineEnding
): string {
  let next = body
  next = patchFlavorAssign(next, node.flavor, indent, eol)
  next = patchUintAssign(next, 'tapping-term-ms', node.tappingTermMs, indent, eol)
  next = patchUintAssign(next, 'quick-tap-ms', node.quickTapMs, indent, eol)
  next = patchUintAssign(next, 'require-prior-idle-ms', node.requirePriorIdleMs, indent, eol)
  return next
}

function formatNamedHoldTap(node: ZmkHoldTap, indent: string, eol: LineEnding): string {
  const label = node.code.replace(/^&/, '')
  const name = node.nodeName || label
  const bindings = node.bindings?.length ? node.bindings : ['&kp', '&kp']
  const inner = `${indent}    `
  const lines = [
    `${indent}${label}: ${name} {`,
    `${inner}compatible = "zmk,behavior-hold-tap";`,
    `${inner}#binding-cells = <${bindings.length}>;`
  ]
  if (node.tappingTermMs != null) lines.push(`${inner}tapping-term-ms = <${node.tappingTermMs}>;`)
  if (node.quickTapMs != null) lines.push(`${inner}quick-tap-ms = <${node.quickTapMs}>;`)
  if (node.requirePriorIdleMs != null) {
    lines.push(`${inner}require-prior-idle-ms = <${node.requirePriorIdleMs}>;`)
  }
  if (node.flavor) lines.push(`${inner}flavor = "${node.flavor}";`)
  lines.push(`${inner}bindings = <${bindings.join('>, <')}>;`)
  lines.push(`${indent}};`)
  return lines.join(eol)
}

function formatOverrideBlock(node: ZmkHoldTap, indent: string, eol: LineEnding): string {
  const inner = `${indent}    `
  const lines = [`${indent}${node.code} {`]
  if (node.flavor) lines.push(`${inner}flavor = "${node.flavor}";`)
  if (node.tappingTermMs != null) lines.push(`${inner}tapping-term-ms = <${node.tappingTermMs}>;`)
  if (node.quickTapMs != null) lines.push(`${inner}quick-tap-ms = <${node.quickTapMs}>;`)
  if (node.requirePriorIdleMs != null) {
    lines.push(`${inner}require-prior-idle-ms = <${node.requirePriorIdleMs}>;`)
  }
  lines.push(`${indent}};`)
  return lines.join(eol)
}

function applyTextEdits(source: string, edits: TextEdit[]): string {
  const ordered = [...edits].sort((a, b) => b.start - a.start || b.end - a.end)
  let out = source
  for (const edit of ordered) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  }
  return out
}

function insertAtLine(source: string, closeBrace: number, text: string, eol: LineEnding): TextEdit {
  const lineStart = source.lastIndexOf('\n', closeBrace - 1) + 1
  const onClosingLine = source.slice(lineStart, closeBrace).trim() === ''
  const start = onClosingLine ? lineStart : closeBrace
  return { start, end: start, text: `${text}${eol}` }
}

/**
 * Update hold-tap timing in place and insert nodes that are not in the file yet.
 * Other lines in a node stay. An absent field on the keymap skips this entirely.
 */
export function spliceHoldTapsIntoDts(source: string, holdTaps: readonly ZmkHoldTap[]): string {
  const eol = dominantEol(source)
  const masked = maskDts(source)
  const spans = collectHoldTapSpans(source, masked)
  const byCode = new Map(holdTaps.map(node => [node.code, node]))
  const edits: TextEdit[] = []
  const patchedNamed = new Set<string>()
  const patchedOverride = new Set<string>()

  for (const span of spans) {
    const node = byCode.get(span.code)
    if (!node || (span.kind === 'override' && !node.override) || (span.kind === 'named' && node.override)) {
      let start = span.blockStart
      let end = span.blockEnd
      end = eatFollowingEol(source, end)
      start = eatPrecedingEol(source, start)
      edits.push({ start, end, text: '' })
      continue
    }
    const body = source.slice(span.open + 1, span.close)
    const indent = innerIndentOf(body, '    ')
    edits.push({
      start: span.open + 1,
      end: span.close,
      text: patchTiming(body, node, indent, eol)
    })
    if (span.kind === 'named') patchedNamed.add(span.code)
    else patchedOverride.add(span.code)
  }

  const missingNamed = holdTaps.filter(node => !node.override && !patchedNamed.has(node.code))
  const missingOverrides = holdTaps.filter(
    node => node.override && !patchedOverride.has(node.code) && hasTiming(node)
  )

  if (missingNamed.length > 0) {
    const found = findNamedBlock(source, masked, 'behaviors')
    if (found) {
      const indent = contentIndent(source, found.openBrace)
      const text = missingNamed.map(node => formatNamedHoldTap(node, indent, eol)).join(eol)
      edits.push(insertAtLine(source, found.closeBrace, text, eol))
    } else {
      const root = /\/\s*\{/.exec(masked)
      if (root) {
        const open = root.index + root[0].length - 1
        const indent = contentIndent(source, open)
        const text = missingNamed
          .map(node => formatNamedHoldTap(node, `${indent}    `, eol))
          .join(eol)
        edits.push({
          start: open + 1,
          end: open + 1,
          text: `${eol}${indent}behaviors {${eol}${text}${eol}${indent}};`
        })
      }
    }
  }

  if (missingOverrides.length > 0) {
    const root = /\/\s*\{/.exec(masked)
    const indent = root ? indentOfLine(source, root.index) : ''
    const text = missingOverrides.map(node => formatOverrideBlock(node, indent, eol)).join(eol + eol)
    const start = root ? root.index : source.length
    const prefix = start > 0 && source[start - 1] !== '\n' ? eol : ''
    edits.push({ start, end: start, text: `${prefix}${text}${eol}${eol}` })
  }

  return applyTextEdits(source, edits)
}

function indentOfLine(source: string, index: number): string {
  const lineStart = source.lastIndexOf('\n', index - 1) + 1
  return /^[ \t]*/.exec(source.slice(lineStart))?.[0] ?? ''
}
