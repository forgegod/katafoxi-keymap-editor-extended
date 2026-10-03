import {
  isModifierWrapCode,
  modifierHoldForKey,
  modifierHoldForWrap,
  modifierRoleGlyph,
  modifierSide,
  MODIFIER_ROLE_GLYPH
} from './modifiers.js'
import { keycodeGlyphLabel, keypadGlyphLabel } from './keycode-labels.js'
import { encodeKeyBinding } from './keymap.js'
import { hostKeyByZmk } from './host-key-id.js'
import {
  ALT_LEVEL_EMPTY,
  hostDisplayLevels,
  hostLevelDisplay,
  type HostKeyLevels
} from './host-layout.js'
import { hostLayoutShelves } from './host-layout-registry.js'
import { hostLayoutMeta, hostLevels } from './host-layout-registry.js'
import {
  hostLegendColumns,
  standardHostLegendView,
  type HostLegendColumn
} from './host-legend-view.js'
import { effectiveShownLayers, standardLayerView } from './layer-view.js'
import type { HostLanguageId } from './host-languages.js'
import type {
  ComposedLegend,
  ComposedLegendColumn,
  ComposeKeyInput,
  HoldRef,
  HostLegendView,
  KeyBindingNode,
  LayerView,
  LegendHover,
  ResolvedBinding
} from './types.js'

export { ALT_LEVEL_EMPTY } from './host-layout.js'

/** Compact layer index for key legends (`1` → `L1`). Binding value stays numeric. */
export function layerLegendSymbol(index: number | string): string {
  return `L${index}`
}

const LAYER_REF_BEHAVIORS = new Set(['&mo', '&to', '&tog', '&sl', '&lt'])

function isLayerParam(value: string | number | undefined | null, layer: number): boolean {
  if (value == null || value === '') return false
  if (Number(value) === layer) return true
  const raw = String(value).toUpperCase()
  return raw === `L${layer}` || raw === layerLegendSymbol(layer).toUpperCase()
}

/** True when the bind names layer N (`&mo 1`, `&lt 1 A`, `&to 0`). */
export function bindingReferencesLayer(node: KeyBindingNode, layer: number): boolean {
  const behavior = String(node.value)
  if (LAYER_REF_BEHAVIORS.has(behavior) && isLayerParam(node.params[0]?.value, layer)) {
    return true
  }
  return (node.params ?? []).some(child => bindingReferencesLayer(child, layer))
}

function isRAltCode(value: string | number | undefined | null): boolean {
  if (value == null) return false
  const key = modifierHoldForKey(value)
  if (key) return key.role === 'alt' && key.side === 'R'
  const wrap = modifierHoldForWrap(value)
  return wrap?.role === 'alt' && wrap.side === 'R'
}

function isShiftKeyCode(value: string | number | undefined | null): boolean {
  if (value == null) return false
  return modifierHoldForKey(value)?.role === 'shift' === true
}

/** True when the bind is RAlt / `RA()` — the key that produces AltGr. */
export function bindingSendsAltGr(node: KeyBindingNode): boolean {
  const behavior = String(node.value)
  if (behavior === '&kp') return isRAltCode(node.params[0]?.value)
  if (behavior === '&mt') return isRAltCode(node.params[0]?.value)
  if (isRAltCode(behavior)) return true
  return (node.params ?? []).some(bindingSendsAltGr)
}

/** True when the bind is a Shift key (`LSHFT` / `RSHFT` / `&mt LSHIFT`). Not `LS(A)`. */
export function bindingSendsShift(node: KeyBindingNode): boolean {
  const behavior = String(node.value)
  if (behavior === '&kp') return isShiftKeyCode(node.params[0]?.value)
  if (behavior === '&mt') return isShiftKeyCode(node.params[0]?.value)
  return (node.params ?? []).some(bindingSendsShift)
}

/**
 * `&kp LS(RALT)` and `&kp RA(LSHFT)`: the key is the AltGr+Shift chord itself.
 * A letter inside the wraps (`LS(A)`) is not that key.
 */
export function bindingIsAltGrShiftChord(node: KeyBindingNode): boolean {
  if (String(node.value) !== '&kp' || node.params.length !== 1) return false
  const parts = new Set<'shift' | 'ralt'>()
  const root = node.params[0]
  if (!root || !collectAltGrShiftParts(root, parts)) return false
  return parts.has('shift') && parts.has('ralt')
}

function collectAltGrShiftParts(
  node: KeyBindingNode,
  parts: Set<'shift' | 'ralt'>
): boolean {
  const hold = modifierHoldForWrap(node.value) ?? modifierHoldForKey(node.value)
  if (hold?.role === 'shift') parts.add('shift')
  else if (hold?.role === 'alt' && hold.side === 'R') parts.add('ralt')
  else return false
  return (node.params ?? []).every(child => collectAltGrShiftParts(child, parts))
}

/** What the hover preview should mark: the whole combo, or only the hold badge. */
export type LegendHoverHit = 'none' | 'combo' | 'hold'

function holdRefMatchesHover(hold: HoldRef | undefined, hover: LegendHover): boolean {
  if (!hold) return false
  if (hover.kind === 'layer') return hold.kind === 'layer' && hold.layer === hover.layer
  if (hover.kind === 'altGr') return hold.kind === 'mod' && isRAltCode(hold.code)
  return hold.kind === 'mod' && isShiftKeyCode(hold.code)
}

export function legendHoverHit(
  binding: KeyBindingNode,
  hover: LegendHover | null
): LegendHoverHit {
  if (!hover) return 'none'
  const resolved = resolveBinding(binding)
  if (hover.kind === 'layer') {
    if (!bindingReferencesLayer(binding, hover.layer)) return 'none'
    return holdRefMatchesHover(resolved.hold, hover) &&
      resolved.tap != null &&
      hostKeyByZmk(resolved.tap)
      ? 'hold'
      : 'combo'
  }
  if (hover.kind === 'altGr') {
    if (!bindingSendsAltGr(binding)) return 'none'
    return holdRefMatchesHover(resolved.hold, hover) ? 'hold' : 'combo'
  }
  if (bindingIsAltGrShiftChord(binding)) return 'combo'
  if (!bindingSendsAltGr(binding) && !bindingSendsShift(binding)) return 'none'
  return holdRefMatchesHover(resolved.hold, hover) ? 'hold' : 'combo'
}

export function isLayerLegendSymbol(text: string): boolean {
  return /^L\d+$/.test(text)
}

/** Role glyphs shared by L/R modifiers. Right side is prefixed at display time. */
const ROLE_GLYPHS = new Set(Object.values(MODIFIER_ROLE_GLYPH))

/**
 * Keycap / ZMK-mode legend: left modifiers stay the role glyph,
 * right modifiers become `R⌃` / `R⎇` / `R⌘` / `R⇧`.
 */
/** `BT_CLR` → `CLR`, `BT1` → `SEL1`, `OUT_USB` → `USB`. */
export function prefixedCommandLegend(code?: string | number | null): string | null {
  const raw = String(code ?? '').trim().toUpperCase()
  if (/^BT\d$/.test(raw)) return `SEL${raw.slice(2)}`
  if (raw.startsWith('BT_')) return raw.slice(3)
  if (raw.startsWith('OUT_')) return raw.slice(4)
  return null
}

/**
 * Keep the behavior token, drop the repeated prefix:
 * `&bt BT_SEL 1` → `&bt SEL1`, `&out OUT_USB` → `&out USB`.
 */
export function compactBehaviorLegend(node: KeyBindingNode): string | null {
  const behavior = String(node.value)
  if (behavior !== '&bt' && behavior !== '&out') return null
  const cmd = node.params[0]
  if (!cmd) return behavior
  const extra = node.params[1] ?? cmd.params[0]
  const short = prefixedCommandLegend(cmd.value) ?? String(cmd.value)
  if (extra != null && extra.value != null && extra.value !== '') {
    return `${behavior} ${short}${extra.value}`
  }
  return `${behavior} ${short}`
}

export function keycapLegend(
  code?: string | number | null,
  symbol?: string | number | null
): string {
  const rawCode = code == null ? '' : String(code)
  const glyph = symbol == null ? '' : String(symbol).trim()
  // Same compact keypad marks as edit_key chips — catalog often stores the
  // code name as `symbol` when JSON has no glyph (`KP_COMMA` → `,`).
  const keypad = keypadGlyphLabel(rawCode) ?? ''
  // US shift aliases (`PRCNT`) and HID punct (`MINUS`) — catalog often omits
  // `symbol`, so fall back before showing the raw token.
  const punct = keycodeGlyphLabel(rawCode) ?? ''
  const base = keypad || punct || glyph || prefixedCommandLegend(rawCode) || rawCode
  if (modifierSide(rawCode) === 'R' && ROLE_GLYPHS.has(glyph)) {
    return `R${glyph}`
  }
  return base
}

export function isCompactKeycapLegend(text: string): boolean {
  return (
    text.length === 1 ||
    isLayerLegendSymbol(text) ||
    text.startsWith('R') && ROLE_GLYPHS.has(text.slice(1))
  )
}

/**
 * HID keypad page (`KP_N7`, `KP_ENTER`, `KC_KP_MINUS`).
 * Display-only: the glyph stays `7` / `+`; UI draws a box.
 */
export function isKeypadCode(code?: string | number | null): boolean {
  const upper = String(code ?? '')
    .trim()
    .toUpperCase()
    .replace(/^KC_/, '')
  return upper.startsWith('KP_')
}

/** Catalog chip: `KP_*` or the Keypad HID group (`CLEAR2`). */
export function isKeypadChoice(choice: {
  code?: string | number | null
  context?: string | null
  aliases?: unknown
}): boolean {
  if (isKeypadCode(choice.code)) return true
  if (String(choice.context ?? '').trim().toLowerCase() === 'keypad') return true
  if (!Array.isArray(choice.aliases)) return false
  return choice.aliases.some(alias => isKeypadCode(alias))
}

/** Short tokens that still read as one unit next to a modifier glyph. */
const SHORT_CHORD_TOKEN_RE = /^(?:ESC|TAB|F(?:1[0-2]|[1-9]))$/

/** `LC(DEL)` / `LA(F4)` / `LA(TAB)` — wrap + one short key, no deeper nest. */
export function isCompactModifierChord(
  wrapCode: string | number | undefined | null,
  innerLegend: string
): boolean {
  const inner = innerLegend.trim()
  return (
    isModifierWrapCode(wrapCode) &&
    (isCompactKeycapLegend(inner) || SHORT_CHORD_TOKEN_RE.test(inner))
  )
}

/** `&mt` / `&lt` — first param is hold, second is tap. */
export function isHoldTapBehavior(code: string | number | undefined | null): boolean {
  const value = String(code ?? '')
  return value === '&mt' || value === '&lt'
}

/**
 * Where the behaviour token belongs on a ZMK-mode key.
 * `&kp` is the default and stays off the cap; hold-tap is the pill;
 * parameterless binds (`&none`, `&trans`, `&caps_word`) are the legend.
 */
export type BehaviorKeycapRole = 'hidden' | 'corner' | 'center'

export function behaviorKeycapRole(
  code?: string | number | null,
  opts?: { paramCount?: number; holdTapVisible?: boolean }
): BehaviorKeycapRole {
  const value = String(code ?? '')
  if (!value) return 'hidden'
  if (value === '&kp') return 'hidden'
  if ((value === '&bt' || value === '&out') && (opts?.paramCount ?? 0) > 0) return 'hidden'
  if (isHoldTapBehavior(value) && opts?.holdTapVisible) return 'hidden'
  if ((opts?.paramCount ?? 0) === 0) return 'center'
  return 'corner'
}

export function isHoldTapParam(param: unknown): boolean {
  return param === 'mod' || param === 'layer'
}

/**
 * Split a ZMK binding into tap keycode + optional hold annotation source.
 * Covers the common editor behaviors; unknown binds yield tap from first param if any.
 */
export function resolveBinding(node: KeyBindingNode): ResolvedBinding {
  const behavior = String(node.value)

  if (behavior === '&none' || behavior === '&trans') {
    return { tap: null }
  }

  if (behavior === '&kp') {
    const tap = node.params[0]?.value
    return { tap: tap != null ? String(tap) : null }
  }

  // &mt hold_mod tap_keycode
  if (behavior === '&mt') {
    const hold = node.params[0]?.value
    const tap = node.params[1]?.value
    return {
      tap: tap != null ? String(tap) : null,
      hold: hold != null && hold !== '' ? { kind: 'mod', code: String(hold) } : undefined
    }
  }

  // &lt layer tap_keycode
  if (behavior === '&lt') {
    const layer = parseHoldLayer(node.params[0]?.value)
    const tap = node.params[1]?.value
    return {
      tap: tap != null ? String(tap) : null,
      hold: layer != null ? { kind: 'layer', layer } : undefined
    }
  }

  const tap = node.params[0]?.value
  return { tap: tap != null ? String(tap) : null }
}

function parseHoldLayer(value: string | number | undefined | null): number | undefined {
  if (value == null || value === '') return undefined
  const numeric = Number(value)
  if (Number.isInteger(numeric)) return numeric
  const match = /^L(\d+)$/i.exec(String(value))
  return match ? Number(match[1]) : undefined
}

function formatHoldBadge(hold: HoldRef): string {
  if (hold.kind === 'layer') return `⧗${layerLegendSymbol(hold.layer)}`
  const info = modifierHoldForKey(hold.code) ?? modifierHoldForWrap(hold.code)
  if (!info) return `⧗${hold.code}`
  return `⧗${keycapLegend(hold.code, modifierRoleGlyph(info.role))}`
}

export interface ResolvedHostColumn extends HostLegendColumn {
  tone: ComposedLegendColumn['tone']
  flag: string
}

/** Legend columns plus the tone and flag the composed legend draws. */
export function resolveHostColumns(view: HostLegendView): ResolvedHostColumn[] {
  return hostLegendColumns(view).map((column, index): ResolvedHostColumn => ({
    ...column,
    tone: index === 0 ? 'base' : 'second',
    flag: hostLayoutMeta(column.layoutId)?.flag ?? ''
  }))
}

function composeColumn(
  resolved: ResolvedHostColumn,
  zmk: string
): ComposedLegendColumn | null {
  const levels = hostDisplayLevels(hostLevels(resolved.layoutId, zmk))
  if (!levels) return null
  return {
    language: resolved.language,
    tone: resolved.tone,
    pair: [levels[0].text, levels[1].text],
    pairDead: [levels[0].dead, levels[1].dead],
    altGr: resolved.altGr ? levels[2].text : '',
    altGrDead: resolved.altGr ? levels[2].dead : false,
    altGrShift: resolved.altGrShift ? levels[3].text : '',
    altGrShiftDead: resolved.altGrShift ? levels[3].dead : false,
    showAltGr: resolved.altGr,
    showAltGrShift: resolved.altGrShift,
    onKeycap: resolved.shown
  }
}

/**
 * N-column host legend for a ZMK token. Unknown ids and non-character
 * keys return null. Hidden extras are omitted; a hidden base stays so
 * the firmware alphabet is still there when its glyphs are off the key.
 */
export function hostLegendFor(
  token: string,
  view?: HostLegendView
): ComposedLegend | null {
  const id = hostKeyByZmk(token)
  if (!id) return null
  const resolved = resolveHostColumns(view ?? standardHostLegendView())
  const base = resolved[0]
  if (!base) return null
  const baseColumn = composeColumn(base, id.zmk)
  if (!baseColumn) return null
  const columns: ComposedLegendColumn[] = [baseColumn]
  for (const column of resolved.slice(1)) {
    if (!column.visible) continue
    const composed = composeColumn(column, id.zmk)
    if (composed) columns.push(composed)
  }
  return { columns, keycode: `KC_${id.zmk}` }
}

/**
 * Host×ZMK composition. Glyphs come from the selected host view
 * (system English + Russian unless the caller passes another).
 * Hold badges come from the binding, not from the letter.
 * Returns null when the tap is not a host character key (modifiers, layers,
 * navigation) so the UI keeps the ZMK-mode glyph.
 */
export function composeKey(input: ComposeKeyInput): ComposedLegend | null {
  const resolved = resolveBinding(input.binding)
  if (resolved.tap == null) return null

  const legend = hostLegendFor(resolved.tap, input.hostView)
  if (!legend) return null
  legend.keypad = isKeypadCode(resolved.tap)
  if (resolved.hold) {
    legend.hold = formatHoldBadge(resolved.hold)
    legend.holdRef = resolved.hold
  }
  return legend
}

export function isBlankLayerBinding(node: KeyBindingNode): boolean {
  const value = String(node.value)
  return value === '&trans' || value === '&none'
}

export function composeLayerRows(
  bindings: KeyBindingNode[],
  hostView?: HostLegendView,
  layerView?: LayerView
): Array<{
  layer: number
  binding: KeyBindingNode
  legend: ComposedLegend | null
  blank: boolean
  raw: boolean
  title: string
}> {
  const layers = layerView ?? standardLayerView()
  const shown = effectiveShownLayers(layers, bindings.length)
  return shown.map(layer => {
    const binding = bindings[layer]
    const blank = isBlankLayerBinding(binding)
    const raw = layer === 0 && layers.layer0Raw
    return {
      layer,
      binding,
      blank,
      raw,
      title: encodeKeyBinding(binding),
      legend: blank || raw ? null : composeKey({ binding, hostView })
    }
  })
}

/**
 * AltGr and AltGr+Shift sit in one token, with no space.
 * A shown column with no glyph is `ˬ`, including `ˬˬ` when both columns are on.
 * The pair is omitted only when both column toggles are off.
 */
export function formatAltGrPair(
  column: Pick<ComposedLegendColumn, 'altGr' | 'altGrShift' | 'showAltGr' | 'showAltGrShift'>
): string | null {
  if (!column.showAltGr && !column.showAltGrShift) return null
  const alt = column.showAltGr ? column.altGr || ALT_LEVEL_EMPTY : ''
  const shift = column.showAltGrShift ? column.altGrShift || ALT_LEVEL_EMPTY : ''
  return `${alt}${shift}`
}

export type KeycapTone = 'base' | 'second'

export interface KeycapFaceGlyph {
  text: string
  /** Spacing mark for a `dead_*` keysym. */
  dead?: boolean
  /** AltGr or AltGr+Shift level. */
  alt: boolean
}

/** One language’s packed glyphs on the keycap face (empty levels omitted). */
export interface KeycapFacePack {
  tone: KeycapTone
  glyphs: KeycapFaceGlyph[]
}

/**
 * What the composed keycap face shows. Single fill algorithm for agents and UI:
 * non-empty glyphs per on-keycap language, then optional hold. No `ˬ`, no `/`.
 * Decode/table still use `ˬ` for empty editable levels — that is a different surface.
 */
export interface KeycapFace {
  packs: KeycapFacePack[]
  hold?: string
}

/** Left slot keeps its own tone. Two drawn languages use base then second so the pair can be told apart. */
function keycapTone(column: ComposedLegendColumn, drawn: readonly ComposedLegendColumn[]): KeycapTone {
  if (drawn.length < 2) return column.tone
  return drawn[0] === column ? 'base' : 'second'
}

function pushGlyph(
  glyphs: KeycapFaceGlyph[],
  text: string,
  alt: boolean,
  dead?: boolean
) {
  if (!text) return
  glyphs.push(dead ? { text, alt, dead: true } : { text, alt })
}

/**
 * Pack one on-keycap language: base, shift, AltGr, AltGr+Shift — skip empties.
 * When `letters` is false (matching pair on the earlier language), only AltGr levels.
 */
function packLanguage(
  column: ComposedLegendColumn,
  drawn: readonly ComposedLegendColumn[],
  letters: boolean
): KeycapFacePack | null {
  const glyphs: KeycapFaceGlyph[] = []
  if (letters) {
    pushGlyph(glyphs, column.pair[0] ?? '', false, column.pairDead[0])
    pushGlyph(glyphs, column.pair[1] ?? '', false, column.pairDead[1])
  }
  if (column.showAltGr) {
    pushGlyph(glyphs, column.altGr, true, column.altGrDead)
  }
  if (column.showAltGrShift) {
    pushGlyph(glyphs, column.altGrShift, true, column.altGrShiftDead)
  }
  if (glyphs.length === 0) return null
  return { tone: keycapTone(column, drawn), glyphs }
}

/**
 * Fill the composed keycap face.
 *
 * 1. Take on-keycap languages (at most two), left to right.
 * 2. For each, append non-empty levels in order: base, shift, AltGr, AltGr+Shift.
 *    If both languages share the same letter pair, the second skips base/shift.
 * 3. Drop a language that contributed no glyphs.
 * 4. Attach `legend.hold` when present (`⧗⌃`, …) — behavior chrome, not a host level.
 *
 * Never emit `ˬ` or `/`. The SPA only paints this face and scale-to-fits.
 */
export function keycapFace(legend: ComposedLegend): KeycapFace {
  const drawn = legend.columns.filter(column => column.onKeycap)
  const packs: KeycapFacePack[] = []
  if (drawn.length === 0) {
    return legend.hold ? { packs, hold: legend.hold } : { packs }
  }

  const left = drawn[0]!
  const right = drawn[1]
  const leftPair = `${left.pair[0]}${left.pair[1]}`
  const rightPair = right ? `${right.pair[0]}${right.pair[1]}` : ''
  const lettersMatch = Boolean(right && leftPair && leftPair === rightPair)

  const leftPack = packLanguage(left, drawn, true)
  if (leftPack) packs.push(leftPack)
  if (right) {
    const rightPack = packLanguage(right, drawn, !lettersMatch)
    if (rightPack) packs.push(rightPack)
  }

  return legend.hold ? { packs, hold: legend.hold } : { packs }
}

/** Compact face string for tests and debug (`5% (5[⅜`, `kK ĸ& ⧗⇧`). */
export function formatKeycapFace(face: KeycapFace): string {
  const body = face.packs.map(pack => pack.glyphs.map(glyph => glyph.text).join('')).join(' ')
  return face.hold ? `${body} ${face.hold}`.trim() : body
}

/** @deprecated Prefer `keycapFace`. Level-shaped blocks kept for golden snapshots. */
export interface KeycapSlot {
  text: string
  dead?: boolean
}

/** @deprecated Prefer `keycapFace`. */
export interface KeycapColumn {
  tone: KeycapTone
  slots: readonly [KeycapSlot, KeycapSlot, KeycapSlot, KeycapSlot]
}

function keycapSlot(text: string, dead?: boolean): KeycapSlot {
  if (!text) return { text: '' }
  return dead ? { text, dead: true } : { text }
}

/**
 * @deprecated Prefer `keycapFace` for anything painted on the board.
 * Level-aligned blocks (empty levels as `''`) for golden / migration only.
 */
export function keycapColumns(legend: ComposedLegend): KeycapColumn[] {
  const drawn = legend.columns.filter(column => column.onKeycap)
  if (drawn.length === 0) return []

  const left = drawn[0]!
  const right = drawn[1]
  const leftPair = `${left.pair[0]}${left.pair[1]}`
  const rightPair = right ? `${right.pair[0]}${right.pair[1]}` : ''
  const lettersMatch = Boolean(right && leftPair && leftPair === rightPair)

  const block = (
    column: ComposedLegendColumn,
    letters: boolean
  ): KeycapColumn => ({
    tone: keycapTone(column, drawn),
    slots: [
      keycapSlot(letters ? column.pair[0] ?? '' : '', letters && column.pairDead[0]),
      keycapSlot(letters ? column.pair[1] ?? '' : '', letters && column.pairDead[1]),
      keycapSlot(column.showAltGr ? column.altGr || '' : '', Boolean(column.altGr && column.altGrDead)),
      keycapSlot(
        column.showAltGrShift ? column.altGrShift || '' : '',
        Boolean(column.altGrShift && column.altGrShiftDead)
      )
    ]
  })

  if (!right) return [block(left, true)]
  return [block(left, true), block(right, !lettersMatch)]
}

export interface MultilangKeycapLine {
  language: HostLanguageId
  /** One language, including columns the two-slot keycap left off. */
  legend: ComposedLegend
}

/**
 * One face per host column, in column order.
 * Languages the eye hid and languages past the two-slot keycap stay in the list,
 * and an empty glyph still keeps its row, so every host character key lines up.
 * Null when the tap is not a host character.
 */
export function multilangKeycapLines(
  binding: KeyBindingNode,
  view?: HostLegendView
): MultilangKeycapLine[] | null {
  const resolved = resolveBinding(binding)
  if (resolved.tap == null) return null
  const id = hostKeyByZmk(resolved.tap)
  if (!id) return null
  const columns = resolveHostColumns(view ?? standardHostLegendView())
  if (columns.length === 0) return null
  const hold = resolved.hold ? formatHoldBadge(resolved.hold) : undefined
  const keypad = isKeypadCode(resolved.tap)
  return columns.map((column, index) => {
    const composed = composeColumn(column, id.zmk)
    const face = composed ? { ...composed, onKeycap: true, tone: 'base' as const } : null
    const legend: ComposedLegend = {
      columns: face ? [face] : [],
      ...(index === 0 && hold ? { hold } : {}),
      ...(keypad ? { keypad: true } : {})
    }
    return { language: column.language, legend }
  })
}

export interface LegendDecodeSlot {
  text: string
  /** True when this current-row cell differs from the language's primary system. */
  differs: boolean
  /** Spacing glyph for a `dead_*` keysym (not a composed character). */
  dead: boolean
}

export interface LegendDecodeColumn {
  language: HostLanguageId
  /** Same flag as the host-legend strip for the column's current layout. */
  flag: string
  slots: [LegendDecodeSlot, LegendDecodeSlot, LegendDecodeSlot, LegendDecodeSlot]
}

/** Full host decode for a composed-row tooltip: ids + optional system/current grid. */
export interface LegendDecodeCard {
  binding: string
  keycode?: string
  vk?: string
  evdevName?: string
  hold?: string
  current: LegendDecodeColumn[]
  /** Omitted when every shown language matches its primary system layout. */
  system: LegendDecodeColumn[] | null
}

export function formatDecodeWord(column: Pick<LegendDecodeColumn, 'slots'>): string {
  return column.slots.map(slot => slot.text).join('')
}

function decodeSlot(keysym: string): LegendDecodeSlot {
  const display = hostLevelDisplay(keysym)
  return {
    text: display.text || ALT_LEVEL_EMPTY,
    differs: false,
    dead: display.dead
  }
}

/** Decode grid from stored keysyms so `dead_*` shows its spacing mark. */
function slotsFromKeyLevels(levels: HostKeyLevels): LegendDecodeColumn['slots'] {
  return [
    decodeSlot(levels.keysyms[0]),
    decodeSlot(levels.keysyms[1]),
    decodeSlot(levels.keysyms[2]),
    decodeSlot(levels.keysyms[3])
  ]
}

/** Character keys and dead-key keys; skip pure modifiers (`Multi_key`, level3). */
function levelsBelongInDecode(levels: HostKeyLevels): boolean {
  return hostDisplayLevels(levels) != null
}

function emptySlots(): LegendDecodeColumn['slots'] {
  return [
    { text: ALT_LEVEL_EMPTY, differs: false, dead: false },
    { text: ALT_LEVEL_EMPTY, differs: false, dead: false },
    { text: ALT_LEVEL_EMPTY, differs: false, dead: false },
    { text: ALT_LEVEL_EMPTY, differs: false, dead: false }
  ]
}

function markDiffs(
  current: LegendDecodeColumn[],
  system: LegendDecodeColumn[]
): { current: LegendDecodeColumn[]; system: LegendDecodeColumn[] | null } {
  let any = false
  const marked = current.map(column => {
    const baseline = system.find(item => item.language === column.language)
    if (!baseline) return column
    const slots = column.slots.map((slot, index) => {
      const base = baseline.slots[index]
      const differs = slot.text !== base.text || slot.dead !== base.dead
      if (differs) any = true
      return { ...slot, differs }
    }) as LegendDecodeColumn['slots']
    return { ...column, slots }
  })
  return { current: marked, system: any ? system : null }
}

/**
 * Identifiers plus a 4-level grid per shown language.
 * The faded system row is the language's primary OS layout (`us` / `winkeys`).
 */
export function composeLegendDecode(
  binding: KeyBindingNode,
  view?: HostLegendView
): LegendDecodeCard {
  const resolved = resolveBinding(binding)
  const host = resolved.tap ? hostKeyByZmk(resolved.tap) : undefined
  const card: LegendDecodeCard = {
    binding: encodeKeyBinding(binding),
    keycode: host ? `KC_${host.zmk}` : undefined,
    vk: host?.vk,
    evdevName: host?.evdevName,
    hold: resolved.hold ? formatHoldBadge(resolved.hold) : undefined,
    current: [],
    system: null
  }
  if (!host) return card

  const hostView = view ?? standardHostLegendView()
  const current: LegendDecodeColumn[] = []
  const system: LegendDecodeColumn[] = []
  for (const column of resolveHostColumns(hostView).filter(item => item.shown)) {
    const levels = hostLevels(column.layoutId, host.zmk)
    if (!levels || !levelsBelongInDecode(levels)) continue
    current.push({
      language: column.language,
      flag: column.flag,
      slots: slotsFromKeyLevels(levels)
    })
    const primary = hostLayoutShelves(column.language).primary
    const sysLevels = primary ? hostLevels(primary.id, host.zmk) : undefined
    system.push({
      language: column.language,
      flag: column.flag,
      slots:
        sysLevels && levelsBelongInDecode(sysLevels)
          ? slotsFromKeyLevels(sysLevels)
          : emptySlots()
    })
  }
  const compared = markDiffs(current, system)
  card.current = compared.current
  card.system = compared.system
  return card
}

/**
 * Fill empty editable columns for shown languages that `composeLegendDecode`
 * skipped because the layout has no record for the key, when the system
 * primary still has glyphs. Keeps the hover-only decode snapshot unchanged
 * (golden) while the edit card can open a missing key.
 */
export function withEditableLegendDecodeGaps(
  card: LegendDecodeCard,
  view?: HostLegendView
): LegendDecodeCard {
  if (!card.keycode) return card
  const zmk = card.keycode.replace(/^KC_/, '')
  const hostView = view ?? standardHostLegendView()
  const shown = resolveHostColumns(hostView).filter(item => item.shown)
  const current = [...card.current]
  const system = [...(card.system ?? [])]
  let changed = false
  for (const column of shown) {
    if (current.some(item => item.language === column.language)) continue
    if (hostLevels(column.layoutId, zmk)) continue
    const primary = hostLayoutShelves(column.language).primary
    const sysLevels = primary ? hostLevels(primary.id, zmk) : undefined
    if (!sysLevels) continue
    current.push({ language: column.language, flag: column.flag, slots: emptySlots() })
    if (!system.some(item => item.language === column.language)) {
      system.push({
        language: column.language,
        flag: column.flag,
        slots: slotsFromKeyLevels(sysLevels)
      })
    }
    changed = true
  }
  if (!changed) return card
  const order = shown.map(column => column.language)
  const byLanguage = (columns: LegendDecodeColumn[]) =>
    [...columns].sort(
      (a, b) => order.indexOf(a.language) - order.indexOf(b.language)
    )
  const compared = markDiffs(byLanguage(current), byLanguage(system))
  return { ...card, current: compared.current, system: compared.system }
}
