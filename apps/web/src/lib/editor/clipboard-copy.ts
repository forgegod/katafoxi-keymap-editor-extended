import {
  cloneParsedKeymap,
  parseDtsKeymap,
  parseKeymap,
  type LayoutKey,
  type ParsedKeymap
} from '@keymap-editor/keymap-core'
import { buildClipboardExport } from '../clipboard/export.js'
import { formatKeymapSaveWarnings } from '../keymap-save-warnings.js'
import type { GithubMeta, SaveNotice } from './types.js'

export type ClipboardCopySheet = {
  code: string
  copied: boolean
  warnings: string[]
  /** Accept this exact export after a successful sheet retry. */
  onCopied: () => void
}

export type ClipboardCopyEditor = {
  readonly source: string | null
  saving: boolean
  layout: LayoutKey[] | null
  draftKeymap: ParsedKeymap | null
  clipboardOriginalSource: string | null
  saveNotice: SaveNotice | null
  beginPublish(): number
  isPublishCurrent(token: number, source: string | null, github: GithubMeta | null): boolean
  applyClipboardCopied(reloaded: ParsedKeymap, saveMeta?: unknown, sentDraft?: ParsedKeymap): void
}

export type CopyClipboardKeymapOptions = {
  writeText?: (text: string) => Promise<void>
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
    const onCopied = () => {
      if (!editor.isPublishCurrent(token, 'clipboard', null)) return
      editor.clipboardOriginalSource = built.code
      editor.applyClipboardCopied(reloaded, {
        mode: built.mode,
        warnings: built.warnings
      }, sentDraft)
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

    if (!editor.isPublishCurrent(token, 'clipboard', null)) return

    if (copied) onCopied()

    return {
      code: built.code,
      copied,
      warnings: formatKeymapSaveWarnings(built.warnings),
      onCopied
    }
  } catch (err) {
    if (!editor.isPublishCurrent(token, 'clipboard', null)) return
    const message =
      err instanceof Error ? err.message : 'Could not build the .keymap export'
    editor.saveNotice = { kind: 'error', messages: [message] }
    return undefined
  } finally {
    if (editor.isPublishCurrent(token, 'clipboard', null)) editor.saving = false
  }
}
