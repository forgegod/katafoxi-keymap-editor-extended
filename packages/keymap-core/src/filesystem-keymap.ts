import { buildKeymapCode, KeymapValidationError } from './keymap.js'
import type { LayoutKey, ParsedKeymap } from './types.js'

/** Inputs for the browser-filesystem firmware-only save boundary. */
export interface BuildFilesystemKeymapInput {
  keymap: ParsedKeymap
  layout: LayoutKey[]
  originalSource: string
}

/**
 * The only outputs a filesystem Save may produce for one existing raw `.keymap`:
 * the complete core `code` from the splice path, its mode and its warnings.
 * No JSON sidecar and no generated-definition source leave this boundary.
 */
export interface BuiltFilesystemKeymap {
  code: string
  mode: 'splice'
  warnings: string[]
}

/** The complete input surface of this source: no template, no extra outputs. */
const ALLOWED_INPUT_KEYS = ['keymap', 'layout', 'originalSource'] as const
const ALLOWED_INPUT_KEY_SET = new Set<string>(ALLOWED_INPUT_KEYS)

export function buildFilesystemKeymap(input: BuildFilesystemKeymapInput): BuiltFilesystemKeymap {
  const unsupported = Object.keys(input).filter(key => !ALLOWED_INPUT_KEY_SET.has(key))
  if (unsupported.length > 0) {
    throw new KeymapValidationError([
      `Filesystem save rejects unsupported parameters: ${unsupported.join(', ')}. ` +
      'Only keymap, layout and originalSource are accepted; this source writes one existing raw .keymap.'
    ])
  }
  const { originalSource } = input
  if (typeof originalSource !== 'string' || originalSource.trim().length === 0) {
    throw new KeymapValidationError([
      'Filesystem save requires the existing raw .keymap source; the default template is not a filesystem output.'
    ])
  }
  const built = buildKeymapCode(input.layout, input.keymap, { originalSource })
  if (built.mode !== 'splice') {
    throw new KeymapValidationError([
      `Filesystem save requires the splice path; received mode "${built.mode}".`
    ])
  }
  return { code: built.code, mode: 'splice', warnings: built.warnings }
}
