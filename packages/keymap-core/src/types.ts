export interface KeyBindingNode {
  value: string | number
  params: KeyBindingNode[]
}

export interface ParsedKeymap {
  keyboard?: string
  keymap?: string
  layout?: string
  layer_names?: string[]
  layers: KeyBindingNode[][]
  [key: string]: unknown
}

export interface LayoutKey {
  x: number
  y: number
  u?: number
  w?: number
  h?: number
  r?: number
  rx?: number
  ry?: number
  row?: number
  col?: number
  label?: string
}

export interface BehaviorDef {
  code: string
  includes?: string[]
  params?: unknown[]
  commands?: Array<{ code: string; additionalParams?: unknown[] }>
  [key: string]: unknown
}

export interface KeycodeDef {
  names: string[]
  description?: string
  context?: string
  symbol?: string
  faIcon?: string
  [key: string]: unknown
}

export interface NormalizedKeycode {
  code: string
  aliases: string[]
  description?: string
  context?: string
  symbol?: string
  faIcon?: string
  params: string[]
  isModifier: boolean
}

/** LARK-style host legend: four glyph slots + optional hold annotation. */
export interface ComposedLegend {
  /** Slot 1–2: base / shifted with language (e.g. a + Ф) */
  primary: [string, string]
  /** Slot 3–4: AltGr / AltGr+Shift (e.g. @ + α) */
  altGr: [string, string]
  /** Hold-tap or home-row mod annotation (e.g. ⧗LC) */
  hold?: string
  /** When EN/RU diverge (e.g. Δτ/ёЁ) */
  bilingualNote?: string
  /** Firmware keycode that produced this (gray in LARK sheet) */
  keycode?: string
  /** Tap is HID keypad (`KP_*`); UI boxes the glyph, host text stays `7`. */
  keypad?: boolean
}

/** Tap/hold extracted from a ZMK binding node (before host lookup). */
export interface ResolvedBinding {
  /** Keycode sent on tap, if any (`A`, `ESC`, …). */
  tap: string | null
  /** Hold side: modifier, layer id, etc. (`LCTRL`, `1`, …). */
  hold?: string
}

/**
 * Input to the compose stub. Prefer `binding`; host profiles come later.
 * `hostProfile` is reserved and ignored until HostLayout exists.
 */
export interface ComposeKeyInput {
  binding: KeyBindingNode
  hostProfile?: string
}
