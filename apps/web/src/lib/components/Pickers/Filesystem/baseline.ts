/**
 * Build the transferable filesystem baseline the editor accepts, and read an
 * explicitly chosen layout JSON. This is UI-side glue only: it reuses core's
 * `loadKeyboardBundle` and the adapter's validated geometry readers, so the
 * accepted baseline is exactly what `FilesystemBaseline` validation expects.
 */

import { loadKeyboardBundle } from '@keymap-editor/keymap-core'
import type { FilesystemBaseline } from '../../../draft-storage'
import {
  readGeometryCandidate,
  validateGeometryJson,
  type FilesystemAccessEnv,
  type FirmwareCandidate,
  type GeometryCandidate
} from '../../../filesystem-access'

/** Picker cancellation is a normal outcome, not an error to surface. */
function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'AbortError'
  )
}

/** Inferred-layout warning code surfaced on the accepted selection. */
export const FILESYSTEM_INFERRED_LAYOUT_WARNING = 'filesystem_inferred_layout'

/**
 * Assemble a baseline for one accepted raw `.keymap`. Supplied geometry has
 * already passed adapter-side `validateInfoJson`; only absent geometry infers.
 */
export function buildFilesystemBaseline(
  candidate: FirmwareCandidate,
  geometry?: GeometryCandidate
): FilesystemBaseline {
  const bundle = loadKeyboardBundle({
    infoJson: geometry ? geometry.json : null,
    keymap: candidate.keymap,
    fallbackKeyboard: candidate.name,
    ...(geometry ? {} : { inferredLayoutWarning: FILESYSTEM_INFERRED_LAYOUT_WARNING })
  })
  return {
    route: candidate.directory
      ? { kind: 'directory', entryName: candidate.name }
      : { kind: 'file' },
    bytes: [...candidate.bytes],
    source: candidate.source,
    keymap: candidate.keymap,
    layout: bundle.layout,
    ...(geometry ? { geometry: { name: geometry.name, bytes: [...geometry.bytes] } } : {})
  }
}

/**
 * Explicit, separately activated layout picker. Returns `null` when the user
 * cancels (the staged firmware candidate and old session must stay). A resolved
 * selection is read and `validateInfoJson`-checked before it is returned.
 */
export async function pickGeometryFile(
  env: FilesystemAccessEnv
): Promise<GeometryCandidate | null> {
  if (!env.isSecureContext || typeof env.showOpenFilePicker !== 'function') {
    throw new Error('The layout file picker is unavailable in this browser')
  }
  let handles: unknown
  try {
    handles = await env.showOpenFilePicker({
      multiple: false,
      types: [{ description: 'Layout JSON', accept: { 'application/json': ['.json'] } }]
    })
  } catch (error) {
    if (isAbortError(error)) return null
    throw error
  }
  if (!Array.isArray(handles) || handles.length !== 1) {
    throw new Error('Select exactly one layout JSON file')
  }
  const handle = handles[0] as { kind?: string; name?: string; getFile?: unknown }
  if (
    !handle ||
    handle.kind !== 'file' ||
    typeof handle.getFile !== 'function' ||
    typeof handle.name !== 'string' ||
    !handle.name.toLowerCase().endsWith('.json')
  ) {
    throw new Error('Selection is not a layout JSON file')
  }
  const lower = handle.name.toLowerCase()
  // Firmware sidecars are never layout, even when they happen to parse.
  if (lower === 'keymap.json' || lower.endsWith('.keymap.json')) {
    throw new Error('Firmware sidecar JSON cannot be used as a layout')
  }
  return readGeometryCandidate(handle as GeometryCandidate['handle'])
}

/** Re-export so the picker can revalidate an explicitly supplied geometry text. */
export { validateGeometryJson }
