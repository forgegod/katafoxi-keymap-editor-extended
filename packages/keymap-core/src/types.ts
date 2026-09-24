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
  commands?: Array<{ code: string; symbol?: string; additionalParams?: unknown[] }>
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

/** LARK-style host legend: language columns + optional hold annotation. */
export interface ComposedLegend {
  /** First language: level 1 + Shift (`eE`) */
  en: [string, string]
  /** Second language pair, or `null` when declined */
  second: [string, string] | null
  /** AltGr of the base layout; empty when hidden or NoSymbol */
  altGr: string
  /** AltGr+Shift of the base layout; empty when hidden or NoSymbol */
  altGrShift: string
  /** Hold-tap or home-row mod annotation (e.g. ⧗LC) */
  hold?: string
  /** When EN/RU AltGr pairs diverge (e.g. Δτ/ёЁ) */
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
 * Which host layouts fill the composed legend.
 * `source` records whether this is the LARK preset or the user's own pick.
 * It does not change glyphs by itself.
 */
export interface HostLegendView {
  baseId: string
  /** Second national language. `null` declines it. */
  secondId: string | null
  /** AltGr column of the first language. */
  altGr: boolean
  /** AltGr+Shift column of the first language. */
  altGrShift: boolean
  source: 'standard' | 'custom'
  /** Preview: hide first-language glyphs without changing `baseId`. */
  baseVisible?: boolean
  /** Preview: hide second-language glyphs without clearing `secondId`. */
  secondVisible?: boolean
  /** Preview: hide All-layers slots; hidden rows stay empty, they do not collapse. */
  layers?: [boolean, boolean, boolean, boolean]
}

/**
 * Input to compose. The default view is the LARK English + Russian preset.
 */
export interface ComposeKeyInput {
  binding: KeyBindingNode
  hostView?: HostLegendView
}

/** Hover target on the host legend strip. Preview only. */
export type LegendHover =
  | { kind: 'layer'; layer: number }
  | { kind: 'altGr' }
  | { kind: 'altGrShift' }
