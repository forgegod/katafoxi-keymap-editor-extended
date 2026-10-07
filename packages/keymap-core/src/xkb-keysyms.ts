/**
 * Keysym name ↔ glyph, via the host symbol dictionary.
 * `NoSymbol` is an empty string. Modifier keysyms (`Multi_key`, `dead_*`)
 * are null: they are not characters. The layout still stores those names
 * as keysyms; only the derived glyph is empty.
 *
 * The reverse direction takes what a user typed — a character or a keysym
 * name — and returns the name to store. Rejection is a value, not a throw.
 */
import {
  codepointFromKeysymSpelling,
  hostSymbolByGlyph,
  hostSymbolByKeysym
} from './host-symbols.js'

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

/** Why typed text cannot become a keysym. */
export type KeysymRejection = 'multiple-code-points' | 'lone-surrogate'

export type GlyphToKeysymResult =
  | { ok: true; keysym: string }
  | { ok: false; reason: KeysymRejection }

/** A name the layout may store even though the dictionary has no character for it. */
function isKeysymName(text: string): boolean {
  if (text === 'NoSymbol' || text === 'VoidSymbol') return true
  if (NON_CHARACTER.has(text) || text.startsWith('dead_')) return true
  return hostSymbolByKeysym(text) !== undefined
}

/** `U0451`, uppercase, at least four digits — the spelling the dictionary itself uses. */
function uSpelling(codepoint: number): string {
  return `U${codepoint.toString(16).toUpperCase().padStart(4, '0')}`
}

/**
 * Typed text back to a keysym name. Empty text is `NoSymbol`, a known keysym
 * name is kept as typed, a single character resolves through the dictionary
 * and falls back to its `U` spelling. Anything longer than one character is
 * rejected, so the caller can show the field as invalid.
 */
export function glyphToKeysym(text: string): GlyphToKeysymResult {
  if (text === '') return { ok: true, keysym: 'NoSymbol' }
  if (isKeysymName(text)) return { ok: true, keysym: text }
  const points = [...text]
  if (points.length !== 1) return { ok: false, reason: 'multiple-code-points' }
  const codepoint = points[0].codePointAt(0) as number
  if (codepoint >= 0xd800 && codepoint <= 0xdfff) return { ok: false, reason: 'lone-surrogate' }
  const symbol = hostSymbolByGlyph(points[0])
  return { ok: true, keysym: symbol ? symbol.keysym : uSpelling(codepoint) }
}
