/**
 * Typewriter index for chord-heavy boards: map combo outputs onto a generic
 * ANSI/TKL skeleton (not a named keyboard) so hover can light finger cores.
 */

import { usShiftBaseCode } from './keycode-labels.js'
import {
  isModifierWrapCode,
  modifierHoldForWrap,
  modifierRoleGlyph
} from './modifiers.js'
import { comboDictionaryLabel, comboDictionaryModifierIndexes } from './combo-dictionary.js'
import { hostLegendFor } from './compose-host.js'
import { keycapLegend } from './compose-binding.js'
import { keycapFace, type KeycapFaceGlyph, type KeycapTone } from './keycap-face.js'
import type { HostLegendView, KeyBindingNode, LayoutKey, ZmkCombo } from './types.js'

export type TypewriterIndexKey = {
  id: string
  label: string
  x: number
  y: number
  w?: number
  h?: number
}

export type ComboIndexBand = 'base' | 'shift' | 'mod'

export type ComboIndexRef =
  | { kind: 'key'; keyId: string; band: 'base' | 'shift' }
  | {
      kind: 'mod'
      keyId: string
      wrap: string
      label: string
    }
  | { kind: 'other'; label: string }
  | { kind: 'skip' }

export type ComboIndexHit = {
  keyId: string
  band: ComboIndexBand
  positions: number[]
  comboIds: string[]
  /** Non-shift wrap (`LA`) when `band === 'mod'`. */
  wrap?: string
  /** Compact face for a mod chord (`⎇TAB`). */
  label?: string
}

/** One typewriter key may hold a plain output, an LS() output, and mod chords. */
export type ComboIndexKeyBands = {
  base?: ComboIndexHit
  shift?: ComboIndexHit
  mods?: ComboIndexHit[]
}

export type ComboIndexOther = {
  comboId: string
  label: string
  positions: number[]
}

export type ComboIndexModel = {
  keys: TypewriterIndexKey[]
  hits: Map<string, ComboIndexKeyBands>
  other: ComboIndexOther[]
}

/** Active-id token for an index half or mod chip (board highlight / aria-pressed). */
export function comboIndexHitActiveId(hit: ComboIndexHit): string {
  if (hit.band === 'mod') return `${hit.keyId}:mod:${hit.wrap ?? hit.label ?? ''}`
  return `${hit.keyId}:${hit.band}`
}

function k(
  id: string,
  label: string,
  x: number,
  y: number,
  w?: number
): TypewriterIndexKey {
  return w != null && w !== 1 ? { id, label, x, y, w } : { id, label, x, y }
}

/** Compact ANSI/TKL skeleton: letters, digits, F-row, arrows, edits. */
export const TYPEWRITER_INDEX_KEYS: readonly TypewriterIndexKey[] = [
  k('esc', 'Esc', 0, 0),
  k('f1', 'F1', 2, 0),
  k('f2', 'F2', 3, 0),
  k('f3', 'F3', 4, 0),
  k('f4', 'F4', 5, 0),
  k('f5', 'F5', 6.5, 0),
  k('f6', 'F6', 7.5, 0),
  k('f7', 'F7', 8.5, 0),
  k('f8', 'F8', 9.5, 0),
  k('f9', 'F9', 11, 0),
  k('f10', 'F10', 12, 0),
  k('f11', 'F11', 13, 0),
  k('f12', 'F12', 14, 0),
  k('del', 'Del', 15.5, 0),

  k('grave', '`', 0, 1.25),
  k('n1', '1', 1, 1.25),
  k('n2', '2', 2, 1.25),
  k('n3', '3', 3, 1.25),
  k('n4', '4', 4, 1.25),
  k('n5', '5', 5, 1.25),
  k('n6', '6', 6, 1.25),
  k('n7', '7', 7, 1.25),
  k('n8', '8', 8, 1.25),
  k('n9', '9', 9, 1.25),
  k('n0', '0', 10, 1.25),
  k('minus', '-', 11, 1.25),
  k('equal', '=', 12, 1.25),
  k('bspc', 'Bksp', 13, 1.25, 2),

  k('tab', 'Tab', 0, 2.25, 1.5),
  k('q', 'Q', 1.5, 2.25),
  k('w', 'W', 2.5, 2.25),
  k('e', 'E', 3.5, 2.25),
  k('r', 'R', 4.5, 2.25),
  k('t', 'T', 5.5, 2.25),
  k('y', 'Y', 6.5, 2.25),
  k('u', 'U', 7.5, 2.25),
  k('i', 'I', 8.5, 2.25),
  k('o', 'O', 9.5, 2.25),
  k('p', 'P', 10.5, 2.25),
  k('lbkt', '[', 11.5, 2.25),
  k('rbkt', ']', 12.5, 2.25),
  k('bslh', '\\', 13.5, 2.25, 1.5),

  k('caps', 'Caps', 0, 3.25, 1.75),
  k('a', 'A', 1.75, 3.25),
  k('s', 'S', 2.75, 3.25),
  k('d', 'D', 3.75, 3.25),
  k('f', 'F', 4.75, 3.25),
  k('g', 'G', 5.75, 3.25),
  k('h', 'H', 6.75, 3.25),
  k('j', 'J', 7.75, 3.25),
  k('k', 'K', 8.75, 3.25),
  k('l', 'L', 9.75, 3.25),
  k('semi', ';', 10.75, 3.25),
  k('sqt', "'", 11.75, 3.25),
  k('enter', 'Enter', 12.75, 3.25, 2.25),

  k('lshift', '⇧', 0, 4.25, 1.25),
  k('nubs', 'ISO', 1.25, 4.25),
  k('z', 'Z', 2.25, 4.25),
  k('x', 'X', 3.25, 4.25),
  k('c', 'C', 4.25, 4.25),
  k('v', 'V', 5.25, 4.25),
  k('b', 'B', 6.25, 4.25),
  k('n', 'N', 7.25, 4.25),
  k('m', 'M', 8.25, 4.25),
  k('comma', ',', 9.25, 4.25),
  k('dot', '.', 10.25, 4.25),
  k('slash', '/', 11.25, 4.25),
  k('rshift', '⇧', 12.25, 4.25, 2.75),

  k('lctrl', 'Ctrl', 0, 5.5, 1.25),
  k('lgui', '⌘', 1.25, 5.5, 1.25),
  k('lalt', 'Alt', 2.5, 5.5, 1.25),
  k('space', 'Space', 3.75, 5.5, 6.25),
  k('ralt', 'Alt', 10, 5.5, 1.25),
  k('rgui', '⌘', 11.25, 5.5, 1.25),
  k('rctrl', 'Ctrl', 12.5, 5.5, 1.5),

  k('ins', 'Ins', 16.25, 1.25),
  k('home', 'Home', 17.25, 1.25),
  k('pgup', 'PgUp', 18.25, 1.25),
  k('end', 'End', 17.25, 2.25),
  k('pgdn', 'PgDn', 18.25, 2.25),
  k('left', '←', 16.25, 5.5),
  k('down', '↓', 17.25, 5.5),
  k('up', '↑', 17.25, 4.5),
  k('right', '→', 18.25, 5.5)
]

/** Canonical ZMK token for a typewriter index key (`a` → `A`, `n1` → `N1`). */
const KEY_TO_ZMK: Record<string, string> = {
  esc: 'ESC',
  del: 'DEL',
  grave: 'GRAVE',
  n1: 'N1',
  n2: 'N2',
  n3: 'N3',
  n4: 'N4',
  n5: 'N5',
  n6: 'N6',
  n7: 'N7',
  n8: 'N8',
  n9: 'N9',
  n0: 'N0',
  minus: 'MINUS',
  equal: 'EQUAL',
  bspc: 'BSPC',
  tab: 'TAB',
  lbkt: 'LBKT',
  rbkt: 'RBKT',
  bslh: 'BSLH',
  caps: 'CAPS',
  semi: 'SEMI',
  sqt: 'SQT',
  enter: 'ENTER',
  lshift: 'LSHIFT',
  rshift: 'RSHIFT',
  nubs: 'NUBS',
  comma: 'COMMA',
  dot: 'DOT',
  slash: 'SLASH',
  lctrl: 'LCTRL',
  rctrl: 'RCTRL',
  lgui: 'LGUI',
  rgui: 'RGUI',
  lalt: 'LALT',
  ralt: 'RALT',
  space: 'SPACE',
  ins: 'INS',
  home: 'HOME',
  pgup: 'PG_UP',
  end: 'END',
  pgdn: 'PG_DN',
  left: 'LEFT',
  down: 'DOWN',
  up: 'UP',
  right: 'RIGHT'
}

for (let i = 1; i <= 12; i++) {
  KEY_TO_ZMK[`f${i}`] = `F${i}`
}
for (const letter of 'abcdefghijklmnopqrstuvwxyz') {
  KEY_TO_ZMK[letter] = letter.toUpperCase()
}

export function typewriterIndexZmk(keyId: string): string | null {
  return KEY_TO_ZMK[keyId] ?? null
}

const CODE_TO_KEY: Record<string, string> = {
  ESC: 'esc',
  ESCAPE: 'esc',
  DEL: 'del',
  DELETE: 'del',
  GRAVE: 'grave',
  N1: 'n1',
  N2: 'n2',
  N3: 'n3',
  N4: 'n4',
  N5: 'n5',
  N6: 'n6',
  N7: 'n7',
  N8: 'n8',
  N9: 'n9',
  N0: 'n0',
  MINUS: 'minus',
  EQUAL: 'equal',
  BSPC: 'bspc',
  BKSP: 'bspc',
  BACKSPACE: 'bspc',
  TAB: 'tab',
  LBKT: 'lbkt',
  LEFT_BRACKET: 'lbkt',
  RBKT: 'rbkt',
  RIGHT_BRACKET: 'rbkt',
  BSLH: 'bslh',
  BACKSLASH: 'bslh',
  CAPS: 'caps',
  CAPSLOCK: 'caps',
  SEMI: 'semi',
  SEMICOLON: 'semi',
  SQT: 'sqt',
  SINGLE_QUOTE: 'sqt',
  APOSTROPHE: 'sqt',
  ENTER: 'enter',
  RET: 'enter',
  RETURN: 'enter',
  LSHFT: 'lshift',
  LSHIFT: 'lshift',
  LEFT_SHIFT: 'lshift',
  RSHFT: 'rshift',
  RSHIFT: 'rshift',
  RIGHT_SHIFT: 'rshift',
  NUBS: 'nubs',
  NON_US_BSLH: 'nubs',
  COMMA: 'comma',
  DOT: 'dot',
  PERIOD: 'dot',
  SLASH: 'slash',
  FSLH: 'slash',
  LCTRL: 'lctrl',
  LCONTROL: 'lctrl',
  LEFT_CONTROL: 'lctrl',
  RCTRL: 'rctrl',
  RCONTROL: 'rctrl',
  LGUI: 'lgui',
  LCMD: 'lgui',
  LWIN: 'lgui',
  LEFT_WIN: 'lgui',
  RGUI: 'rgui',
  RCMD: 'rgui',
  RWIN: 'rgui',
  LALT: 'lalt',
  LEFT_ALT: 'lalt',
  RALT: 'ralt',
  RIGHT_ALT: 'ralt',
  SPACE: 'space',
  INS: 'ins',
  INSERT: 'ins',
  HOME: 'home',
  PG_UP: 'pgup',
  PGUP: 'pgup',
  PAGE_UP: 'pgup',
  END: 'end',
  PG_DN: 'pgdn',
  PGDN: 'pgdn',
  PAGE_DOWN: 'pgdn',
  LEFT: 'left',
  RIGHT: 'right',
  UP: 'up',
  DOWN: 'down'
}

for (let i = 1; i <= 12; i++) {
  CODE_TO_KEY[`F${i}`] = `f${i}`
}

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
for (const letter of LETTERS) {
  CODE_TO_KEY[letter] = letter.toLowerCase()
}

function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/^KC_/, '')
}

function keyIdForCode(code: string): string | null {
  const upper = normalizeCode(code)
  if (!upper) return null
  const direct = CODE_TO_KEY[upper]
  if (direct) return direct
  const shiftBase = usShiftBaseCode(upper)
  if (shiftBase) return CODE_TO_KEY[normalizeCode(shiftBase)] ?? null
  return null
}

const WRAP_INLINE = /^(LS|LC|LA|LG|RS|RC|RA|RG)\((.+)\)$/i

function wrapIsShift(wrap: string): boolean {
  const upper = wrap.toUpperCase()
  return upper === 'LS' || upper === 'RS'
}

/** Compact face for `LA(TAB)` / `LC(DEL)` — same marks as board ZMK legends. */
const INDEX_INNER_GLYPH: Record<string, string> = {
  DEL: '⌦',
  DELETE: '⌦',
  BSPC: '⌫',
  BACKSPACE: '⌫',
  CAPS: '⇪',
  CAPSLOCK: '⇪'
}

export function comboIndexModChordLabel(wrap: string, innerCode: string): string {
  const hold = modifierHoldForWrap(wrap)
  const roleGlyph = hold ? modifierRoleGlyph(hold.role) : wrap.toUpperCase()
  const mark = hold?.side === 'R' ? `R${roleGlyph}` : roleGlyph
  const upper = normalizeCode(innerCode)
  const inner =
    INDEX_INNER_GLYPH[upper] ?? (keycapLegend(innerCode) || upper)
  return `${mark}${inner}`
}

type UnwrapResult = {
  code: string
  shift: boolean
  /** Outermost non-shift wrap (`LA`, `LC`, …). */
  modWrap?: string
}

function unwrapBinding(binding: KeyBindingNode): UnwrapResult | null {
  const behavior = String(binding.value ?? '')
  if (behavior === '&none' || behavior === '&trans') return null
  if (behavior !== '&kp' && behavior !== '&sk') return null
  let node: KeyBindingNode | undefined = binding.params[0]
  if (!node) return null
  let shift = false
  let modWrap: string | undefined
  while (node) {
    const raw = String(node.value ?? '')
    const inline = WRAP_INLINE.exec(raw)
    if (inline) {
      const wrap = inline[1]!.toUpperCase()
      if (wrapIsShift(wrap)) shift = true
      else if (!modWrap) modWrap = wrap
      const inner = node.params[0]
      node = inner ?? { value: inline[2]!, params: [] }
      continue
    }
    if (isModifierWrapCode(raw) && node.params[0]) {
      const wrap = String(raw).toUpperCase()
      if (wrapIsShift(wrap)) shift = true
      else if (!modWrap) modWrap = wrap
      node = node.params[0]
      continue
    }
    if (usShiftBaseCode(normalizeCode(raw))) shift = true
    return { code: raw, shift, modWrap }
  }
  return null
}

export function comboBindingIndexRef(binding: KeyBindingNode): ComboIndexRef {
  const unwrapped = unwrapBinding(binding)
  if (!unwrapped) {
    if (String(binding.value ?? '') === '&none' || String(binding.value ?? '') === '&trans') {
      return { kind: 'skip' }
    }
    return { kind: 'other', label: comboDictionaryLabel(binding) }
  }
  const keyId = keyIdForCode(unwrapped.code)
  if (!keyId) return { kind: 'other', label: comboDictionaryLabel(binding) }
  // Non-shift chords (Alt+Tab, Ctrl+Del) stay on the terminal key as mod chips
  // so they are not collapsed into the plain base half.
  if (unwrapped.modWrap) {
    return {
      kind: 'mod',
      keyId,
      wrap: unwrapped.modWrap,
      label: comboIndexModChordLabel(unwrapped.modWrap, unwrapped.code)
    }
  }
  return { kind: 'key', keyId, band: unwrapped.shift ? 'shift' : 'base' }
}

function extraCount(combo: ZmkCombo, modifiers: ReadonlySet<number>): number {
  return combo.keyPositions.filter(index => modifiers.has(index)).length
}

type ComboIndexBucket = { combo: ZmkCombo; extras: number }

function hitFromBucket(
  keyId: string,
  band: ComboIndexBand,
  list: ComboIndexBucket[],
  extra?: { wrap?: string; label?: string }
): ComboIndexHit | undefined {
  if (list.length === 0) return undefined
  const min = Math.min(...list.map(item => item.extras))
  const chosen = list.filter(item => item.extras === min)
  const positions = [
    ...new Set(chosen.flatMap(item => item.combo.keyPositions))
  ].sort((a, b) => a - b)
  return {
    keyId,
    band,
    positions,
    comboIds: chosen.map(item => item.combo.id),
    ...(extra?.wrap ? { wrap: extra.wrap } : {}),
    ...(extra?.label ? { label: extra.label } : {})
  }
}

/**
 * For each typewriter key, plain and Shift outputs peek separately.
 * Non-shift wraps (`LA`/`LC`/…) become mod chips on the same key.
 * Within a band (or mod wrap), prefer the fewest thumb extras.
 */
export function comboDictionaryIndexHits(
  combos: readonly ZmkCombo[],
  modifiers: readonly number[]
): Map<string, ComboIndexKeyBands> {
  const extra = new Set(modifiers)
  const grouped = new Map<
    string,
    {
      base: ComboIndexBucket[]
      shift: ComboIndexBucket[]
      mods: Map<string, { label: string; buckets: ComboIndexBucket[] }>
    }
  >()
  for (const combo of combos) {
    const ref = comboBindingIndexRef(combo.binding)
    if (ref.kind === 'skip' || ref.kind === 'other') continue
    const slot = grouped.get(ref.keyId) ?? {
      base: [],
      shift: [],
      mods: new Map()
    }
    if (ref.kind === 'mod') {
      const prev = slot.mods.get(ref.wrap) ?? { label: ref.label, buckets: [] }
      prev.buckets.push({ combo, extras: extraCount(combo, extra) })
      slot.mods.set(ref.wrap, prev)
    } else {
      slot[ref.band].push({ combo, extras: extraCount(combo, extra) })
    }
    grouped.set(ref.keyId, slot)
  }

  const hits = new Map<string, ComboIndexKeyBands>()
  for (const [keyId, slot] of grouped) {
    const mods: ComboIndexHit[] = []
    for (const [wrap, group] of slot.mods) {
      const hit = hitFromBucket(keyId, 'mod', group.buckets, {
        wrap,
        label: group.label
      })
      if (hit) mods.push(hit)
    }
    mods.sort((a, b) => (a.label ?? '').localeCompare(b.label ?? ''))
    const bands: ComboIndexKeyBands = {
      base: hitFromBucket(keyId, 'base', slot.base),
      shift: hitFromBucket(keyId, 'shift', slot.shift),
      ...(mods.length > 0 ? { mods } : {})
    }
    if (bands.base || bands.shift || bands.mods?.length) hits.set(keyId, bands)
  }
  return hits
}

const KEY_SHIFT_MARK: Record<string, string> = {
  n1: '!',
  n2: '@',
  n3: '#',
  n4: '$',
  n5: '%',
  n6: '^',
  n7: '&',
  n8: '*',
  n9: '(',
  n0: ')',
  minus: '_',
  equal: '+',
  lbkt: '{',
  rbkt: '}',
  bslh: '|',
  semi: ':',
  sqt: '"',
  grave: '~',
  comma: '<',
  dot: '>',
  slash: '?'
}

/** One on-keycap language on a dictionary half: letter + AltGr (or Shift + AltGr+Shift). */
export type TypewriterIndexBandPack = {
  tone: KeycapTone
  glyphs: readonly [KeycapFaceGlyph, KeycapFaceGlyph]
}

export type TypewriterIndexBandFace = {
  packs: TypewriterIndexBandPack[]
  fallback?: string
}

function ansiFallback(
  key: TypewriterIndexKey,
  band: ComboIndexBand,
  split: boolean
): string {
  const letter =
    key.label.length === 1 && key.label >= 'A' && key.label <= 'Z'
  const shiftMark = KEY_SHIFT_MARK[key.id]
  if (band === 'shift') {
    return split
      ? (shiftMark ?? (letter ? key.label : `⇧${key.label}`))
      : key.label
  }
  return split && letter ? key.label.toLowerCase() : key.label
}

/**
 * Host face for one index half. Letter + AltGr (base) or Shift + AltGr+Shift.
 * Packs come from `keycapFace`; non-host keys keep an ANSI fallback label.
 */
export function typewriterIndexBandFace(
  key: TypewriterIndexKey,
  band: ComboIndexBand,
  view?: HostLegendView | null,
  split = true
): TypewriterIndexBandFace {
  const zmk = typewriterIndexZmk(key.id)
  const legend = zmk && view ? hostLegendFor(zmk, view) : null
  const face = legend ? keycapFace(legend) : null
  if (face && face.packs.length > 0) {
    const letter = band === 'shift' ? 1 : 0
    const alt = band === 'shift' ? 3 : 2
    return {
      packs: face.packs.map(pack => ({
        tone: pack.tone,
        glyphs: [pack.glyphs[letter]!, pack.glyphs[alt]!]
      }))
    }
  }
  return { packs: [], fallback: ansiFallback(key, band, split) }
}

export function comboDictionaryIndexOther(
  combos: readonly ZmkCombo[]
): ComboIndexOther[] {
  const byLabel = new Map<string, ComboIndexOther>()
  for (const combo of combos) {
    const ref = comboBindingIndexRef(combo.binding)
    if (ref.kind !== 'other') continue
    const prev = byLabel.get(ref.label)
    if (prev) {
      prev.positions = [
        ...new Set([...prev.positions, ...combo.keyPositions])
      ].sort((a, b) => a - b)
      continue
    }
    byLabel.set(ref.label, {
      comboId: combo.id,
      label: ref.label,
      positions: [...combo.keyPositions]
    })
  }
  return [...byLabel.values()]
}

export function comboDictionaryIndexModel(
  layout: readonly LayoutKey[],
  combos: readonly ZmkCombo[] | undefined
): ComboIndexModel {
  const list = combos ?? []
  const modifiers = comboDictionaryModifierIndexes(layout, list)
  return {
    keys: [...TYPEWRITER_INDEX_KEYS],
    hits: comboDictionaryIndexHits(list, modifiers),
    other: comboDictionaryIndexOther(list)
  }
}
