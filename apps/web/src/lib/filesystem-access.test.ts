import { describe, expect, it, vi } from 'vitest'
import {
  authorizeSaveViaFilePicker,
  detectFilesystemAccess,
  discoverDirectoryKeymaps,
  grantWritePermission,
  matchingGeometryFilename,
  openFirmwareCandidate,
  pickFirmwareFile,
  queryWritePermission,
  readFirmwareCandidate,
  readGeometryCandidate,
  validateGeometryJson,
  type FilesystemAccessEnv,
  type FilesystemDirectoryHandleLike,
  type FilesystemFileHandleLike
} from './filesystem-access'

function env(partial: Partial<FilesystemAccessEnv>): FilesystemAccessEnv {
  return { isSecureContext: true, ...partial }
}

const openPicker = () => Promise.resolve([])
const dirPicker = () => Promise.resolve({} as never)

describe('detectFilesystemAccess', () => {
  it('reports both routes when a secure context exposes callable pickers', () => {
    const caps = detectFilesystemAccess(
      env({ showOpenFilePicker: openPicker, showDirectoryPicker: dirPicker })
    )
    expect(caps.fileOpen.supported).toBe(true)
    expect(caps.fileSave.supported).toBe(true)
    expect(caps.directoryDiscovery.supported).toBe(true)
  })

  it('disables every route in an insecure context', () => {
    const caps = detectFilesystemAccess(
      env({
        isSecureContext: false,
        showOpenFilePicker: openPicker,
        showDirectoryPicker: dirPicker
      })
    )
    expect(caps.fileOpen.supported).toBe(false)
    expect(caps.fileOpen.reason).toBe('insecure-context')
    expect(caps.directoryDiscovery.supported).toBe(false)
  })

  it('treats a folder-only browser as read-only discovery without file save', () => {
    const caps = detectFilesystemAccess(env({ showDirectoryPicker: dirPicker }))
    expect(caps.fileOpen.supported).toBe(false)
    expect(caps.fileSave.supported).toBe(false)
    expect(caps.directoryDiscovery.supported).toBe(true)
  })

  it('treats a non-callable picker property as missing', () => {
    const caps = detectFilesystemAccess(
      env({ showOpenFilePicker: 42 as never })
    )
    expect(caps.fileOpen.supported).toBe(false)
    expect(caps.fileOpen.reason).toBe('api-not-callable')
  })

  it('explains a missing picker without claiming browser-wide support', () => {
    const caps = detectFilesystemAccess(env({}))
    expect(caps.fileOpen.reason).toBe('api-missing')
    expect(caps.directoryDiscovery.reason).toBe('api-missing')
  })
})

// ---- shared synthetic fixtures ----

function validKeymapText(): string {
  return [
    '#include <behaviors.dtsi>',
    '#include <dt-bindings/zmk/keys.h>',
    '',
    '/ {',
    '    keymap {',
    '        compatible = "zmk,keymap";',
    '        default_layer {',
    '            bindings = <&kp A &kp B>;',
    '        };',
    '    };',
    '};',
    ''
  ].join('\n')
}

const utf8 = (text: string): number[] => Array.from(new TextEncoder().encode(text))

type SyntheticFile = { name: string; bytes: number[]; lastModified?: number }
type SyntheticHandle = FilesystemFileHandleLike & { id: string }

function makeHandle(id: string, file: SyntheticFile): SyntheticHandle {
  const bytes = file.bytes
  return {
    id,
    kind: 'file',
    name: file.name,
    getFile: async () => ({
      name: file.name,
      size: bytes.length,
      lastModified: file.lastModified ?? 0,
      arrayBuffer: async () => new Uint8Array(bytes).buffer
    }),
    isSameEntry: async (other) => (other as { id?: string } | null)?.id === id
  }
}

describe('pickFirmwareFile', () => {
  it('refuses an insecure context before invoking a callable picker', async () => {
    const picker = vi.fn(async () => [makeHandle('a', { name: 'a.keymap', bytes: utf8(validKeymapText()) })])
    await expect(pickFirmwareFile({ isSecureContext: false, showOpenFilePicker: picker })).rejects.toMatchObject({ code: 'unsupported' })
    expect(picker).not.toHaveBeenCalled()
  })
  it('validates the filename even when the picker ignores its filter', async () => {
    await expect(pickFirmwareFile(env({ showOpenFilePicker: async () => [makeHandle('a', { name: 'a.json', bytes: utf8(validKeymapText()) })] }))).rejects.toMatchObject({ code: 'invalid-selection' })
  })
  it('requests exactly one keymap and returns the selected file handle', async () => {
    const handle = makeHandle('a', { name: 'a.keymap', bytes: utf8(validKeymapText()) })
    let options: unknown
    const selection = await pickFirmwareFile(
      env({ showOpenFilePicker: async (o) => { options = o; return [handle] } })
    )
    expect(selection).toBe(handle)
    expect((options as { multiple?: boolean }).multiple).toBe(false)
  })

  it('maps picker cancellation to a cancelled error', async () => {
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' })
    await expect(
      pickFirmwareFile(env({ showOpenFilePicker: async () => { throw abort } }))
    ).rejects.toMatchObject({ code: 'cancelled' })
  })

  it('refuses a multi-selection and a non-file handle', async () => {
    const handle = makeHandle('a', { name: 'a.keymap', bytes: utf8(validKeymapText()) })
    await expect(
      pickFirmwareFile(env({ showOpenFilePicker: async () => [handle, handle] }))
    ).rejects.toMatchObject({ code: 'invalid-selection' })
    await expect(
      pickFirmwareFile(env({ showOpenFilePicker: async () => [{ kind: 'directory', name: 'd' } as never] }))
    ).rejects.toMatchObject({ code: 'invalid-selection' })
  })
})

describe('readFirmwareCandidate', () => {
  it('preserves the UTF-8 BOM in the exact source baseline', async () => {
    const text = '\uFEFF' + validKeymapText()
    expect((await readFirmwareCandidate(makeHandle('a', { name: 'a.keymap', bytes: utf8(text) }))).source).toBe(text)
  })
  it('preserves exact bytes and untrimmed UTF-8 source', async () => {
    const text = `\r\n  ${validKeymapText()}  \r\n`
    const handle = makeHandle('a', { name: 'a.keymap', bytes: utf8(text) })
    const candidate = await readFirmwareCandidate(handle)
    expect(candidate.bytes).toEqual(utf8(text))
    expect(candidate.source).toBe(text)
    expect(candidate.name).toBe('a.keymap')
    expect(candidate.handle).toBe(handle)
    expect(candidate.keymap.layers.length).toBe(1)
  })

  it('rejects JSON-only input', async () => {
    const handle = makeHandle('a', { name: 'a.keymap', bytes: utf8('{"layers":[["&kp A"]]}') })
    await expect(readFirmwareCandidate(handle)).rejects.toMatchObject({ code: 'invalid-firmware' })
  })

  it('rejects invalid UTF-8 instead of silently replacing it', async () => {
    const handle = makeHandle('a', { name: 'a.keymap', bytes: [0xff, 0xfe, 0x00, 0x41] })
    await expect(readFirmwareCandidate(handle)).rejects.toMatchObject({ code: 'invalid-firmware' })
  })

  it('rejects a template filename and empty firmware', async () => {
    await expect(
      readFirmwareCandidate(makeHandle('t', { name: 'a.keymap.template', bytes: utf8(validKeymapText()) }))
    ).rejects.toMatchObject({ code: 'invalid-firmware' })
    await expect(
      readFirmwareCandidate(makeHandle('e', { name: 'a.keymap', bytes: [] }))
    ).rejects.toMatchObject({ code: 'invalid-firmware' })
  })
})

describe('openFirmwareCandidate', () => {
  it('stages the picked file with its transferable baseline', async () => {
    const handle = makeHandle('a', { name: 'a.keymap', bytes: utf8(validKeymapText()) })
    const candidate = await openFirmwareCandidate(
      env({ showOpenFilePicker: async () => [handle] })
    )
    expect(candidate.handle).toBe(handle)
    expect(candidate.source).toContain('compatible = "zmk,keymap"')
  })
})

const validInfoText = JSON.stringify({
  id: 'kb',
  layouts: { LAYOUT: { layout: [{ x: 0, y: 0 }, { x: 1, y: 0 }] } }
})

function geometryError(text: string): string | null {
  try {
    validateGeometryJson(text)
    return null
  } catch (error) {
    return (error as { code?: string }).code ?? null
  }
}

describe('matchingGeometryFilename', () => {
  it('maps a keymap stem to its sidecar json', () => {
    expect(matchingGeometryFilename('a.keymap')).toBe('a.json')
  })

  it('excludes the reserved info/keymap stems', () => {
    expect(matchingGeometryFilename('info.keymap')).toBeNull()
    expect(matchingGeometryFilename('keymap.keymap')).toBeNull()
  })

  it('excludes the .keymap.json firmware-sidecar collision', () => {
    expect(matchingGeometryFilename('foo.keymap.keymap')).toBeNull()
  })

  it('returns null for a non-keymap name', () => {
    expect(matchingGeometryFilename('README.md')).toBeNull()
  })
})

describe('validateGeometryJson', () => {
  it('returns parsed geometry for a valid info.json', () => {
    expect(validateGeometryJson(validInfoText)).toMatchObject({ id: 'kb' })
  })

  it.each(['not json', 'null', '{}', '{"layouts":{}}', '{"layers":[["&kp A"]]}'])(
    'refuses non-layout input %s',
    (text) => {
      expect(geometryError(text)).toBe('invalid-geometry')
    }
  )
})

describe('readGeometryCandidate', () => {
  it('reads exact bytes and validated json', async () => {
    const handle = makeHandle('g', { name: 'a.json', bytes: utf8(validInfoText) })
    const geometry = await readGeometryCandidate(handle)
    expect(geometry.name).toBe('a.json')
    expect(geometry.handle).toBe(handle)
    expect(geometry.bytes).toEqual(utf8(validInfoText))
    expect(geometry.json).toMatchObject({ id: 'kb' })
  })

  it('refuses malformed or unreadable supplied geometry', async () => {
    await expect(
      readGeometryCandidate(makeHandle('g', { name: 'a.json', bytes: utf8('{}') }))
    ).rejects.toMatchObject({ code: 'invalid-geometry' })
    const exploding = makeHandle('g', { name: 'a.json', bytes: utf8(validInfoText) })
    exploding.getFile = async () => { throw new Error('denied') }
    await expect(readGeometryCandidate(exploding)).rejects.toMatchObject({
      code: 'invalid-geometry'
    })
  })
})

type DirChild = { name: string; handle: FilesystemFileHandleLike | FilesystemDirectoryHandleLike }

function makeDirHandle(
  name: string,
  children: DirChild[],
  options: { failAfter?: number } = {}
): FilesystemDirectoryHandleLike {
  let yielded = 0
  return {
    kind: 'directory',
    name,
    entries: async function* () {
      for (const child of children) {
        if (options.failAfter !== undefined && yielded >= options.failAfter) {
          throw new Error('enumeration failed')
        }
        yielded += 1
        yield [child.name, child.handle]
      }
    }
  }
}

function discoveryFixture() {
  return {
    a: makeHandle('a', { name: 'a.keymap', bytes: utf8(validKeymapText()) }),
    B: makeHandle('B', { name: 'B.keymap', bytes: utf8(validKeymapText()) }),
    umlaut: makeHandle('u', { name: 'ä.keymap', bytes: utf8(validKeymapText()) }),
    template: makeHandle('t', { name: 'x.keymap.template', bytes: utf8(validKeymapText()) }),
    info: makeHandle('i', { name: 'info.json', bytes: utf8(validInfoText) }),
    fwSidecar: makeHandle('f', { name: 'foo.keymap.json', bytes: utf8(validInfoText) })
  }
}

describe('discoverDirectoryKeymaps', () => {
  it('lists eligible direct keymaps in exact code-unit order', async () => {
    const f = discoveryFixture()
    const dir = makeDirHandle('config', [
      { name: 'ä.keymap', handle: f.umlaut },
      { name: 'a.keymap', handle: f.a },
      { name: 'B.keymap', handle: f.B },
      { name: 'nested', handle: makeDirHandle('nested', []) },
      { name: 'x.keymap.template', handle: f.template },
      { name: 'info.json', handle: f.info }
    ])
    const inventory = await discoverDirectoryKeymaps(dir)
    expect(inventory.keymaps.map((k) => k.name)).toEqual(['B.keymap', 'a.keymap', 'ä.keymap'])
    expect(inventory.keymaps[0].handle).toBe(f.B)
    expect(inventory.ignoredNames).toContain('info.json')
    expect(inventory.ignoredNames).toContain('x.keymap.template')
    expect(inventory.ignoredNames).not.toContain('nested')
  })

  it('never recurses into nested directories or reads file contents', async () => {
    const f = discoveryFixture()
    const read = vi.fn()
    const tracked = {
      ...f.a,
      getFile: async () => {
        read()
        return f.a.getFile()
      }
    }
    const nested = makeDirHandle('nested', [{ name: 'deep.keymap', handle: f.B }])
    const dir = makeDirHandle('config', [
      { name: 'a.keymap', handle: tracked },
      { name: 'nested', handle: nested }
    ])
    const inventory = await discoverDirectoryKeymaps(dir)
    expect(inventory.keymaps.map((k) => k.name)).toEqual(['a.keymap'])
    expect(read).not.toHaveBeenCalled()
  })

  it('returns an empty inventory for an empty directory', async () => {
    const inventory = await discoverDirectoryKeymaps(makeDirHandle('config', []))
    expect(inventory.keymaps).toEqual([])
    expect(inventory.ignoredNames).toEqual([])
  })

  it('reports a failed enumeration as an error, not an empty inventory', async () => {
    const f = discoveryFixture()
    const dir = makeDirHandle(
      'config',
      [
        { name: 'a.keymap', handle: f.a },
        { name: 'B.keymap', handle: f.B }
      ],
      { failAfter: 1 }
    )
    await expect(discoverDirectoryKeymaps(dir)).rejects.toMatchObject({ code: 'io' })
  })

  it('never requests a writable stream from the directory or its children', async () => {
    const f = discoveryFixture()
    const dirWrite = vi.fn()
    const childWrite = vi.fn()
    const child = {
      ...f.a,
      createWritable: async () => {
        childWrite()
        throw new Error('refused')
      }
    }
    const dir = {
      ...makeDirHandle('config', [{ name: 'a.keymap', handle: child }]),
      createWritable: async () => {
        dirWrite()
        throw new Error('refused')
      }
    }
    await discoverDirectoryKeymaps(dir)
    expect(dirWrite).not.toHaveBeenCalled()
    expect(childWrite).not.toHaveBeenCalled()
  })
})

describe('authorizeSaveViaFilePicker', () => {
  const accepted = () => makeHandle('a', { name: 'a.keymap', bytes: utf8(validKeymapText()) })

  it('requires a fresh picker and proves isSameEntry against the accepted handle', async () => {
    const target = accepted()
    const picked = { ...target }
    const picker = vi.fn(async () => [picked])
    const auth = await authorizeSaveViaFilePicker({
      env: env({ showOpenFilePicker: picker }),
      accepted: target
    })
    expect(auth.handle).toBe(picked)
    expect(picker).toHaveBeenCalledTimes(1)
  })

  it('refuses a picked handle that is not the accepted entry', async () => {
    const other = makeHandle('b', { name: 'a.keymap', bytes: utf8(validKeymapText()) })
    await expect(
      authorizeSaveViaFilePicker({
        env: env({ showOpenFilePicker: async () => [other] }),
        accepted: accepted()
      })
    ).rejects.toMatchObject({ code: 'identity-mismatch' })
  })

  it('propagates Save-access cancellation without writing', async () => {
    const abort = Object.assign(new Error('cancelled'), { name: 'AbortError' })
    await expect(
      authorizeSaveViaFilePicker({
        env: env({ showOpenFilePicker: async () => { throw abort } }),
        accepted: accepted()
      })
    ).rejects.toMatchObject({ code: 'cancelled' })
  })

  it('additionally proves the exact direct directory entry for the directory route', async () => {
    const target = accepted()
    const picked = { ...target }
    const entry = { ...target }
    const calls: unknown[] = []
    const directory = {
      kind: 'directory' as const,
      name: 'config',
      entries: async function* () {},
      getFileHandle: async (name: string, options?: { create?: boolean }) => {
        calls.push({ name, options })
        return entry
      }
    }
    const auth = await authorizeSaveViaFilePicker({
      env: env({ showOpenFilePicker: async () => [picked] }),
      accepted: target,
      directory: { handle: directory, entryName: 'a.keymap' }
    })
    expect(auth.handle).toBe(picked)
    expect(calls).toEqual([{ name: 'a.keymap', options: { create: false } }])
  })

  it('refuses a directory whose entry is not the accepted file', async () => {
    const target = accepted()
    const picked = { ...target }
    const entry = makeHandle('z', { name: 'a.keymap', bytes: utf8(validKeymapText()) })
    const directory = {
      kind: 'directory' as const,
      name: 'config',
      entries: async function* () {},
      getFileHandle: async () => entry
    }
    await expect(
      authorizeSaveViaFilePicker({
        env: env({ showOpenFilePicker: async () => [picked] }),
        accepted: target,
        directory: { handle: directory, entryName: 'a.keymap' }
      })
    ).rejects.toMatchObject({ code: 'identity-mismatch' })
  })

  it('invalidates a stale attempt when isCurrent turns false after an await', async () => {
    const target = accepted()
    const picked = { ...target }
    let current = true
    await expect(
      authorizeSaveViaFilePicker({
        env: env({
          showOpenFilePicker: async () => {
            current = false
            return [picked]
          }
        }),
        accepted: target,
        isCurrent: () => current
      })
    ).rejects.toMatchObject({ code: 'stale-attempt' })
  })

  it('never requests readwrite or a writable stream while authorizing', async () => {
    const target = accepted()
    const requestPermission = vi.fn(async () => 'granted' as const)
    const createWritable = vi.fn()
    const picked = { ...target, requestPermission, createWritable }
    const entry = { ...target, requestPermission, createWritable }
    const dirRequest = vi.fn(async () => 'granted' as const)
    const directory = {
      kind: 'directory' as const,
      name: 'config',
      entries: async function* () {},
      getFileHandle: async () => entry,
      requestPermission: dirRequest
    }
    await authorizeSaveViaFilePicker({
      env: env({ showOpenFilePicker: async () => [picked] }),
      accepted: target,
      directory: { handle: directory, entryName: 'a.keymap' }
    })
    expect(requestPermission).not.toHaveBeenCalled()
    expect(dirRequest).not.toHaveBeenCalled()
    expect(createWritable).not.toHaveBeenCalled()
  })
})

describe('permission helpers', () => {
  const base = () => makeHandle('a', { name: 'a.keymap', bytes: utf8(validKeymapText()) })

  it('queries write permission without prompting', async () => {
    const requestPermission = vi.fn()
    const handle = {
      ...base(),
      queryPermission: vi.fn(async () => 'prompt' as const),
      requestPermission
    }
    await expect(queryWritePermission(handle)).resolves.toBe('prompt')
    expect(requestPermission).not.toHaveBeenCalled()
  })

  it('treats a handle without queryPermission as requiring an explicit grant', async () => {
    await expect(queryWritePermission(base())).resolves.toBe('prompt')
  })

  it('grants write access only through an explicit request action', async () => {
    const requestPermission = vi.fn(async () => 'granted' as const)
    const handle = { ...base(), requestPermission }
    await expect(grantWritePermission(handle)).resolves.toBe('granted')
    expect(requestPermission).toHaveBeenCalledWith({ mode: 'readwrite' })
  })

  it('reports denial without retrying', async () => {
    const requestPermission = vi.fn(async () => 'denied' as const)
    const handle = { ...base(), requestPermission }
    await expect(grantWritePermission(handle)).resolves.toBe('denied')
    expect(requestPermission).toHaveBeenCalledTimes(1)
  })

  it('refuses to grant when the handle has no requestPermission', async () => {
    await expect(grantWritePermission(base())).rejects.toMatchObject({ code: 'unsupported' })
  })
})
