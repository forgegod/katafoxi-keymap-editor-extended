/**
 * Shared DTS structure scanner: mask comments/strings, match braces and
 * angle-bracket properties, find named blocks. Callers search on the masked
 * view (same length as source). Bindings interiors are tokenized from the
 * mask; other values may still be sliced from the original.
 */

export interface DtsRange {
  start: number
  end: number
}

export interface DtsNamedBlock {
  /** Absolute start of the keyword (e.g. `combos`). */
  keywordStart: number
  openBrace: number
  closeBrace: number
  bodyStart: number
  bodyEnd: number
}

/**
 * Direct child node of a DTS block. `labelStart` is the start of `label:` when
 * present, otherwise the node name. `end` is after `};` plus one trailing
 * newline — not the next line's indent.
 */
export interface DtsChildNode {
  labelStart: number
  nameStart: number
  openBrace: number
  closeBrace: number
  end: number
  label?: string
  name: string
}

const CHILD_NODE_RE = /(?:([A-Za-z_]\w*)\s*:\s*)?([A-Za-z0-9,._+@-]+)\s*\{/g

/** Escape `value` so it can be embedded in a `RegExp` source. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, ch => `\\${ch}`)
}

/**
 * Replace // and /* comments, and double-quoted string interiors, with spaces
 * of the same length. Newlines in comments stay so line structure is stable.
 * Quote characters stay so callers can recover string values from the original.
 * Inside a string, `\\` also masks the next character so `\"` does not end it.
 */
export function maskDts(source: string): string {
  const out = new Array<string>(source.length)
  let i = 0
  while (i < source.length) {
    const ch = source[i]
    const next = source[i + 1]

    if (ch === '/' && next === '*') {
      out[i] = ' '
      out[i + 1] = ' '
      i += 2
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        out[i] = source[i] === '\n' ? '\n' : ' '
        i++
      }
      if (i < source.length) {
        out[i] = ' '
        if (i + 1 < source.length) out[i + 1] = ' '
        i += 2
      }
      continue
    }

    if (ch === '/' && next === '/') {
      while (i < source.length && source[i] !== '\n') {
        out[i] = ' '
        i++
      }
      continue
    }

    if (ch === '"') {
      out[i] = '"'
      i++
      while (i < source.length && source[i] !== '"') {
        if (source[i] === '\\' && i + 1 < source.length) {
          out[i] = ' '
          out[i + 1] = source[i + 1] === '\n' ? '\n' : ' '
          i += 2
          continue
        }
        out[i] = source[i] === '\n' ? '\n' : ' '
        i++
      }
      if (i < source.length) {
        out[i] = '"'
        i++
      }
      continue
    }

    out[i] = ch
    i++
  }
  return out.join('')
}

/**
 * Direct children of `block` (not nested grandchildren). Search on `masked`
 * (same length as source). Skips a match whose braces do not close in the body.
 */
export function* iterateChildNodes(
  masked: string,
  block: Pick<DtsNamedBlock, 'bodyStart' | 'bodyEnd'>
): Generator<DtsChildNode, void, undefined> {
  const re = new RegExp(CHILD_NODE_RE.source, 'g')
  re.lastIndex = block.bodyStart
  let m: RegExpExecArray | null
  while ((m = re.exec(masked)) !== null) {
    if (m.index >= block.bodyEnd) break
    const openBrace = m.index + m[0].length - 1
    if (openBrace >= block.bodyEnd) break
    const closeBrace = matchBrace(masked, openBrace)
    if (closeBrace < 0 || closeBrace > block.bodyEnd) {
      re.lastIndex = openBrace + 1
      continue
    }
    re.lastIndex = closeBrace + 1

    let nameStart = openBrace
    while (nameStart > m.index && /\s/.test(masked[nameStart - 1])) nameStart--
    nameStart -= m[2].length

    let end = closeBrace + 1
    if (end < block.bodyEnd && masked[end] === ';') end++
    if (end < block.bodyEnd && masked[end] === '\r') end++
    if (end < block.bodyEnd && masked[end] === '\n') end++

    const node: DtsChildNode = {
      labelStart: m.index,
      nameStart,
      openBrace,
      closeBrace,
      end,
      name: m[2]
    }
    if (m[1]) node.label = m[1]
    yield node
  }
}

/** Index of matching `}` for `{` at openIndex on a masked string, or -1. */
export function matchBrace(masked: string, openIndex: number): number {
  if (masked[openIndex] !== '{') return -1
  let depth = 0
  for (let i = openIndex; i < masked.length; i++) {
    const c = masked[i]
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * Absolute range of `prop = <...>` interior (between `<` and matching `>`).
 * Uses a word-boundary lookbehind so `sensor-bindings` does not match `bindings`.
 */
export function findAngleProp(
  masked: string,
  bodyRange: DtsRange,
  prop: string
): DtsRange | null {
  const slice = masked.slice(bodyRange.start, bodyRange.end)
  const re = new RegExp(`(?<![\\w-])${escapeRegExp(prop)}\\s*=\\s*<`)
  const m = re.exec(slice)
  if (!m) return null
  const contentStart = bodyRange.start + m.index + m[0].length
  let depth = 1
  for (let i = contentStart; i < bodyRange.end; i++) {
    if (masked[i] === '<') depth++
    else if (masked[i] === '>') {
      depth--
      if (depth === 0) return { start: contentStart, end: i }
    }
  }
  return null
}

/**
 * Full `prop = <...>;` statement span (prop name through trailing `;`), or null.
 */
export function findAnglePropStatement(
  masked: string,
  bodyRange: DtsRange,
  prop: string
): { statement: DtsRange; interior: DtsRange } | null {
  const interior = findAngleProp(masked, bodyRange, prop)
  if (!interior) return null
  const slice = masked.slice(bodyRange.start, interior.start)
  const re = new RegExp(`(?<![\\w-])${escapeRegExp(prop)}\\s*=\\s*<$`)
  const m = re.exec(slice)
  if (!m) return null
  const stmtStart = bodyRange.start + m.index
  let stmtEnd = interior.end + 1
  while (stmtEnd < bodyRange.end && /[ \t\r\n]/.test(masked[stmtEnd])) stmtEnd++
  if (masked[stmtEnd] === ';') stmtEnd++
  return { statement: { start: stmtStart, end: stmtEnd }, interior }
}

/**
 * Non-negative integers from an angle-bracket interior.
 * Returns null when any token is not a decimal integer (macros, signs, junk).
 * Empty interior → `[]` (fully parsed, no values).
 */
export function parseUintList(interior: string): number[] | null {
  const out: number[] = []
  for (const tok of interior.trim().split(/\s+/)) {
    if (!tok) continue
    if (!/^\d+$/.test(tok)) return null
    out.push(Number(tok))
  }
  return out
}

export type UintAngleProp =
  | { kind: 'absent' }
  | { kind: 'ok'; values: number[] }
  | { kind: 'unparsed' }

/** Angle-bracket uint list, or unparsed when a token is not a decimal integer. */
export function readUintAngleProp(
  masked: string,
  bodyRange: DtsRange,
  prop: string
): UintAngleProp {
  const interior = findAngleProp(masked, bodyRange, prop)
  if (!interior) return { kind: 'absent' }
  const values = parseUintList(masked.slice(interior.start, interior.end))
  if (values == null) return { kind: 'unparsed' }
  return { kind: 'ok', values }
}

/** Single uint property (`timeout-ms = <40>`). Empty or multi-value interiors are unparsed. */
export function readUintAngleScalar(
  masked: string,
  bodyRange: DtsRange,
  prop: string
): { kind: 'absent' } | { kind: 'ok'; value: number } | { kind: 'unparsed' } {
  const propValue = readUintAngleProp(masked, bodyRange, prop)
  if (propValue.kind === 'absent') return propValue
  if (propValue.kind === 'unparsed' || propValue.values.length !== 1) {
    return { kind: 'unparsed' }
  }
  return { kind: 'ok', value: propValue.values[0] }
}

/** True when `prop;` appears as its own token (not inside `not-prop;`). */
export function hasBoolProp(body: string, prop: string): boolean {
  return new RegExp(`(?<![\\w-])${escapeRegExp(prop)}\\s*;`).test(body)
}

export interface FindNamedBlockOptions {
  /** Prefer (or require) a block whose body declares this compatible string. */
  compatible?: string
  /** When true, only a block with `compatible` matches (no fallback). */
  requireCompatible?: boolean
}

/** `#if` / `#ifdef` / `#ifndef` / `#elif` / `#else` at the start of a line. */
const PREPROCESSOR_CONDITIONAL_RE = /^\s*#(if|ifdef|ifndef|elif|else)\b/m

/**
 * True when a preprocessor branch sits in `masked` (or `range` on it).
 * Comments and strings are already spaces on a maskDts view.
 */
export function hasPreprocessorConditional(
  masked: string,
  range?: Pick<DtsRange, 'start' | 'end'>
): boolean {
  const slice = range ? masked.slice(range.start, range.end) : masked
  return PREPROCESSOR_CONDITIONAL_RE.test(slice)
}

function namedBlockRe(keyword: string): RegExp {
  return new RegExp(`(?<![\\w,.+@-])${escapeRegExp(keyword)}\\s*\\{`, 'g')
}

/**
 * Every `keyword { … }` on `masked`. When `compatible` is set, read the
 * string from `source` and keep matching bodies; with `requireCompatible`,
 * skip blocks that lack it. Without a compatible hit, the first name match
 * is the fallback (unless `requireCompatible`).
 */
export function findNamedBlocks(
  source: string,
  masked: string,
  keyword: string,
  options: FindNamedBlockOptions = {}
): DtsNamedBlock[] {
  const re = namedBlockRe(keyword)
  const all: DtsNamedBlock[] = []
  const compatibleHits: DtsNamedBlock[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(masked)) !== null) {
    const openBrace = m.index + m[0].length - 1
    const closeBrace = matchBrace(masked, openBrace)
    if (closeBrace < 0) continue
    const block: DtsNamedBlock = {
      keywordStart: m.index,
      openBrace,
      closeBrace,
      bodyStart: openBrace + 1,
      bodyEnd: closeBrace
    }
    all.push(block)
    if (options.compatible && blockHasCompatible(source, masked, block, options.compatible)) {
      compatibleHits.push(block)
    }
  }
  if (options.compatible) {
    if (compatibleHits.length > 0) return compatibleHits
    if (options.requireCompatible) return []
    return all.length > 0 ? [all[0]!] : []
  }
  return all
}

/**
 * Locate `keyword { … }`. Search on `masked`; when `compatible` is set, read
 * the string value from `source`. Prefer that block; with `requireCompatible`,
 * skip blocks that lack it.
 */
export function findNamedBlock(
  source: string,
  masked: string,
  keyword: string,
  options: FindNamedBlockOptions = {}
): DtsNamedBlock | null {
  return findNamedBlocks(source, masked, keyword, options)[0] ?? null
}

function blockHasCompatible(
  source: string,
  masked: string,
  block: DtsNamedBlock,
  compatible: string
): boolean {
  const body = masked.slice(block.bodyStart, block.bodyEnd)
  const re = /compatible\s*=\s*"/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    const contentStart = block.bodyStart + m.index + m[0].length
    const contentEnd = masked.indexOf('"', contentStart)
    if (contentEnd < 0 || contentEnd > block.bodyEnd) continue
    if (source.slice(contentStart, contentEnd) === compatible) return true
  }
  return false
}

export interface TokenizeBindingsResult {
  /** Bind strings that start with `&`. */
  binds: string[]
  /** True when a non-empty scrap did not start with `&` and was dropped. */
  hasUnparsedFragment: boolean
}

function isDtsWhitespace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === '\f' || ch === '\v'
}

/**
 * Split a bindings block into individual bind strings (each starts with `&`).
 * All whitespace collapses to a single space. A new bind starts only at `&`
 * when parenthesis depth is 0. Non-empty scraps without a leading `&` are
 * reported via `hasUnparsedFragment`.
 */
export function tokenizeBindingsDetailed(block: string): TokenizeBindingsResult {
  const masked = maskDts(block)
  const binds: string[] = []
  let hasUnparsedFragment = false
  let current = ''
  let depth = 0

  const flush = () => {
    const s = current.trim()
    current = ''
    if (!s) return
    if (s.startsWith('&')) binds.push(s)
    else hasUnparsedFragment = true
  }

  for (let i = 0; i < masked.length; i++) {
    const ch = masked[i]!
    if (ch === '(') {
      depth++
      current += ch
      continue
    }
    if (ch === ')') {
      if (depth > 0) depth--
      current += ch
      continue
    }
    if (ch === '&' && depth === 0) {
      flush()
      current = '&'
      continue
    }
    if (isDtsWhitespace(ch)) {
      if (current.length > 0 && current[current.length - 1] !== ' ') current += ' '
      continue
    }
    current += ch
  }
  flush()
  return { binds, hasUnparsedFragment }
}

/** Split a bindings block into individual bind strings (each starts with &). */
export function tokenizeBindings(block: string): string[] {
  return tokenizeBindingsDetailed(block).binds
}

/**
 * Return `stem` if unused, otherwise `stem_2`, `stem_3`, …. Records the chosen
 * id in `used`.
 */
export function uniqueDtsNodeId(stem: string, used: Set<string>): string {
  if (!used.has(stem)) {
    used.add(stem)
    return stem
  }
  let n = 2
  while (used.has(`${stem}_${n}`)) n++
  const id = `${stem}_${n}`
  used.add(id)
  return id
}
