import { KeymapValidationError } from './errors.js'
import { inferRectangularLayout, validateInfoJson } from './layout.js'
import type { LayoutKey, ParsedKeymap } from './types.js'

/** ZMK `info.json` layouts object (id/name optional). */
export type InfoJsonLayouts = {
  id?: string
  name?: string
  layouts: Record<string, { layout: LayoutKey[] }>
}

export type PickInfoLayoutOptions = {
  /** When set, require this layout name instead of default/first. */
  layoutName?: string
  /** Used when info has no id/name. */
  fallbackKeyboard?: string
}

/**
 * Prefer `layouts.default`, else the first layout key.
 * Callers that already validated may pass a typed object; unknown input is validated.
 */
export function pickInfoLayout(
  info: unknown,
  options: PickInfoLayoutOptions = {}
): { layout: LayoutKey[]; layoutName: string; keyboard: string } {
  validateInfoJson(info)
  const root = info as InfoJsonLayouts
  const names = Object.keys(root.layouts)

  const layoutName =
    options.layoutName ??
    (root.layouts.default ? 'default' : names[0]!)
  const entry = root.layouts[layoutName]
  if (!entry || !Array.isArray(entry.layout)) {
    throw new KeymapValidationError([
      `info.json layout "${layoutName}" is missing or invalid`
    ])
  }

  const keyboard =
    (typeof root.id === 'string' && root.id) ||
    (typeof root.name === 'string' && root.name) ||
    options.fallbackKeyboard ||
    'keyboard'

  return {
    layout: entry.layout.map(key => ({ ...key })),
    layoutName,
    keyboard
  }
}

export type LoadKeyboardBundleOptions = {
  /** Parsed info.json root, or null/undefined when absent. */
  infoJson?: unknown | null
  /** Already-parsed keymap (after DTS/JSON parse or from an API adapter). */
  keymap: ParsedKeymap
  /**
   * Warning code when layout is inferred from layer-0 binding count
   * (e.g. `clipboard_inferred_layout`, `github_inferred_layout`).
   */
  inferredLayoutWarning?: string
  /** Used when info has no id/name, or when inferring. */
  fallbackKeyboard?: string
  /** Layout name when inferring. Defaults to `LAYOUT`. */
  fallbackLayoutName?: string
  /** Error message when info is missing and layer 0 is empty. */
  missingLayoutMessage?: string
}

export type KeyboardBundle = {
  layout: LayoutKey[]
  layoutName: string
  keyboard: string
  keymap: ParsedKeymap
  warnings: string[]
  inferredLayout: boolean
}

function hasUsableLayouts(info: unknown): info is InfoJsonLayouts {
  if (!info || typeof info !== 'object') return false
  const layouts = (info as InfoJsonLayouts).layouts
  return (
    !!layouts &&
    typeof layouts === 'object' &&
    Object.keys(layouts).length > 0
  )
}

/**
 * Shared Demo/Clipboard/GitHub/Local path: pick layout from info.json or
 * infer a flat rectangle from layer 0, and attach an inferred-layout warning.
 */
export function loadKeyboardBundle(
  options: LoadKeyboardBundleOptions
): KeyboardBundle {
  const {
    infoJson,
    keymap,
    inferredLayoutWarning,
    fallbackKeyboard = 'keyboard',
    fallbackLayoutName = 'LAYOUT',
    missingLayoutMessage = 'Keymap has no bindings to infer a layout from'
  } = options

  const warnings: string[] = []

  if (hasUsableLayouts(infoJson)) {
    const picked = pickInfoLayout(infoJson, { fallbackKeyboard })
    return {
      layout: picked.layout,
      layoutName: picked.layoutName,
      keyboard: picked.keyboard,
      keymap,
      warnings,
      inferredLayout: false
    }
  }

  const keyCount = Array.isArray(keymap.layers?.[0]) ? keymap.layers[0].length : 0
  if (keyCount <= 0) {
    throw new KeymapValidationError([missingLayoutMessage])
  }

  const layout = inferRectangularLayout(keyCount)
  if (inferredLayoutWarning) warnings.push(inferredLayoutWarning)

  return {
    layout,
    layoutName: fallbackLayoutName,
    keyboard: fallbackKeyboard,
    keymap,
    warnings,
    inferredLayout: true
  }
}
