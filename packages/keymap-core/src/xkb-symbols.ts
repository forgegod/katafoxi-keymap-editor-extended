/**
 * Read `key <NAME> { [ level1, level2, ... ] }` statements from one
 * `xkb_symbols` section. `include` lines are not expanded: LARK writes
 * every alphanumeric key in the section itself.
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

/** XKB key name → keysym names, in level order. Later statements win. */
export function parseXkbSymbolsSection(
  source: string,
  section: string
): Map<string, string[]> {
  const text = stripXkbComments(source)
  const header = new RegExp(`xkb_symbols\\s*"${section}"`)
  const found = header.exec(text)
  if (!found) throw new Error(`xkb symbols section "${section}" not found`)
  const open = text.indexOf('{', found.index)
  if (open < 0) throw new Error(`xkb symbols section "${section}" has no body`)
  const body = sliceBrace(text, open)
  const keys = new Map<string, string[]>()
  const keyRe = /key\s*<([A-Za-z0-9]+)>\s*(\{[\s\S]*?\}|\[[^\]]*\])\s*;/g
  for (const key of body.matchAll(keyRe)) {
    const lists = symbolLists(key[2])
    if (lists.length === 0) continue
    keys.set(key[1].toUpperCase(), lists[0])
  }
  return keys
}
