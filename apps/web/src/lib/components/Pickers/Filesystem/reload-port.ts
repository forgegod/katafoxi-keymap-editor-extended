/**
 * Typed seam to the domain's staged reload/adopt transaction.
 *
 * The picker owns the explicit confirm, the synchronous context capture and the
 * fresh-identity disk read; the domain owns the captured revision and the
 * atomic commit. There is no fallback path or alternate adoption protocol.
 */

import type { FilesystemBaseline } from '../../../draft-storage'
import { editor } from '../../../editor.svelte.js'

export type FilesystemReloadContext = ReturnType<typeof editor.captureFilesystemReload>

export interface FilesystemReloadPort {
  /** Synchronous capture, invoked before any disk read. */
  capture(): FilesystemReloadContext
  /**
   * Identity-checked staged reload/adopt. `confirmedDiscard` is `true` only for
   * the explicit "Discard firmware draft and reload" gesture. `false` preserves
   * existing work and recovery.
   */
  reload(
    baseline: FilesystemBaseline,
    context: FilesystemReloadContext,
    confirmedDiscard: boolean
  ): Promise<boolean>
}

/** Real editor API; the domain module adds these methods. */
export function defaultReloadPort(): FilesystemReloadPort {
  return {
    capture: () => editor.captureFilesystemReload(),
    reload: (baseline, context, confirmedDiscard) =>
      editor.reloadFilesystemKeyboard(baseline, context, confirmedDiscard)
  }
}
