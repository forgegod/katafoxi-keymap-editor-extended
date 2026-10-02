/**
 * Parse and surgically rewrite ZMK `combos { … }` nodes in a .keymap file.
 * Combo `bindings =` never become layers (see dts-keymap / ADR 0002).
 *
 * Binding strings stay raw here; `parseKeymap` / `encodeKeymap` convert to
 * `KeyBindingNode` so this module does not import keymap.ts.
 */

import { findMatchingBrace } from './dts-keymap.js'
import type { ZmkCombo } from './types.js'

export interface DtsCombosBlock {
  /** Absolute start of the `combos` keyword. */
  keywordStart: number
  openBrace: number
  closeBrace: number
  bodyStart: number
  bodyEnd: number
}

/**
 * Locate a `combos { … }` block. Prefers one that declares
 * `compatible = "zmk,combos"` when several exist.
 */
export function findCombosBlock(source: string): DtsCombosBlock | null {
  const re = /\bcombos\s*\{/g
  let fallback: DtsCombosBlock | null = null
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    const openBrace = m.index + m[0].length - 1
    const closeBrace = findMatchingBrace(source, openBrace)
    if (closeBrace < 0) continue
    const bodyStart = openBrace + 1
    const bodyEnd = closeBrace
    const block: DtsCombosBlock = {
      keywordStart: m.index,
      openBrace,
      closeBrace,
      bodyStart,
      bodyEnd
    }
    const body = source.slice(bodyStart, bodyEnd)
    if (/compatible\s*=\s*"zmk,combos"/.test(body)) return block
    if (!fallback) fallback = block
  }
  return fallback
}

function findAngleInterior(
  source: string,
  from: number,
  to: number,
  prop: string
): { start: number; end: number } | null {
  const slice = source.slice(from, to)
  const re = new RegExp(`${prop}\\s*=\\s*<`)
  const m = re.exec(slice)
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

function parseUintList(interior: string): number[] {
  const out: number[] = []
  for (const tok of interior.trim().split(/\s+/)) {
    if (!tok) continue
    const n = Number(tok)
    if (Number.isInteger(n) && n >= 0) out.push(n)
  }
  return out
}

function parseOptionalUintProp(body: string, prop: string): number | undefined {
  const m = new RegExp(`${prop}\\s*=\\s*<\\s*(\\d+)\\s*>`).exec(body)
  if (!m) return undefined
  return Number(m[1])
}

function parseOptionalBoolProp(body: string, prop: string): boolean | undefined {
  const m = new RegExp(`${prop}\\s*;`).exec(body)
  return m ? true : undefined
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
  const block = findCombosBlock(source)
  if (!block) return []

  const body = source.slice(block.bodyStart, block.bodyEnd)
  const combos: DtsComboJson[] = []
  const re = /(\w+)\s*\{/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) {
    const name = m[1]
    if (name === 'compatible') continue
    const openBraceRel = m.index + m[0].length - 1
    const openBrace = block.bodyStart + openBraceRel
    const closeBrace = findMatchingBrace(source, openBrace)
    if (closeBrace < 0 || closeBrace > block.bodyEnd) {
      re.lastIndex = openBraceRel + 1
      continue
    }
    re.lastIndex = closeBrace - block.bodyStart + 1

    const nodeBody = source.slice(openBrace + 1, closeBrace)
    const bindings = findAngleInterior(source, openBrace + 1, closeBrace, 'bindings')
    const positions = findAngleInterior(source, openBrace + 1, closeBrace, 'key-positions')
    if (!bindings || !positions) continue

    const bindingText = source.slice(bindings.start, bindings.end).trim()
    // One binding per combo (ZMK allows one); take the first &… token.
    const bindMatch = bindingText.match(/&\S+(?:\s+\S+)*/)
    if (!bindMatch) continue

    const combo: DtsComboJson = {
      id: name,
      keyPositions: parseUintList(source.slice(positions.start, positions.end)),
      binding: bindMatch[0].trim()
    }

    const timeoutMs = parseOptionalUintProp(nodeBody, 'timeout-ms')
    if (timeoutMs !== undefined) combo.timeoutMs = timeoutMs
    const idle = parseOptionalUintProp(nodeBody, 'require-prior-idle-ms')
    if (idle !== undefined) combo.requirePriorIdleMs = idle
    if (parseOptionalBoolProp(nodeBody, 'slow-release')) combo.slowRelease = true
    const layersInterior = findAngleInterior(source, openBrace + 1, closeBrace, 'layers')
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
export function formatComboNode(combo: DtsComboJson, indent = '        '): string {
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
  return lines.join('\n')
}

export function formatCombosBlock(combos: DtsComboJson[], indent = '    '): string {
  const child = indent + '    '
  const nodes = combos.map(c => formatComboNode(c, child)).join('\n')
  return (
    `${indent}combos {\n` +
    `${child}compatible = "zmk,combos";\n` +
    (nodes ? `${nodes}\n` : '') +
    `${indent}};`
  )
}

/**
 * Replace or insert the `combos` block so it matches `combos`.
 * Empty list removes an existing block. Outside the block stays byte-stable
 * aside from the inserted/removed region.
 */
export function spliceCombosIntoDts(original: string, combos: DtsComboJson[]): string {
  const block = findCombosBlock(original)

  if (combos.length === 0) {
    if (!block) return original
    let from = block.keywordStart
    let to = block.closeBrace + 1
    if (original[to] === ';') to++
    while (from > 0 && (original[from - 1] === ' ' || original[from - 1] === '\t')) {
      from--
    }
    if (from > 0 && original[from - 1] === '\n') from--
    let next = original.slice(0, from) + original.slice(to)
    next = next.replace(/\n{3,}/g, '\n\n')
    return next
  }

  const formatted = formatCombosBlock(combos)

  if (block) {
    let to = block.closeBrace + 1
    if (original[to] === ';') to++
    return original.slice(0, block.keywordStart) + formatted + original.slice(to)
  }

  const root = /\/\s*\{/.exec(original)
  if (root) {
    const openBrace = root.index + root[0].length - 1
    const closeBrace = findMatchingBrace(original, openBrace)
    if (closeBrace >= 0) {
      const insertion = `\n${formatted}\n`
      return original.slice(0, closeBrace) + insertion + original.slice(closeBrace)
    }
  }

  return `${original.trimEnd()}\n\n/ {\n${formatted}\n};\n`
}

/** Suggest a unique combo id like `combo`, `combo_2`, … */
export function nextComboId(existing: readonly { id: string }[]): string {
  const used = new Set(existing.map(c => c.id))
  if (!used.has('combo')) return 'combo'
  let n = 2
  while (used.has(`combo_${n}`)) n++
  return `combo_${n}`
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

/** True when the combo is safe to leave in the keymap / exit the editor. */
export function isComboReady(combo: { keyPositions: readonly number[] }): boolean {
  return comboKeysIssue(combo.keyPositions) === null
}

/** Empty starter combo for the visual editor (parsed binding). */
export function createEmptyCombo(existing: readonly { id: string }[]): ZmkCombo {
  return {
    id: nextComboId(existing),
    keyPositions: [],
    binding: { value: '&kp', params: [{ value: 'ESC', params: [] }] }
  }
}
