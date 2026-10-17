/**
 * Session/handle port for the filesystem picker UI.
 *
 * The picker never talks to IndexedDB directly: it consumes this narrow port so
 * component tests can inject an in-memory association map. The production port
 * wraps {@link FilesystemHandles}, which already isolates browser handles from
 * transferable firmware data and never prompts or reads disk on its own.
 *
 * `list` is optional: without it the picker can still reconnect work that is
 * present in this session, but cannot enumerate remembered documents across a
 * reload.
 */

import {
  FilesystemHandles,
  type AcceptResult,
  type FilesystemHandleLike,
  type FilesystemHandlesPayload,
  type IdentityResolution
} from '../../../filesystem-handles'

export interface FilesystemHandlesPort {
  identify(handle: FilesystemHandleLike): Promise<IdentityResolution>
  accept(
    documentId: string,
    handles: FilesystemHandlesPayload,
    remember?: boolean
  ): Promise<AcceptResult>
  restore(documentId: string): Promise<FilesystemHandlesPayload | null>
  forget(documentId: string): Promise<void>
  /** Optional: remembered document ids, read-only, never prompts or reads disk. */
  list?(): Promise<string[]>
}

let singleton: FilesystemHandles | undefined

/** One origin-local store per page; identity must survive picker remounts. */
export function defaultHandlesPort(): FilesystemHandlesPort {
  singleton ??= new FilesystemHandles()
  return singleton
}
