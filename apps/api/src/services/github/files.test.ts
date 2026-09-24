import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApiRequestOptions } from './api.js'
import * as api from './api.js'
import * as auth from './auth.js'
import {
  fetchKeyboardFiles,
  findCodeKeymap,
  listConfigDir,
  MissingRepoFile
} from './files.js'

const REPO = 'acme/lark'
const TOKEN = 'install-token'
const KEYMAP_PATH = 'config/lark.keymap'
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
  { name: 'lark.keymap.template', path: 'config/lark.keymap.template' },
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

function mockGithub(
  files: Record<string, unknown>,
  options: { missing?: string[] } = {}
) {
  const missing = new Set(options.missing ?? [])
  return vi.spyOn(api, 'request').mockImplementation(async options => {
    const url = requestUrl(options)
    const path = url.replace(`/repos/${REPO}/contents/`, '')
    if (missing.has(path)) throw notFound()
    if (!(path in files)) {
      throw new Error(`unexpected GitHub request: ${url}`)
    }
    return ok(files[path])
  })
}

afterEach(() => {
  vi.restoreAllMocks()
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

  it('lists config once and does not download .keymap when keymap.json is valid', async () => {
    const request = mockGithub({
      'config/info.json': JSON.stringify(INFO),
      config: LISTING,
      'config/keymap.json': JSON.stringify(KEYMAP_JSON)
    })

    const result = await fetchKeyboardFiles('1', REPO, 'main')

    expect(result.originalCodeKeymap.path).toBe(KEYMAP_PATH)
    expect(result.keymap).toEqual(KEYMAP_JSON)
    expect(requestUrls(request).filter(url => url.endsWith('/contents/config'))).toHaveLength(
      1
    )
    expect(requestUrls(request).some(url => url.endsWith(`/${KEYMAP_PATH}`))).toBe(false)
  })

  it('lists config once and downloads .keymap only once when keymap.json is missing', async () => {
    const request = mockGithub(
      {
        'config/info.json': JSON.stringify(INFO),
        config: LISTING,
        [KEYMAP_PATH]: DTS
      },
      { missing: ['config/keymap.json'] }
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
})

function requestUrls(request: { mock: { calls: unknown[][] } }): string[] {
  return request.mock.calls.map(call => requestUrl(call[0] as ApiRequestOptions | string))
}
