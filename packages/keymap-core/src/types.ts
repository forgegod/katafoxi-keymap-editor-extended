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
  /** AltGr of the base layout; empty when the column is off or the level is NoSymbol */
  altGr: string
  /** AltGr+Shift of the base layout; empty when the column is off or the level is NoSymbol */
  altGrShift: string
  /** AltGr column toggle. False hides that slot; an empty glyph still shows ˬ when true. */
  showAltGr?: boolean
  /** AltGr+Shift column toggle. False hides that slot. */
  showAltGrShift?: boolean
  /** Hold-tap or home-row mod annotation (e.g. ⧗LC) */
  hold?: string
  /** When EN/RU AltGr pairs diverge (e.g. Δτ/ёЁ) */
  bilingualNote?: string
  /** The two AltGr pairs behind `bilingualNote`, first language then second. */
  bilingualAlt?: [string, string]
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
 */
export interface HostLegendView {
  baseId: string
  /** Second national language. `null` declines it. */
  secondId: string | null
  /** AltGr column of the first language. */
  altGr: boolean
  /** AltGr+Shift column of the first language. */
  altGrShift: boolean
  /** Preview: hide first-language glyphs without changing `baseId`. */
  baseVisible?: boolean
  /** Preview: hide second-language glyphs without clearing `secondId`. */
  secondVisible?: boolean
  /** AltGr column of the second language. Defaults to `altGr`. */
  secondAltGr?: boolean
  /** AltGr+Shift column of the second language. Defaults to `altGrShift`. */
  secondAltGrShift?: boolean
  /**
   * Languages after the base column, in table order.
   * Absent means just `secondId`, when that is set.
   */
  roster?: ReadonlyArray<{
    language: 'en' | 'ru' | 'uk' | 'de'
    layoutId: string
    altGr: boolean
    altGrShift: boolean
  }>
  /** Shown firmware-layer indices in the order they were turned on. */
  shownLayers?: number[]
  /** Layer 0 stays on the cap; when true the first row is the raw ZMK code. */
  layer0Raw?: boolean
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
