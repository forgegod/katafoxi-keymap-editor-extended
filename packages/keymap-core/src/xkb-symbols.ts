/**
 * Read `key <NAME> { [ level1, level2, ... ] }` statements from one
 * `xkb_symbols` section.
 * `include "file(section)"` is expanded from the same source, or from
 * `files[file]` when that map is given. A bare `include "latin"` is
 * `latin(basic)`. Includes of missing files stay unresolved.
 */

/** One X11 keysym name token (safe to embed in `xkb_symbols` text). */
export const KEYSYM =
  /^(?:[A-Za-z_][A-Za-z0-9_]*|[0-9]|U[0-9A-Fa-f]{4,6}|0x[0-9A-Fa-f]+)$/

function stripXkbComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function sectionHeader(section: string): RegExp {
  return new RegExp(`xkb_symbols\\s*"${escapeRegExp(section)}"`)
}

function sliceBrace(text: string, open: number): string {
  let depth = 0
  for (let i = open; i < text.length; i++) {
    const ch = text[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return text.slice(open + 1, i)
    }
  }
  throw new Error('xkb symbols: unbalanced brace')
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

export interface ParseXkbOptions {
  files?: Readonly<Record<string, string>>
  fileId?: string
  /** When set, a missing include throws and names the include spec. */
  strictIncludes?: boolean
  /** Append-only bag for include cycles and multi-group keys. */
  warnings?: string[]
}

export interface XkbSectionInfo {
  section: string
  name: string
}

const SECTION_HEADER = /xkb_symbols\s*"([^"]+)"/g
const SECTION_NAME = /name\[Group1\]\s*=\s*"([^"]*)"/

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
    sections.push({ section, name: SECTION_NAME.exec(body)?.[1] ?? section })
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

function hasSection(source: string, section: string): boolean {
  return sectionHeader(section).test(stripXkbComments(source))
}

function reportCycle(path: string, options: ParseXkbOptions): void {
  const message = `Cyclic xkb include: ${path}`
  if (options.strictIncludes) throw new Error(message)
  if (options.warnings) options.warnings.push(message)
  else console.warn(message)
}

/**
 * XKB key name → keysym names, in level order.
 * Included sections are applied first; a later statement in this section wins.
 */
export function parseXkbSymbolsSection(
  source: string,
  section: string,
  stack: readonly string[] = [],
  options: ParseXkbOptions = {}
): Map<string, string[]> {
  const fileId = options.fileId ?? ''
  const frame = `${fileId}:${section}`
  if (stack.includes(frame)) {
    reportCycle([...stack, frame].join(' → '), options)
    return new Map()
  }
  const text = stripXkbComments(source)
  const found = sectionHeader(section).exec(text)
  if (!found) throw new Error(`xkb symbols section "${section}" not found`)
  const open = text.indexOf('{', found.index)
  if (open < 0) throw new Error(`xkb symbols section "${section}" has no body`)
  const body = sliceBrace(text, open)
  const keys = new Map<string, string[]>()
  const token =
    /include\s+"([^"]+)"|key\s*<([A-Za-z0-9]+)>\s*(\{[\s\S]*?\}|\[[^\]]*\])\s*;/g
  for (const match of body.matchAll(token)) {
    if (match[1]) {
      const spec = includedSpec(match[1])
      if (!spec) {
        if (options.strictIncludes) {
          throw new Error(`Unresolved xkb include "${match[1]}"`)
        }
        continue
      }
      const fromFiles = options.files?.[spec.file]
      const fromVendored = !!(fromFiles && hasSection(fromFiles, spec.section))
      const sameFile =
        hasSection(source, spec.section) && (fileId === '' || spec.file === fileId)
      const nestedSource = (fromVendored ? fromFiles : null) ?? (sameFile ? source : null)
      if (!nestedSource) {
        if (options.strictIncludes) {
          throw new Error(`Unresolved xkb include "${match[1]}"`)
        }
        continue
      }
      const nestedId = fromVendored ? spec.file : fileId
      for (const [name, levels] of parseXkbSymbolsSection(
        nestedSource,
        spec.section,
        [...stack, frame],
        {
          ...options,
          fileId: nestedId,
          // Vendored modules keep the builtin skip for their own missing includes.
          strictIncludes: fromVendored ? false : options.strictIncludes
        }
      )) {
        keys.set(name, levels)
      }
      continue
    }
    const lists = symbolLists(match[3])
    if (lists.length === 0) continue
    const keyName = match[2].toUpperCase()
    if (lists.length > 1) {
      options.warnings?.push(
        `Key <${keyName}> has ${lists.length} keysym groups; using the first.`
      )
    }
    keys.set(keyName, lists[0])
  }
  return keys
}
