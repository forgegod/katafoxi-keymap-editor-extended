import {
  encodeHostKeymapSnapshot,
  type HostKeymapSnapshot,
  type LayoutKey,
  type ParsedKeymap
} from '@keymap-editor/keymap-core'
import type { GithubMeta } from './editor.svelte.js'
import type { KeyboardFilesResult } from './github/api.svelte.js'

export type PublishKeymapEditor = {
  saving: boolean
  readonly isDirty: boolean
  readonly isPublishDirty?: boolean
  readonly draftKeymap: unknown
  readonly source: string | null
  readonly githubMeta: GithubMeta | null
  layout: LayoutKey[] | null
  beginPublish(): number
  isPublishCurrent(
    token: number,
    source: string | null,
    github: GithubMeta | null
  ): boolean
  applyPublished(reloaded: ParsedKeymap, saveMeta?: unknown): void
  applyReloadFailure(source: string | null): void
  applySaveFailure(data: unknown): void
  acceptHostRepoBaseline?(encoded?: string): void
  buildCurrentHostKeymapSnapshot?(): HostKeymapSnapshot
}

export async function publishKeymap(
  editor: PublishKeymapEditor,
  handlers: {
    write: () => Promise<unknown>
    reload: () => Promise<
      Pick<KeyboardFilesResult, 'keymap'> & Partial<Pick<KeyboardFilesResult, 'layout'>>
    >
  }
): Promise<boolean> {
  const publishDirty =
    typeof editor.isPublishDirty === 'boolean' ? editor.isPublishDirty : editor.isDirty
  if (editor.saving || !publishDirty || !editor.draftKeymap) return false
  editor.saving = true
  const token = editor.beginPublish()
  const sourceAtStart = editor.source
  const githubAtStart = editor.githubMeta
  const committedHostBaseline = editor.buildCurrentHostKeymapSnapshot
    ? encodeHostKeymapSnapshot(editor.buildCurrentHostKeymapSnapshot())
    : undefined
  try {
    const saveMeta = await handlers.write()
    try {
      const reloaded = await handlers.reload()
      if (!editor.isPublishCurrent(token, sourceAtStart, githubAtStart)) {
        return false
      }
      if (reloaded.layout) {
        editor.layout = reloaded.layout
      }
      editor.applyPublished(reloaded.keymap, saveMeta)
      editor.acceptHostRepoBaseline?.(committedHostBaseline)
      return true
    } catch {
      if (!editor.isPublishCurrent(token, sourceAtStart, githubAtStart)) {
        return false
      }
      editor.applyReloadFailure(sourceAtStart)
      return false
    }
  } catch (err) {
    const requestErr = err as { response?: { data?: unknown } }
    editor.applySaveFailure(requestErr.response?.data ?? null)
    return false
  } finally {
    editor.saving = false
  }
}
