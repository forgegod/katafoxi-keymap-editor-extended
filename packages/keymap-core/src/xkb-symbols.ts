/**
 * Read `key <NAME> { [ level1, level2, ... ] }` statements from one
 * `xkb_symbols` section.
 * `include "file(section)"` is expanded from the same source, or from
 * `files[file]` when that map is given. A bare `include "latin"` is
 * `latin(basic)`. Includes of missing files stay unresolved.
 */

const KEYSYM =
  /^(?:[A-Za-z_][A-Za-z0-9_]*|[0-9]|U[0-9A-Fa-f]{4,6}|0x[0-9A-Fa-f]+)$/

export function stripXkbComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
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
  return new RegExp(`xkb_symbols\\s*"${section}"`).test(stripXkbComments(source))
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
  if (stack.includes(frame)) return new Map()
  const text = stripXkbComments(source)
  const header = new RegExp(`xkb_symbols\\s*"${section}"`)
  const found = header.exec(text)
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
      if (!spec) continue
      const fromFiles = options.files?.[spec.file]
      const nestedSource = fromFiles ?? (hasSection(source, spec.section) ? source : null)
      if (!nestedSource) continue
      const nestedId = fromFiles ? spec.file : fileId
      for (const [name, levels] of parseXkbSymbolsSection(
        nestedSource,
        spec.section,
        [...stack, frame],
        { ...options, fileId: nestedId }
      )) {
        keys.set(name, levels)
      }
      continue
    }
    const lists = symbolLists(match[3])
    if (lists.length === 0) continue
    keys.set(match[2].toUpperCase(), lists[0])
  }
  return keys
}
