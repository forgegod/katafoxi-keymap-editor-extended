/**
 * Browser File System Access low-level adapter.
 *
 * Stateless primitives over the browser File System Access API for one existing
 * raw `.keymap`: capability detection, explicit picker actions, staged raw-file
 * open with exact UTF-8 bytes/source, optional separate geometry validation,
 * read-only direct directory discovery, per-attempt Save authorization, byte
 * preflight and a single-file write/close/readback.
 *
 * This module owns no editor identity, draft store or save orchestration. It
 * exposes handles, byte arrays and typed outcomes so the parent can persist a
 * transferable baseline (`bytes: number[]`, `source: string`,
 * `keymap: ParsedKeymap`, `layout: LayoutKey[]`, optional `geometry`) and drive
 * staging itself. Synthetic handles are injected through {@link FilesystemAccessEnv}
 * so tests never touch real files, pickers or permissions.
 */

import {
  isUserKeymapFilename,
  matchingInfoJsonFilename,
  parseDtsKeymap,
  parseKeymap,
  validateInfoJson,
  type ParsedKeymap
} from '@keymap-editor/keymap-core'

export type PermissionMode = 'read' | 'readwrite'
export type PermissionState = 'granted' | 'prompt' | 'denied'

/** Minimal `File` surface read by the adapter. */
export type FilesystemFileLike = {
  name: string
  size: number
  lastModified: number
  arrayBuffer(): Promise<ArrayBuffer>
}

/** Minimal writable-stream surface used for the single firmware write. */
export type FilesystemWritableStreamLike = {
  write(data: Uint8Array): Promise<void>
  close(): Promise<void>
  abort?(reason?: unknown): Promise<void>
}

export type FilesystemFileHandleLike = {
  kind: 'file'
  name: string
  getFile(): Promise<FilesystemFileLike>
  isSameEntry(other: FilesystemFileHandleLike): Promise<boolean>
  queryPermission?(descriptor: { mode: PermissionMode }): Promise<PermissionState>
  requestPermission?(descriptor: { mode: PermissionMode }): Promise<PermissionState>
  createWritable?(options?: {
    keepExistingData?: boolean
  }): Promise<FilesystemWritableStreamLike>
}

export type FilesystemDirectoryHandleLike = {
  kind: 'directory'
  name: string
  entries(): AsyncIterableIterator<[string, FilesystemFileHandleLike | FilesystemDirectoryHandleLike]>
  getFileHandle?(
    name: string,
    options?: { create?: boolean }
  ): Promise<FilesystemFileHandleLike>
  isSameEntry?(other: unknown): Promise<boolean>
  /** Present on some browsers; its presence never authorizes a directory write. */
  createWritable?(): Promise<FilesystemWritableStreamLike>
}

export type FilesystemAccessEnv = {
  isSecureContext: boolean
  showOpenFilePicker?: (options?: unknown) => Promise<FilesystemFileHandleLike[]>
  showDirectoryPicker?: (options?: unknown) => Promise<FilesystemDirectoryHandleLike>
}

export type FilesystemRouteReason =
  | 'insecure-context'
  | 'api-missing'
  | 'api-not-callable'

export type FilesystemRouteCapability = {
  supported: boolean
  reason?: FilesystemRouteReason
}

export type FilesystemCapabilities = {
  fileOpen: FilesystemRouteCapability
  fileSave: FilesystemRouteCapability
  directoryDiscovery: FilesystemRouteCapability
}

function pickerReason(
  env: FilesystemAccessEnv,
  picker: ((options?: unknown) => Promise<unknown>) | undefined
): FilesystemRouteReason | null {
  if (!env.isSecureContext) return 'insecure-context'
  if (picker === undefined || picker === null) return 'api-missing'
  if (typeof picker !== 'function') return 'api-not-callable'
  return null
}

/**
 * Detect routes independently. An available picker is not proof that returned
 * handles are writable; folder-only support stays read-only discovery because
 * Save requires the separate file picker.
 */
export function detectFilesystemAccess(
  env: FilesystemAccessEnv
): FilesystemCapabilities {
  const fileReason = pickerReason(env, env.showOpenFilePicker)
  const dirReason = pickerReason(env, env.showDirectoryPicker)
  return {
    fileOpen: fileReason ? { supported: false, reason: fileReason } : { supported: true },
    fileSave: fileReason ? { supported: false, reason: fileReason } : { supported: true },
    directoryDiscovery: dirReason
      ? { supported: false, reason: dirReason }
      : { supported: true }
  }
}

export type FilesystemAccessErrorCode =
  | 'unsupported'
  | 'cancelled'
  | 'invalid-selection'
  | 'invalid-firmware'
  | 'invalid-geometry'
  | 'identity-mismatch'
  | 'permission-denied'
  | 'external-change'
  | 'stale-attempt'
  | 'io'

export class FilesystemAccessError extends Error {
  code: FilesystemAccessErrorCode
  detail?: string

  constructor(code: FilesystemAccessErrorCode, message: string, detail?: string) {
    super(message)
    this.name = 'FilesystemAccessError'
    this.code = code
    this.detail = detail
  }
}

function isAbort(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { name?: string }).name === 'AbortError'
  )
}

/**
 * Fresh explicit user-activated picker for exactly one existing `.keymap`.
 * Returns the selected file handle; never inspects or requests write access.
 */
export async function pickFirmwareFile(
  env: FilesystemAccessEnv
): Promise<FilesystemFileHandleLike> {
  if (!env.isSecureContext || typeof env.showOpenFilePicker !== 'function') {
    throw new FilesystemAccessError('unsupported', 'File picker is unavailable in this browser')
  }
  let handles: FilesystemFileHandleLike[]
  try {
    handles = await env.showOpenFilePicker({
      multiple: false,
      types: [{ description: 'ZMK keymap', accept: { 'text/plain': ['.keymap'] } }]
    })
  } catch (error) {
    if (isAbort(error)) {
      throw new FilesystemAccessError('cancelled', 'File selection was cancelled')
    }
    throw error
  }
  if (!Array.isArray(handles) || handles.length !== 1) {
    throw new FilesystemAccessError('invalid-selection', 'Select exactly one .keymap file')
  }
  const handle = handles[0]
  if (!handle || handle.kind !== 'file' || typeof handle.getFile !== 'function' || !isUserKeymapFilename(handle.name)) {
    throw new FilesystemAccessError('invalid-selection', 'Selection is not a file handle')
  }
  return handle
}

export type FirmwareCandidate = {
  handle: FilesystemFileHandleLike
  name: string
  /** Exact bytes read from disk; authoritative for external-change detection. */
  bytes: number[]
  /** Exact strict UTF-8 decode of those bytes, unstripped and unnormalized. */
  source: string
  keymap: ParsedKeymap
  parseWarnings: string[]
  /** Present when the file was discovered through a directory route. */
  directory?: FilesystemDirectoryHandleLike
}

function toBytes(buffer: ArrayBuffer): number[] {
  return Array.from(new Uint8Array(buffer))
}

/** Strict UTF-8 decode; refuses to replace invalid bytes. */
function decodeUtf8Strict(
  bytes: number[],
  code: FilesystemAccessErrorCode = 'invalid-firmware'
): string {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(new Uint8Array(bytes))
  } catch {
    throw new FilesystemAccessError(code, 'File is not valid UTF-8 text')
  }
}

/**
 * Read and validate one existing raw `.keymap`: exact bytes, exact source and
 * core-parsed firmware. Rejects templates, JSON-only input, empty/invalid
 * firmware, non-file handles and invalid UTF-8. Does not trim or normalize.
 */
export async function readFirmwareCandidate(
  handle: FilesystemFileHandleLike,
  options: { directory?: FilesystemDirectoryHandleLike } = {}
): Promise<FirmwareCandidate> {
  if (!handle || handle.kind !== 'file' || typeof handle.getFile !== 'function') {
    throw new FilesystemAccessError('invalid-selection', 'Selection is not a file handle')
  }
  if (!isUserKeymapFilename(handle.name)) {
    throw new FilesystemAccessError(
      'invalid-firmware',
      'Selection is not a user .keymap file'
    )
  }
  const file = await handle.getFile()
  const bytes = toBytes(await file.arrayBuffer())
  if (bytes.length === 0) {
    throw new FilesystemAccessError('invalid-firmware', 'Keymap file is empty')
  }
  const source = decodeUtf8Strict(bytes)
  if (source.trimStart().startsWith('{')) {
    throw new FilesystemAccessError(
      'invalid-firmware',
      'Keymap must be ZMK .keymap text, not JSON'
    )
  }
  let parsed: ParsedKeymap
  let parseWarnings: string[]
  try {
    const dts = parseDtsKeymap(source, {
      keyboard: 'filesystem',
      keymap: 'filesystem',
      layout: 'LAYOUT'
    })
    parseWarnings = Array.isArray(dts.warnings) ? [...dts.warnings] : []
    parsed = parseKeymap(dts)
  } catch (error) {
    throw new FilesystemAccessError(
      'invalid-firmware',
      error instanceof Error ? error.message : 'Keymap could not be parsed'
    )
  }
  if (!parsed.layers?.length) {
    throw new FilesystemAccessError('invalid-firmware', 'Keymap has no layers')
  }
  return {
    handle,
    name: handle.name,
    bytes,
    source,
    keymap: parsed,
    parseWarnings,
    ...(options.directory ? { directory: options.directory } : {})
  }
}

/** Explicit Open: pick one keymap, then stage it. */
export async function openFirmwareCandidate(
  env: FilesystemAccessEnv
): Promise<FirmwareCandidate> {
  return readFirmwareCandidate(await pickFirmwareFile(env))
}

/**
 * Sidecar geometry filename for a discovered keymap, with the CHG-007 collision
 * exclusion: core's helper would map `foo.keymap.keymap` to `foo.keymap.json`,
 * which is a firmware sidecar name and must never be read as layout.
 */
export function matchingGeometryFilename(keymapFilename: string): string | null {
  const candidate = matchingInfoJsonFilename(keymapFilename)
  if (!candidate) return null
  if (candidate.toLowerCase().endsWith('.keymap.json')) return null
  return candidate
}

/**
 * Parse and core-validate a supplied geometry text. Any invalid, non-layout or
 * firmware-shaped input throws `invalid-geometry`; callers must not fall back to
 * inference for a supplied-but-invalid geometry.
 */
export function validateGeometryJson(text: string): unknown {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    throw new FilesystemAccessError('invalid-geometry', 'Geometry is not valid JSON')
  }
  try {
    validateInfoJson(parsed)
  } catch (error) {
    throw new FilesystemAccessError(
      'invalid-geometry',
      error instanceof Error ? error.message : 'Geometry is not a layout info.json'
    )
  }
  return parsed
}

export type GeometryCandidate = {
  handle: FilesystemFileHandleLike
  name: string
  bytes: number[]
  text: string
  json: unknown
}

/** Read and validate a supplied geometry file. */
export async function readGeometryCandidate(
  handle: FilesystemFileHandleLike
): Promise<GeometryCandidate> {
  if (!handle || handle.kind !== 'file' || typeof handle.getFile !== 'function') {
    throw new FilesystemAccessError('invalid-selection', 'Selection is not a file handle')
  }
  let bytes: number[]
  try {
    const file = await handle.getFile()
    bytes = toBytes(await file.arrayBuffer())
  } catch {
    throw new FilesystemAccessError('invalid-geometry', 'Geometry could not be read')
  }
  if (bytes.length === 0) {
    throw new FilesystemAccessError('invalid-geometry', 'Geometry file is empty')
  }
  const text = decodeUtf8Strict(bytes, 'invalid-geometry')
  return { handle, name: handle.name, bytes, text, json: validateGeometryJson(text) }
}

export type DiscoveredKeymap = { name: string; handle: FilesystemFileHandleLike }

export type DirectoryInventory = {
  directory: FilesystemDirectoryHandleLike
  /** Eligible direct `.keymap` files, sorted by exact UTF-16 code-unit name order. */
  keymaps: DiscoveredKeymap[]
  /** Direct non-eligible file names, disclosed without reading their contents. */
  ignoredNames: string[]
}

const byCodeUnit = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

/**
 * Read-only direct discovery of a config directory. Enumerates direct entries
 * only (never recurses or traverses parents), lists eligible `.keymap` files in
 * exact code-unit name order, discloses ignored sidecar names without reading
 * them, and never requests a writable stream. A failed enumeration throws; it is
 * not an empty inventory.
 */
export async function discoverDirectoryKeymaps(
  directory: FilesystemDirectoryHandleLike
): Promise<DirectoryInventory> {
  if (!directory || directory.kind !== 'directory' || typeof directory.entries !== 'function') {
    throw new FilesystemAccessError('invalid-selection', 'Selection is not a directory handle')
  }
  const keymaps: DiscoveredKeymap[] = []
  const ignoredNames: string[] = []
  try {
    for await (const [name, entry] of directory.entries()) {
      if (!entry || entry.kind !== 'file') continue
      if (isUserKeymapFilename(name)) keymaps.push({ name, handle: entry })
      else ignoredNames.push(name)
    }
  } catch (error) {
    if (error instanceof FilesystemAccessError) throw error
    throw new FilesystemAccessError('io', 'Directory could not be enumerated')
  }
  keymaps.sort((a, b) => byCodeUnit(a.name, b.name))
  ignoredNames.sort(byCodeUnit)
  return { directory, keymaps, ignoredNames }
}

export type SaveAuthorization = {
  /** Only this attempt's proved-equivalent file-picker handle may be written. */
  handle: FilesystemFileHandleLike
}

export type AuthorizeSaveOptions = {
  env: FilesystemAccessEnv
  /** The accepted document handle the fresh pick must prove equivalence to. */
  accepted: FilesystemFileHandleLike
  /** Directory route context: the exact direct entry is re-resolved and proved. */
  directory?: { handle: FilesystemDirectoryHandleLike; entryName: string }
  /** Per-attempt generation guard, evaluated after every await. */
  isCurrent?: () => boolean
}

/**
 * Per-attempt Save authorization (both routes). Starts with a fresh
 * user-activated `showOpenFilePicker` selection of exactly one existing
 * `.keymap`, proves `isSameEntry` against the accepted handle, and for the
 * directory route additionally resolves and proves the exact direct entry
 * without creation. Never requests read or write permission and never opens a
 * writable stream. `isCurrent` is rechecked after each await so a superseded
 * attempt fails with `stale-attempt`.
 */
export async function authorizeSaveViaFilePicker(
  options: AuthorizeSaveOptions
): Promise<SaveAuthorization> {
  const picked = await pickFirmwareFile(options.env)
  await verifyFilesystemIdentity(picked, options)
  return { handle: picked }
}

/** Repeat proof at pre-stream and readback boundaries without another prompt. */
export async function verifyFilesystemIdentity(
  picked: FilesystemFileHandleLike,
  options: Omit<AuthorizeSaveOptions, 'env'>
): Promise<void> {
  const { accepted, directory, isCurrent } = options
  const checkCurrent = (): boolean => isCurrent?.() ?? true
  if (!checkCurrent()) throw new FilesystemAccessError('stale-attempt', 'Save attempt was superseded')

  if (typeof picked.isSameEntry !== 'function') {
    throw new FilesystemAccessError('identity-mismatch', 'Selected handle cannot prove identity')
  }
  const sameAsAccepted = await picked.isSameEntry(accepted)
  if (!checkCurrent()) throw new FilesystemAccessError('stale-attempt', 'Save attempt was superseded')
  if (!sameAsAccepted) {
    throw new FilesystemAccessError('identity-mismatch', 'Selected file is not the accepted document')
  }

  if (directory) {
    if (typeof directory.handle.getFileHandle !== 'function') {
      throw new FilesystemAccessError(
        'identity-mismatch',
        'Directory entry cannot be re-resolved without creation'
      )
    }
    let entry: FilesystemFileHandleLike
    try {
      entry = await directory.handle.getFileHandle(directory.entryName, { create: false })
    } catch {
      throw new FilesystemAccessError(
        'identity-mismatch',
        'Accepted directory entry could not be resolved'
      )
    }
    if (!checkCurrent()) throw new FilesystemAccessError('stale-attempt', 'Save attempt was superseded')
    const entryMatchesPicked =
      typeof entry.isSameEntry === 'function' ? await entry.isSameEntry(picked) : false
    const entryMatchesAccepted =
      typeof entry.isSameEntry === 'function' ? await entry.isSameEntry(accepted) : false
    if (!checkCurrent()) throw new FilesystemAccessError('stale-attempt', 'Save attempt was superseded')
    if (!entryMatchesPicked || !entryMatchesAccepted) {
      throw new FilesystemAccessError(
        'identity-mismatch',
        'Directory entry does not identify the accepted file'
      )
    }
  }
}

/**
 * Non-prompting write-permission query. Never triggers a browser prompt; a
 * handle without `queryPermission` reports `prompt` so callers must expose an
 * explicit Grant access action.
 */
export async function queryWritePermission(
  handle: FilesystemFileHandleLike
): Promise<PermissionState> {
  if (typeof handle.queryPermission !== 'function') return 'prompt'
  try {
    return await handle.queryPermission({ mode: 'readwrite' })
  } catch {
    return 'prompt'
  }
}

/**
 * Explicit Grant access action. Only this request may prompt; it must be called
 * from a fresh user gesture, never automatically after an await.
 */
export async function grantWritePermission(
  handle: FilesystemFileHandleLike
): Promise<PermissionState> {
  if (typeof handle.requestPermission !== 'function') {
    throw new FilesystemAccessError('unsupported', 'Write permission cannot be requested here')
  }
  return handle.requestPermission({ mode: 'readwrite' })
}
