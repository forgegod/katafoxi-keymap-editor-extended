/**
 * Read `key <NAME> { [ level1, level2, ... ] }` statements from one
 * `xkb_symbols` section.
 * `include "file(section)"` is expanded when that section is in the same
 * source, and later keys replace included ones. Includes of other files
 * stay unresolved: LARK writes its own alphanumeric keys in the section.
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

/** `ru(common)` → `common`. A bare file name has no section in this source. */
function includedSection(spec: string): string | null {
  const match = /^[A-Za-z0-9_]+\(([^)]+)\)$/.exec(spec.trim())
  return match?.[1] ?? null
}

/**
 * XKB key name → keysym names, in level order.
 * Included sections are applied first; a later statement in this section wins.
 */
export function parseXkbSymbolsSection(
  source: string,
  section: string,
  stack: readonly string[] = []
): Map<string, string[]> {
  if (stack.includes(section)) return new Map()
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
      const nested = includedSection(match[1])
      if (!nested || !new RegExp(`xkb_symbols\\s*"${nested}"`).test(text)) continue
      for (const [name, levels] of parseXkbSymbolsSection(source, nested, [
        ...stack,
        section
      ])) {
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
