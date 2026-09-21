/**
 * Minimal ZMK .keymap (devicetree bindings=) parser for editor import.
 * Expands simple #define macros and extracts layer bindings arrays.
 */

const DEFINE_RE = /^#define\s+(\w+)\s+(.+)$/gm
const LAYER_RE =
  /(\w+)\s*\{\s*bindings\s*=\s*<([\s\S]*?)>\s*;\s*\}/g

function expandMacros(text: string, macros: Record<string, string>): string {
  // Apply longer names first to avoid partial replacements
  const keys = Object.keys(macros).sort((a, b) => b.length - a.length)
  let out = text
  for (const key of keys) {
    out = out.replace(new RegExp(`\\b${key}\\b`, 'g'), macros[key])
  }
  return out
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
}

export function parseDtsKeymap(
  source: string,
  meta: { keyboard?: string; keymap?: string; layout?: string } = {}
): DtsKeymapJson {
  const macros = parseDefines(source)
  const layers: string[][] = []
  const layer_names: string[] = []

  let match: RegExpExecArray | null
  const re = new RegExp(LAYER_RE)
  while ((match = re.exec(source)) !== null) {
    const name = match[1]
    const block = expandMacros(match[2], macros)
    const binds = tokenizeBindings(block).map(b => expandMacros(b, macros))
    layers.push(binds)
    layer_names.push(name === 'default_layer' ? 'default' : name)
  }

  if (layers.length === 0) {
    throw new Error('No layers with bindings found in .keymap')
  }

  return {
    keyboard: meta.keyboard ?? 'unknown',
    keymap: meta.keymap ?? 'unknown',
    layout: meta.layout ?? 'LAYOUT',
    layer_names,
    layers
  }
}
