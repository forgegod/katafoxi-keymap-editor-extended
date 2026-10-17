/**
 * Detect the browser File System Access entry points without prompting.
 *
 * Only reads properties of the injected scope; it calls no picker and requests
 * no permission. Capability *routing* (secure context, missing picker) is owned
 * by `detectFilesystemAccess` in the domain adapter.
 */

import type {
  FilesystemAccessEnv,
  FilesystemDirectoryHandleLike,
  FilesystemFileHandleLike
} from '../../../filesystem-access'

type PickerScope = {
  isSecureContext?: boolean
  showOpenFilePicker?: (options?: unknown) => Promise<FilesystemFileHandleLike[]>
  showDirectoryPicker?: (options?: unknown) => Promise<FilesystemDirectoryHandleLike>
}

export function windowFilesystemEnv(scope: unknown = globalThis): FilesystemAccessEnv {
  const target = (scope ?? {}) as PickerScope
  const env: FilesystemAccessEnv = { isSecureContext: target.isSecureContext === true }
  if (typeof target.showOpenFilePicker === 'function') {
    env.showOpenFilePicker = target.showOpenFilePicker.bind(target)
  }
  if (typeof target.showDirectoryPicker === 'function') {
    env.showDirectoryPicker = target.showDirectoryPicker.bind(target)
  }
  return env
}
