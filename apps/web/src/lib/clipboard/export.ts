/**
 * Build the .keymap text a Clipboard session hands back to the user.
 */

import {
  buildKeymapCode,
  type LayoutKey,
  type ParsedKeymap
} from '@keymap-editor/keymap-core'

export type ClipboardExport = {
  code: string
  mode: 'template' | 'splice' | 'default_template'
  warnings: string[]
}

/** Splice into the pasted .keymap when present; otherwise the default template. */
export function buildClipboardExport(
  layout: LayoutKey[],
  keymap: ParsedKeymap,
  originalSource: string | null | undefined
): ClipboardExport {
  const built = buildKeymapCode(layout, keymap, {
    originalSource: originalSource ?? undefined
  })
  return {
    code: built.code,
    mode: built.mode,
    warnings: built.warnings
  }
}
