import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiRequestOptions } from './api.js'
import * as api from './api.js'
import { assertBranchName, assertRepositoryName, BranchNameError, createBranch, RepositoryNameError } from './installations.js'

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
