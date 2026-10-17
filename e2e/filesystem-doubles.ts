import type { Page } from '@playwright/test'

/**
 * Synthetic File System Access doubles for Phase 3 browser workflow coverage.
 *
 * The harness installs `window.showOpenFilePicker` / `window.showDirectoryPicker`
 * backed by in-memory entries, so no test touches real files, real pickers, or
 * real permissions. Every picker call, permission query/request, identity proof,
 * read, write, close, abort, directory enumeration and exact-entry resolution is
 * appended to a call log. Fetch calls to product routes and system-clipboard
 * writes are recorded in a separate forbidden-I/O log that must stay empty.
 *
 * Handles carry stable `__fsId` entry ids: a fresh picker selection returns a
 * new wrapper object with the same id, so `isSameEntry` proofs exercise the
 * real identity path. Directory children are read-only discovery inputs unless
 * `childWritable` is set; the directory handle itself never exposes permission
 * or writable entry points.
 */

export type FilesystemDoublePermission = 'granted' | 'prompt' | 'denied'

export interface FilesystemDoubleEntry {
  /** Stable entry id; defaults to the file name. Alias handles share one id. */
  id?: string
  /** Exact UTF-8 text content of the synthetic disk file. */
  text: string
  /** Non-prompting query outcome for this handle. */
  query?: FilesystemDoublePermission
  /** Prompt outcome when no `grants` remain. */
  grant?: FilesystemDoublePermission
  /** Consumed in order by successive `requestPermission` calls. */
  grants?: FilesystemDoublePermission[]
}

export interface FilesystemDoubleFailure {
  name?: string
  message?: string
}

export interface FilesystemDoubleConfig {
  /** Defaults to true; false shadows `window.isSecureContext` with false. */
  secure?: boolean
  /** Defaults to true; false removes the file picker (folder-only browser). */
  filePicker?: boolean
  /** Defaults to true; false removes the directory picker. */
  dirPicker?: boolean
  /** Fallback query outcome for entries without one. Defaults to granted. */
  defaultQuery?: FilesystemDoublePermission
  /** Synthetic disk files by exact file name. */
  entries?: Record<string, FilesystemDoubleEntry>
  /** Synthetic directories by name with direct children listed verbatim. */
  dirs?: Record<string, { children: string[]; failEnumerate?: FilesystemDoubleFailure }>
  /** Consumed in order by `showOpenFilePicker`; exhaustion throws loudly. */
  fileQueue?: Array<{ name: string } | { cancel: true } | { fail: FilesystemDoubleFailure }>
  /** Consumed in order by `showDirectoryPicker`; exhaustion throws loudly. */
  dirQueue?: Array<{ dir: string } | { cancel: true } | { fail: FilesystemDoubleFailure }>
  /** Injected failures at the write-path boundaries. */
  fail?: {
    getFile?: FilesystemDoubleFailure
    createWritable?: FilesystemDoubleFailure
    write?: FilesystemDoubleFailure
    /** `reject` fails before bytes change; `after-write` applies bytes first. */
    close?: 'reject' | 'after-write'
  }
  /** Allow `createWritable` on directory-derived children. Defaults to false. */
  childWritable?: boolean
}

export interface FilesystemDoubleLogEntry {
  op: string
  [key: string]: unknown
}

/**
 * Install the doubles before page scripts run. Must stay free of outer-scope
 * references: Playwright serializes this function into the page.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function installFilesystemDoubleHarness(config: any): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any
  const cfg = {
    secure: config.secure !== false,
    filePicker: config.filePicker !== false,
    dirPicker: config.dirPicker !== false,
    defaultQuery: config.defaultQuery ?? 'granted',
    entries: config.entries ?? {},
    dirs: config.dirs ?? {},
    fileQueue: [...(config.fileQueue ?? [])],
    dirQueue: [...(config.dirQueue ?? [])],
    fail: config.fail ? { ...config.fail } : {},
    childWritable: config.childWritable === true
  }
  const state: {
    disk: Record<string, { id: string; bytes: number[] }>
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    log: any[]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    io: any[]
  } = { disk: {}, log: [], io: [] }
  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  let gesture = 0
  window.addEventListener('click', () => { gesture += 1 }, true)
  const requireGesture = () => {
    // Chromium runs microtasks between native listeners; check the active
    // event dispatch instead of expiring before Svelte's delegated listener.
    if (w.event?.type !== 'click') throw new Error('Synthetic picker/permission prompt requires a fresh gesture')
    return gesture
  }
  for (const [name, entry] of Object.entries(cfg.entries)) {
    const typed = entry as { id?: string; text?: string }
    state.disk[name] = {
      id: typed.id ?? name,
      bytes: Array.from(encoder.encode(typed.text ?? ''))
    }
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const log = (record: any): void => {
    state.log.push(record)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const failNow = (spec: any, fallback: { name: string; message: string }): Error => {
    const error = new Error(spec?.message ?? fallback.message) as Error & { name: string }
    error.name = spec?.name ?? fallback.name
    return error
  }

  const fileHandle = (name: string, child: boolean): unknown => {
    const record = state.disk[name]
    const entry = (cfg.entries[name] ?? {}) as {
      query?: string
      grant?: string
      grants?: string[]
    }
    const id = record?.id ?? name
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handle: any = {
      kind: 'file',
      name,
      __fsId: id,
      __fsChild: child,
      getFile: async () => {
        log({ op: 'read', id, name, child })
        if (cfg.fail.getFile) {
          throw failNow(cfg.fail.getFile, { name: 'NotReadableError', message: `Cannot read ${name}` })
        }
        const bytes = [...(state.disk[name]?.bytes ?? [])]
        return {
          name,
          size: bytes.length,
          lastModified: 0,
          arrayBuffer: async () => new Uint8Array(bytes).buffer
        }
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      isSameEntry: async (other: any) => {
        const otherId = other?.__fsId ?? null
        const result = !!other && otherId === id
        log({ op: 'isSameEntry', id, other: otherId, result })
        return result
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      queryPermission: async (descriptor: any) => {
        log({ op: 'queryPermission', id, name, mode: descriptor?.mode ?? null, child })
        return entry.query ?? cfg.defaultQuery
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      requestPermission: async (descriptor: any) => {
        log({ op: 'requestPermission', id, name, mode: descriptor?.mode ?? null, child, gesture: requireGesture() })
        const outcome = Array.isArray(entry.grants) && entry.grants.length > 0 ? entry.grants.shift()! : entry.grant ?? 'granted'
        entry.query = outcome
        return outcome
      }
    }
    if (!child || cfg.childWritable) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      handle.createWritable = async (options: any) => {
        log({ op: 'createWritable', id, name, child, keepExistingData: options?.keepExistingData ?? null })
        if (cfg.fail.createWritable) {
          throw failNow(cfg.fail.createWritable, { name: 'NotAllowedError', message: `Cannot write ${name}` })
        }
        let staged: number[] | null = null
        return {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          write: async (data: any) => {
            log({ op: 'write', id, name, bytes: data?.length ?? null })
            if (cfg.fail.write) {
              throw failNow(cfg.fail.write, { name: 'IOError', message: `Write failed for ${name}` })
            }
            staged = Array.from(data instanceof Uint8Array ? data : new Uint8Array(data))
          },
          close: async () => {
            log({ op: 'close', id, name })
            if (cfg.fail.close === 'after-write') {
              if (staged) state.disk[name].bytes = staged
              throw failNow(
                { name: 'IOError', message: `Close failed for ${name} after bytes changed` },
                { name: 'IOError', message: 'close failed' }
              )
            }
            if (cfg.fail.close === 'reject') {
              throw failNow(
                { name: 'IOError', message: `Close failed for ${name}` },
                { name: 'IOError', message: 'close failed' }
              )
            }
            if (staged) state.disk[name].bytes = staged
          },
          abort: async () => {
            log({ op: 'abort', id, name })
          }
        }
      }
    }
    return handle
  }

  const dirHandle = (dirName: string): unknown => {
    const dir = (cfg.dirs[dirName] ?? { children: [] }) as {
      children?: string[]
      failEnumerate?: { name?: string; message?: string }
    }
    return {
      kind: 'directory',
      name: dirName,
      __fsId: `dir:${dirName}`,
      entries: async function* () {
        log({ op: 'enumerate', dir: dirName })
        if (dir.failEnumerate) {
          throw failNow(dir.failEnumerate, { name: 'IOError', message: `Cannot list ${dirName}` })
        }
        for (const childName of dir.children ?? []) {
          if (cfg.entries[childName]) yield [childName, fileHandle(childName, true)]
          else {
            yield [
              childName,
              {
                kind: 'directory',
                name: childName,
                __fsId: `dir:${childName}`,
                isSameEntry: async () => false
              }
            ]
          }
        }
      },
      getFileHandle: async (name: string, options?: { create?: boolean }) => {
        log({ op: 'resolve', dir: dirName, name, create: options?.create ?? null })
        if (options?.create) {
          throw failNow(
            { name: 'NotAllowedError', message: 'File creation is not permitted' },
            { name: 'NotAllowedError', message: 'denied' }
          )
        }
        if (!cfg.entries[name] || !(dir.children ?? []).includes(name)) {
          const missing = new Error(`No such entry ${name}`) as Error & { name: string }
          missing.name = 'NotFoundError'
          throw missing
        }
        return fileHandle(name, true)
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      isSameEntry: async (other: any) => !!other && other?.__fsId === `dir:${dirName}`
    }
  }

  if (cfg.filePicker) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    w.showOpenFilePicker = async (options: any) => {
      log({ op: 'filePicker', multiple: options?.multiple ?? null, gesture: requireGesture() })
      const next = cfg.fileQueue.shift()
      if (!next) throw new Error('Filesystem test double exhausted its file-picker queue')
      if (next.cancel) throw new DOMException('The user aborted a request', 'AbortError')
      if (next.fail) {
        throw failNow(next.fail, { name: 'NotAllowedError', message: 'File selection failed' })
      }
      if (!cfg.entries[next.name]) {
        throw failNow(
          { name: 'NotFoundError', message: `Unknown test entry ${next.name}` },
          { name: 'NotFoundError', message: 'missing' }
        )
      }
      const handle = fileHandle(next.name, false) as { __fsId: string }
      log({ op: 'filePicked', id: handle.__fsId, name: next.name })
      return [handle]
    }
  } else {
    try {
      w.showOpenFilePicker = undefined
    } catch {
      /* keep the native value out of reach */
    }
  }

  if (cfg.dirPicker) {
    w.showDirectoryPicker = async (options: { mode?: string }) => {
      log({ op: 'dirPicker', mode: options?.mode, gesture: requireGesture() })
      const next = cfg.dirQueue.shift()
      if (!next) throw new Error('Filesystem test double exhausted its directory-picker queue')
      if (next.cancel) throw new DOMException('The user aborted a request', 'AbortError')
      if (next.fail) {
        throw failNow(next.fail, { name: 'NotAllowedError', message: 'Folder selection failed' })
      }
      if (!cfg.dirs[next.dir]) {
        throw failNow(
          { name: 'NotFoundError', message: `Unknown test directory ${next.dir}` },
          { name: 'NotFoundError', message: 'missing' }
        )
      }
      log({ op: 'dirPicked', dir: next.dir })
      return dirHandle(next.dir)
    }
  } else {
    try {
      w.showDirectoryPicker = undefined
    } catch {
      /* keep the native value out of reach */
    }
  }

  if (!cfg.secure) {
    try {
      Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true })
    } catch {
      /* a non-configurable native stays; capability detection then governs */
    }
  }

  try {
    const rawFetch = w.fetch.bind(w)
    w.fetch = async (...args: unknown[]) => {
      try {
        const target = args[0] as string
        const init = args[1] as { method?: string } | undefined
        const url = new URL(String(target), w.location.href)
        if (url.origin === w.location.origin && /^\/(keymap|github)(\/|$)/.test(url.pathname)) {
          state.io.push({ op: 'fetch', method: init?.method ?? 'GET', url: url.pathname })
        }
      } catch {
        /* log-only wrapper never breaks the request */
      }
      return rawFetch(...args)
    }
  } catch {
    /* without fetch there is nothing to observe */
  }

  try {
    const clipboard = w.navigator?.clipboard
    if (clipboard) {
      const rawWrite = clipboard.writeText.bind(clipboard)
      clipboard.writeText = async (text: string) => {
        state.io.push({ op: 'clipboard-write', chars: String(text).length })
        return rawWrite(text)
      }
    }
  } catch {
    /* clipboard observation is best-effort */
  }

  w.__fsLog = () => [...state.log]
  w.__fsIo = () => [...state.io]
  w.__fsDisk = (name: string) => decoder.decode(new Uint8Array(state.disk[name]?.bytes ?? []))
  w.__fsSetDisk = (name: string, text: string) => {
    const id = state.disk[name]?.id ?? (cfg.entries[name]?.id as string | undefined) ?? name
    state.disk[name] = { id, bytes: Array.from(encoder.encode(text)) }
    log({ op: 'externalSet', id, name })
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  w.__fsPushFileQueue = (items: any[]) => {
    cfg.fileQueue.push(...items)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  w.__fsPushDirQueue = (items: any[]) => {
    cfg.dirQueue.push(...items)
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  w.__fsSetFail = (fail: any) => {
    cfg.fail = fail ? { ...fail } : {}
  }
  w.__fsSetDefaultQuery = (query: string) => {
    cfg.defaultQuery = query
  }
}

/** Install the doubles before any page script runs. */
export async function installFilesystemDoubles(page: Page, config: FilesystemDoubleConfig): Promise<void> {
  await page.addInitScript(installFilesystemDoubleHarness, config)
}

type FilesystemDoubleWindow = {
  __fsLog: () => FilesystemDoubleLogEntry[]
  __fsIo: () => FilesystemDoubleLogEntry[]
  __fsDisk: (name: string) => string
  __fsSetDisk: (name: string, text: string) => void
  __fsPushFileQueue: (items: unknown[]) => void
  __fsPushDirQueue: (items: unknown[]) => void
  __fsSetFail: (fail: FilesystemDoubleConfig['fail'] | null) => void
  __fsSetDefaultQuery: (query: FilesystemDoublePermission) => void
}

export async function fsLog(page: Page): Promise<FilesystemDoubleLogEntry[]> {
  return page.evaluate(() => (window as unknown as FilesystemDoubleWindow).__fsLog())
}

export async function fsIo(page: Page): Promise<FilesystemDoubleLogEntry[]> {
  return page.evaluate(() => (window as unknown as FilesystemDoubleWindow).__fsIo())
}

export async function fsDisk(page: Page, name: string): Promise<string> {
  return page.evaluate(target => (window as unknown as FilesystemDoubleWindow).__fsDisk(target), name)
}

/** Rewrite synthetic disk bytes behind the app's back (external mutation). */
export async function fsSetDisk(page: Page, name: string, text: string): Promise<void> {
  await page.evaluate(([target, content]) => (window as unknown as FilesystemDoubleWindow).__fsSetDisk(target, content), [name, text])
}

export async function fsPushFileQueue(
  page: Page,
  items: NonNullable<FilesystemDoubleConfig['fileQueue']>
): Promise<void> {
  await page.evaluate(queue => (window as unknown as FilesystemDoubleWindow).__fsPushFileQueue(queue), items)
}

export async function fsSetFail(page: Page, fail: FilesystemDoubleConfig['fail'] | null): Promise<void> {
  await page.evaluate(value => (window as unknown as FilesystemDoubleWindow).__fsSetFail(value), fail)
}

export function countOps(log: FilesystemDoubleLogEntry[], op: string): number {
  return log.filter(entry => entry.op === op).length
}
