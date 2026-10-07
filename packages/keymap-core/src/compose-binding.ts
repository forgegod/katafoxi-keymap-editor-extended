import {
  isModifierWrapCode,
  isRAltCode,
  isShiftKeyCode,
  modifierHoldForKey,
  modifierHoldForWrap,
  modifierRoleGlyph,
  modifierSide,
  MODIFIER_ROLE_GLYPH
} from './modifiers.js'
import { keycodeGlyphLabel, keypadGlyphLabel } from './keycode-labels.js'
import { getBehaviorCatalog } from './catalog.js'
import { encodeKeyBinding } from './keymap.js'
import {
  defaultRgbLayerHsb,
  hsbToCss,
  isRgbLayerRecipeCode,
  parseHsbBindingNode,
  type HsbColor
} from './behavior-recipes.js'
import type {
  HoldRef,
  KeyBindingNode,
  ResolvedBinding,
  ZmkConditionalLayer
} from './types.js'

/** Compact layer index for key legends (`1` → `L1`). Binding value stays numeric. */
export function layerLegendSymbol(index: number | string): string {
  return `L${index}`
}

const LAYER_REF_BEHAVIORS = new Set(['&mo', '&to', '&tog', '&sl', '&lt', '&rgblayer'])

function isLayerParam(value: string | number | undefined | null, layer: number): boolean {
  if (value == null || value === '') return false
  if (Number(value) === layer) return true
  const raw = String(value).toUpperCase()
  return raw === layerLegendSymbol(layer).toUpperCase()
}

/**
 * A two-argument behaviour the stock catalog does not know.
 * Named hold-taps (`&hm LCTRL A`) are this shape until they are edited.
 */
function isUnknownHoldTap(node: KeyBindingNode): boolean {
  const behavior = String(node.value ?? '')
  if (!behavior.startsWith('&') || isHoldTapBehavior(behavior)) return false
  // Recipe macros are two-param but not hold-taps.
  if (behavior === '&rgblayer') return false
  if (getBehaviorCatalog().byCode[behavior]) return false
  return (node.params?.length ?? 0) === 2
}

const TRANS_BINDING: KeyBindingNode = { value: '&trans', params: [] }

function shiftedLayerToken(
  value: string | number,
  nextIndex: number
): string | number {
  if (typeof value === 'number') return nextIndex
  if (/^L\d+$/i.test(String(value))) {
    const prefix = String(value).startsWith('l') ? 'l' : 'L'
    return `${prefix}${nextIndex}`
  }
  return String(nextIndex)
}

/**
 * Shift `&mo` / `&lt` / `&to` / `&tog` / `&sl` layer arguments after a
 * layer is removed. A ref to the deleted layer becomes `&trans`.
 */
export const LAYER_REF_CLEARED_NOTE =
  'Bindings that pointed at the deleted layer became transparent.'

export function remapLayerRefBindingAfterDelete(
  node: KeyBindingNode,
  deleted: number
): { node: KeyBindingNode; cleared: boolean } {
  const behavior = String(node.value)
  if (LAYER_REF_BEHAVIORS.has(behavior)) {
    const layer = parseHoldLayer(node.params[0]?.value)
    if (layer === deleted) return { node: TRANS_BINDING, cleared: true }
    if (layer != null && layer > deleted) {
      const first = node.params[0]!
      return {
        node: {
          value: node.value,
          params: [
            { value: shiftedLayerToken(first.value, layer - 1), params: first.params },
            ...node.params.slice(1)
          ]
        },
        cleared: false
      }
    }
  }
  let cleared = false
  const params = (node.params ?? []).map(child => {
    const inner = remapLayerRefBindingAfterDelete(child, deleted)
    if (inner.cleared) cleared = true
    return inner.node
  })
  return { node: { value: node.value, params }, cleared }
}

/** True when the bind names layer N (`&mo 1`, `&lt 1 A`, `&to 0`). */
export function bindingReferencesLayer(node: KeyBindingNode, layer: number): boolean {
  const behavior = String(node.value)
  if (LAYER_REF_BEHAVIORS.has(behavior) && isLayerParam(node.params[0]?.value, layer)) {
    return true
  }
  if (isUnknownHoldTap(node) && isLayerParam(node.params[0]?.value, layer)) return true
  return (node.params ?? []).some(child => bindingReferencesLayer(child, layer))
}

/** True when the bind is RAlt / `RA()` — the key that produces AltGr. */
export function bindingSendsAltGr(node: KeyBindingNode): boolean {
  const behavior = String(node.value)
  if (behavior === '&kp') return isRAltCode(node.params[0]?.value)
  if (behavior === '&mt' || isUnknownHoldTap(node)) return isRAltCode(node.params[0]?.value)
  if (isRAltCode(behavior)) return true
  return (node.params ?? []).some(bindingSendsAltGr)
}

/** True when the bind is a Shift key (`LSHFT` / `RSHFT` / `&mt LSHIFT`). Not `LS(A)`. */
export function bindingSendsShift(node: KeyBindingNode): boolean {
  const behavior = String(node.value)
  if (behavior === '&kp') return isShiftKeyCode(node.params[0]?.value)
  if (behavior === '&mt' || isUnknownHoldTap(node)) return isShiftKeyCode(node.params[0]?.value)
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

export function isLayerLegendSymbol(text: string): boolean {
  return /^L\d+$/.test(text)
}

/** Role glyphs shared by L/R modifiers. Right side is prefixed at display time. */
const ROLE_GLYPHS = new Set(Object.values(MODIFIER_ROLE_GLYPH))

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

/** Compact board face for `&rgblayer` — layer mark + underglow CSS (no DTS token). */
export type RgbLayerLegend = {
  layer: number
  layerLabel: string
  color: HsbColor
  css: string
}

export function rgbLayerLegend(node: KeyBindingNode): RgbLayerLegend | null {
  if (!isRgbLayerRecipeCode(node.value)) return null
  const layer = parseHoldLayer(node.params[0]?.value)
  if (layer == null) return null
  const color =
    parseHsbBindingNode(node.params[1]) ??
    parseHsbBindingNode(node.params[2]) ??
    defaultRgbLayerHsb(layer)
  return {
    layer,
    layerLabel: layerLegendSymbol(layer),
    color,
    css: hsbToCss(color)
  }
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

/** Stock hold-tap, or an unknown two-argument behaviour such as `&hm`. */
export function isHoldTapBinding(node: {
  value?: string | number
  params?: unknown[]
}): boolean {
  if (isHoldTapBehavior(node.value) && (node.params?.length ?? 0) === 2) return true
  return isUnknownHoldTap(node as KeyBindingNode)
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
  // Legend shows RGB + layer hold; behaviour code stays off the cap.
  if (value === '&rgblayer') return 'hidden'
  if ((value === '&bt' || value === '&out') && (opts?.paramCount ?? 0) > 0) return 'hidden'
  if (opts?.holdTapVisible) return 'hidden'
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

  // &mt hold_mod tap_keycode. A named hold-tap uses the same split
  // unless its first argument is a bare layer index.
  if (behavior === '&mt' || (isUnknownHoldTap(node) && parseHoldLayer(node.params[0]?.value) == null)) {
    const hold = node.params[0]?.value
    const tap = node.params[1]?.value
    return {
      tap: tap != null ? String(tap) : null,
      hold: hold != null && hold !== '' ? { kind: 'mod', code: String(hold) } : undefined
    }
  }

  // &lt layer tap_keycode. A named hold-tap with a numeric first argument too.
  if (behavior === '&lt' || isUnknownHoldTap(node)) {
    const layer = parseHoldLayer(node.params[0]?.value)
    const tap = node.params[1]?.value
    return {
      tap: tap != null ? String(tap) : null,
      hold: layer != null ? { kind: 'layer', layer } : undefined
    }
  }

  // Momentary layer + underglow: not a host character; ZmkLegend paints L{n}+swatch.
  if (behavior === '&rgblayer') {
    const layer = parseHoldLayer(node.params[0]?.value)
    return {
      tap: null,
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

/**
 * Layer that stays active only while this key is down.
 * `&mo` and `&lt` qualify. `&to`, `&tog`, and `&sl` release the key.
 */
function physicallyHeldLayer(node: KeyBindingNode): number | null {
  const behavior = String(node.value)
  if (behavior !== '&mo' && behavior !== '&lt' && behavior !== '&rgblayer') return null
  return parseHoldLayer(node.params[0]?.value) ?? null
}

/** Title for a then-layer face that cannot fire because this key is already held. */
export const CONDITIONAL_OCCUPIED_NOTE = 'Already held, so this binding does not fire'

/**
 * Then-layer rows on this key that do not fire while a conditional layer is
 * showing: another row on the same key is held to keep an if-layer active.
 * The hold's own row is left alone. A second activator elsewhere can still
 * reach the marked binding; the mark is about this key's hold.
 */
export function conditionalOccupiedLayers(
  bindings: readonly KeyBindingNode[],
  rules: readonly Pick<ZmkConditionalLayer, 'ifLayers' | 'thenLayer'>[]
): Set<number> {
  const occupied = new Set<number>()
  if (rules.length === 0) return occupied
  for (let layer = 0; layer < bindings.length; layer++) {
    const binding = bindings[layer]
    if (!binding) continue
    const held = physicallyHeldLayer(binding)
    if (held == null) continue
    for (const rule of rules) {
      if (!rule.ifLayers.includes(held)) continue
      if (rule.thenLayer === layer) continue
      if (rule.thenLayer < 0 || rule.thenLayer >= bindings.length) continue
      occupied.add(rule.thenLayer)
    }
  }
  return occupied
}

export function formatHoldBadge(hold: HoldRef): string {
  if (hold.kind === 'layer') return `⧗${layerLegendSymbol(hold.layer)}`
  const info = modifierHoldForKey(hold.code) ?? modifierHoldForWrap(hold.code)
  if (!info) return `⧗${hold.code}`
  return `⧗${keycapLegend(hold.code, modifierRoleGlyph(info.role))}`
}

export function isBlankLayerBinding(node: KeyBindingNode): boolean {
  const value = String(node.value)
  return value === '&trans' || value === '&none'
}

/** Hover mark for a blank layer row: passthrough vs silent. */
export function blankRowMark(binding: KeyBindingNode): string {
  return String(binding.value) === '&trans' ? '↓' : '∅'
}

/** Spoken label for a stacked layer slot, including held-layer occupancy. */
export function layerRowAriaLabel(
  row: { layer: number; title: string; binding: KeyBindingNode },
  occupied: boolean
): string {
  const title = row.title || encodeKeyBinding(row.binding)
  const code = String(row.binding.value)
  const base =
    code === '&trans'
      ? `${title}, layer ${row.layer}, passes through`
      : code === '&none'
        ? `${title}, layer ${row.layer}, silent`
        : `${title}, layer ${row.layer}`
  return occupied ? `${base}, already held` : base
}
