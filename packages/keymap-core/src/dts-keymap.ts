/**
 * Minimal ZMK .keymap (devicetree bindings=) parser for editor import.
 * Expands simple #define macros and extracts layer bindings arrays.
 * Only layer nodes inside `keymap { compatible = "zmk,keymap"; ... }` become layers.
 */

const DEFINE_RE = /^#define\s+(\w+)\s+(.+)$/gm

/** Index of matching `}` for `{` at openIndex, or -1. */
export function findMatchingBrace(source: string, openIndex: number): number {
  if (source[openIndex] !== '{') return -1
  let depth = 0
  for (let i = openIndex; i < source.length; i++) {
    const c = source[i]
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * Locate the `keymap { ... }` block that contains `compatible = "zmk,keymap"`.
 * Returns absolute indices into `source`: body is exclusive of the braces.
 */
export function findZmkKeymapBlock(source: string): {
  keywordStart: number
  openBrace: number
  closeBrace: number
  bodyStart: number
  bodyEnd: number
} | null {
  const re = /\bkeymap\s*\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    const openBrace = m.index + m[0].length - 1
    const closeBrace = findMatchingBrace(source, openBrace)
    if (closeBrace < 0) continue
    const body = source.slice(openBrace + 1, closeBrace)
    if (/compatible\s*=\s*"zmk,keymap"/.test(body)) {
      return {
        keywordStart: m.index,
        openBrace,
        closeBrace,
        bodyStart: openBrace + 1,
        bodyEnd: closeBrace
      }
    }
  }
  return null
}

/** Absolute range of `bindings = <...>` interior (content between `<` and `>`). */
export function findBindingsInterior(
  source: string,
  from: number,
  to: number
): { start: number; end: number } | null {
  const slice = source.slice(from, to)
  const m = /bindings\s*=\s*</.exec(slice)
  if (!m) return null
  const contentStart = from + m.index + m[0].length
  let depth = 1
  for (let i = contentStart; i < to; i++) {
    if (source[i] === '<') depth++
    else if (source[i] === '>') {
      depth--
      if (depth === 0) return { start: contentStart, end: i }
    }
  }
  return null
}

export interface DtsLayerNode {
  /** Absolute start of the node id (e.g. `layer_0`). */
  nameStart: number
  /** Absolute end after the closing `};` (or `}`). */
  nodeEnd: number
  name: string
  openBrace: number
  closeBrace: number
  bindingsInterior: { start: number; end: number }
}

/**
 * Layer nodes (with bindings) inside a ZMK keymap block, in document order.
 * `block` is the findZmkKeymapBlock result for `source`.
 */
export function findKeymapLayerNodes(
  source: string,
  block: NonNullable<ReturnType<typeof findZmkKeymapBlock>>
): DtsLayerNode[] {
  const body = source.slice(block.bodyStart, block.bodyEnd)
  const nodes: DtsLayerNode[] = []
  const re = /(\w+)\s*\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    const name = m[1]
    if (name === 'compatible') continue
    const openBraceRel = m.index + m[0].length - 1
    const openBrace = block.bodyStart + openBraceRel
    const closeBrace = findMatchingBrace(source, openBrace)
    if (closeBrace < 0 || closeBrace > block.bodyEnd) {
      // Avoid re-matching the same `{` forever on malformed input
      re.lastIndex = openBraceRel + 1
      continue
    }

    // Skip past this node so nested braces aren't re-scanned as siblings
    re.lastIndex = closeBrace - block.bodyStart + 1

    const bindingsInterior = findBindingsInterior(source, openBrace + 1, closeBrace)
    if (!bindingsInterior) continue

    // Include trailing `;` and following whitespace up to next sibling / end
    let nodeEnd = closeBrace + 1
    if (source[nodeEnd] === ';') nodeEnd++
    while (nodeEnd < block.bodyEnd && /[ \t\r\n]/.test(source[nodeEnd])) {
      nodeEnd++
    }

    nodes.push({
      nameStart: block.bodyStart + m.index,
      nodeEnd,
      name,
      openBrace,
      closeBrace,
      bindingsInterior
    })
  }
  return nodes
}

function expandMacros(text: string, macros: Record<string, string>): string {
  const keys = Object.keys(macros).sort((a, b) => b.length - a.length)
  let out = text
  for (const key of keys) {
    out = out.replace(new RegExp(`\\b${key}\\b`, 'g'), macros[key])
  }
  return out
}

/** True if any #define name appears as a whole word in `text`. */
export function macrosAppearInText(text: string, macros: Record<string, string>): boolean {
  const keys = Object.keys(macros).sort((a, b) => b.length - a.length)
  for (const key of keys) {
    if (new RegExp(`\\b${key}\\b`).test(text)) return true
  }
  return false
}

/** Concatenated bindings interiors inside the ZMK keymap block (unexpanded). */
export function keymapBindingsText(source: string): string | null {
  const block = findZmkKeymapBlock(source)
  if (!block) return null
  const layers = findKeymapLayerNodes(source, block)
  return layers.map(n => source.slice(n.bindingsInterior.start, n.bindingsInterior.end)).join('\n')
}

/** Split a bindings block into individual bind strings (each starts with &). */
export function tokenizeBindings(block: string): string[] {
  const normalized = block.replace(/\r\n/g, '\n').replace(/\n/g, ' ')
  return normalized
    .split(/(?=&)/)
    .map(s => s.trim())
    .filter(s => s.startsWith('&'))
}

export function parseDefines(source: string): Record<string, string> {
  const macros: Record<string, string> = {}
  let match: RegExpExecArray | null
  const re = new RegExp(DEFINE_RE)
  while ((match = re.exec(source)) !== null) {
    macros[match[1]] = match[2].replace(/\/\/.*$/, '').trim()
  }
  return macros
}

export interface DtsKeymapJson {
  keyboard: string
  keymap: string
  layout: string
  layer_names: string[]
  layers: string[][]
  warnings: string[]
  [key: string]: unknown
}

export function parseDtsKeymap(
  source: string,
  meta: { keyboard?: string; keymap?: string; layout?: string } = {}
): DtsKeymapJson {
  const macros = parseDefines(source)
  const layers: string[][] = []
  const layer_names: string[] = []
  const warnings: string[] = []

  const block = findZmkKeymapBlock(source)
  if (!block) {
    throw new Error('No layers with bindings found in .keymap')
  }

  const layerNodes = findKeymapLayerNodes(source, block)
  let anyMacroExpanded = false

  for (const node of layerNodes) {
    const rawBlock = source.slice(node.bindingsInterior.start, node.bindingsInterior.end)
    if (macrosAppearInText(rawBlock, macros)) {
      anyMacroExpanded = true
    }
    const blockExpanded = expandMacros(rawBlock, macros)
    const binds = tokenizeBindings(blockExpanded).map(b => expandMacros(b, macros))
    layers.push(binds)
    layer_names.push(node.name === 'default_layer' ? 'default' : node.name)
  }

  if (layers.length === 0) {
    throw new Error('No layers with bindings found in .keymap')
  }

  if (anyMacroExpanded) {
    warnings.push('macros_expanded')
  }

  return {
    keyboard: meta.keyboard ?? 'unknown',
    keymap: meta.keymap ?? 'unknown',
    layout: meta.layout ?? 'LAYOUT',
    layer_names,
    layers,
    warnings
  }
}
