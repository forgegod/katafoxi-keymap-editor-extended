/**
 * Letter case folding for host-language alphabets.
 *
 * Default `toUpperCase` / `toLowerCase` break Turkish dotted/dotless I
 * (`i`↔`İ`, `ı`↔`I`) and turn German `ß` into `SS` instead of `ẞ`.
 */

import type { HostLanguageId } from './host-languages.js'

/** Canonical lowercase form for “is this letter present?” checks. */
export function foldLetterKey(ch: string, language: HostLanguageId): string {
  if (language === 'tr') {
    if (ch === 'İ' || ch === 'i') return 'i'
    if (ch === 'I' || ch === 'ı') return 'ı'
  }
  if (ch === 'ẞ' || ch === 'ß') return 'ß'
  return ch.toLowerCase().normalize('NFC')
}

/**
 * True when `lower` and `upper` are the unshifted / shifted pair for Caps Lock
 * (MSKLC Cap bit). Language-aware for Turkish; `ß`/`ẞ` for German and others.
 */
export function isLetterCasePair(
  lower: string | null,
  upper: string | null,
  language?: HostLanguageId
): boolean {
  if (!lower || !upper || lower === upper) return false
  if (language === 'tr') {
    if (lower === 'i') return upper === 'İ'
    if (lower === 'ı') return upper === 'I'
    if (lower === 'İ' || lower === 'I') return false
  }
  if (lower === 'ß' && upper === 'ẞ') return true
  const up = lower.toUpperCase()
  if ([...up].length !== 1) return false
  const down = upper.toLowerCase().normalize('NFC')
  if ([...down].length !== 1) return false
  return up === upper && down === lower
}
