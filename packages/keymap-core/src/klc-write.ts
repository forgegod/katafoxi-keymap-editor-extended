/**
 * Write a Microsoft Keyboard Layout Creator source file from a host layout.
 *
 * The text is what MSKLC saves: UTF-16 LE with BOM, CRLF, SHIFTSTATE columns,
 * scan code, virtual key, caps behavior, and DEADKEY tables. A plain file is
 * one language. `hostLayoutsToCapsKlc` keeps the base language's locale and
 * puts another layout's letters on Caps Lock. AltGr in that file comes from
 * the second layout, and an English AltGr symbol remains only where the
 * second layout has none. Locale id, punctuation virtual keys, and dead-key
 * spacing characters come from `WindowsLocale`.
 */

import { HOST_KEY_IDS, type HostKeyId } from './host-key-id.js'
import type { HostLayout } from './host-layout.js'
import { windowsDeadKey, type WindowsDeadKey } from './klc-dead.js'
import type { WindowsLocale } from './klc-locale.js'
import { keysymToGlyph } from './xkb-keysyms.js'

export interface HostLayoutKlcOptions {
  /** Profile name. Becomes the KBD description. Also the DLL id when `kbdId` is omitted. */
  name: string
  /**
   * DLL name: one to eight letters and digits, starting with a letter.
   * Windows keeps the previous layout when this id stays the same.
   */
  kbdId?: string
  locale: WindowsLocale
  /**
   * Levels 0 and 1 of this layout become Caps Lock and Caps Lock+Shift.
   * AltGr and AltGr+Shift come from this layout. A base AltGr symbol is
   * kept only where this layout's AltGr level is empty. The same AltGr
   * symbols are written on the Caps Lock row. Virtual keys and `LOCALEID`
   * stay with the base layout. `locale.sgcapByZmk` is ignored in this mode.
   */
  capsLayout?: HostLayout
}

const SHIFT_ORDER = [0, 1, 2, 6, 7] as const

/** Host levels 0..3 land on these shift states. Ctrl (2) is not a host level. */
const LEVEL_SHIFT = [0, 1, 6, 7] as const

const SHIFT_COMMENT: Record<number, string> = {
  0: '//Column 4',
  1: '//Column 5 : Shft',
  2: '//Column 6 :       Ctrl',
  6: '//Column 7 :       Ctrl Alt',
  7: '//Column 8 : Shft  Ctrl Alt'
}

const KEYNAME = `
01	Esc
0e	Backspace
0f	Tab
1c	Enter
1d	Ctrl
2a	Shift
36	"Right Shift"
37	"Num *"
38	Alt
39	Space
3a	"Caps Lock"
3b	F1
3c	F2
3d	F3
3e	F4
3f	F5
40	F6
41	F7
42	F8
43	F9
44	F10
45	Pause
46	"Scroll Lock"
47	"Num 7"
48	"Num 8"
49	"Num 9"
4a	"Num -"
4b	"Num 4"
4c	"Num 5"
4d	"Num 6"
4e	"Num +"
4f	"Num 1"
50	"Num 2"
51	"Num 3"
52	"Num 0"
53	"Num Del"
54	"Sys Req"
57	F11
58	F12
7c	F13
7d	F14
7e	F15
7f	F16
80	F17
81	F18
82	F19
83	F20
84	F21
85	F22
86	F23
87	F24
`.trim()

const KEYNAME_EXT = `
1c	"Num Enter"
1d	"Right Ctrl"
35	"Num /"
37	"Prnt Scrn"
38	"Right Alt"
45	"Num Lock"
46	Break
47	Home
48	Up
49	"Page Up"
4b	Left
4d	Right
4f	End
50	Down
51	"Page Down"
52	Insert
53	Delete
54	<00>
56	Help
5b	"Left Windows"
5c	"Right Windows"
5d	Application
`.trim()

function quote(value: string): string {
  return `"${value.replace(/[\r\n"]/g, ' ').replace(/\s+/g, ' ').trim()}"`
}

/** MSKLC uses the KBD id as a DLL name: one to eight letters and digits, starting with a letter. */
export function klcIdentifier(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9]/g, '')
  if (!cleaned) return 'Layout'
  const id = (/^[A-Za-z]/.test(cleaned) ? cleaned : `L${cleaned}`).slice(0, 8)
  return /^[A-Za-z]/.test(id) ? id : 'Layout'
}

/**
 * Paired-layout DLL name: three letters from each language plus a two-digit
 * version (`English` + `Russian` + 1 → `EngRus01`). Underscores are not
 * allowed, and the whole id is at most eight characters.
 */
export function pairedKbdId(baseName: string, capsName: string, version: number): string {
  const stem = (name: string) => name.replace(/[^A-Za-z]/g, '').slice(0, 3)
  const n = Math.min(99, Math.max(1, Math.trunc(version) || 1))
  return klcIdentifier(`${stem(baseName)}${stem(capsName)}${String(n).padStart(2, '0')}`)
}

function hex4(codepoint: number): string {
  return codepoint.toString(16).padStart(4, '0')
}

/** MSKLC writes ASCII letters and digits as themselves, everything else as hex. */
export function klcCharToken(codepoint: number): string {
  const asciiLetter = (codepoint >= 0x41 && codepoint <= 0x5a) || (codepoint >= 0x61 && codepoint <= 0x7a)
  const asciiDigit = codepoint >= 0x30 && codepoint <= 0x39
  if (asciiLetter || asciiDigit) return String.fromCodePoint(codepoint)
  if (codepoint > 0xffff) {
    const rest = codepoint - 0x10000
    return hex4(0xd800 + (rest >> 10)) + hex4(0xdc00 + (rest & 0x3ff))
  }
  return hex4(codepoint)
}

function glyphOf(keysym: string): string | null {
  if (!keysym || keysym === 'NoSymbol' || keysym === 'VoidSymbol') return null
  if (keysym.startsWith('dead_')) return null
  const glyph = keysymToGlyph(keysym)
  if (!glyph) return null
  const chars = [...glyph]
  if (chars.length !== 1) return null
  return chars[0]
}

function isCasePair(lower: string | null, upper: string | null): boolean {
  if (!lower || !upper || lower === upper) return false
  return lower.toUpperCase() === upper && upper.toLowerCase() === lower
}

function deadEntry(keysym: string, locale: WindowsLocale): WindowsDeadKey | undefined {
  if (!keysym.startsWith('dead_')) return undefined
  const shared = windowsDeadKey(keysym)
  const id = locale.deadIdByKeysym?.[keysym] ?? shared?.id
  if (id == null) return undefined
  const pairs = (shared?.pairs ?? [[0x20, id] as const]).map(([base, composed]) =>
    base === 0x20 ? ([0x20, id] as const) : ([base, composed] as const)
  )
  return { keysym, id, pairs }
}

function cellToken(keysym: string, locale: WindowsLocale): string {
  const dead = deadEntry(keysym, locale)
  if (dead) return `${hex4(dead.id)}@`
  const glyph = glyphOf(keysym)
  if (!glyph) return '-1'
  return klcCharToken(glyph.codePointAt(0) as number)
}

function latinVk(keysym: string): string | null {
  const glyph = glyphOf(keysym)
  if (!glyph) return null
  if (glyph >= 'a' && glyph <= 'z') return glyph.toUpperCase()
  if (glyph >= 'A' && glyph <= 'Z') return glyph.toUpperCase()
  return null
}

function vkSpelling(vk: string): string {
  return vk.startsWith('VK_') ? vk.slice(3) : vk
}

function assignVks(
  keys: readonly HostKeyId[],
  layout: HostLayout,
  locale: WindowsLocale
): Map<string, string> {
  const assigned = new Map<string, string>()
  const used = new Set<string>()
  for (const key of keys) {
    const override = locale.vkByZmk?.[key.zmk]
    if (!override) continue
    assigned.set(key.zmk, override)
    used.add(override)
  }
  for (const key of keys) {
    if (assigned.has(key.zmk)) continue
    const levels = layout.byZmk.get(key.zmk)
    const letter = latinVk(levels?.keysyms[0] ?? '') ?? latinVk(levels?.keysyms[1] ?? '')
    if (!letter || used.has(letter)) continue
    assigned.set(key.zmk, letter)
    used.add(letter)
  }
  for (const key of keys) {
    if (assigned.has(key.zmk)) continue
    const vk = vkSpelling(key.vk)
    assigned.set(key.zmk, vk)
    used.add(vk)
  }
  return assigned
}

function layoutUsesLevel(layout: HostLayout, level: number, locale: WindowsLocale): boolean {
  for (const levels of layout.byZmk.values()) {
    if (cellToken(levels.keysyms[level] ?? 'NoSymbol', locale) !== '-1') return true
  }
  return false
}

function shiftStates(layout: HostLayout, locale: WindowsLocale, capsLayout?: HostLayout): number[] {
  const states = new Set<number>(locale.shiftStates)
  states.add(0)
  states.add(1)
  states.add(2)
  const uses = (level: number) =>
    layoutUsesLevel(layout, level, locale) ||
    (capsLayout != null && layoutUsesLevel(capsLayout, level, locale))
  if (uses(2)) states.add(6)
  if (uses(3)) states.add(7)
  return SHIFT_ORDER.filter(state => states.has(state))
}

/**
 * National AltGr wins. An empty national level keeps the base symbol, so a
 * US layout with no AltGr still receives the other language's characters,
 * and a custom English AltGr symbol survives where the other language has none.
 */
function mergedAltGr(
  state: number,
  base: ReadonlyMap<number, string>,
  caps: ReadonlyMap<number, string> | undefined
): string {
  const fromBase = base.get(state) ?? '-1'
  if (!caps || (state !== 6 && state !== 7)) return fromBase
  const national = caps.get(state) ?? '-1'
  return national === '-1' ? fromBase : national
}

function inferredCap(glyphs: readonly (string | null)[]): string {
  let cap = 0
  if (isCasePair(glyphs[0], glyphs[1])) cap |= 1
  if (isCasePair(glyphs[2], glyphs[3])) cap |= 4
  return String(cap)
}

function capToken(
  zmk: string,
  glyphs: readonly (string | null)[],
  locale: WindowsLocale
): string {
  if (locale.sgcapByZmk?.[zmk] != null) return 'SGCap'
  return inferredCap(glyphs)
}

function tokensByState(keysyms: readonly string[], locale: WindowsLocale): Map<number, string> {
  const byState = new Map<number, string>()
  for (let level = 0; level < LEVEL_SHIFT.length; level++) {
    byState.set(LEVEL_SHIFT[level], cellToken(keysyms[level] ?? 'NoSymbol', locale))
  }
  byState.set(2, '-1')
  return byState
}

/** Caps Lock carries a second alphabet when its base or shift glyph differs. */
function capsAlphabetDiffers(
  base: ReadonlyMap<number, string>,
  caps: ReadonlyMap<number, string> | undefined
): boolean {
  if (!caps) return false
  const lower = caps.get(0) ?? '-1'
  const upper = caps.get(1) ?? '-1'
  if (lower === '-1' && upper === '-1') return false
  return lower !== (base.get(0) ?? '-1') || upper !== (base.get(1) ?? '-1')
}

interface LayoutRow {
  scan: number
  lines: string[]
}

function scanHex(scan: number): string {
  return scan.toString(16).padStart(2, '0')
}

function rowLine(scan: number, vk: string, cap: string, cells: readonly string[]): string {
  return [scanHex(scan), vk, cap, ...cells].join('\t')
}

function characterRow(
  key: HostKeyId,
  vk: string,
  layout: HostLayout,
  locale: WindowsLocale,
  states: readonly number[],
  capsLayout?: HostLayout
): LayoutRow {
  const keysyms = layout.byZmk.get(key.zmk)?.keysyms ?? ['NoSymbol', 'NoSymbol', 'NoSymbol', 'NoSymbol']
  const glyphs = keysyms.map(name => glyphOf(name))
  const byState = tokensByState(keysyms, locale)
  const capsKeysyms = capsLayout?.byZmk.get(key.zmk)?.keysyms
  const capsStates = capsKeysyms ? tokensByState(capsKeysyms, locale) : undefined
  const cells = states.map(state => mergedAltGr(state, byState, capsStates))
  if (capsLayout && capsAlphabetDiffers(byState, capsStates)) {
    const capsCells = states.map(state => {
      if (state === 0 || state === 1) return capsStates?.get(state) ?? '-1'
      return mergedAltGr(state, byState, capsStates)
    })
    return {
      scan: key.scan as number,
      lines: [
        rowLine(key.scan as number, vk, 'SGCap', cells),
        ['-1', '-1', '0', ...capsCells].join('\t')
      ]
    }
  }
  const lines = [
    rowLine(
      key.scan as number,
      vk,
      capsLayout ? inferredCap(glyphs) : capToken(key.zmk, glyphs, locale),
      cells
    )
  ]
  if (!capsLayout) {
    const capital = locale.sgcapByZmk?.[key.zmk]
    if (capital != null) lines.push(['-1', '-1', '0', klcCharToken(capital)].join('\t'))
  }
  return { scan: key.scan as number, lines }
}

function fixedRow(
  scan: number,
  vk: string,
  cap: string,
  fill: (state: number) => string,
  states: readonly number[]
): LayoutRow {
  return {
    scan,
    lines: [rowLine(scan, vk, cap, states.map(fill))]
  }
}

function deadSections(layout: HostLayout, locale: WindowsLocale, capsLayout?: HostLayout): WindowsDeadKey[] {
  const byId = new Map<number, WindowsDeadKey>()
  const consider = (keysym: string) => {
    const dead = deadEntry(keysym, locale)
    if (!dead || byId.has(dead.id)) return
    byId.set(dead.id, dead)
  }
  for (const levels of layout.byZmk.values()) {
    for (const keysym of levels.keysyms) consider(keysym)
  }
  if (capsLayout) {
    for (const levels of capsLayout.byZmk.values()) {
      for (const keysym of levels.keysyms) consider(keysym)
    }
  }
  return [...byId.values()]
}

function deadKeyLines(dead: WindowsDeadKey): string[] {
  const lines = [`DEADKEY\t${hex4(dead.id)}`, '']
  for (const [base, composed] of dead.pairs) {
    const from = String.fromCodePoint(base)
    const to = String.fromCodePoint(composed)
    lines.push(`${hex4(base)}\t${hex4(composed)}\t// ${from} -> ${to}`)
  }
  return lines
}

/**
 * English on the normal keys, a second alphabet on Caps Lock, and that
 * layout's AltGr on AltGr. `LOCALEID` stays the base locale, so Windows
 * lists one layout of that language.
 */
export function hostLayoutsToCapsKlc(
  base: HostLayout,
  caps: HostLayout,
  options: HostLayoutKlcOptions
): string {
  return hostLayoutToKlc(base, { ...options, capsLayout: caps })
}

/** One .klc document, CRLF, without the UTF-16 BOM. */
export function hostLayoutToKlc(layout: HostLayout, options: HostLayoutKlcOptions): string {
  const locale = options.locale
  const capsLayout = options.capsLayout
  const states = shiftStates(layout, locale, capsLayout)
  const keys = HOST_KEY_IDS.filter(key => key.scan !== undefined)
  const vks = assignVks(keys, layout, locale)
  const rows: LayoutRow[] = keys
    .filter(key => layout.byZmk.has(key.zmk) || capsLayout?.byZmk.has(key.zmk))
    .map(key =>
      characterRow(key, vks.get(key.zmk) ?? vkSpelling(key.vk), layout, locale, states, capsLayout)
    )
  rows.push(fixedRow(0x39, 'SPACE', '0', state => (state <= 2 ? '0020' : '-1'), states))
  rows.push(fixedRow(0x53, 'DECIMAL', '0', state => (state <= 1 ? '002e' : '-1'), states))
  rows.sort((left, right) => left.scan - right.scan)
  const decimal = rows.filter(row => row.scan === 0x53)
  const ordered = [...rows.filter(row => row.scan !== 0x53), ...decimal]

  const description = (options.name.trim() || locale.languageName).replace(/[\t\r\n]/g, ' ')
  const kbdId = klcIdentifier(options.kbdId?.trim() || description)
  const lines = [
    `KBD\t${kbdId}\t${quote(description)}`,
    `COPYRIGHT\t${quote('(c) 2026 keymap-editor')}`,
    `COMPANY\t${quote('keymap-editor')}`,
    `LOCALENAME\t${quote(locale.localeName)}`,
    `LOCALEID\t${quote(locale.localeId)}`,
    'VERSION\t1.0',
    '',
    'SHIFTSTATE',
    '',
    ...states.map(state => `${state}\t${SHIFT_COMMENT[state] ?? ''}`),
    '',
    "LAYOUT\t\t;an extra '@' at the end is a dead key",
    '',
    `//SC\tVK_\tCap\t${states.join('\t')}`,
    '',
    ...ordered.flatMap(row => row.lines),
    ''
  ]
  const dead = deadSections(layout, locale, capsLayout)
  for (const item of dead) lines.push(...deadKeyLines(item), '')
  // MSKLC splits a section on CRLF only. A LF-only block is one key name, and the
  // quotes inside "Right Shift" then break the generated C file.
  lines.push('KEYNAME', '', ...KEYNAME.split('\n'), '', 'KEYNAME_EXT', '', ...KEYNAME_EXT.split('\n'), '')
  if (dead.length) {
    lines.push('KEYNAME_DEAD', '')
    for (const item of dead) {
      const label = item.keysym.replace(/^dead_/, '').toUpperCase()
      lines.push(`${hex4(item.id)}\t${quote(label)}`)
    }
    lines.push('')
  }
  lines.push(
    'DESCRIPTIONS',
    '',
    `0409\t${description}`,
    'LANGUAGENAMES',
    '',
    `0409\t${locale.languageName}`,
    'ENDKBD',
    ''
  )
  return lines.join('\r\n')
}

/** UTF-16 LE with BOM, the encoding MSKLC opens. */
export function encodeKlc(text: string): Uint8Array {
  const bytes = new Uint8Array(2 + text.length * 2)
  bytes[0] = 0xff
  bytes[1] = 0xfe
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index)
    bytes[2 + index * 2] = code & 0xff
    bytes[3 + index * 2] = code >> 8
  }
  return bytes
}
