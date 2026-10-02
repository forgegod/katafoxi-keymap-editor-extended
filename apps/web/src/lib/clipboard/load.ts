/**
 * Clipboard keymap source — parse pasted info.json + .keymap / keymap.json.
 * Domain parse/splice stays in keymap-core; this is the browser adapter.
 */

import {
  assertLayerKeyCounts,
  encodeKeymap,
  inferRectangularLayout,
  isPrimaryKeymapJson,
  parseDtsKeymap,
  parseKeymap,
  validateInfoJson,
  validateKeymapJson,
  type LayoutKey,
  type ParsedKeymap
} from '@keymap-editor/keymap-core'

export type ClipboardBundle = {
  layout: LayoutKey[]
  layoutName: string
  keyboard: string
  keymap: ParsedKeymap
  /** Pasted `.keymap` text for splice on Copy; null when the paste was JSON-only. */
  originalSource: string | null
  warnings: string[]
  /** True when layout was synthesized (no info.json). */
  inferredLayout: boolean
}

type InfoJson = {
  id?: string
  name?: string
  layouts: Record<string, { layout: LayoutKey[] }>
}

function parseJsonObject(text: string, label: string): unknown {
  const trimmed = text.trim()
  if (!trimmed) throw new Error(`${label} is empty`)
  try {
    return JSON.parse(trimmed)
  } catch {
    throw new Error(`${label} is not valid JSON`)
  }
}

/** Parse pasted `info.json` into the first layout. */
export function parseClipboardInfo(text: string): {
  layout: LayoutKey[]
  layoutName: string
  keyboard: string
} {
  const parsed = parseJsonObject(text, 'Layout')
  validateInfoJson(parsed)
  const info = parsed as InfoJson
  const layoutName = Object.keys(info.layouts)[0]
  if (!layoutName) throw new Error('info.json has no layouts')
  const layout = info.layouts[layoutName].layout
  const keyboard =
    (typeof info.id === 'string' && info.id) ||
    (typeof info.name === 'string' && info.name) ||
    'clipboard'
  return { layout, layoutName, keyboard }
}

/** Validate pasted `.keymap` text for splice on Copy (does not parse layers). */
export function parseClipboardExportSource(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('Export .keymap is empty')
  if (trimmed.startsWith('{')) {
    throw new Error('Export source must be ZMK .keymap text, not keymap.json')
  }
  parseDtsKeymap(trimmed, { keyboard: 'clipboard', keymap: 'clipboard', layout: 'LAYOUT' })
  return trimmed
}

/**
 * Parse pasted keymap text: `.keymap` DTS, or `keymap.json`.
 * When the paste is JSON, pass `exportKeymapText` (a `.keymap` file) to preserve preamble on Copy.
 */
export function parseClipboardKeymap(
  text: string,
  meta: { keyboard: string; layoutName: string },
  exportKeymapText?: string
): {
  keymap: ParsedKeymap
  originalSource: string | null
  warnings: string[]
} {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('Keymap is empty')

  if (trimmed.startsWith('{')) {
    const parsed = parseJsonObject(trimmed, 'Keymap')
    validateKeymapJson(parsed)
    if (!isPrimaryKeymapJson(parsed)) {
      throw new Error('keymap.json has no usable layers')
    }
    const keymap = parseKeymap(parsed as { layers: string[][] })
    if (!keymap.keyboard) keymap.keyboard = meta.keyboard
    if (!keymap.layout) keymap.layout = meta.layoutName
    if (!keymap.keymap) keymap.keymap = 'clipboard'
    const exportTrimmed = exportKeymapText?.trim() ?? ''
    const originalSource = exportTrimmed
      ? parseClipboardExportSource(exportTrimmed)
      : null
    const warnings: string[] = []
    if (!originalSource) {
      warnings.push('clipboard_json_no_export_source')
    }
    return { keymap, originalSource, warnings }
  }

  const raw = parseDtsKeymap(trimmed, {
    keyboard: meta.keyboard,
    keymap: 'clipboard',
    layout: meta.layoutName
  })
  const warnings = Array.isArray(raw.warnings) ? [...raw.warnings] : []
  const keymap = parseKeymap(raw)
  return { keymap, originalSource: trimmed, warnings }
}

/**
 * Load a clipboard session from pasted keymap text.
 * `info.json` is optional: without it, a flat rectangular layout is inferred.
 */
export function loadClipboardBundle(
  infoText: string,
  keymapText: string,
  exportKeymapText?: string
): ClipboardBundle {
  const infoTrimmed = infoText.trim()
  let layout: LayoutKey[]
  let layoutName: string
  let keyboard: string
  let inferredLayout = false

  if (infoTrimmed) {
    ;({ layout, layoutName, keyboard } = parseClipboardInfo(infoTrimmed))
  } else {
    layoutName = 'LAYOUT'
    keyboard = 'clipboard'
    layout = []
    inferredLayout = true
  }

  const { keymap, originalSource, warnings } = parseClipboardKeymap(
    keymapText,
    { keyboard, layoutName },
    exportKeymapText
  )

  if (inferredLayout) {
    const keyCount = keymap.layers[0]?.length ?? 0
    if (keyCount <= 0) {
      throw new Error('Keymap has no bindings to infer a layout from')
    }
    layout = inferRectangularLayout(keyCount)
    keymap.keyboard = keyboard
    keymap.layout = layoutName
    warnings.push('clipboard_inferred_layout')
  }

  const encoded = encodeKeymap(keymap)
  assertLayerKeyCounts(layout, encoded.layers as string[][])
  return {
    layout,
    layoutName,
    keyboard,
    keymap,
    originalSource,
    warnings,
    inferredLayout
  }
}
