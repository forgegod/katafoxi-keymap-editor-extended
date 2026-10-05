import type { HostLanguageId } from './host-languages.js'
import type { KeycodeOsSupport } from './keycode-os.js'

export interface KeyBindingNode {
  value: string | number
  params: KeyBindingNode[]
}

/**
 * One ZMK combo node (`combos { combo_id { … } }`).
 * `keyPositions` are layout / matrix indices (same as board `keyIndex`).
 */
export interface ZmkCombo {
  id: string
  keyPositions: number[]
  binding: KeyBindingNode
  timeoutMs?: number
  requirePriorIdleMs?: number
  slowRelease?: boolean
  /** Layer indexes the combo is active on; omit = all layers. */
  layers?: number[]
}

/**
 * One ZMK conditional-layer rule.
 * `thenLayer` is active exactly while every `ifLayers` entry is active.
 */
export interface ZmkConditionalLayer {
  id: string
  ifLayers: number[]
  thenLayer: number
}

/**
 * One ZMK hold-tap read from the keymap.
 * A named node (`hm: hm { compatible = "zmk,behavior-hold-tap" }`) is a new
 * behaviour code. `override` is an `&mt { … }` / `&lt { … }` timing block
 * for a behaviour that already exists. Save rewrites this list when it is set.
 */
export interface ZmkHoldTap {
  /** Reference including `&`, e.g. `&hm` or `&mt`. */
  code: string
  /** Timing block for an existing behaviour, not a new node. */
  override?: boolean
  /** Devicetree node name after the label colon. */
  nodeName?: string
  tappingTermMs?: number
  quickTapMs?: number
  requirePriorIdleMs?: number
  flavor?: string
  /** `bindings = <&kp>, <&kp>` refs, in order. */
  bindings?: string[]
  /** Key-editor slot types derived from `bindings`. */
  params?: string[]
}

export interface ParsedKeymap {
  keyboard?: string
  keymap?: string
  layout?: string
  layer_names?: string[]
  layers: KeyBindingNode[][]
  /** ZMK combos from the .keymap; absent when the source had none. */
  combos?: ZmkCombo[]
  /**
   * ZMK conditional layers. Absent when the source had none.
   * An empty array means the user removed them and Save should drop the block.
   */
  conditionalLayers?: ZmkConditionalLayer[]
  /**
   * Hold-tap nodes and `&mt` / `&lt` timing blocks.
   * Absent when the source had none and Save should leave those nodes alone.
   * An array, including empty, is the editor's list and Save rewrites it.
   */
  holdTaps?: ZmkHoldTap[]
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
  /**
   * Matrix slot kept for keymap index alignment, but no physical key.
   * Still counts toward layer length / DTS output; omit from the drawn board.
   */
  absent?: boolean
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
  /** ZMK HID OS flags when present on the catalog row. */
  os?: KeycodeOsSupport
}

/** One language column in a composed host legend. */
export interface ComposedLegendColumn {
  language: HostLanguageId
  /** Keycap color. Base column is `base`; extras are `second`. */
  tone: 'base' | 'second'
  /** Level 1 + Shift (`eE`). Dead accents use their spacing marks. */
  pair: [string, string]
  /** True when the matching `pair` slot is a `dead_*` spacing mark. */
  pairDead: [boolean, boolean]
  /** AltGr glyph; empty when the column is off or the level is NoSymbol. */
  altGr: string
  /** True when `altGr` is a dead-key spacing mark. */
  altGrDead: boolean
  /** AltGr+Shift glyph; empty when the column is off or the level is NoSymbol. */
  altGrShift: string
  /** True when `altGrShift` is a dead-key spacing mark. */
  altGrShiftDead: boolean
  /**
   * AltGr column toggle. On the keycap face the level is always a slot:
   * on + glyph, on + empty → `ˬ`, off → `ˬ` (hides content, slot stays).
   */
  showAltGr: boolean
  /** AltGr+Shift column toggle. Same face rule as `showAltGr`. */
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
  /** Tap is HID keypad (`KP_*`); UI washes the glyph, host text stays `7`. */
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
 * `columns[0]` is the base column: the firmware alphabet, kept even when its
 * glyphs are hidden. `open` is the national language paired with that base for
 * the combined Windows file. Highlight symbol differences compares the two
 * languages on `keycap` (position marks); Win AltGr marks only when English
 * and `open` are both drawn. `keycap` is oldest first, at most two.
 * Omitted on older saves: the visible base, plus `open` when that column is visible.
 */
export interface HostLegendView {
  columns: HostColumn[]
  open: HostLanguageId | null
  keycap?: HostLanguageId[]
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
  | {
      kind: 'layers'
      /** Held layers whose activator keys should light up. */
      layers: number[]
      /** Then-layer under the pointer. Its own bindings light up too. */
      source?: number
    }
  | { kind: 'altGr' }
  | { kind: 'altGrShift' }
