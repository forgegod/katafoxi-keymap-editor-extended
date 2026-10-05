import { parseKeymap, HOST_KEYMAP_SNAPSHOT_PATH } from '@keymap-editor/keymap-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiRequestOptions } from './api.js'
import * as api from './api.js'
import * as auth from './auth.js'
import {
  commitChanges,
  fetchKeyboardFiles,
  findCodeKeymap,
  isAllowedHostKeymapPath,
  listConfigDir,
  MissingRepoFile
} from './files.js'

const REPO = 'acme/lark'
const TOKEN = 'install-token'
const KEYMAP_PATH = 'config/lark.keymap'
const TEMPLATE_PATH = 'config/lark.keymap.template'
const DTS = `
/ {
  keymap {
    compatible = "zmk,keymap";
    default_layer {
      bindings = <
&kp A
      >;
    };
  };
};
`

const LISTING = [
  { name: 'info.json', path: 'config/info.json' },
  { name: 'lark.keymap.template', path: TEMPLATE_PATH },
  { name: 'lark.keymap', path: KEYMAP_PATH }
]

const LISTING_NO_TEMPLATE = [
  { name: 'info.json', path: 'config/info.json' },
  { name: 'lark.keymap', path: KEYMAP_PATH }
]

const INFO = { id: 'lark', name: 'LARK' }
const KEYMAP_JSON = {
  keyboard: 'lark',
  keymap: 'lark',
  layout: 'LAYOUT',
  layer_names: ['default'],
  layers: [['&kp A']]
}

const ORIGINAL_SOURCE = `#define FOO BAR

/ {
  keymap {
    compatible = "zmk,keymap";
    default_layer {
      bindings = < &kp A >;
    };
  };
};
`

const NO_KEYMAP_BLOCK = `#define FOO BAR

/ {
  other {
    bindings = < &kp A >;
  };
};
`

const KEYMAP_TEMPLATE = `/* CUSTOM_TEMPLATE */
#include <behaviors.dtsi>

/ {
    keymap {
        compatible = "zmk,keymap";

{{rendered_layers}}
    };
};
`

const ONE_KEY_LAYOUT = [{ x: 0, y: 0, row: 0, col: 0 }]
const EDITED_KEYMAP = parseKeymap({
  layer_names: ['default'],
  layers: [['&kp B']]
})

const CURRENT_COMMIT_SHA = 'current-commit-sha'
const BASE_TREE_SHA = 'base-tree-sha'
const NEW_TREE_SHA = 'new-tree-sha'
const NEW_COMMIT_SHA = 'new-commit-sha'

const GENERATED_BANNER = 'THIS FILE WAS GENERATED'

function ok(data: unknown) {
  return { data, headers: {}, status: 200 }
}

function notFound() {
  return Object.assign(new Error('GitHub API 404'), {
    response: { status: 404 }
  })
}

function requestUrl(options: ApiRequestOptions | string): string {
  return typeof options === 'string' ? options : options.url
}

function requestMethod(options: ApiRequestOptions | string): string {
  if (typeof options === 'string') return 'GET'
  return (options.method || (options.data ? 'POST' : 'GET')).toUpperCase()
}

function contentsPath(url: string): string | null {
  const prefix = `/repos/${REPO}/contents/`
  return url.startsWith(prefix) ? url.slice(prefix.length) : null
}

function resolveMockValue(value: unknown, options: ApiRequestOptions | string): unknown {
  if (typeof value === 'function') {
    return (value as (opts: ApiRequestOptions | string) => unknown)(options)
  }
  return value
}

function mockGithub(
  files: Record<string, unknown>,
  options: { missing?: string[]; errors?: Record<string, number> } = {}
) {
  const missing = new Set(options.missing ?? [])
  const errors = options.errors ?? {}
  return vi.spyOn(api, 'request').mockImplementation(async options => {
    const url = requestUrl(options)
    const method = requestMethod(options)
    const path = contentsPath(url)
    if (path !== null && missing.has(path)) throw notFound()
    if (path !== null && path in errors) {
      throw Object.assign(new Error(`GitHub API ${errors[path]}`), {
        response: { status: errors[path] }
      })
    }

    const methodUrl = `${method} ${url}`
    if (methodUrl in files) return ok(resolveMockValue(files[methodUrl], options))
    if (url in files) return ok(resolveMockValue(files[url], options))
    if (path !== null && path in files) return ok(resolveMockValue(files[path], options))

    throw new Error(`unexpected GitHub request: ${method} ${url}`)
  })
}

function gitCommitEndpoints(
  branch: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    [`GET /repos/${REPO}/commits/${branch}`]: {
      sha: CURRENT_COMMIT_SHA,
      commit: { tree: { sha: BASE_TREE_SHA } }
    },
    [`POST /repos/${REPO}/git/trees`]: { sha: NEW_TREE_SHA },
    [`POST /repos/${REPO}/git/commits`]: { sha: NEW_COMMIT_SHA },
    [`PATCH /repos/${REPO}/git/refs/heads/${branch}`]: {},
    ...overrides
  }
}

function requestOptions(request: { mock: { calls: unknown[][] } }): ApiRequestOptions[] {
  return request.mock.calls.map(call => call[0] as ApiRequestOptions)
}

function findRequest(
  request: { mock: { calls: unknown[][] } },
  method: string,
  url: string
): ApiRequestOptions | undefined {
  return requestOptions(request).find(
    opts => requestMethod(opts) === method && requestUrl(opts) === url
  )
}

function bytesBeforeKeymapBlock(source: string): string {
  const match = /\bkeymap\s*\{/.exec(source)
  if (!match) {
    throw new Error('expected a keymap { block')
  }
  return source.slice(0, match.index)
}

function treeBlobs(request: { mock: { calls: unknown[][] } }) {
  const treeReq = findRequest(request, 'POST', `/repos/${REPO}/git/trees`)
  const data = treeReq?.data as {
    base_tree?: string
    tree?: Array<{ path: string; content: string }>
  }
  return data
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('isAllowedHostKeymapPath', () => {
  it('allows snapshot and single-segment linux/windows deliverables', () => {
    expect(isAllowedHostKeymapPath(HOST_KEYMAP_SNAPSHOT_PATH)).toBe(true)
    expect(isAllowedHostKeymapPath('host_keymap/linux/ru.xkb')).toBe(true)
    expect(isAllowedHostKeymapPath('host_keymap/windows/en-ru.klc')).toBe(true)
  })

  it('rejects traversal, absolute, and out-of-allowlist paths', () => {
    expect(isAllowedHostKeymapPath('host_keymap/../config/evil.keymap')).toBe(false)
    expect(isAllowedHostKeymapPath('host_keymap/linux/../windows/x.klc')).toBe(false)
    expect(isAllowedHostKeymapPath('/host_keymap/linux/ru.xkb')).toBe(false)
    expect(isAllowedHostKeymapPath('config/keymap.json')).toBe(false)
    expect(isAllowedHostKeymapPath('host_keymap/extra/ru.xkb')).toBe(false)
    expect(isAllowedHostKeymapPath('host_keymap/linux/nested/ru.xkb')).toBe(false)
    expect(isAllowedHostKeymapPath('evil/../escape.txt')).toBe(false)
  })
})

describe('listConfigDir', () => {
  it('lists config once and forwards the branch', async () => {
    const request = mockGithub({ config: LISTING })
    const listing = await listConfigDir(TOKEN, REPO, 'main')
    expect(listing).toEqual(LISTING)
    expect(request).toHaveBeenCalledTimes(1)
    expect(request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: `/repos/${REPO}/contents/config`,
        token: TOKEN,
        params: { ref: 'main' }
      })
    )
  })
})

describe('findCodeKeymap', () => {
  it('picks the user keymap and ignores the template', () => {
    expect(findCodeKeymap(LISTING)).toEqual({
      name: 'lark.keymap',
      path: KEYMAP_PATH
    })
  })

  it('throws when no user keymap is listed', () => {
    expect(() =>
      findCodeKeymap([{ name: 'info.json', path: 'config/info.json' }])
    ).toThrow(MissingRepoFile)
  })
})

describe('fetchKeyboardFiles', () => {
  beforeEach(() => {
    vi.spyOn(auth, 'createInstallationToken').mockResolvedValue({
      data: { token: TOKEN }
    } as Awaited<ReturnType<typeof auth.createInstallationToken>>)
  })

  it('reads hold-tap nodes from .keymap when keymap.json does not list them', async () => {
    const dts = `&mt {\n    flavor = "tap-preferred";\n    tapping-term-ms = <300>;\n};\n${DTS}`
    const request = mockGithub(
      {
        'config/info.json': JSON.stringify(INFO),
        config: LISTING,
        'config/keymap.json': JSON.stringify(KEYMAP_JSON),
        [KEYMAP_PATH]: dts
      },
      { missing: [HOST_KEYMAP_SNAPSHOT_PATH] }
    )

    const result = await fetchKeyboardFiles('1', REPO, 'main')

    expect(result.originalCodeKeymap.path).toBe(KEYMAP_PATH)
    expect(result.keymap).toMatchObject({
      ...KEYMAP_JSON,
      holdTaps: [
        { code: '&mt', override: true, flavor: 'tap-preferred', tappingTermMs: 300 }
      ]
    })
    expect(result.hostSnapshot).toBeNull()
    expect(requestUrls(request).filter(url => url.endsWith('/contents/config'))).toHaveLength(
      1
    )
    expect(requestUrls(request).some(url => url.endsWith(`/${KEYMAP_PATH}`))).toBe(true)
  })

  it('does not download .keymap when keymap.json already lists holdTaps', async () => {
    const request = mockGithub(
      {
        'config/info.json': JSON.stringify(INFO),
        config: LISTING,
        'config/keymap.json': JSON.stringify({
          ...KEYMAP_JSON,
          holdTaps: [],
          sensorBindings: []
        })
      },
      { missing: [HOST_KEYMAP_SNAPSHOT_PATH] }
    )

    const result = await fetchKeyboardFiles('1', REPO, 'main')

    expect(result.keymap).toEqual({ ...KEYMAP_JSON, holdTaps: [], sensorBindings: [] })
    expect(requestUrls(request).some(url => url.endsWith(`/${KEYMAP_PATH}`))).toBe(false)
  })

  it('lists config once and downloads .keymap only once when keymap.json is missing', async () => {
    const request = mockGithub(
      {
        'config/info.json': JSON.stringify(INFO),
        config: LISTING,
        [KEYMAP_PATH]: DTS
      },
      { missing: ['config/keymap.json', HOST_KEYMAP_SNAPSHOT_PATH] }
    )

    const result = await fetchKeyboardFiles('1', REPO)

    expect(result.originalCodeKeymap.path).toBe(KEYMAP_PATH)
    expect(result.keymap.layers[0]).toEqual(['&kp A'])
    expect(requestUrls(request).filter(url => url.endsWith('/contents/config'))).toHaveLength(
      1
    )
    expect(
      requestUrls(request).filter(url => url.endsWith(`/${KEYMAP_PATH}`))
    ).toHaveLength(1)
  })

  it('falls back to .keymap when keymap.json is not JSON', async () => {
    const request = mockGithub(
      {
        'config/info.json': JSON.stringify(INFO),
        config: LISTING,
        'config/keymap.json': 'not-json',
        [KEYMAP_PATH]: DTS
      },
      { missing: [HOST_KEYMAP_SNAPSHOT_PATH] }
    )

    const result = await fetchKeyboardFiles('1', REPO)

    expect(result.originalCodeKeymap.path).toBe(KEYMAP_PATH)
    expect(result.keymap.layers[0]).toEqual(['&kp A'])
    expect(
      requestUrls(request).filter(url => url.endsWith(`/${KEYMAP_PATH}`))
    ).toHaveLength(1)
  })

  it('falls back to .keymap when keymap.json is not primary and skips the template', async () => {
    const request = mockGithub(
      {
        'config/info.json': JSON.stringify(INFO),
        config: LISTING,
        'config/keymap.json': JSON.stringify({ layers: [] }),
        [KEYMAP_PATH]: DTS
      },
      { missing: [HOST_KEYMAP_SNAPSHOT_PATH] }
    )

    const result = await fetchKeyboardFiles('1', REPO)

    expect(result.originalCodeKeymap.path).toBe(KEYMAP_PATH)
    expect(result.keymap.layers[0]).toEqual(['&kp A'])
    expect(
      requestUrls(request).filter(url => url.endsWith(`/${KEYMAP_PATH}`))
    ).toHaveLength(1)
    expect(requestUrls(request).some(url => url.endsWith(`/${TEMPLATE_PATH}`))).toBe(false)
  })

  it('rethrows a non-404 keymap.json error without downloading .keymap', async () => {
    const request = mockGithub(
      {
        'config/info.json': JSON.stringify(INFO),
        config: LISTING,
        [KEYMAP_PATH]: DTS
      },
      {
        missing: [HOST_KEYMAP_SNAPSHOT_PATH],
        errors: { 'config/keymap.json': 500 }
      }
    )

    await expect(fetchKeyboardFiles('1', REPO)).rejects.toMatchObject({
      response: { status: 500 }
    })
    expect(requestUrls(request).some(url => url.endsWith(`/${KEYMAP_PATH}`))).toBe(false)
  })

  it('returns null info when info.json is missing', async () => {
    const listing = [
      { name: 'lark.keymap', path: KEYMAP_PATH },
      { name: 'keymap.json', path: 'config/keymap.json' }
    ]
    mockGithub(
      {
        config: listing,
        'config/keymap.json': JSON.stringify(KEYMAP_JSON)
      },
      { missing: ['config/info.json', HOST_KEYMAP_SNAPSHOT_PATH] }
    )

    const result = await fetchKeyboardFiles('1', REPO)
    expect(result.info).toBeNull()
    expect(result.keymap).toEqual(KEYMAP_JSON)
    expect(result.originalCodeKeymap.path).toBe(KEYMAP_PATH)
  })

  it('returns a parsed host snapshot when host_keymap/snapshot.json exists', async () => {
    const hostSnapshot = {
      version: 1,
      view: {
        columns: [
          {
            language: 'en',
            layoutId: 'system-us',
            visible: true,
            altGr: true,
            altGrShift: true
          }
        ],
        open: null
      },
      layouts: []
    }
    mockGithub({
      'config/info.json': JSON.stringify(INFO),
      config: LISTING,
      'config/keymap.json': JSON.stringify(KEYMAP_JSON),
      [HOST_KEYMAP_SNAPSHOT_PATH]: JSON.stringify(hostSnapshot)
    })

    const result = await fetchKeyboardFiles('1', REPO, 'main')
    expect(result.hostSnapshot).toEqual(hostSnapshot)
  })
})

function requestUrls(request: { mock: { calls: unknown[][] } }): string[] {
  return request.mock.calls.map(call => requestUrl(call[0] as ApiRequestOptions | string))
}

describe('commitChanges', () => {
  beforeEach(() => {
    vi.spyOn(auth, 'createInstallationToken').mockResolvedValue({
      data: { token: TOKEN }
    } as Awaited<ReturnType<typeof auth.createInstallationToken>>)
  })

  it('uses .keymap.template when listed and commits the user keymap path plus keymap.json', async () => {
    const request = mockGithub({
      config: LISTING,
      [TEMPLATE_PATH]: KEYMAP_TEMPLATE,
      [KEYMAP_PATH]: ORIGINAL_SOURCE,
      ...gitCommitEndpoints('main')
    })

    const result = await commitChanges('1', REPO, 'main', ONE_KEY_LAYOUT, EDITED_KEYMAP)

    expect(result.mode).toBe('template')
    expect(
      requestUrls(request).some(url => url.endsWith(`/contents/${TEMPLATE_PATH}`))
    ).toBe(true)

    const blobs = treeBlobs(request)
    expect(blobs.tree?.map(blob => blob.path)).toEqual([KEYMAP_PATH, 'config/keymap.json'])

    const keymapBody = blobs.tree?.find(blob => blob.path === KEYMAP_PATH)?.content ?? ''
    expect(keymapBody).toContain('CUSTOM_TEMPLATE')
    expect(keymapBody).toContain('&kp B')
    expect(KEYMAP_TEMPLATE).not.toContain(GENERATED_BANNER)
    expect(keymapBody).not.toContain(GENERATED_BANNER)
  })

  it('splices into the original .keymap when no template is listed', async () => {
    const request = mockGithub({
      config: LISTING_NO_TEMPLATE,
      [KEYMAP_PATH]: ORIGINAL_SOURCE,
      ...gitCommitEndpoints('main')
    })

    const result = await commitChanges('1', REPO, 'main', ONE_KEY_LAYOUT, EDITED_KEYMAP)

    expect(result.mode).toBe('splice')
    expect(
      requestUrls(request).some(url => url.endsWith(`/contents/${TEMPLATE_PATH}`))
    ).toBe(false)

    const keymapBody =
      treeBlobs(request).tree?.find(blob => blob.path === KEYMAP_PATH)?.content ?? ''
    expect(bytesBeforeKeymapBlock(keymapBody)).toBe(bytesBeforeKeymapBlock(ORIGINAL_SOURCE))
    expect(keymapBody).toContain('#define FOO BAR')
    expect(keymapBody).toContain('&kp B')
  })

  it('walks commits → trees → git commits → ref update with matching shas', async () => {
    const request = mockGithub({
      config: LISTING_NO_TEMPLATE,
      [KEYMAP_PATH]: ORIGINAL_SOURCE,
      ...gitCommitEndpoints('main')
    })

    await commitChanges('1', REPO, 'main', ONE_KEY_LAYOUT, EDITED_KEYMAP)

    const trees = findRequest(request, 'POST', `/repos/${REPO}/git/trees`)
    expect(trees?.data).toEqual(
      expect.objectContaining({
        base_tree: BASE_TREE_SHA
      })
    )

    const commit = findRequest(request, 'POST', `/repos/${REPO}/git/commits`)
    expect(commit?.data).toEqual(
      expect.objectContaining({
        tree: NEW_TREE_SHA,
        parents: [CURRENT_COMMIT_SHA]
      })
    )

    const ref = findRequest(request, 'PATCH', `/repos/${REPO}/git/refs/heads/main`)
    expect(ref?.data).toEqual({ sha: NEW_COMMIT_SHA })
  })

  it('does not PATCH the ref when creating the tree fails', async () => {
    const request = mockGithub({
      config: LISTING_NO_TEMPLATE,
      [KEYMAP_PATH]: ORIGINAL_SOURCE,
      ...gitCommitEndpoints('main', {
        [`POST /repos/${REPO}/git/trees`]: () => {
          throw new Error('tree create failed')
        }
      })
    })

    await expect(
      commitChanges('1', REPO, 'main', ONE_KEY_LAYOUT, EDITED_KEYMAP)
    ).rejects.toThrow('tree create failed')

    expect(findRequest(request, 'PATCH', `/repos/${REPO}/git/refs/heads/main`)).toBeUndefined()
    expect(requestUrls(request).some(url => url.includes('/git/refs/'))).toBe(false)
  })

  it('does not percent-encode slashes in branch names for commits and refs', async () => {
    const branch = 'feature/x'
    const request = mockGithub({
      config: LISTING_NO_TEMPLATE,
      [KEYMAP_PATH]: ORIGINAL_SOURCE,
      ...gitCommitEndpoints(branch)
    })

    await commitChanges('1', REPO, branch, ONE_KEY_LAYOUT, EDITED_KEYMAP)

    expect(findRequest(request, 'GET', `/repos/${REPO}/commits/feature/x`)).toBeDefined()
    expect(
      findRequest(request, 'PATCH', `/repos/${REPO}/git/refs/heads/feature/x`)
    ).toBeDefined()
    expect(requestUrls(request).some(url => url.includes('feature%2Fx'))).toBe(false)
  })

  it('does not PATCH when splice fails without a keymap block or template', async () => {
    const request = mockGithub({
      config: LISTING_NO_TEMPLATE,
      [KEYMAP_PATH]: NO_KEYMAP_BLOCK,
      ...gitCommitEndpoints('main')
    })

    await expect(
      commitChanges('1', REPO, 'main', ONE_KEY_LAYOUT, EDITED_KEYMAP)
    ).rejects.toThrow(/compatible = "zmk,keymap"/)

    expect(findRequest(request, 'PATCH', `/repos/${REPO}/git/refs/heads/main`)).toBeUndefined()
    expect(requestUrls(request).some(url => url.includes('/git/refs/'))).toBe(false)
    expect(findRequest(request, 'POST', `/repos/${REPO}/git/trees`)).toBeUndefined()
  })

  it('writes host_keymap/snapshot.json in the same tree when a snapshot is provided', async () => {
    const request = mockGithub({
      config: LISTING_NO_TEMPLATE,
      [KEYMAP_PATH]: ORIGINAL_SOURCE,
      ...gitCommitEndpoints('main')
    })
    const hostSnapshot = {
      version: 1 as const,
      view: {
        columns: [
          {
            language: 'en' as const,
            layoutId: 'system-us',
            visible: true,
            altGr: true,
            altGrShift: true
          }
        ],
        open: null
      },
      layouts: []
    }

    await commitChanges('1', REPO, 'main', ONE_KEY_LAYOUT, EDITED_KEYMAP, hostSnapshot)

    const blobs = treeBlobs(request)
    expect(blobs.tree?.map(blob => blob.path)).toEqual([
      KEYMAP_PATH,
      'config/keymap.json',
      HOST_KEYMAP_SNAPSHOT_PATH
    ])
    expect(
      blobs.tree?.find(blob => blob.path === HOST_KEYMAP_SNAPSHOT_PATH)?.content
    ).toContain('"version": 1')
  })

  it('writes host deliverable files beside the snapshot', async () => {
    const request = mockGithub({
      config: LISTING_NO_TEMPLATE,
      [KEYMAP_PATH]: ORIGINAL_SOURCE,
      ...gitCommitEndpoints('main')
    })
    const hostSnapshot = {
      version: 1 as const,
      view: {
        columns: [
          {
            language: 'en' as const,
            layoutId: 'system-us',
            visible: true,
            altGr: true,
            altGrShift: true
          }
        ],
        open: null
      },
      layouts: []
    }
    const hostDeliverables = [
      {
        path: 'host_keymap/linux/ru.xkb',
        content: 'xkb_symbols "ru" { };\n'
      },
      {
        path: 'host_keymap/windows/ru.klc',
        content: 'KBD\tru\t"Russian"\r\n'
      },
      {
        path: 'evil/../escape.txt',
        content: 'nope'
      },
      {
        path: 'host_keymap/../config/evil.keymap',
        content: 'traversal'
      },
      {
        path: '/host_keymap/linux/abs.xkb',
        content: 'absolute'
      }
    ]

    await commitChanges(
      '1',
      REPO,
      'main',
      ONE_KEY_LAYOUT,
      EDITED_KEYMAP,
      hostSnapshot,
      hostDeliverables
    )

    const paths = treeBlobs(request).tree?.map(blob => blob.path) ?? []
    expect(paths).toEqual([
      KEYMAP_PATH,
      'config/keymap.json',
      HOST_KEYMAP_SNAPSHOT_PATH,
      'host_keymap/linux/ru.xkb',
      'host_keymap/windows/ru.klc'
    ])
  })
})
