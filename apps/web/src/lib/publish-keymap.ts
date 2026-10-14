import {
  cloneParsedKeymap,
  encodeHostKeymapSnapshot,
  type HostKeymapSnapshot,
  type LayoutKey,
  type ParsedKeymap
} from '@keymap-editor/keymap-core'
import type { GithubMeta } from './editor.svelte.js'
import type { HostSnapshotLoadError } from './editor/types.js'
import type { KeyboardFilesResult } from './github/api.svelte.js'

const BRANCH_CHANGED_NOTICE = 'Branch changed on GitHub — reload'

export type PublishKeymapEditor = {
  saving: boolean
  readonly isDirty: boolean
  readonly isPublishDirty?: boolean
  readonly draftKeymap: unknown
  readonly source: string | null
  githubMeta: GithubMeta | null
  layout: LayoutKey[] | null
  beginPublish(): number
  captureLayerOperationSnapshot?(sentDraft: ParsedKeymap): boolean
  isPublishCurrent(
    token: number,
    source: string | null,
    github: GithubMeta | null
  ): boolean
  applyPublished(
    reloaded: ParsedKeymap,
    saveMeta?: unknown,
    sentDraft?: ParsedKeymap | null
  ): void
  applyReloadFailure(source: string | null): void
  applySaveFailure(data: unknown): void
  acceptHostRepoBaseline?(encoded?: string): void
  buildCurrentHostKeymapSnapshot?(): HostKeymapSnapshot | null
  retainHostSnapshotOmitWarning?(): void
  noteHostSnapshotLoad?(error: HostSnapshotLoadError): void
  _persistGithubHostCache?(): Promise<void>
}

export async function publishKeymap(
  editor: PublishKeymapEditor,
  handlers: {
    write: (sentDraft: ParsedKeymap) => Promise<unknown>
    reload: () => Promise<
      Pick<KeyboardFilesResult, 'keymap'> &
        Partial<Pick<KeyboardFilesResult, 'layout' | 'headSha' | 'keymapPath' | 'ownershipMode' | 'jsonChoiceRequired'>>
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
  const hostSnapshot = editor.buildCurrentHostKeymapSnapshot?.() ?? null
  const committedHostBaseline =
    hostSnapshot != null ? encodeHostKeymapSnapshot(hostSnapshot) : undefined
  const sentDraft = cloneParsedKeymap(editor.draftKeymap as ParsedKeymap)
  editor.captureLayerOperationSnapshot?.(sentDraft)
  try {
    const saveMeta = await handlers.write(sentDraft)
    try {
      const reloaded = await handlers.reload()
      if (!editor.isPublishCurrent(token, sourceAtStart, githubAtStart)) {
        return false
      }
      if (githubAtStart?.keymapPath && reloaded.keymapPath !== githubAtStart.keymapPath) throw new Error('Reloaded a different selected keymap')
      const receipt = saveMeta as { hostWritesOmitted?: boolean; hostSnapshotError?: HostSnapshotLoadError } | null
      if (receipt?.hostWritesOmitted) editor.noteHostSnapshotLoad?.(receipt.hostSnapshotError ?? 'incompatible')
      if (reloaded.layout) {
        editor.layout = reloaded.layout
      }
      if (reloaded.headSha && editor.githubMeta) {
        editor.githubMeta = {
          ...editor.githubMeta,
          headSha: reloaded.headSha,
          ...(reloaded.ownershipMode ? { ownershipMode: reloaded.ownershipMode } : {}),
          ...(reloaded.jsonChoiceRequired !== undefined ? { jsonChoiceRequired: reloaded.jsonChoiceRequired } : {}),
          jsonChoice: undefined
        }
      }
      editor.applyPublished(reloaded.keymap, saveMeta, sentDraft)
      if (committedHostBaseline !== undefined && !receipt?.hostWritesOmitted) {
        editor.acceptHostRepoBaseline?.(committedHostBaseline)
      }
      editor.retainHostSnapshotOmitWarning?.()
      if (receipt?.hostWritesOmitted) await editor._persistGithubHostCache?.()
      return true
    } catch {
      if (!editor.isPublishCurrent(token, sourceAtStart, githubAtStart)) {
        return false
      }
      editor.applyReloadFailure(sourceAtStart)
      return false
    }
  } catch (err) {
    if (!editor.isPublishCurrent(token, sourceAtStart, githubAtStart)) {
      return false
    }
    const requestErr = err as { response?: { status?: number; data?: unknown } }
    if (requestErr.response?.status === 409) {
      editor.applySaveFailure({ errors: [BRANCH_CHANGED_NOTICE] })
    } else {
      editor.applySaveFailure(requestErr.response?.data ?? null)
    }
    return false
  } finally {
    if (editor.isPublishCurrent(token, sourceAtStart, githubAtStart)) {
      editor.saving = false
    }
  }
}
