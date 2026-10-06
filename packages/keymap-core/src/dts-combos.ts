/**
 * Parse and surgically rewrite ZMK `combos { … }` nodes in a .keymap file.
 * Combo `bindings =` never become layers (see dts-keymap / ADR 0002).
 *
 * Binding strings stay raw here; `parseKeymap` / `encodeKeymap` convert to
 * `KeyBindingNode` so this module does not import keymap.ts.
 */

import {
  findAngleProp,
  findNamedBlock,
  hasBoolProp,
  maskDts,
  matchBrace,
  parseUintList,
  tokenizeBindings,
  type DtsNamedBlock
} from './dts-scan.js'
import {
  collapseExtraBlankLines,
  dominantEol,
  eatPrecedingEol,
  type LineEnding
} from './eol.js'
import {
  isModifierWrapCode,
  modifierHoldForKey,
  modifierHoldForWrap
} from './modifiers.js'
import type { KeyBindingNode, ZmkCombo } from './types.js'

export type DtsCombosBlock = DtsNamedBlock

/**
 * Locate a `combos { … }` block. Prefers one that declares
 * `compatible = "zmk,combos"` when several exist.
 */
export function findCombosBlock(source: string): DtsCombosBlock | null {
  const masked = maskDts(source)
  return findNamedBlock(source, masked, 'combos', { compatible: 'zmk,combos' })
}

function parseOptionalUintProp(body: string, prop: string): number | undefined {
  const m = new RegExp(`(?<![\\w-])${prop}\\s*=\\s*<\\s*(\\d+)\\s*>`).exec(body)
  if (!m) return undefined
  return Number(m[1])
}

/** Raw combo as stored in DtsKeymapJson before parseKeymap. */
export interface DtsComboJson {
  id: string
  keyPositions: number[]
  /** Single binding string, e.g. `&kp ESC`. */
  binding: string
  timeoutMs?: number
  requirePriorIdleMs?: number
  slowRelease?: boolean
  layers?: number[]
}

/**
 * Parse combo nodes from a .keymap source. Missing / empty block → [].
 * Macros in combo bindings are left as written (caller may expand separately).
 */
export function parseDtsCombos(source: string): DtsComboJson[] {
  const masked = maskDts(source)
  const block = findNamedBlock(source, masked, 'combos', { compatible: 'zmk,combos' })
  if (!block) return []

  const body = masked.slice(block.bodyStart, block.bodyEnd)
  const combos: DtsComboJson[] = []
  const re = /(\w+)\s*\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    const name = m[1]
    const openBraceRel = m.index + m[0].length - 1
    const openBrace = block.bodyStart + openBraceRel
    const closeBrace = matchBrace(masked, openBrace)
    if (closeBrace < 0 || closeBrace > block.bodyEnd) {
      re.lastIndex = openBraceRel + 1
      continue
    }
    re.lastIndex = closeBrace - block.bodyStart + 1

    const range = { start: openBrace + 1, end: closeBrace }
    const nodeBody = masked.slice(openBrace + 1, closeBrace)
    const bindings = findAngleProp(masked, range, 'bindings')
    const positions = findAngleProp(masked, range, 'key-positions')
    if (!bindings || !positions) continue

    // One binding per combo (ZMK allows one); tokenizeBindings tolerates spaces in ().
    const binds = tokenizeBindings(masked.slice(bindings.start, bindings.end))
    if (binds.length === 0) continue

    const combo: DtsComboJson = {
      id: name,
      keyPositions: parseUintList(source.slice(positions.start, positions.end)),
      binding: binds[0]
    }

    const timeoutMs = parseOptionalUintProp(nodeBody, 'timeout-ms')
    if (timeoutMs !== undefined) combo.timeoutMs = timeoutMs
    const idle = parseOptionalUintProp(nodeBody, 'require-prior-idle-ms')
    if (idle !== undefined) combo.requirePriorIdleMs = idle
    if (hasBoolProp(nodeBody, 'slow-release')) combo.slowRelease = true
    const layersInterior = findAngleProp(masked, range, 'layers')
    if (layersInterior) {
      combo.layers = parseUintList(source.slice(layersInterior.start, layersInterior.end))
    }

    combos.push(combo)
  }
  return combos
}

function sanitizeComboId(id: string): string {
  const cleaned = id.replace(/[^a-zA-Z0-9_]/g, '_')
  return cleaned.length > 0 ? cleaned : 'combo'
}

/** Format one combo node (encoded binding string already on the raw). */
function formatComboNode(
  combo: DtsComboJson,
  indent = '        ',
  eol: LineEnding = '\n'
): string {
  const inner = indent + '    '
  const lines: string[] = [`${indent}${sanitizeComboId(combo.id)} {`]
  lines.push(`${inner}bindings = <${combo.binding}>;`)
  lines.push(`${inner}key-positions = <${combo.keyPositions.join(' ')}>;`)
  if (combo.timeoutMs !== undefined) {
    lines.push(`${inner}timeout-ms = <${combo.timeoutMs}>;`)
  }
  if (combo.requirePriorIdleMs !== undefined) {
    lines.push(`${inner}require-prior-idle-ms = <${combo.requirePriorIdleMs}>;`)
  }
  if (combo.slowRelease) {
    lines.push(`${inner}slow-release;`)
  }
  if (combo.layers && combo.layers.length > 0) {
    lines.push(`${inner}layers = <${combo.layers.join(' ')}>;`)
  }
  lines.push(`${indent}};`)
  return lines.join(eol)
}

export function formatCombosBlock(
  combos: DtsComboJson[],
  indent = '    ',
  eol: LineEnding = '\n'
): string {
  const child = indent + '    '
  const nodes = combos.map(c => formatComboNode(c, child, eol)).join(eol)
  return (
    `${indent}combos {${eol}` +
    `${child}compatible = "zmk,combos";${eol}` +
    (nodes ? `${nodes}${eol}` : '') +
    `${indent}};`
  )
}

/**
 * Replace or insert the `combos` block so it matches `combos`.
 * Empty list removes an existing block. Outside the block stays byte-stable
 * aside from the inserted/removed region.
 */
export function spliceCombosIntoDts(original: string, combos: DtsComboJson[]): string {
  const eol = dominantEol(original)
  const block = findCombosBlock(original)

  if (combos.length === 0) {
    if (!block) return original
    let from = block.keywordStart
    let to = block.closeBrace + 1
    if (original[to] === ';') to++
    while (from > 0 && (original[from - 1] === ' ' || original[from - 1] === '\t')) {
      from--
    }
    from = eatPrecedingEol(original, from)
    return collapseExtraBlankLines(original.slice(0, from) + original.slice(to), eol)
  }

  const formatted = formatCombosBlock(combos, '    ', eol)

  if (block) {
    let to = block.closeBrace + 1
    if (original[to] === ';') to++
    return original.slice(0, block.keywordStart) + formatted + original.slice(to)
  }

  const masked = maskDts(original)
  const root = /\/\s*\{/.exec(masked)
  if (root) {
    const openBrace = root.index + root[0].length - 1
    const closeBrace = matchBrace(masked, openBrace)
    if (closeBrace >= 0) {
      const insertion = `${eol}${formatted}${eol}`
      return original.slice(0, closeBrace) + insertion + original.slice(closeBrace)
    }
  }

  return `${original.trimEnd()}${eol}${eol}/ {${eol}${formatted}${eol}};${eol}`
}

function sanitizeComboIdPart(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

function flattenBindingForId(node: KeyBindingNode): string {
  const wrap = isModifierWrapCode(node.value)
  const head = sanitizeComboIdPart(String(node.value ?? '').replace(/^&/, ''))
  const kids = (node.params ?? []).map(flattenBindingForId).filter(Boolean)
  if (wrap && kids.length > 0) return [head, ...kids].join('_')
  if (kids.length === 0) return head
  return [head, ...kids].join('_')
}

/**
 * Stem from the combo binding (`&kp ESC` → `combo_esc`, `&mo 1` → `combo_mo_1`).
 * Always a legal DTS node id fragment.
 */
function suggestComboIdStem(binding: KeyBindingNode): string {
  const behavior = sanitizeComboIdPart(String(binding.value ?? '').replace(/^&/, ''))
  const paramBits = (binding.params ?? []).map(flattenBindingForId).filter(Boolean)
  let body: string
  if (behavior === 'kp' && paramBits.length === 1) {
    body = paramBits[0]
  } else if (paramBits.length > 0) {
    body = [behavior, ...paramBits].join('_')
  } else {
    body = behavior || 'combo'
  }
  body = body.replace(/_+/g, '_').replace(/^_|_$/g, '') || 'combo'
  if (body === 'combo' || body.startsWith('combo_')) return body
  return `combo_${body}`
}

/** Unique id from binding; appends `_2`, `_3`, … on collision. */
export function nextComboIdFromBinding(
  binding: KeyBindingNode,
  existing: readonly { id: string }[]
): string {
  const stem = suggestComboIdStem(binding)
  const used = new Set(existing.map(c => c.id))
  if (!used.has(stem)) return stem
  let n = 2
  while (used.has(`${stem}_${n}`)) n++
  return `${stem}_${n}`
}

/** Placeholder ids that may be renamed when the binding changes. */
export function isPlaceholderComboId(id: string): boolean {
  return /^combo(_\d+)?$/.test(id)
}

/** Compact list meta: `50ms · all` / `30ms · L0L1 · slow · idle100` (no matrix indexes). */
export function comboListMeta(combo: {
  keyPositions: readonly number[]
  timeoutMs?: number
  requirePriorIdleMs?: number
  slowRelease?: boolean
  layers?: readonly number[]
}): string {
  const bits: string[] = []
  bits.push(`${combo.timeoutMs ?? 50}ms`)
  if (combo.layers && combo.layers.length > 0) {
    bits.push(combo.layers.map(i => `L${i}`).join(''))
  } else {
    bits.push('all')
  }
  if (combo.slowRelease) bits.push('slow')
  if (combo.requirePriorIdleMs !== undefined) {
    bits.push(`idle${combo.requirePriorIdleMs}`)
  }
  const n = combo.keyPositions.length
  if (n < 2) bits.push(n === 0 ? 'no keys' : 'need 2+')
  return bits.join(' · ')
}

/** True when the combo may fire on any of the shown firmware layers. */
export function comboAppliesToAnyLayer(
  combo: { layers?: readonly number[] },
  layers: readonly number[]
): boolean {
  if (!combo.layers || combo.layers.length === 0) return true
  if (layers.length === 0) return true
  return combo.layers.some(l => layers.includes(l))
}

/** ZMK combos are chords — one key is just a normal binding. */
export const COMBO_MIN_KEYS = 2
/** Soft cap: more than a handful is awkward to press and usually a mistake. */
export const COMBO_MAX_KEYS = 5

export type ComboKeysIssue = 'too_few' | 'too_many'

export function comboKeysIssue(
  keyPositions: readonly number[]
): ComboKeysIssue | null {
  const n = keyPositions.length
  if (n < COMBO_MIN_KEYS) return 'too_few'
  if (n > COMBO_MAX_KEYS) return 'too_many'
  return null
}

export function comboKeysMessage(issue: ComboKeysIssue | null): string | null {
  if (issue === 'too_few') return 'A combo needs at least 2 keys.'
  if (issue === 'too_many') {
    return `A combo can use at most ${COMBO_MAX_KEYS} keys.`
  }
  return null
}

export interface ComboChordRef {
  id: string
  keyPositions: readonly number[]
  /** Omit or leave empty for every layer. */
  layers?: readonly number[]
}

/**
 * Chord identity. Order and repeated indexes do not count.
 * Fewer than two distinct keys is not a chord yet.
 */
function comboChordKey(keyPositions: readonly number[]): string | null {
  const unique = [...new Set(keyPositions)].sort((a, b) => a - b)
  if (unique.length < COMBO_MIN_KEYS) return null
  return unique.join(',')
}

/** Omitted or empty `layers` means every layer, so it meets any other combo. */
function comboLayersIntersect(
  a: readonly number[] | undefined,
  b: readonly number[] | undefined
): boolean {
  if (!a || a.length === 0 || !b || b.length === 0) return true
  const set = new Set(a)
  return b.some(layer => set.has(layer))
}

/**
 * Combos that claim the same key set on a shared layer.
 * The value is the other combo's id (first match in list order).
 * A shorter chord inside a longer one is not a conflict.
 */
export function comboChordOverlapPartners(
  combos: readonly ComboChordRef[]
): Map<string, string> {
  const partners = new Map<string, string>()
  const chords: { id: string; key: string; layers?: readonly number[] }[] = []
  for (const combo of combos) {
    const key = comboChordKey(combo.keyPositions)
    if (key == null) continue
    chords.push({ id: combo.id, key, layers: combo.layers })
  }
  for (let i = 0; i < chords.length; i++) {
    const left = chords[i]!
    for (let j = i + 1; j < chords.length; j++) {
      const right = chords[j]!
      if (left.key !== right.key) continue
      if (!comboLayersIntersect(left.layers, right.layers)) continue
      if (!partners.has(left.id)) partners.set(left.id, right.id)
      if (!partners.has(right.id)) partners.set(right.id, left.id)
    }
  }
  return partners
}

/** First combo in list order that shares its chord with another on a common layer. */
export function comboChordOverlap(
  combos: readonly ComboChordRef[]
): { id: string; otherId: string } | null {
  const partners = comboChordOverlapPartners(combos)
  for (const combo of combos) {
    const otherId = partners.get(combo.id)
    if (otherId) return { id: combo.id, otherId }
  }
  return null
}

export function comboOverlapMessage(otherId: string | null | undefined): string | null {
  if (!otherId) return null
  return `Same keys as ${otherId} on a shared layer.`
}

/**
 * True when layer0 at this index is a standalone modifier key
 * (`&kp LSHIFT`, `&sk LCTRL`, hold side of `&mt LALT A`).
 */
export function bindingIsModifierKey(node: KeyBindingNode | undefined): boolean {
  if (!node) return false
  const behavior = String(node.value)
  if (behavior === '&kp' || behavior === '&sk') {
    return modifierHoldForKey(node.params[0]?.value) != null
  }
  if (behavior === '&mt') {
    return modifierHoldForKey(node.params[0]?.value) != null
  }
  return false
}

/** True when the bind is a mod key or nests a wrap like `LS(CAPS)` / `LC(BSPC)`. */
export function bindingCarriesModifier(node: KeyBindingNode | undefined): boolean {
  if (!node) return false
  if (bindingIsModifierKey(node)) return true
  if (isModifierWrapCode(node.value)) return true
  return (node.params ?? []).some(child => bindingCarriesModifier(child))
}

/**
 * Soft design hint: any selected layer0 key carries a modifier
 * (standalone Shift/Alt, `&mt` hold-mod, or `LS()`/`LA()` wraps).
 * Mixing those into a combo usually mimics a normal host chord.
 * Does not block save or exit.
 */
export function comboLooksLikeModifierChord(
  keyPositions: readonly number[],
  layer0: readonly (KeyBindingNode | undefined)[] | undefined
): boolean {
  if (keyPositions.length < COMBO_MIN_KEYS || !layer0) return false
  return keyPositions.some(index => bindingCarriesModifier(layer0[index]))
}

function comboModifierChordMessage(): string {
  return 'Looks like a normal modifier chord; combos usually use letter or thumb keys.'
}

/** Typical ZMK default when `timeout-ms` is omitted. */
export const COMBO_TIMEOUT_MS_DEFAULT = 50
export const COMBO_TIMEOUT_MS_MIN = 20
export const COMBO_TIMEOUT_MS_MAX = 200

export function clampComboTimeoutMs(ms: number): number {
  if (!Number.isFinite(ms)) return COMBO_TIMEOUT_MS_DEFAULT
  return Math.min(
    COMBO_TIMEOUT_MS_MAX,
    Math.max(COMBO_TIMEOUT_MS_MIN, Math.round(ms))
  )
}

/**
 * Suggested starting value when the user turns on `require-prior-idle-ms`.
 * Omitted in DTS means no prior-idle gate (Off in the UI).
 */
export const COMBO_PRIOR_IDLE_MS_DEFAULT = 100
export const COMBO_PRIOR_IDLE_MS_MIN = 20
export const COMBO_PRIOR_IDLE_MS_MAX = 500

export function clampComboPriorIdleMs(ms: number): number {
  if (!Number.isFinite(ms)) return COMBO_PRIOR_IDLE_MS_DEFAULT
  return Math.min(
    COMBO_PRIOR_IDLE_MS_MAX,
    Math.max(COMBO_PRIOR_IDLE_MS_MIN, Math.round(ms))
  )
}

function isTabKeycode(value: string | number | undefined | null): boolean {
  if (value == null || value === '') return false
  const code = String(value).toUpperCase().replace(/^KC_/, '')
  return code === 'TAB'
}

/**
 * True when the binding is essentially Alt+Tab (`&kp LA(TAB)` / `RA(TAB)`).
 * Host task-switchers expect Alt held; a one-shot combo is usually a poor fit.
 */
export function bindingLooksLikeAltTab(node: KeyBindingNode | undefined): boolean {
  if (!node) return false
  const wrap = modifierHoldForWrap(node.value)
  if (wrap?.role === 'alt' && isTabKeycode(node.params[0]?.value)) return true
  return (node.params ?? []).some(child => bindingLooksLikeAltTab(child))
}

function comboAltTabMessage(): string {
  return 'Alt+Tab usually needs Alt held; a one-shot combo often works poorly on the host.'
}

function comboBindingHint(binding: KeyBindingNode | undefined): string | null {
  if (bindingLooksLikeAltTab(binding)) return comboAltTabMessage()
  return null
}

/**
 * Soft design hints when hard key-count rules already pass.
 * Binding hints (Alt+Tab) win over position hints (mod chord).
 */
export function comboDesignHint(
  keyPositions: readonly number[],
  layer0: readonly (KeyBindingNode | undefined)[] | undefined,
  binding?: KeyBindingNode
): string | null {
  if (comboKeysIssue(keyPositions) != null) return null
  const fromBinding = comboBindingHint(binding)
  if (fromBinding) return fromBinding
  if (comboLooksLikeModifierChord(keyPositions, layer0)) {
    return comboModifierChordMessage()
  }
  return null
}

/** Empty starter combo for the visual editor (parsed binding). */
export function createEmptyCombo(existing: readonly { id: string }[]): ZmkCombo {
  const binding: KeyBindingNode = {
    value: '&kp',
    params: [{ value: 'ESC', params: [] }]
  }
  return {
    id: nextComboIdFromBinding(binding, existing),
    keyPositions: [],
    binding
  }
}
