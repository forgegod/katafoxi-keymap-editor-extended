import type { HostLanguageId } from './host-languages.js'

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

/** One language column in a composed host legend. */
export interface ComposedLegendColumn {
  language: HostLanguageId
  /** Keycap color. Base column is `base`; extras are `second`. */
  tone: 'base' | 'second'
  /** Level 1 + Shift (`eE`). */
  pair: [string, string]
  /** AltGr glyph; empty when the column is off or the level is NoSymbol. */
  altGr: string
  /** AltGr+Shift glyph; empty when the column is off or the level is NoSymbol. */
  altGrShift: string
  /** AltGr column toggle. False hides that slot; an empty glyph still shows ˬ when true. */
  showAltGr: boolean
  /** AltGr+Shift column toggle. False hides that slot. */
  showAltGrShift: boolean
  /** D9: this column's letter pair is drawn on the keycap. */
  onKeycap: boolean
}

/** Hold target extracted from a binding, before it is formatted for the keycap. */
export type HoldRef =
  | { kind: 'layer'; layer: number }
  | { kind: 'mod'; code: string }

/** Host legend: N language columns + optional hold annotation. */
export interface ComposedLegend {
  columns: ComposedLegendColumn[]
  /** Hold-tap or home-row mod annotation (e.g. ⧗LC) */
  hold?: string
  /** Structured hold target that produced `hold`. */
  holdRef?: HoldRef
  /** Firmware keycode that produced this (gray in the host sheet) */
  keycode?: string
  /** Tap is HID keypad (`KP_*`); UI boxes the glyph, host text stays `7`. */
  keypad?: boolean
}

/** Tap/hold extracted from a ZMK binding node (before host lookup). */
export interface ResolvedBinding {
  /** Keycode sent on tap, if any (`A`, `ESC`, …). */
  tap: string | null
  /** Hold side: layer momentary or modifier, before badge formatting. */
  hold?: HoldRef
}

/** One language column in the host-legend view. `columns[0]` is the base. */
export interface HostColumn {
  language: HostLanguageId
  layoutId: string
  visible: boolean
  altGr: boolean
  altGrShift: boolean
}

/**
 * Which host layouts fill the composed legend.
 * `columns[0]` is the base column. `open` is the extra language shown
 * next to the base, or `null` when no extra is selected.
 */
export interface HostLegendView {
  columns: HostColumn[]
  open: HostLanguageId | null
}

/** Which firmware layers are drawn on the keycap. */
export interface LayerView {
  shown: number[]
  layer0Raw: boolean
}

/**
 * Input to compose. The default view is the primary system English + Russian pair.
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
