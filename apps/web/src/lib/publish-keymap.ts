import type { LayoutKey, ParsedKeymap } from '@keymap-editor/keymap-core'
import type { GithubMeta } from './editor.svelte.js'

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
  acceptHostRepoBaseline?(): void
  buildCurrentHostKeymapSnapshot?(): unknown
}

export async function publishKeymap(
  editor: PublishKeymapEditor,
  handlers: {
    write: () => Promise<unknown>
    reload: () => Promise<{ layout?: unknown; keymap?: unknown }>
  }
): Promise<boolean> {
  const publishDirty =
    typeof editor.isPublishDirty === 'boolean' ? editor.isPublishDirty : editor.isDirty
  if (editor.saving || !publishDirty || !editor.draftKeymap) return false
  editor.saving = true
  const token = editor.beginPublish()
  const sourceAtStart = editor.source
  const githubAtStart = editor.githubMeta
  try {
    const saveMeta = await handlers.write()
    try {
      const reloaded = await handlers.reload()
      if (!editor.isPublishCurrent(token, sourceAtStart, githubAtStart)) {
        return false
      }
      if (reloaded.layout) {
        editor.layout = reloaded.layout as LayoutKey[]
      }
      editor.applyPublished(reloaded.keymap as ParsedKeymap, saveMeta)
      editor.acceptHostRepoBaseline?.()
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
