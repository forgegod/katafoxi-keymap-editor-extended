import type { HostLayout } from './host-layout.js'
import { keysymToGlyph } from './xkb-keysyms.js'

// The bounded CHG-013 base-output contract, not a simulation of every mode's
// shortcuts/modifiers. See urob/zmk-unicode at the vendored alias revision:
// 6ce21267e497e20ff9e05da16d4eefcdd3e89190, include/zmk-unicode/unicode.h
// (hex_to_key) and src/behaviors/behavior_unicode.c (start/stop service keys).
const SERVICE_KEYS = [
  ['N0', '0'], ['N1', '1'], ['N2', '2'], ['N3', '3'], ['N4', '4'],
  ['N5', '5'], ['N6', '6'], ['N7', '7'], ['N8', '8'], ['N9', '9'],
  ['A', 'a'], ['B', 'b'], ['C', 'c'], ['D', 'd'], ['E', 'e'], ['F', 'f'],
  ['U', 'u'], ['SPACE', 'space'], ['ENTER', 'Return']
] as const

export interface UnicodeHostLayoutIssue {
  zmk: string
  expectedKeysym: string
  actualKeysym: string | null
  reason: 'missing' | 'remapped'
}

export type UnicodeHostLayoutCompatibility =
  | { status: 'compatible'; issues: [] }
  | { status: 'incompatible'; issues: UnicodeHostLayoutIssue[] }
  | { status: 'unavailable'; issues: [] }

/**
 * Check only the caller-selected English table, not its id, cached glyphs,
 * another language column, firmware bindings or the active OS layout.
 * Missing keys stay missing; this never fills, registers or edits a table.
 */
export function unicodeHostLayoutCompatibility(
  layout: HostLayout | undefined
): UnicodeHostLayoutCompatibility {
  if (!layout) return { status: 'unavailable', issues: [] }
  const issues: UnicodeHostLayoutIssue[] = []
  for (const [zmk, expectedKeysym] of SERVICE_KEYS) {
    const actualKeysym = layout.byZmk.get(zmk)?.keysyms[0] ?? null
    if (actualKeysym === expectedKeysym) continue
    // Compare character semantics, not spelling or cached display glyphs.
    // Return is an action: a Unicode CR or keypad Enter is not that keysym.
    if (actualKeysym != null && expectedKeysym !== 'Return' &&
      keysymToGlyph(actualKeysym) === keysymToGlyph(expectedKeysym)) continue
    issues.push({
      zmk,
      expectedKeysym,
      actualKeysym,
      reason: actualKeysym == null || actualKeysym === '' ||
        actualKeysym === 'NoSymbol' || actualKeysym === 'VoidSymbol' ? 'missing' : 'remapped'
    })
  }
  return issues.length ? { status: 'incompatible', issues } : { status: 'compatible', issues: [] }
}
