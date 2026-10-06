/**
 * Read `key <NAME> { [ level1, level2, ... ] }` statements from one
 * `xkb_symbols` section.
 * `include "file(section)"` is expanded from the same source when
 * `file` is this `fileId` and the section exists here; otherwise from
 * `files[file]`. A bare `include "latin"` is `latin(basic)`. Includes
 * of missing files stay unresolved. Known non-character modules
 * (`level3`, `eurosign`, `nbsp`, `kpdl`) are skipped with a warning.
 */

/** One X11 keysym name token (safe to embed in `xkb_symbols` text). */
export const KEYSYM =
  /^(?:[A-Za-z_][A-Za-z0-9_]*|[0-9]|U[0-9A-Fa-f]{4,6}|0x[0-9A-Fa-f]+)$/

/** Include nesting cap, counting ancestor sections on the parse stack. */
const INCLUDE_DEPTH_CAP = 16

/**
 * xkeyboard-config modules that only switch levels or keypad punctuation.
 * They appear in almost every real layout and are not character maps.
 */
const SKIP_XKB_MODULES = new Set(['level3', 'eurosign', 'nbsp', 'kpdl'])

function stripXkbComments(source: string): string {
  const out: string[] = []
  let i = 0
  const n = source.length
  while (i < n) {
    const c = source[i]
    if (c === '/' && source[i + 1] === '*') {
      const end = source.indexOf('*/', i + 2)
      out.push(' ')
      if (end < 0) break
      i = end + 2
      continue
    }
    if (c === '/' && source[i + 1] === '/') {
      const end = source.indexOf('\n', i + 2)
      if (end < 0) break
      i = end
      continue
    }
    out.push(c)
    i++
  }
  return out.join('')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function sectionHeader(section: string): RegExp {
  return new RegExp(`xkb_symbols\\s*"${escapeRegExp(section)}"`)
}

function sliceBrace(text: string, open: number): string | null {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(open + 1, i)
    }
  }
  return null
}

function symbolLists(body: string): string[][] {
  const lists: string[][] = []
  const re = /(^|[^A-Za-z0-9_])\[([^\]]*)\]/g
  for (const match of body.matchAll(re)) {
    const items = match[2]
      .split(',')
      .map(item => item.trim())
      .filter(Boolean)
    if (items.length > 0 && items.every(item => KEYSYM.test(item))) lists.push(items)
  }
  return lists
}

interface ParseCache {
  stripped: { source: string; text: string }[]
  bodies: { source: string; section: string; body: string }[]
  parsed: { fileId: string; section: string; source: string; keys: Map<string, string[]> }[]
}

interface ParseRun extends ParseXkbOptions {
  cache: ParseCache
}

export interface ParseXkbOptions {
  files?: Readonly<Record<string, string>>
  fileId?: string
  /** When set, a missing include throws and names the include spec. */
  strictIncludes?: boolean
  /** Append-only bag for include cycles, skipped modules, merge modes, and multi-group keys. */
  warnings?: string[]
}

export interface XkbSectionInfo {
  section: string
  name: string
}

const SECTION_HEADER = /xkb_symbols\s*"([^"]+)"/g
const SECTION_NAME = /name\[Group1\]\s*=\s*"([^"]*)"/
const INCLUDE_TOKEN = /(?:include|override|augment)\s+"/y
const KEY_TOKEN = /key\s*<([A-Za-z0-9]+)>\s*/y

function strippedText(source: string, cache: ParseCache): string {
  for (const entry of cache.stripped) {
    if (entry.source === source) return entry.text
  }
  const text = stripXkbComments(source)
  cache.stripped.push({ source, text })
  return text
}

function sectionBody(source: string, section: string, cache: ParseCache): string {
  for (const entry of cache.bodies) {
    if (entry.source === source && entry.section === section) return entry.body
  }
  const text = strippedText(source, cache)
  const found = sectionHeader(section).exec(text)
  if (!found) throw new Error(`xkb symbols section "${section}" not found`)
  const open = text.indexOf('{', found.index)
  if (open < 0) throw new Error(`xkb symbols section "${section}" has no body`)
  const body = sliceBrace(text, open) ?? text.slice(open + 1)
  cache.bodies.push({ source, section, body })
  return body
}

function cachedParse(
  cache: ParseCache,
  fileId: string,
  section: string,
  source: string
): Map<string, string[]> | undefined {
  for (const entry of cache.parsed) {
    if (entry.fileId === fileId && entry.section === section && entry.source === source) {
      return entry.keys
    }
  }
  return undefined
}

/** Every `xkb_symbols` section and its `name[Group1]`, or the section id. */
export function listXkbSections(text: string): XkbSectionInfo[] {
  const source = stripXkbComments(text)
  const sections: XkbSectionInfo[] = []
  for (const match of source.matchAll(SECTION_HEADER)) {
    const section = match[1]
    const open = source.indexOf('{', match.index ?? 0)
    if (open < 0) {
      sections.push({ section, name: section })
      continue
    }
    const body = sliceBrace(source, open)
    sections.push({ section, name: body ? (SECTION_NAME.exec(body)?.[1] ?? section) : section })
  }
  return sections
}

/** `ru(common)` → file `ru`, section `common`. Bare `latin` → `latin(basic)`. */
function includedSpec(spec: string): { file: string; section: string } | null {
  const trimmed = spec.trim()
  const named = /^([A-Za-z0-9_/]+)\(([^)]+)\)$/.exec(trimmed)
  if (named) return { file: named[1], section: named[2] }
  if (/^[A-Za-z0-9_/]+$/.test(trimmed)) return { file: trimmed, section: 'basic' }
  return null
}

function hasSection(source: string, section: string, cache: ParseCache): boolean {
  return sectionHeader(section).test(strippedText(source, cache))
}

function reportWarning(message: string, options: ParseXkbOptions, fatal = false): void {
  if (fatal && options.strictIncludes) throw new Error(message)
  if (options.warnings) options.warnings.push(message)
  else console.warn(message)
}

function reportCycle(path: string, options: ParseXkbOptions): void {
  reportWarning(`Cyclic xkb include: ${path}`, options, true)
}

/**
 * xkbcomp default merge mode is override: per level, `NoSymbol` in the new
 * map keeps the previous keysym (and trailing omitted levels act the same).
 * xkeyboard-config writes `any` for that keep-previous sentinel; treat it alike.
 * With no included value, `any` collapses to `NoSymbol` (xkbcomp's empty slot).
 */
function keepsIncludedLevel(keysym: string): boolean {
  return keysym === 'any' || keysym === 'NoSymbol'
}

function mergeKeyLevels(included: string[] | undefined, overlay: string[]): string[] {
  if (!included) {
    return overlay.map(level => (level === 'any' ? 'NoSymbol' : level))
  }
  const width = Math.max(included.length, overlay.length)
  const merged: string[] = []
  for (let i = 0; i < width; i++) {
    const next = i < overlay.length ? overlay[i] : undefined
    const prev = i < included.length ? included[i] : undefined
    if (next === undefined || keepsIncludedLevel(next)) {
      merged.push(prev ?? 'NoSymbol')
    } else {
      merged.push(next)
    }
  }
  return merged
}

function closeQuote(text: string, from: number): number {
  const close = text.indexOf('"', from)
  return close
}

function applyInclude(
  keys: Map<string, string[]>,
  specText: string,
  mergeMode: string,
  stack: readonly string[],
  frame: string,
  source: string,
  options: ParseRun
): void {
  if (mergeMode === 'augment' || mergeMode === 'override') {
    reportWarning(`xkb include uses ${mergeMode}; treated as include.`, options)
  }
  const spec = includedSpec(specText)
  if (!spec) {
    if (options.strictIncludes) {
      throw new Error(`Unresolved xkb include "${specText}"`)
    }
    return
  }
  if (SKIP_XKB_MODULES.has(spec.file)) {
    reportWarning(`Skipped xkb include "${specText}": non-character module.`, options)
    return
  }
  const fileId = options.fileId ?? ''
  const fromFiles = options.files?.[spec.file]
  const fromVendored = !!(fromFiles && hasSection(fromFiles, spec.section, options.cache))
  const sameFile =
    hasSection(source, spec.section, options.cache) && (fileId === '' || spec.file === fileId)
  const preferSameFile = spec.file === fileId && sameFile
  const nestedSource =
    (preferSameFile ? source : null) ??
    (fromVendored ? fromFiles : null) ??
    (sameFile ? source : null)
  if (!nestedSource) {
    if (options.strictIncludes) {
      throw new Error(`Unresolved xkb include "${specText}"`)
    }
    return
  }
  const nestedId = fromVendored && !preferSameFile ? spec.file : fileId
  for (const [name, levels] of parseSection(nestedSource, spec.section, [...stack, frame], {
    ...options,
    fileId: nestedId,
    // Vendored modules keep the builtin skip for their own missing includes.
    strictIncludes: fromVendored && !preferSameFile ? false : options.strictIncludes
  })) {
    keys.set(name, mergeKeyLevels(keys.get(name), levels))
  }
}

function applyKey(keys: Map<string, string[]>, keyName: string, raw: string, options: ParseRun): void {
  const lists = symbolLists(raw)
  if (lists.length === 0) return
  const name = keyName.toUpperCase()
  if (lists.length > 1) {
    options.warnings?.push(`Key <${name}> has ${lists.length} keysym groups; using the first.`)
  }
  keys.set(name, mergeKeyLevels(keys.get(name), lists[0]))
}

function scanSectionBody(
  body: string,
  keys: Map<string, string[]>,
  stack: readonly string[],
  frame: string,
  source: string,
  options: ParseRun
): void {
  let i = 0
  let noClosingBrace = false
  while (i < body.length) {
    INCLUDE_TOKEN.lastIndex = i
    const includeMatch = INCLUDE_TOKEN.exec(body)
    if (includeMatch) {
      const mergeMode = includeMatch[0].startsWith('override')
        ? 'override'
        : includeMatch[0].startsWith('augment')
          ? 'augment'
          : 'include'
      const quoteAt = includeMatch.index + includeMatch[0].length
      const close = closeQuote(body, quoteAt)
      if (close < 0) break
      applyInclude(keys, body.slice(quoteAt, close), mergeMode, stack, frame, source, options)
      i = close + 1
      continue
    }
    KEY_TOKEN.lastIndex = i
    const keyMatch = KEY_TOKEN.exec(body)
    if (keyMatch) {
      let pos = keyMatch.index + keyMatch[0].length
      while (pos < body.length && /\s/.test(body[pos])) pos++
      if (body[pos] === '{') {
        if (noClosingBrace) {
          i = pos + 1
          continue
        }
        const inner = sliceBrace(body, pos)
        if (inner == null) {
          noClosingBrace = true
          i = pos + 1
          continue
        }
        applyKey(keys, keyMatch[1], inner, options)
        i = pos + inner.length + 2
        continue
      }
      if (body[pos] === '[') {
        const close = body.indexOf(']', pos + 1)
        if (close < 0) {
          i = pos + 1
          continue
        }
        applyKey(keys, keyMatch[1], body.slice(pos, close + 1), options)
        i = close + 1
        continue
      }
      i = keyMatch.index + keyMatch[0].length
      continue
    }
    i++
  }
}

function parseSection(
  source: string,
  section: string,
  stack: readonly string[],
  options: ParseRun
): Map<string, string[]> {
  const fileId = options.fileId ?? ''
  const frame = `${fileId}:${section}`
  if (stack.includes(frame)) {
    reportCycle([...stack, frame].join(' → '), options)
    return new Map()
  }
  if (stack.length >= INCLUDE_DEPTH_CAP) {
    reportWarning(`xkb include depth exceeds ${INCLUDE_DEPTH_CAP}: ${[...stack, frame].join(' → ')}`, options, true)
    return new Map()
  }
  const hit = cachedParse(options.cache, fileId, section, source)
  if (hit) return hit
  const body = sectionBody(source, section, options.cache)
  const keys = new Map<string, string[]>()
  scanSectionBody(body, keys, stack, frame, source, options)
  options.cache.parsed.push({ fileId, section, source, keys })
  return keys
}

/**
 * XKB key name → keysym names, in level order.
 * Included sections are applied first; a later statement merges per level
 * (override): concrete keysyms replace, `any` / `NoSymbol` keep included.
 */
export function parseXkbSymbolsSection(
  source: string,
  section: string,
  stack: readonly string[] = [],
  options: ParseXkbOptions = {}
): Map<string, string[]> {
  return parseSection(source, section, stack, {
    ...options,
    cache: { stripped: [], bodies: [], parsed: [] }
  })
}
