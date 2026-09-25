/**
 * Keysym name → glyph, via the host symbol dictionary.
 * `NoSymbol` is an empty string. Modifier keysyms (`Multi_key`, `dead_*`)
 * are null: they are not characters. The layout still stores those names
 * as keysyms; only the derived glyph is empty.
 */

import { codepointFromKeysymSpelling, hostSymbolByKeysym } from './host-symbols.js'

const NON_CHARACTER = new Set(['Multi_key', 'ISO_Level3_Shift', 'ISO_Level5_Shift'])

export function keysymToGlyph(name: string): string | null {
  if (name === 'NoSymbol' || name === 'VoidSymbol') return ''
  const symbol = hostSymbolByKeysym(name)
  if (symbol) return symbol.glyph
  if (NON_CHARACTER.has(name) || name.startsWith('dead_')) return null
  const codepoint = codepointFromKeysymSpelling(name)
  if (codepoint != null) return String.fromCodePoint(codepoint)
  if (name.length === 1) return name
  return null
}
