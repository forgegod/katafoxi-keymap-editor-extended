import { encodeKeyBinding } from './keymap.js'
import { hostKeyByZmk } from './host-key-id.js'
import { hostDisplayLevels } from './host-layout.js'
import { hostLayoutMeta, hostLevels } from './host-layout-registry.js'
import {
  hostLegendColumns,
  standardHostLegendView,
  type HostLegendColumn
} from './host-legend-view.js'
import { effectiveShownLayers, standardLayerView } from './layer-view.js'
import { isRAltCode, isShiftKeyCode } from './modifiers.js'
import type { HostLanguageId } from './host-languages.js'
import type {
  ComposedLegend,
  ComposedLegendColumn,
  ComposeKeyInput,
  HoldRef,
  HostLegendView,
  KeyBindingNode,
  LayerView,
  LegendHover
} from './types.js'
import {
  bindingIsAltGrShiftChord,
  bindingReferencesLayer,
  bindingSendsAltGr,
  bindingSendsShift,
  formatHoldBadge,
  isBlankLayerBinding,
  isKeypadCode,
  resolveBinding
} from './compose-binding.js'

/** What the hover preview should mark: the whole combo, or only the hold badge. */
export type LegendHoverHit = 'none' | 'combo' | 'hold'

function hoverLayerTargets(hover: Extract<LegendHover, { kind: 'layers' }>): number[] {
  return hover.source == null ? hover.layers : [...hover.layers, hover.source]
}

function holdRefMatchesHover(hold: HoldRef | undefined, hover: LegendHover): boolean {
  if (!hold) return false
  if (hover.kind === 'layer') return hold.kind === 'layer' && hold.layer === hover.layer
  if (hover.kind === 'layers') {
    return hold.kind === 'layer' && hoverLayerTargets(hover).includes(hold.layer)
  }
  if (hover.kind === 'altGr') return hold.kind === 'mod' && isRAltCode(hold.code)
  return hold.kind === 'mod' && isShiftKeyCode(hold.code)
}

export function legendHoverHit(
  binding: KeyBindingNode,
  hover: LegendHover | null
): LegendHoverHit {
  if (!hover) return 'none'
  const resolved = resolveBinding(binding)
  if (hover.kind === 'layer' || hover.kind === 'layers') {
    const named =
      hover.kind === 'layer'
        ? bindingReferencesLayer(binding, hover.layer)
        : hoverLayerTargets(hover).some(layer => bindingReferencesLayer(binding, layer))
    if (!named) return 'none'
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

export interface ResolvedHostColumn extends HostLegendColumn {
  tone: ComposedLegendColumn['tone']
  flag: string
}

/** Legend columns plus the tone and flag the composed legend draws. */
export function resolveHostColumns(view: HostLegendView): ResolvedHostColumn[] {
  return hostLegendColumns(view).map((column, index): ResolvedHostColumn => ({
    ...column,
    tone: legendColumnTone(index),
    flag: hostLayoutMeta(column.layoutId)?.flag ?? ''
  }))
}

/** First shown host language is base; later columns share the second-language tone. */
export function legendColumnTone(index: number): ComposedLegendColumn['tone'] {
  return index === 0 ? 'base' : 'second'
}

function emptyComposeColumn(resolved: ResolvedHostColumn): ComposedLegendColumn {
  return {
    language: resolved.language,
    tone: resolved.tone,
    pair: ['', ''],
    pairDead: [false, false],
    altGr: '',
    altGrDead: false,
    altGrShift: '',
    altGrShiftDead: false,
    showAltGr: resolved.altGr,
    showAltGrShift: resolved.altGrShift,
    onKeycap: resolved.shown
  }
}

function composeColumn(
  resolved: ResolvedHostColumn,
  zmk: string
): ComposedLegendColumn | null {
  const raw = hostLevels(resolved.layoutId, zmk)
  if (!raw) return emptyComposeColumn(resolved)
  const levels = hostDisplayLevels(raw)
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
 * N-column host legend for a ZMK token. Unknown ids, modifier keys, and
 * non-character bases return null. A shown column with no key record keeps
 * four empty slots (`ˬ` on the face) so on-keycap languages stay aligned.
 * Hidden extras are omitted; a hidden base stays so the firmware alphabet is
 * still there when its glyphs are off the key.
 */
export function hostLegendFor(
  token: string,
  view?: HostLegendView
): ComposedLegend | null {
  const id = hostKeyByZmk(token)
  if (!id || id.scan == null) return null
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
  if (!id || id.scan == null) return null
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
