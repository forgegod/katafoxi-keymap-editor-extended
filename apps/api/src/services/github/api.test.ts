import { describe, expect, it } from 'vitest'
import { githubApiPath } from './api.js'

describe('githubApiPath', () => {
  it('encodes each segment and keeps slashes between them', () => {
    expect(githubApiPath('repos', 'acme/lark', 'commits', 'feature/x')).toBe(
      '/repos/acme/lark/commits/feature/x'
    )
    expect(githubApiPath('repos', 'acme/lark', 'commits', 'main#x')).toBe(
      '/repos/acme/lark/commits/main%23x'
    )
    expect(githubApiPath('repos', 'acme/lark', 'contents', 'config/lark.keymap')).toBe(
      '/repos/acme/lark/contents/config/lark.keymap'
    )
    expect(githubApiPath('repos', 'acme/lark', 'git', 'refs', 'heads', 'y%')).toBe(
      '/repos/acme/lark/git/refs/heads/y%25'
    )
  })
})
