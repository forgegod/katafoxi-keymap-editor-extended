import {
  cloneParsedKeymap,
  parseDtsKeymap,
  parseKeymap,
  type LayoutKey,
  type ParsedKeymap
} from '@keymap-editor/keymap-core'
import { buildClipboardExport } from '../clipboard/export.js'
import { formatKeymapSaveWarnings } from '../keymap-save-warnings.js'
import type { SaveNotice } from './types.js'

export type ClipboardCopySheet = {
  code: string
  copied: boolean
  warnings: string[]
  /** Accept this exact export after a successful sheet retry. */
  onCopied: () => void
}

export type ClipboardCopyEditor = {
  readonly source: 'clipboard'
  saving: boolean
  layout: LayoutKey[] | null
  draftKeymap: ParsedKeymap | null
  clipboardOriginalSource: string | null
  saveNotice: SaveNotice | null
  beginPublish(): number
  captureLayerOperationSnapshot?(sentDraft: ParsedKeymap): boolean
  isClipboardCopyCurrent(token: number): boolean
  applyClipboardCopied(reloaded: ParsedKeymap, sentDraft?: ParsedKeymap): void
}

export type CopyClipboardKeymapOptions = {
  writeText?: (text: string) => Promise<void>
}

/** Refine the shared editor at the caller boundary without copying its reactive state. */
export function isClipboardCopyEditor(
  editor: Omit<ClipboardCopyEditor, 'source'> & { readonly source: string | null }
): editor is ClipboardCopyEditor {
  return editor.source === 'clipboard'
}

/** Build, splice, and copy the current clipboard-session .keymap. */
export async function copyClipboardKeymap(
  editor: ClipboardCopyEditor,
  options: CopyClipboardKeymapOptions = {}
): Promise<ClipboardCopySheet | undefined> {
  if (editor.source !== 'clipboard' || !editor.layout || !editor.draftKeymap || editor.saving) return
  editor.saving = true
  const token = editor.beginPublish()
  const sentDraft = cloneParsedKeymap(editor.draftKeymap)
  const layerIdentityCaptured = editor.captureLayerOperationSnapshot?.(sentDraft) ?? false
  try {
    const built = buildClipboardExport(
      editor.layout,
      sentDraft,
      editor.clipboardOriginalSource
    )
    const reloaded = parseKeymap(parseDtsKeymap(built.code, {
      keyboard: typeof sentDraft.keyboard === 'string' ? sentDraft.keyboard : 'clipboard',
      keymap: typeof sentDraft.keymap === 'string' ? sentDraft.keymap : 'clipboard',
      layout: typeof sentDraft.layout === 'string' ? sentDraft.layout : 'LAYOUT'
    }))
    if (layerIdentityCaptured && sentDraft.layer_names) reloaded.layer_names = [...sentDraft.layer_names]
    const onCopied = () => {
      if (!editor.isClipboardCopyCurrent(token)) return
      editor.clipboardOriginalSource = built.code
      editor.applyClipboardCopied(reloaded, sentDraft)
    }
    let copied = false
    const writeText =
      options.writeText ?? (text => navigator.clipboard.writeText(text))
    try {
      await writeText(built.code)
      copied = true
    } catch {
      copied = false
    }

    if (!editor.isClipboardCopyCurrent(token)) return

    if (copied) onCopied()

    return {
      code: built.code,
      copied,
      warnings: formatKeymapSaveWarnings(built.warnings),
      onCopied
    }
  } catch (err) {
    if (!editor.isClipboardCopyCurrent(token)) return
    const message =
      err instanceof Error ? err.message : 'Could not build the .keymap export'
    editor.saveNotice = { kind: 'error', messages: [message] }
    return undefined
  } finally {
    if (editor.isClipboardCopyCurrent(token)) editor.saving = false
  }
}
