import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiRequestOptions } from './api.js'
import * as api from './api.js'
import * as auth from './auth.js'
import {
  assertBranchName,
  assertRepositoryName,
  BranchNameError,
  createBranch,
  fetchInstallationRepos,
  RepositoryNameError
} from './installations.js'

function requestUrl(options: ApiRequestOptions | string): string {
  return typeof options === 'string' ? options : options.url
}

describe('assertBranchName', () => {
  it('trims a usable name', () => {
    expect(assertBranchName('  topic  ')).toBe('topic')
    expect(assertBranchName('feature/x')).toBe('feature/x')
  })

  it('rejects names Git does not allow', () => {
    expect(() => assertBranchName('has space')).toThrow(BranchNameError)
    expect(() => assertBranchName('bad..name')).toThrow(BranchNameError)
    expect(() => assertBranchName('.hidden')).toThrow(BranchNameError)
    expect(() => assertBranchName('')).toThrow(/Enter a branch name/)
  })
})

describe('assertRepositoryName', () => {
  it('accepts owner/repo', () => {
    expect(assertRepositoryName('acme/lark')).toBe('acme/lark')
    expect(assertRepositoryName('  acme/keymap  ')).toBe('acme/keymap')
  })

  it('rejects malformed repository names', () => {
    expect(() => assertRepositoryName('')).toThrow(RepositoryNameError)
    expect(() => assertRepositoryName('only-owner')).toThrow(RepositoryNameError)
    expect(() => assertRepositoryName('a/b/c')).toThrow(RepositoryNameError)
    expect(() => assertRepositoryName('../evil/repo')).toThrow(RepositoryNameError)
    expect(() => assertRepositoryName('acme/../lark')).toThrow(RepositoryNameError)
  })
})

describe('fetchInstallationRepos', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists only repositories returned for the user, not the App installation', async () => {
    const createToken = vi.spyOn(auth, 'createInstallationToken').mockResolvedValue({
      data: { token: 'install-token' }
    } as Awaited<ReturnType<typeof auth.createInstallationToken>>)
    const request = vi.spyOn(api, 'request').mockImplementation(async options => {
      const opts: ApiRequestOptions = typeof options === 'string' ? { url: options } : options
      const url = requestUrl(options)
      expect(opts.token).toBe('user-token')

      if (url.startsWith('/user/installations') && !url.includes('/repositories')) {
        return { data: { installations: [{ id: 1 }] }, headers: {}, status: 200 }
      }
      if (url.includes('/user/installations/1/repositories')) {
        return {
          data: {
            repositories: [{ full_name: 'acme/a', permissions: { pull: true, push: true } }]
          },
          headers: {},
          status: 200
        }
      }
      if (url.includes('/installation/repositories')) {
        return {
          data: {
            repositories: [
              { full_name: 'acme/a', permissions: { pull: true, push: true } },
              { full_name: 'acme/b', permissions: { pull: true, push: true } }
            ]
          },
          headers: {},
          status: 200
        }
      }
      throw new Error(`unexpected ${url}`)
    })

    const result = await fetchInstallationRepos('user-token')

    expect(result.repositories).toEqual([
      { full_name: 'acme/a', permissions: { pull: true, push: true } }
    ])
    expect(result.repoInstallationMap).toEqual({ 'acme/a': 1 })
    expect(result.repoAccess).toEqual({
      'acme/a': { installationId: 1, push: true }
    })
    expect(createToken).not.toHaveBeenCalled()
    expect(request.mock.calls.some(([options]) => requestUrl(options).includes('/installation/repositories'))).toBe(
      false
    )
  })

  it('pages through more than 30 user installations', async () => {
    const page1 = Array.from({ length: 30 }, (_, i) => ({ id: i + 1 }))
    const page2 = [{ id: 31 }]
    const nextUrl = 'https://api.github.com/user/installations?per_page=100&page=2'
    const seenInstallations = new Set<number>()

    vi.spyOn(api, 'request').mockImplementation(async options => {
      const opts: ApiRequestOptions = typeof options === 'string' ? { url: options } : options
      const url = requestUrl(options)
      expect(opts.token).toBe('user-token')

      if (url === '/user/installations?per_page=100') {
        return {
          data: { installations: page1 },
          headers: { link: `<${nextUrl}>; rel="next"` },
          status: 200
        }
      }
      if (url === nextUrl) {
        return { data: { installations: page2 }, headers: {}, status: 200 }
      }
      const match = url.match(/\/user\/installations\/(\d+)\/repositories/)
      if (match) {
        seenInstallations.add(Number(match[1]))
        return { data: { repositories: [] }, headers: {}, status: 200 }
      }
      throw new Error(`unexpected ${url}`)
    })

    const result = await fetchInstallationRepos('user-token')
    expect(result.installations.map(installation => (installation as { id: number }).id)).toEqual([
      ...page1.map(item => item.id),
      31
    ])
    expect(seenInstallations.size).toBe(31)
    expect(seenInstallations.has(31)).toBe(true)
  })
})

describe('createBranch', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('copies the source commit onto refs/heads', async () => {
    const request = vi.spyOn(api, 'request').mockImplementation(async options => {
      const opts: ApiRequestOptions = typeof options === 'string' ? { url: options } : options
      if (opts.url === '/repos/acme/lark/commits/main') {
        return { data: { sha: 'abc123' }, headers: {}, status: 200 }
      }
      if (opts.url === '/repos/acme/lark/git/refs') {
        expect(opts.method).toBe('POST')
        expect(opts.data).toEqual({ ref: 'refs/heads/feature/x', sha: 'abc123' })
        expect(opts.token).toBe('install-token')
        return { data: {}, headers: {}, status: 201 }
      }
      throw new Error(`unexpected ${requestUrl(options)}`)
    })

    await expect(createBranch('install-token', 'acme/lark', ' feature/x ', 'main')).resolves.toEqual({
      name: 'feature/x'
    })
    expect(request).toHaveBeenCalledTimes(2)
  })
})
