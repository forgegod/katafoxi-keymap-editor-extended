import {
  isModifierWrapCode,
  modifierHoldForKey,
  modifierHoldForWrap,
  modifierRoleGlyph,
  modifierSide,
  MODIFIER_ROLE_GLYPH
} from './modifiers.js'
import { encodeKeyBinding } from './keymap.js'
import { hostKeyByZmk } from './host-key-id.js'
import { ALT_LEVEL_EMPTY, hostComposeGlyphs, type HostLevels } from './host-layout.js'
import { hostLayoutShelves } from './host-layout-registry.js'
import { hostLayoutMeta, hostLevels } from './host-layout-registry.js'
import { standardHostLegendView } from './host-legend-view.js'
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
  const base = glyph || prefixedCommandLegend(rawCode) || rawCode
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

export interface ResolvedHostColumn {
  language: HostLanguageId
  layoutId: string
  visible: boolean
  altGr: boolean
  altGrShift: boolean
  /** D9: letter pair is drawn on the keycap (visible base, or the open extra). */
  onKeycap: boolean
  /** Table: base is always wide; an extra is wide when it is open and visible. */
  wide: boolean
  tone: ComposedLegendColumn['tone']
  flag: string
}

/** View columns with layout metadata and the D9 keycap flag. */
export function resolveHostColumns(view: HostLegendView): ResolvedHostColumn[] {
  return view.columns.map((column, index): ResolvedHostColumn => {
    const extraOpen = view.open === column.language && column.visible
    const isBase = index === 0
    return {
      language: column.language,
      layoutId: column.layoutId,
      visible: column.visible,
      altGr: column.altGr,
      altGrShift: column.altGrShift,
      onKeycap: isBase ? column.visible : extraOpen,
      wide: isBase || extraOpen,
      tone: isBase ? 'base' : 'second',
      flag: hostLayoutMeta(column.layoutId)?.flag ?? ''
    }
  })
}

function composeColumn(
  resolved: ResolvedHostColumn,
  zmk: string
): ComposedLegendColumn | null {
  const levels = hostComposeGlyphs(hostLevels(resolved.layoutId, zmk))
  if (!levels || levels[0] === '') return null
  return {
    language: resolved.language,
    tone: resolved.tone,
    pair: [levels[0], levels[1]],
    altGr: resolved.altGr ? levels[2] : '',
    altGrShift: resolved.altGrShift ? levels[3] : '',
    showAltGr: resolved.altGr,
    showAltGrShift: resolved.altGrShift,
    onKeycap: resolved.onKeycap
  }
}

/**
 * N-column host legend for a ZMK token. Unknown ids and non-character
 * keys return null. Hidden extras are omitted; a hidden base stays so
 * AltGr collapse can still see it.
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

/** AltGr pair used to decide bilingual collapse. Empty glyphs stay empty. */
function shownAltPair(
  column: Pick<ComposedLegendColumn, 'altGr' | 'altGrShift' | 'showAltGr' | 'showAltGrShift'>
): string {
  const left = column.showAltGr ? column.altGr : ''
  const right = column.showAltGrShift ? column.altGrShift : ''
  if (!left && !right) return ''
  return `${column.showAltGr ? left || ALT_LEVEL_EMPTY : ''}${
    column.showAltGrShift ? right || ALT_LEVEL_EMPTY : ''
  }`
}

export type KeycapTone = 'base' | 'second'

export interface KeycapPiece {
  text: string
  /** Language color. `null` is shared by both languages, or the `/` between them. */
  tone: KeycapTone | null
}

export interface KeycapColumn {
  kind: 'letters' | 'alt'
  pieces: KeycapPiece[]
}

/**
 * What one keycap line shows, left to right.
 * D9: only the visible base and the open extra are drawn.
 * A second-language case pair equal to the first is drawn once.
 * Diverging AltGr pairs stay one column, each half in its language color.
 */
export function keycapColumns(legend: ComposedLegend): KeycapColumn[] {
  const columns: KeycapColumn[] = []
  const letters = legend.columns.filter(column => column.onKeycap)
  let firstPair = ''
  for (const column of letters) {
    const text = `${column.pair[0]}${column.pair[1]}`
    if (!text || text === firstPair) continue
    if (!firstPair) firstPair = text
    columns.push({ kind: 'letters', pieces: [{ text, tone: column.tone }] })
  }

  const base = legend.columns.find(column => column.tone === 'base')
  const extra = legend.columns.find(column => column.tone === 'second' && column.onKeycap)
  const baseAltOn = Boolean(base && (base.showAltGr || base.showAltGrShift))
  const extraAltOn = Boolean(extra && (extra.showAltGr || extra.showAltGrShift))
  if (base && extra && baseAltOn && extraAltOn) {
    const baseAlt = shownAltPair(base)
    const extraAlt = shownAltPair(extra)
    if (baseAlt !== extraAlt) {
      const pieces: KeycapPiece[] = [
        { text: baseAlt, tone: 'base' },
        { text: '/', tone: null },
        { text: extraAlt, tone: 'second' }
      ]
      columns.push({ kind: 'alt', pieces: pieces.filter(piece => piece.text !== '') })
      return columns
    }
  }
  const altSource = extra && extraAltOn && !baseAltOn ? extra : base
  if (altSource) {
    const alt = formatAltGrPair(altSource)
    if (alt) columns.push({ kind: 'alt', pieces: [{ text: alt, tone: null }] })
  }
  return columns
}

export interface LegendDecodeSlot {
  text: string
  /** True when this current-row cell differs from the language's primary system. */
  differs: boolean
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

function slotsFromLevels(levels: HostLevels): LegendDecodeColumn['slots'] {
  return [
    { text: levels[0] || ALT_LEVEL_EMPTY, differs: false },
    { text: levels[1] || ALT_LEVEL_EMPTY, differs: false },
    { text: levels[2] || ALT_LEVEL_EMPTY, differs: false },
    { text: levels[3] || ALT_LEVEL_EMPTY, differs: false }
  ]
}

function emptySlots(): LegendDecodeColumn['slots'] {
  return [
    { text: ALT_LEVEL_EMPTY, differs: false },
    { text: ALT_LEVEL_EMPTY, differs: false },
    { text: ALT_LEVEL_EMPTY, differs: false },
    { text: ALT_LEVEL_EMPTY, differs: false }
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
      const differs = slot.text !== baseline.slots[index].text
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
  for (const column of resolveHostColumns(hostView).filter(item => item.onKeycap)) {
    const levels = hostComposeGlyphs(hostLevels(column.layoutId, host.zmk))
    if (!levels) continue
    current.push({ language: column.language, flag: column.flag, slots: slotsFromLevels(levels) })
    const primary = hostLayoutShelves(column.language).primary
    const sysLevels = primary ? hostComposeGlyphs(hostLevels(primary.id, host.zmk)) : undefined
    system.push({
      language: column.language,
      flag: column.flag,
      slots: sysLevels ? slotsFromLevels(sysLevels) : emptySlots()
    })
  }
  const compared = markDiffs(current, system)
  card.current = compared.current
  card.system = compared.system
  return card
}
