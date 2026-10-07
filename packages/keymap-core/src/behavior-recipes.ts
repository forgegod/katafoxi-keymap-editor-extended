/**
 * Built-in behavior recipes (fixed DTS nodes + KeyEditor params).
 * Not a general macro editor — one known shape at a time.
 */

import {
  findNamedBlock,
  matchBrace,
  scanDts,
  type DtsScan
} from './dts-scan.js'
import {
  dominantEol,
  type LineEnding
} from './eol.js'
import type { BehaviorCatalog } from './catalog.js'
import type { BehaviorDef, KeyBindingNode, ParsedKeymap } from './types.js'

export const RGB_LAYER_RECIPE_CODE = '&rgblayer'

/** Canonical HSB restore color after release (upstream wiki). */
export const RGB_LAYER_RESTORE_HSB = { h: 0, s: 0, b: 0 } as const

export type HsbColor = { h: number; s: number; b: number }

/**
 * Default underglow per layer — same hue families as the SPA layer wash
 * (`--layer-tone-0…3`: blue / green / purple / ochre), brighter for LEDs.
 * Cycles every four layers like `layerToneStyle`.
 */
export const RGB_LAYER_TONE_HSB: readonly HsbColor[] = [
  { h: 148, s: 160, b: 190 },
  { h: 72, s: 170, b: 170 },
  { h: 190, s: 140, b: 180 },
  { h: 28, s: 160, b: 170 }
]

/** Fallback when no layer index is known (same as L1 green family). */
export const RGB_LAYER_DEFAULT_HSB: HsbColor = { ...RGB_LAYER_TONE_HSB[1]! }

/** Default HSB for `&rgblayer <layer>` before the user picks a color. */
export function defaultRgbLayerHsb(layer: number): HsbColor {
  const band = ((Math.trunc(layer) % 4) + 4) % 4
  return { ...RGB_LAYER_TONE_HSB[band]! }
}

export interface BehaviorRecipe {
  code: string
  name: string
  description: string
  /** Editor param slots (not stock ZMK catalog kinds only). */
  params: readonly string[]
  includes: readonly string[]
}

/**
 * Momentary layer + underglow color. DTS node is fixed; bindings are
 * `&rgblayer <layer> RGB_COLOR_HSB(h,s,b)`.
 */
export const RGB_LAYER_RECIPE: BehaviorRecipe = {
  code: RGB_LAYER_RECIPE_CODE,
  name: 'Layer + RGB',
  description: 'Hold a layer and set underglow color; release restores black.',
  params: ['layer', 'hsb'],
  includes: ['#include <dt-bindings/zmk/rgb.h>']
}

export const BEHAVIOR_RECIPES: readonly BehaviorRecipe[] = [RGB_LAYER_RECIPE]

export function behaviorRecipeFor(code: string): BehaviorRecipe | undefined {
  return BEHAVIOR_RECIPES.find(recipe => recipe.code === code)
}

export function isRgbLayerRecipeCode(code: string | number | undefined | null): boolean {
  return String(code ?? '') === RGB_LAYER_RECIPE_CODE
}

function clampByte(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(255, Math.round(n)))
}

export function clampHsb(input: Partial<HsbColor> | null | undefined): HsbColor {
  return {
    h: clampByte(input?.h ?? 0),
    s: clampByte(input?.s ?? 0),
    b: clampByte(input?.b ?? 0)
  }
}

/** Binding param node for `RGB_COLOR_HSB(h,s,b)`. */
export function hsbBindingNode(color: Partial<HsbColor>): KeyBindingNode {
  const { h, s, b } = clampHsb(color)
  return {
    value: 'RGB_COLOR_HSB',
    params: [
      { value: h, params: [] },
      { value: s, params: [] },
      { value: b, params: [] }
    ]
  }
}

/** Token form stored on editor slots and in binding previews. */
export function encodeHsbToken(color: Partial<HsbColor>): string {
  const { h, s, b } = clampHsb(color)
  return `RGB_COLOR_HSB(${h},${s},${b})`
}

/** Parse `RGB_COLOR_HSB(h,s,b)` or a tree node into HSB. */
export function parseHsbToken(value: string | number | undefined | null): HsbColor | null {
  if (value == null) return null
  const text = String(value).trim()
  const match = /^RGB_COLOR_HSB(?:_VAL)?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)\)$/.exec(text)
  if (!match) return null
  return clampHsb({
    h: Number(match[1]),
    s: Number(match[2]),
    b: Number(match[3])
  })
}

export function parseHsbBindingNode(node: KeyBindingNode | undefined | null): HsbColor | null {
  if (!node) return null
  const fromToken = parseHsbToken(node.value)
  if (fromToken) return fromToken
  if (String(node.value) === 'RGB_COLOR_HSB_VAL') {
    return readHsbArgs(node.params)
  }
  if (String(node.value) === 'RGB_COLOR_HSB') {
    return readHsbArgs(node.params)
  }
  return null
}

function readHsbArgs(params: KeyBindingNode[] | undefined): HsbColor | null {
  if (!params || params.length < 3) return null
  const h = Number(params[0]?.value)
  const s = Number(params[1]?.value)
  const b = Number(params[2]?.value)
  if (![h, s, b].every(Number.isFinite)) return null
  return clampHsb({ h, s, b })
}

/**
 * Collapse `RGB_COLOR_HSB_CMD` + `RGB_COLOR_HSB_VAL(...)` into one HSB node
 * when loading a binding for the editor.
 */
export function normalizeRgbLayerBinding(node: KeyBindingNode): KeyBindingNode {
  if (!isRgbLayerRecipeCode(node.value)) return node
  const params = [...(node.params ?? [])]
  if (params.length < 2) return node
  const layer = params[0]
  if (!layer) return node
  const second = params[1]
  if (String(second?.value) === 'RGB_COLOR_HSB' || String(second?.value) === 'RGB_COLOR_HSB_VAL') {
    const color = parseHsbBindingNode(second) ?? RGB_LAYER_DEFAULT_HSB
    return { value: RGB_LAYER_RECIPE_CODE, params: [layer, hsbBindingNode(color)] }
  }
  if (
    String(second?.value) === 'RGB_COLOR_HSB_CMD' &&
    params[2] &&
    String(params[2].value).startsWith('RGB_COLOR_HSB')
  ) {
    const color = parseHsbBindingNode(params[2]) ?? RGB_LAYER_DEFAULT_HSB
    return { value: RGB_LAYER_RECIPE_CODE, params: [layer, hsbBindingNode(color)] }
  }
  return node
}

export function defaultRgbLayerBinding(
  layer = 1,
  color?: Partial<HsbColor> | null
): KeyBindingNode {
  return {
    value: RGB_LAYER_RECIPE_CODE,
    params: [
      { value: layer, params: [] },
      hsbBindingNode(color ?? defaultRgbLayerHsb(layer))
    ]
  }
}

/** True when any layer/combo/sensor binding uses `&rgblayer`. */
export function keymapUsesRgbLayerRecipe(keymap: ParsedKeymap): boolean {
  const visit = (node: KeyBindingNode): boolean => {
    if (isRgbLayerRecipeCode(node.value)) return true
    return (node.params ?? []).some(visit)
  }
  for (const layer of keymap.layers) {
    if (layer.some(visit)) return true
  }
  if (keymap.combos?.some(combo => visit(combo.binding))) return true
  if (keymap.sensorBindings) {
    for (const row of keymap.sensorBindings) {
      if (row.some(visit)) return true
    }
  }
  return false
}

/** Detect a `rgblayer:` child under `behaviors` (label or node name). */
export function dtsHasRgbLayerNode(source: string, scan?: DtsScan): boolean {
  const dts = scan ?? scanDts(source)
  const behaviors = findNamedBlock(source, dts, 'behaviors')
  if (!behaviors) return false
  const body = dts.masked.slice(behaviors.bodyStart, behaviors.bodyEnd)
  return /(?:^|[\s;])rgblayer\s*:/.test(body) || /(?:^|[\s;])rgblayer\s*\{/.test(body)
}

export function shouldEnsureRgbLayerRecipe(
  keymap: Pick<ParsedKeymap, 'rgbLayerRecipe' | 'layers' | 'combos' | 'sensorBindings'>
): boolean {
  if (keymap.rgbLayerRecipe === true) return true
  return keymapUsesRgbLayerRecipe(keymap as ParsedKeymap)
}

export function rgbLayerRecipeBehaviorDef(): BehaviorDef {
  return {
    code: RGB_LAYER_RECIPE.code,
    name: RGB_LAYER_RECIPE.name,
    description: RGB_LAYER_RECIPE.description,
    params: [...RGB_LAYER_RECIPE.params],
    includes: [...RGB_LAYER_RECIPE.includes]
  }
}

/** Add `&rgblayer` to the catalog when the recipe is active on the keymap. */
export function mergeRecipeCatalog(
  catalog: BehaviorCatalog,
  rgbLayerRecipe: boolean | undefined
): BehaviorCatalog {
  if (!rgbLayerRecipe) return catalog
  if (catalog.byCode[RGB_LAYER_RECIPE_CODE]) return catalog
  const def = rgbLayerRecipeBehaviorDef()
  const list = [...catalog.list, def]
  return {
    list,
    byCode: { ...catalog.byCode, [def.code]: def }
  }
}

function formatRgbLayerNode(indent: string, eol: LineEnding): string {
  const i = indent
  const i2 = `${indent}    `
  // Upstream wiki shape; restore color is black.
  return [
    `${i}rgblayer: rgb_layer {`,
    `${i2}compatible = "zmk,behavior-macro-two-param";`,
    `${i2}#binding-cells = <2>;`,
    `${i2}label = "MOMENTARY_LAYER_WITH_RGB_COLOR";`,
    `${i2}bindings`,
    `${i2}  = <&macro_param_2to2 &rgb_ug RGB_COLOR_HSB_CMD MACRO_PLACEHOLDER &macro_param_1to1>`,
    `${i2}  , <&macro_press>`,
    `${i2}  , <&mo MACRO_PLACEHOLDER>`,
    `${i2}  , <&macro_pause_for_release>`,
    `${i2}  , <&macro_release>`,
    `${i2}  , <&macro_param_1to1 &mo MACRO_PLACEHOLDER>`,
    `${i2}  , <&macro_tap>`,
    `${i2}  , <&rgb_ug RGB_COLOR_HSB(${RGB_LAYER_RESTORE_HSB.h}, ${RGB_LAYER_RESTORE_HSB.s}, ${RGB_LAYER_RESTORE_HSB.b})>`,
    `${i2}  ;`,
    `${i}};`
  ].join(eol)
}

type TextEdit = { start: number; end: number; text: string }

function insertAtLine(source: string, closeBrace: number, text: string, eol: LineEnding): TextEdit {
  const lineStart = source.lastIndexOf('\n', closeBrace - 1) + 1
  const onClosingLine = source.slice(lineStart, closeBrace).trim() === ''
  const start = onClosingLine ? lineStart : closeBrace
  return { start, end: start, text: `${text}${eol}` }
}

function contentIndent(source: string, openBrace: number): string {
  const match = /\r?\n([ \t]*)\S/.exec(source.slice(openBrace + 1))
  return match?.[1] ?? '    '
}

/**
 * Insert the fixed `&rgblayer` macro node when missing.
 * Does not rewrite an existing `rgblayer` body.
 */
export function spliceRgbLayerRecipeIntoDts(source: string): string {
  const scan = scanDts(source)
  if (dtsHasRgbLayerNode(source, scan)) return source
  const eol = dominantEol(source)
  const { masked } = scan
  const edits: TextEdit[] = []
  const found = findNamedBlock(source, scan, 'behaviors')
  if (found) {
    const indent = contentIndent(source, found.openBrace)
    edits.push(insertAtLine(source, found.closeBrace, formatRgbLayerNode(indent, eol), eol))
  } else {
    const root = /\/\s*\{/.exec(masked)
    if (!root) return source
    const open = root.index + root[0].length - 1
    // Ensure brace match exists so we insert inside root.
    if (matchBrace(masked, open) < 0) return source
    const indent = contentIndent(source, open)
    const text = [
      `${indent}behaviors {`,
      formatRgbLayerNode(`${indent}    `, eol),
      `${indent}};`
    ].join(eol)
    edits.push({
      start: open + 1,
      end: open + 1,
      text: `${eol}${text}`
    })
  }
  let out = source
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  }
  return out
}

/** HSB → CSS for picker swatches (s/b are 0–100 in ZMK, not 0–1). */
export function hsbToCss({ h, s, b }: HsbColor): string {
  const { h: hh, s: ss, b: bb } = clampHsb({ h, s, b })
  return `hsl(${(hh / 255) * 360} ${(ss / 255) * 100}% ${(bb / 255) * 100}%)`
}

/** Detect recipe ownership from DTS text (bindings or node). */
export function detectRgbLayerRecipeFromDts(source: string, layers: string[][]): boolean {
  if (dtsHasRgbLayerNode(source)) return true
  return layers.some(layer => layer.some(bind => /(^|\s)&rgblayer\b/.test(bind)))
}
