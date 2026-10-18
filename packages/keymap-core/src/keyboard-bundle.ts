import { KeymapValidationError } from './errors.js'
import { inferRectangularLayout, validateInfoJson, validateLayoutBindingOrder } from './layout.js'
import { resolveCatalogLayout } from './layout-catalog.js'
import type { CatalogLayoutResult, LayoutCatalogRequest } from './layout-catalog.js'
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
  /** Opt-in domain preview only. Existing adapters do not automatically discover or accept geometry. */
  discovery?: LayoutCatalogRequest
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
  discovery?: CatalogLayoutResult
  layout: LayoutKey[]
  layoutName: string
  keyboard: string
  keymap: ParsedKeymap
  warnings: string[]
  inferredLayout: boolean
}

function hasEmptyLayouts(info: unknown): boolean {
  if (!info || typeof info !== 'object' || Array.isArray(info)) return false
  const layouts = (info as InfoJsonLayouts).layouts
  return (
    !!layouts &&
    typeof layouts === 'object' &&
    !Array.isArray(layouts) &&
    Object.keys(layouts).length === 0
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

  if (infoJson != null && !hasEmptyLayouts(infoJson)) {
    if (Array.isArray(infoJson) || Array.isArray((infoJson as InfoJsonLayouts).layouts)) {
      throw new KeymapValidationError(['Explicit layout JSON must contain a layouts object, not an array'])
    }
    const picked = pickInfoLayout(infoJson, { fallbackKeyboard })
    validateLayoutBindingOrder(picked.layout, keymap.layers)
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
  validateLayoutBindingOrder(layout, keymap.layers)
  const discovery = options.discovery ? resolveCatalogLayout({ ...options.discovery, keymap }) : undefined
  if (discovery?.status === 'candidate') {
    validateLayoutBindingOrder(discovery.layout.layout, keymap.layers)
    return {
      layout: discovery.layout.layout,
      layoutName: discovery.layout.physicalLayout ?? discovery.layout.transform,
      keyboard: fallbackKeyboard, keymap, warnings, discovery,
      inferredLayout: discovery.layout.geometry === 'electrical-inference'
    }
  }
  if (discovery) warnings.push(`layout_discovery_${discovery.reason}`)
  if (inferredLayoutWarning) warnings.push(inferredLayoutWarning)

  return {
    layout,
    layoutName: fallbackLayoutName,
    keyboard: fallbackKeyboard,
    keymap,
    warnings,
    inferredLayout: true,
    ...(discovery ? { discovery } : {})
  }
}
