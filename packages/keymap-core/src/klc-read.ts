/**
 * Read a Microsoft Keyboard Layout Creator source file into host layouts.
 *
 * A one-alphabet file becomes one layout. A file that puts another alphabet
 * on Caps Lock — the shape `hostLayoutsToCapsKlc` writes — becomes two:
 * levels 0 and 1 of the normal rows are the base, levels 0 and 1 of each
 * Caps Lock row are the second language, and AltGr stays with that second
 * language. Scan codes select the key. Virtual keys, the Ctrl column, key
 * names, and custom dead-key compositions are not stored.
 */

import { HOST_KEY_IDS } from './host-key-id.js'
import { hostLayoutFromKeysyms, type HostLayout } from './host-layout.js'
import { HOST_LANGUAGE_IDS, type HostLanguageId } from './host-languages.js'
import { WINDOWS_DEAD_KEYS, windowsDeadKey } from './klc-dead.js'
import { windowsLocale } from './klc-locale.js'
import { glyphToKeysym } from './xkb-keysyms.js'

export class KlcParseError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'KlcParseError'
  }
}

export interface KlcLayoutImport {
  description: string
  kbdId: string
  localeId: string
  /** Language of `LOCALEID` when it is one of the host locales. */
  baseLanguage: HostLanguageId | null
  kind: 'single' | 'paired'
  base: HostLayout
  /** Caps Lock alphabet. Present only when `kind` is `paired`. */
  caps?: HostLayout
  /**
   * Russian, Ukrainian, or German when those letters are on Caps Lock.
   * Null for a single layout, or when the second alphabet is not one of those.
   */
  capsLanguage: HostLanguageId | null
  warnings: string[]
}

const KEYWORDS = new Set([
  'KBD',
  'COPYRIGHT',
  'COMPANY',
  'LOCALENAME',
  'LOCALEID',
  'VERSION',
  'SHIFTSTATE',
  'LAYOUT',
  'DEADKEY',
  'KEYNAME',
  'KEYNAME_EXT',
  'KEYNAME_DEAD',
  'DESCRIPTIONS',
  'LANGUAGENAMES',
  'ENDKBD'
])

/** Full Caps Lock rows before a file counts as a second alphabet, not a few Shift overrides. */
const PAIRED_KEY_MIN = 8

const LEVEL_BY_STATE: Readonly<Record<number, number>> = { 0: 0, 1: 1, 6: 2, 7: 3 }

const BY_SCAN = new Map<number, string>()
for (const key of HOST_KEY_IDS) {
  if (key.scan !== undefined) BY_SCAN.set(key.scan, key.zmk)
}

const DEAD_BY_ID = new Map<number, string>()
for (const item of WINDOWS_DEAD_KEYS) DEAD_BY_ID.set(item.id, item.keysym)
for (const language of HOST_LANGUAGE_IDS) {
  for (const [keysym, id] of Object.entries(windowsLocale(language).deadIdByKeysym ?? {})) {
    DEAD_BY_ID.set(id, keysym)
  }
}

interface RawRow {
  scan: number
  cells: string[]
  continuation?: string[]
}

interface DeadBlock {
  id: number
  pairs: [number, number][]
}

/** UTF-16 LE with BOM, which is what MSKLC saves. UTF-8 is accepted for a pasted copy. */
export function decodeKlc(bytes: Uint8Array): string {
  const utf16le = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe
  const utf16be = bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff
  let text: string
  if (utf16le) text = new TextDecoder('utf-16le').decode(bytes)
  else if (utf16be) text = new TextDecoder('utf-16be').decode(bytes)
  else if (looksLikeUtf16Le(bytes)) text = new TextDecoder('utf-16le').decode(bytes)
  else text = new TextDecoder('utf-8').decode(bytes)
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  return text
}

function looksLikeUtf16Le(bytes: Uint8Array): boolean {
  const sample = Math.min(bytes.length - (bytes.length % 2), 64)
  if (sample < 8) return false
  let zeros = 0
  for (let index = 1; index < sample; index += 2) {
    if (bytes[index] === 0) zeros += 1
  }
  return zeros >= sample / 4
}

function leadingKeyword(line: string): string | null {
  const match = /^([A-Z][A-Z0-9_]*)\b/.exec(line)
  if (!match || !KEYWORDS.has(match[1])) return null
  return match[1]
}

function splitFields(line: string): string[] {
  const bare = line.split('//')[0].trimEnd()
  if (!bare.trim()) return []
  const parts = bare.includes('\t') ? bare.split('\t') : bare.trim().split(/\s+/)
  return parts.map(part => part.trim())
}

function unquote(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function normToken(token: string | undefined): string {
  const value = token?.trim() ?? ''
  if (!value || value === '-1' || value === '%%') return '-1'
  return value.toLowerCase()
}

function tokenAt(cells: readonly string[], states: readonly number[], state: number): string {
  const index = states.indexOf(state)
  if (index < 0 || index >= cells.length) return '-1'
  return normToken(cells[index])
}

function isFullContinuation(row: RawRow): boolean {
  return !!row.continuation && row.continuation.length >= row.cells.length && row.continuation.length >= 2
}

function lettersDiffer(row: RawRow, states: readonly number[]): boolean {
  const caps = row.continuation
  if (!caps) return false
  return (
    tokenAt(row.cells, states, 0) !== tokenAt(caps, states, 0) ||
    tokenAt(row.cells, states, 1) !== tokenAt(caps, states, 1)
  )
}

function codepointOf(body: string): number | null {
  if (/^[0-9A-Fa-f]{8}$/.test(body)) {
    const hi = Number.parseInt(body.slice(0, 4), 16)
    const lo = Number.parseInt(body.slice(4), 16)
    if (hi >= 0xd800 && hi <= 0xdbff && lo >= 0xdc00 && lo <= 0xdfff) {
      return 0x10000 + ((hi - 0xd800) << 10) + (lo - 0xdc00)
    }
    return null
  }
  if (/^[0-9A-Fa-f]{4}$/.test(body)) {
    const value = Number.parseInt(body, 16)
    if (value >= 0xd800 && value <= 0xdfff) return null
    return value
  }
  const chars = [...body]
  if (chars.length !== 1) return null
  const codepoint = chars[0].codePointAt(0)
  if (codepoint == null || (codepoint >= 0xd800 && codepoint <= 0xdfff)) return null
  return codepoint
}

function cellToKeysym(token: string | undefined, unknownDead: Set<string>): string {
  const value = token?.trim() ?? ''
  if (!value || value === '-1' || value === '%%') return 'NoSymbol'
  const dead = value.endsWith('@')
  const body = dead ? value.slice(0, -1) : value
  const codepoint = codepointOf(body)
  if (codepoint == null) return 'NoSymbol'
  if (dead) {
    const keysym = DEAD_BY_ID.get(codepoint)
    if (!keysym) {
      unknownDead.add(codepoint.toString(16).padStart(4, '0'))
      return 'NoSymbol'
    }
    return keysym
  }
  const parsed = glyphToKeysym(String.fromCodePoint(codepoint))
  return parsed.ok ? parsed.keysym : 'NoSymbol'
}

function keysymsAt(
  cells: readonly string[],
  states: readonly number[],
  which: 'all' | 'letters' | 'altgr',
  unknownDead: Set<string>
): [string, string, string, string] {
  const keysyms: [string, string, string, string] = ['NoSymbol', 'NoSymbol', 'NoSymbol', 'NoSymbol']
  const take = (state: number) => {
    const level = LEVEL_BY_STATE[state]
    if (level == null) return
    keysyms[level] = cellToKeysym(tokenAt(cells, states, state) === '-1' ? '-1' : cells[states.indexOf(state)], unknownDead)
  }
  if (which !== 'altgr') {
    take(0)
    take(1)
  }
  if (which !== 'letters') {
    take(6)
    take(7)
  }
  return keysyms
}

function prefer(primary: string, fallback: string): string {
  return primary !== 'NoSymbol' ? primary : fallback
}

function filled(keysyms: readonly string[]): boolean {
  return keysyms.some(keysym => keysym !== 'NoSymbol')
}

function guessCapsLanguage(layout: HostLayout): HostLanguageId | null {
  let text = ''
  for (const levels of layout.byZmk.values()) {
    text += levels.glyphs[0] + levels.glyphs[1]
  }
  if (/[іїєґІЇЄҐ]/.test(text)) return 'uk'
  if (/[\u0400-\u04FF]/.test(text)) return 'ru'
  if (/[äöüÄÖÜß]/.test(text)) return 'de'
  return null
}

function languageByLocaleId(localeId: string): HostLanguageId | null {
  const id = localeId.trim().toLowerCase()
  if (!id) return null
  for (const language of HOST_LANGUAGE_IDS) {
    if (windowsLocale(language).localeId.toLowerCase() === id) return language
  }
  return null
}

function compositionsDiffer(block: DeadBlock): boolean {
  const keysym = DEAD_BY_ID.get(block.id)
  if (!keysym) return false
  const known = windowsDeadKey(keysym)
  if (!known) return true
  const signature = (pairs: readonly (readonly [number, number])[]) =>
    pairs
      .filter(([base]) => base !== 0x20)
      .map(([base, composed]) => `${base}:${composed}`)
      .sort()
      .join('|')
  return signature(block.pairs) !== signature(known.pairs)
}

/** Parse one .klc document. The text is already decoded (`decodeKlc`). */
export function parseKlc(text: string): KlcLayoutImport {
  const source = text.replace(/^\uFEFF/, '')
  const lines = source.split(/\r\n|\n|\r/)
  let description = ''
  let kbdId = ''
  let localeId = ''
  let mode: 'none' | 'shift' | 'layout' | 'dead' | 'skip' = 'none'
  const states: number[] = []
  const rows: RawRow[] = []
  let pending: RawRow | undefined
  const deadBlocks: DeadBlock[] = []
  let dead: DeadBlock | undefined

  const finishDead = () => {
    if (!dead) return
    deadBlocks.push(dead)
    dead = undefined
  }
  const finishRow = () => {
    if (!pending) return
    rows.push(pending)
    pending = undefined
  }

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('//')) continue
    const keyword = leadingKeyword(trimmed)
    if (keyword) {
      finishRow()
      finishDead()
      if (keyword === 'SHIFTSTATE') mode = 'shift'
      else if (keyword === 'LAYOUT') mode = 'layout'
      else if (keyword === 'DEADKEY') {
        mode = 'dead'
        const id = Number.parseInt(splitFields(trimmed)[1] ?? '', 16)
        if (Number.isInteger(id)) dead = { id, pairs: [] }
        else mode = 'skip'
      } else if (keyword === 'KBD') {
        mode = 'none'
        const fields = splitFields(trimmed)
        kbdId = fields[1] ?? ''
        description = unquote(fields.slice(2).join('\t'))
      } else if (keyword === 'LOCALEID') {
        mode = 'none'
        localeId = unquote(splitFields(trimmed)[1] ?? '')
      } else if (
        keyword === 'KEYNAME' ||
        keyword === 'KEYNAME_EXT' ||
        keyword === 'KEYNAME_DEAD' ||
        keyword === 'DESCRIPTIONS' ||
        keyword === 'LANGUAGENAMES' ||
        keyword === 'ENDKBD'
      ) {
        mode = 'skip'
      } else mode = 'none'
      continue
    }
    if (mode === 'shift') {
      const value = Number.parseInt(splitFields(trimmed)[0] ?? '', 10)
      if (Number.isInteger(value)) states.push(value)
      continue
    }
    if (mode === 'layout') {
      const fields = splitFields(trimmed)
      if (fields.length === 0) continue
      if (fields[0] === '-1') {
        if (pending) pending.continuation = fields.slice(3)
        continue
      }
      const scan = Number.parseInt(fields[0], 16)
      if (!Number.isInteger(scan)) continue
      finishRow()
      pending = { scan, cells: fields.slice(3) }
      continue
    }
    if (mode === 'dead' && dead) {
      const fields = splitFields(trimmed)
      const base = Number.parseInt(fields[0] ?? '', 16)
      const composed = Number.parseInt(fields[1] ?? '', 16)
      if (Number.isInteger(base) && Number.isInteger(composed)) dead.pairs.push([base, composed])
    }
  }
  finishRow()
  finishDead()

  if (states.length === 0) throw new KlcParseError('This .klc file has no SHIFTSTATE table.')

  const known = rows.filter(row => BY_SCAN.has(row.scan))
  if (known.length === 0) throw new KlcParseError('This .klc file has no character keys.')

  const pairedKeys = known.filter(row => isFullContinuation(row) && lettersDiffer(row, states))
  const kind = pairedKeys.length >= PAIRED_KEY_MIN ? 'paired' : 'single'
  const unknownDead = new Set<string>()
  const baseEntries: [string, [string, string, string, string]][] = []
  const capsEntries: [string, [string, string, string, string]][] = []

  for (const row of known) {
    const zmk = BY_SCAN.get(row.scan) as string
    const full = isFullContinuation(row)
    if (kind === 'paired') {
      const letters = keysymsAt(row.cells, states, 'letters', unknownDead)
      const altSource = full && row.continuation ? row.continuation : row.cells
      const alt = keysymsAt(altSource, states, 'altgr', unknownDead)
      const mainAlt = keysymsAt(row.cells, states, 'altgr', unknownDead)
      const capsLetters = full && row.continuation
        ? keysymsAt(row.continuation, states, 'letters', unknownDead)
        : letters
      const base = [letters[0], letters[1], 'NoSymbol', 'NoSymbol'] as [string, string, string, string]
      const caps = [
        capsLetters[0],
        capsLetters[1],
        prefer(alt[2], mainAlt[2]),
        prefer(alt[3], mainAlt[3])
      ] as [string, string, string, string]
      if (filled(base)) baseEntries.push([zmk, base])
      if (filled(caps)) capsEntries.push([zmk, caps])
    } else {
      const all = keysymsAt(row.cells, states, 'all', unknownDead)
      if (filled(all)) baseEntries.push([zmk, all])
    }
  }

  const warnings: string[] = []
  if (unknownDead.size > 0) {
    warnings.push(`Dropped unknown dead key ${[...unknownDead][0]}.`)
  }
  if (deadBlocks.some(compositionsDiffer)) {
    warnings.push('Dead-key compositions in this file were not imported.')
  }
  if (kind === 'single' && known.some(row => row.continuation && row.continuation.length > 0)) {
    warnings.push('Caps Lock characters that differ from Shift were left out.')
  }

  const base = hostLayoutFromKeysyms('klc', baseEntries)
  const caps = kind === 'paired' ? hostLayoutFromKeysyms('klc-caps', capsEntries) : undefined
  return {
    description,
    kbdId,
    localeId,
    baseLanguage: languageByLocaleId(localeId),
    kind,
    base,
    ...(caps ? { caps } : {}),
    capsLanguage: caps ? guessCapsLanguage(caps) : null,
    warnings
  }
}
