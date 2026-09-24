export type ModifierRole = 'ctrl' | 'shift' | 'alt' | 'gui'

export interface ModifierHold {
  wrap: string
  key: string
  role: ModifierRole
  side: 'L' | 'R'
}

export const MOD_WRAP_RE = /^(L|R)(C|S|A|G)$/i

export const MOD_KEY_RE =
  /^(L|R)(CTRL|CONTROL|SHIFT|SHFT|ALT|CMD|GUI|WIN|META)$/i

/** Role glyph only; right side is prefixed at display time. */
export const MODIFIER_ROLE_GLYPH: Record<ModifierRole, string> = {
  ctrl: '⌃',
  shift: '⇧',
  alt: '⌥',
  gui: '⌘'
}

export function modifierRoleGlyph(role: ModifierRole): string {
  return MODIFIER_ROLE_GLYPH[role]
}

/** Hold-bar order: left then right, Shift → Ctrl → Alt → GUI. */
export const MODIFIER_HOLDS: ModifierHold[] = [
  { wrap: 'LS', key: 'LSHFT', role: 'shift', side: 'L' },
  { wrap: 'LC', key: 'LCTRL', role: 'ctrl', side: 'L' },
  { wrap: 'LA', key: 'LALT', role: 'alt', side: 'L' },
  { wrap: 'LG', key: 'LCMD', role: 'gui', side: 'L' },
  { wrap: 'RS', key: 'RSHFT', role: 'shift', side: 'R' },
  { wrap: 'RC', key: 'RCTRL', role: 'ctrl', side: 'R' },
  { wrap: 'RA', key: 'RALT', role: 'alt', side: 'R' },
  { wrap: 'RG', key: 'RCMD', role: 'gui', side: 'R' }
]

const HOLD_BY_WRAP = new Map(
  MODIFIER_HOLDS.map(hold => [hold.wrap, hold] as const)
)
const HOLD_BY_KEY = new Map(MODIFIER_HOLDS.map(hold => [hold.key, hold] as const))

/** Canonical hold key for aliases (`LSHIFT` → `LSHFT`). */
const MODIFIER_KEY_ALIASES: Record<string, string> = {
  LSHIFT: 'LSHFT',
  LEFT_SHIFT: 'LSHFT',
  RSHIFT: 'RSHFT',
  RIGHT_SHIFT: 'RSHFT',
  LCONTROL: 'LCTRL',
  LEFT_CONTROL: 'LCTRL',
  RCONTROL: 'RCTRL',
  RIGHT_CONTROL: 'RCTRL',
  LGUI: 'LCMD',
  LWIN: 'LCMD',
  LMETA: 'LCMD',
  RGUI: 'RCMD',
  RWIN: 'RCMD',
  RMETA: 'RCMD'
}

/** Outer-first nest: LC(LS(A)) — Ctrl, then Shift, Alt, GUI. */
const OUTER_ROLE_ORDER: Record<ModifierRole, number> = {
  ctrl: 0,
  shift: 1,
  alt: 2,
  gui: 3
}

export function modifierSide(code: string): 'L' | 'R' | '' {
  if (
    /^R(IGHT)?([A-Z_]|$)/i.test(code) ||
    /^(RCMD|RALT|RCTRL|RGUI|RWIN|RMETA|RSHIFT|RSHFT)$/i.test(code)
  ) {
    return 'R'
  }
  if (
    /^L(EFT)?([A-Z_]|$)/i.test(code) ||
    /^(LCMD|LALT|LCTRL|LGUI|LWIN|LMETA|LSHIFT|LSHFT)$/i.test(code)
  ) {
    return 'L'
  }
  return ''
}

export function isModifierWrapCode(
  code: string | number | undefined | null
): boolean {
  return MOD_WRAP_RE.test(String(code ?? ''))
}

export function modifierHoldForWrap(
  wrap: string | number | undefined
): ModifierHold | undefined {
  return HOLD_BY_WRAP.get(String(wrap ?? '').toUpperCase())
}

export function modifierHoldForKey(
  key: string | number | undefined
): ModifierHold | undefined {
  const code = String(key ?? '').toUpperCase()
  return HOLD_BY_KEY.get(code) ?? HOLD_BY_KEY.get(MODIFIER_KEY_ALIASES[code])
}

/** TARGET_SYSTEM: left role glyph unmarked, right side `R⌃` / `R⌥` / `R⌘` / `R⇧`. */
export function modifierHoldLegend(hold: ModifierHold): string {
  const glyph = modifierRoleGlyph(hold.role)
  return hold.side === 'R' ? `R${glyph}` : glyph
}

export function sortModifierWraps(wraps: Iterable<string>): string[] {
  return [...wraps].sort((a, b) => {
    const ha = modifierHoldForWrap(a)
    const hb = modifierHoldForWrap(b)
    const ra = ha ? OUTER_ROLE_ORDER[ha.role] : 99
    const rb = hb ? OUTER_ROLE_ORDER[hb.role] : 99
    if (ra !== rb) return ra - rb
    return (ha?.side === 'R' ? 1 : 0) - (hb?.side === 'R' ? 1 : 0)
  })
}

/** One wrap per role; last side wins. */
export function normalizeModifierWraps(wraps: Iterable<string>): string[] {
  const byRole = new Map<ModifierRole, string>()
  for (const wrap of wraps) {
    const hold = modifierHoldForWrap(wrap)
    if (hold) byRole.set(hold.role, hold.wrap)
  }
  return sortModifierWraps(byRole.values())
}

export function canApplyModifierHold(
  wrapCode: string,
  terminal?: string | number
): boolean {
  const wrapHold = modifierHoldForWrap(wrapCode)
  const keyHold = modifierHoldForKey(terminal)
  if (!wrapHold || !keyHold) return true
  return wrapHold.role !== keyHold.role
}

export function wrapsCompatibleWithTerminal(
  wraps: Iterable<string>,
  terminal?: string | number
): string[] {
  const normalized = normalizeModifierWraps(wraps)
  const keyHold = modifierHoldForKey(terminal)
  if (!keyHold) return normalized
  return normalized.filter(wrap => modifierHoldForWrap(wrap)?.role !== keyHold.role)
}

export function toggleModifierWraps(
  wraps: Iterable<string>,
  wrapCode: string,
  terminal?: string | number
): string[] {
  const hold = modifierHoldForWrap(wrapCode)
  if (!hold) return wrapsCompatibleWithTerminal(wraps, terminal)
  const current = wrapsCompatibleWithTerminal(wraps, terminal)
  if (current.includes(hold.wrap)) {
    return current.filter(wrap => wrap !== hold.wrap)
  }
  if (!canApplyModifierHold(wrapCode, terminal)) return current
  return wrapsCompatibleWithTerminal([...current, hold.wrap], terminal)
}

export interface ModifierChainNode {
  value?: string | number
  params?: ModifierChainNode[]
}

export function readModifierChain<T extends ModifierChainNode>(
  node: T | undefined
): { wraps: string[]; terminal: T | undefined } {
  const wraps: string[] = []
  let current = node
  while (current && isModifierWrapCode(current.value)) {
    wraps.push(String(current.value).toUpperCase())
    current = (current.params?.[0] as T | undefined) ?? undefined
  }
  return { wraps: normalizeModifierWraps(wraps), terminal: current }
}

export function writeModifierChain<T extends ModifierChainNode>(
  wraps: Iterable<string>,
  terminal: T | undefined,
  makeNode: (value: string | number | undefined, params: T[]) => T
): T {
  const ordered = wrapsCompatibleWithTerminal(wraps, terminal?.value)
  let node = terminal ?? makeNode(undefined, [])
  for (let i = ordered.length - 1; i >= 0; i--) {
    node = makeNode(ordered[i], [node])
  }
  return node
}
