import {
  parseDtsKeymap,
  parseKeymap,
  type LayoutKey,
  type ParsedKeymap
} from '@keymap-editor/keymap-core'
import { buildClipboardExport } from '../clipboard/export.js'
import { writeClipboardOriginalSource } from '../clipboard/session.js'
import { formatKeymapSaveWarnings } from '../keymap-save-warnings.js'
import type { DraftIdentity } from '../draft-storage.js'
import type { SaveNotice } from './types.js'

export type ClipboardCopySheet = {
  code: string
  copied: boolean
  warnings: string[]
}

export type ClipboardCopyEditor = {
  saving: boolean
  layout: LayoutKey[] | null
  draftKeymap: ParsedKeymap | null
  clipboardOriginalSource: string | null
  readonly isDirty: boolean
  saveNotice: SaveNotice | null
  currentDraftIdentity(): DraftIdentity | null
  applyClipboardCopied(reloaded: ParsedKeymap, saveMeta?: unknown): void
}

export type CopyClipboardKeymapOptions = {
  writeText?: (text: string) => Promise<void>
}

/** Build, splice, and copy the current clipboard-session .keymap. */
export async function copyClipboardKeymap(
  editor: ClipboardCopyEditor,
  options: CopyClipboardKeymapOptions = {}
): Promise<ClipboardCopySheet | undefined> {
  if (!editor.layout || !editor.draftKeymap || editor.saving) return
  editor.saving = true
  try {
    const built = buildClipboardExport(
      editor.layout,
      editor.draftKeymap,
      editor.clipboardOriginalSource
    )
    let copied = false
    const writeText =
      options.writeText ?? (text => navigator.clipboard.writeText(text))
    try {
      await writeText(built.code)
      copied = true
    } catch {
      copied = false
    }

    editor.clipboardOriginalSource = built.code
    const identity = editor.currentDraftIdentity()
    if (identity) writeClipboardOriginalSource(identity, built.code)

    const km = editor.draftKeymap
    const raw = parseDtsKeymap(built.code, {
      keyboard: typeof km.keyboard === 'string' ? km.keyboard : 'clipboard',
      keymap: typeof km.keymap === 'string' ? km.keymap : 'clipboard',
      layout: typeof km.layout === 'string' ? km.layout : 'LAYOUT'
    })
    const reloaded = parseKeymap(raw)
    if (editor.isDirty) {
      editor.applyClipboardCopied(reloaded, {
        mode: built.mode,
        warnings: built.warnings
      })
    } else {
      editor.saveNotice = null
    }

    return {
      code: built.code,
      copied,
      warnings: formatKeymapSaveWarnings(built.warnings)
    }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Could not build the .keymap export'
    editor.saveNotice = { kind: 'error', messages: [message] }
    return undefined
  } finally {
    editor.saving = false
  }
}
