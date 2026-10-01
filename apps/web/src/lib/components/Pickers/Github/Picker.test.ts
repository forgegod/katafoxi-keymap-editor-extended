import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import github from '../../../github/api.svelte.js'
import * as storage from '../../../github/storage'
import type { GitHubRepo } from '../../../github/api.svelte.js'
import Picker from './Picker.svelte'

// happy-dom comment nodes are not `instanceof Comment`. Svelte skips empty
// comment anchors with that check; without it, mount can throw.
const happyComment = document.createComment('')
const CommentCtor = Object.getPrototypeOf(happyComment).constructor
if (!(happyComment instanceof Comment)) {
  Object.defineProperty(globalThis, 'Comment', {
    configurable: true,
    writable: true,
    value: CommentCtor
  })
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function selectedOptionText(select: HTMLSelectElement | null) {
  if (!(select instanceof HTMLSelectElement)) {
    throw new Error('missing select')
  }
  return select.selectedOptions[0]?.textContent?.trim() ?? ''
}

describe('Github Picker', () => {
  let target: HTMLDivElement
  let view: ReturnType<typeof mount> | undefined

  const repo: GitHubRepo = {
    id: 11,
    full_name: 'acme/lark',
    default_branch: 'main'
  }

  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    const modalRoot = document.createElement('div')
    modalRoot.id = 'modal-root'
    target.appendChild(modalRoot)

    github.repositories = [repo]
    github.repoInstallationMap = { [repo.full_name]: '1' }
    github.installations = [{ id: 1 }]
    github.authorized = true
    github.initialized = true

    vi.spyOn(github, 'init').mockResolvedValue(undefined)
  })

  afterEach(() => {
    if (view) unmount(view)
    view = undefined
    target?.remove()
    localStorage.clear()
    vi.restoreAllMocks()
    github.authorized = false
    github.login = null
    github.initialized = false
    github.repositories = null
    github.repoInstallationMap = null
    github.installations = null
  })

  function open(onSelect = vi.fn(), onLogout?: () => void) {
    view = mount(Picker, { target, props: { onSelect, onLogout } })
    flushSync()
    return onSelect
  }

  function clickButton(text: string) {
    const button = [...target.querySelectorAll('button')].find(
      item => item.textContent?.trim() === text
    )
    if (!(button instanceof HTMLButtonElement)) throw new Error(`missing ${text}`)
    button.click()
    flushSync()
  }

  it('selects the only branch even when storage has a different persisted branch', async () => {
    storage.setPersistedBranch(repo.id, 'main')
    vi.spyOn(github, 'fetchRepoBranches').mockResolvedValue([{ name: 'only' }])
    vi.spyOn(github, 'fetchLayoutAndKeymap').mockResolvedValue({
      layout: [{ row: 0, col: 0 }],
      keymap: { layers: [] }
    })

    const onSelect = open()

    await vi.waitFor(() => {
      expect(target.querySelector('.source-trigger-label')?.textContent?.trim()).toBe('only')
    })
    expect(target.querySelector('.source-trigger')?.getAttribute('title')).toBe(
      'acme/lark · only'
    )
    expect(target.querySelector('.branch-value')?.textContent?.trim()).toBe('only')
    expect(target.querySelector('#branch')).toBeNull()
    expect(target.querySelector('#repo')).toBeNull()
    const popover = target.querySelector('.source-popover')
    expect(popover).toBeInstanceOf(HTMLElement)
    expect((popover as HTMLElement).hidden).toBe(true)
    target.querySelector('.source-trigger')?.dispatchEvent(
      new MouseEvent('click', { bubbles: true })
    )
    flushSync()
    expect((popover as HTMLElement).hidden).toBe(false)
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        github: { repository: repo.full_name, branch: 'only' }
      })
    )
  })

  it('selects a persisted branch that is still in the list over default_branch', async () => {
    storage.setPersistedBranch(repo.id, 'dev')
    vi.spyOn(github, 'fetchRepoBranches').mockResolvedValue([
      { name: 'main' },
      { name: 'dev' },
      { name: 'feat' }
    ])
    vi.spyOn(github, 'fetchLayoutAndKeymap').mockResolvedValue({
      layout: [{ row: 0, col: 0 }],
      keymap: { layers: [] }
    })

    const onSelect = open()

    await vi.waitFor(() => {
      expect(selectedOptionText(target.querySelector('#branch'))).toBe('dev')
    })
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        github: { repository: repo.full_name, branch: 'dev' }
      })
    )
    expect(onSelect).not.toHaveBeenCalledWith(
      expect.objectContaining({
        github: { repository: repo.full_name, branch: 'main' }
      })
    )
  })

  it('falls back to default_branch when the persisted branch is gone', async () => {
    storage.setPersistedBranch(repo.id, 'deleted')
    vi.spyOn(github, 'fetchRepoBranches').mockResolvedValue([
      { name: 'main' },
      { name: 'feat' }
    ])
    vi.spyOn(github, 'fetchLayoutAndKeymap').mockResolvedValue({
      layout: [{ row: 0, col: 0 }],
      keymap: { layers: [] }
    })

    const onSelect = open()

    await vi.waitFor(() => {
      expect(selectedOptionText(target.querySelector('#branch'))).toBe('main')
    })
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        github: { repository: repo.full_name, branch: 'main' }
      })
    )
  })

  it('clears branches on repo switch and ignores a stale layout response', async () => {
    const oldRepo: GitHubRepo = {
      id: 10,
      full_name: 'acme/old',
      default_branch: 'main'
    }
    const newRepo: GitHubRepo = {
      id: 20,
      full_name: 'acme/new',
      default_branch: 'main'
    }
    github.repositories = [oldRepo, newRepo]
    github.repoInstallationMap = {
      [oldRepo.full_name]: '1',
      [newRepo.full_name]: '1'
    }

    const oldLayout = deferred<{ layout: unknown; keymap: unknown }>()
    const newBranches = deferred<Array<{ name: string }>>()

    vi.spyOn(github, 'fetchRepoBranches').mockImplementation(async next => {
      if (next.id === oldRepo.id) return [{ name: 'main' }]
      return newBranches.promise
    })
    vi.spyOn(github, 'fetchLayoutAndKeymap').mockImplementation(async name => {
      if (name === oldRepo.full_name) return oldLayout.promise
      return { layout: [{ row: 0, col: 0 }], keymap: { layers: [] } }
    })

    const onSelect = open()

    await vi.waitFor(() => {
      expect(github.fetchLayoutAndKeymap).toHaveBeenCalledWith(
        oldRepo.full_name,
        'main'
      )
    })
    expect(target.querySelector('.branch-value')?.textContent?.trim()).toBe('main')
    expect(target.querySelector('#branch')).toBeNull()

    const repoSelect = target.querySelector('#repo')
    if (!(repoSelect instanceof HTMLSelectElement)) {
      throw new Error('missing repo select')
    }
    expect([...repoSelect.options].map(option => option.textContent?.trim())).toEqual([
      'acme/old',
      'acme/new'
    ])
    expect(repoSelect.options[0]?.getAttribute('title')).toBe('acme/old')
    repoSelect.value = '1'
    repoSelect.dispatchEvent(new Event('change', { bubbles: true }))
    flushSync()

    expect(target.querySelector('#branch')).toBeNull()

    oldLayout.resolve({
      layout: [{ row: 0, col: 0 }],
      keymap: { layers: [] }
    })
    await Promise.resolve()
    flushSync()
    await Promise.resolve()
    flushSync()

    expect(onSelect).not.toHaveBeenCalled()
    expect(target.querySelector('#branch')).toBeNull()
    expect(target.querySelector('.branch-value')).toBeNull()
  })

  it('shows a validation error from the singleton and keeps the repo and branch', async () => {
    vi.spyOn(github, 'fetchRepoBranches').mockResolvedValue([{ name: 'main' }])
    vi.spyOn(github, 'fetchLayoutAndKeymap').mockRejectedValue(
      new Error('load failed')
    )

    open()

    await vi.waitFor(() => {
      expect(target.querySelector('.branch-value')?.textContent?.trim()).toBe('main')
    })

    github.emit('repo-validation-error', {
      name: 'InfoValidationError',
      errors: ['missing config/info.json']
    })
    flushSync()

    expect(document.body.textContent).toContain('missing config/info.json')
    expect(target.querySelector('.repo-value')?.textContent?.trim()).toBe('acme/lark')
    expect(target.querySelector('.branch-value')?.textContent?.trim()).toBe('main')
  })

  it('warns when the layout has no row/col and still calls onSelect', async () => {
    vi.spyOn(github, 'fetchRepoBranches').mockResolvedValue([{ name: 'main' }])
    vi.spyOn(github, 'fetchLayoutAndKeymap').mockResolvedValue({
      layout: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      keymap: { layers: [] }
    })

    const onSelect = open()

    await vi.waitFor(() => {
      expect(onSelect).toHaveBeenCalled()
    })
    expect(document.body.textContent).toContain(
      'Layout in info.json has no row/col definitions. Generated keymap files will not be nicely formatted.'
    )
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        github: { repository: repo.full_name, branch: 'main' },
        layout: [{ x: 0, y: 0 }, { x: 1, y: 0 }]
      })
    )
  })

  it('creates a branch from the current one and selects it', async () => {
    github.login = 'octocat'
    vi.spyOn(github, 'fetchRepoBranches').mockResolvedValue([
      { name: 'main' },
      { name: 'dev' }
    ])
    vi.spyOn(github, 'fetchLayoutAndKeymap').mockResolvedValue({
      layout: [{ row: 0, col: 0 }],
      keymap: { layers: [] }
    })
    const create = vi.spyOn(github, 'createBranch').mockResolvedValue({ name: 'topic' })

    const onSelect = open()
    await vi.waitFor(() => {
      expect(selectedOptionText(target.querySelector('#branch'))).toBe('main')
    })

    clickButton('Create new branch')
    const input = target.querySelector('#new-branch')
    if (!(input instanceof HTMLInputElement)) throw new Error('missing branch input')
    input.value = 'topic'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()
    clickButton('Create')

    await vi.waitFor(() => {
      expect(selectedOptionText(target.querySelector('#branch'))).toBe('topic')
    })
    expect(create).toHaveBeenCalledWith('acme/lark', 'topic', 'main')
    await vi.waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          github: { repository: 'acme/lark', branch: 'topic' }
        })
      )
    })
    const link = target.querySelector('a.menu-action')
    expect(link?.textContent?.trim()).toBe('Manage repos for octocat')
    expect(link?.getAttribute('target')).toBe('_blank')
    expect(link?.getAttribute('href')).toMatch(/^https:\/\/github\.com\//)
  })

  it('shows a create-branch error and logs out without keeping the keymap', async () => {
    vi.spyOn(github, 'fetchRepoBranches').mockResolvedValue([{ name: 'main' }, { name: 'dev' }])
    vi.spyOn(github, 'fetchLayoutAndKeymap').mockResolvedValue({
      layout: [{ row: 0, col: 0 }],
      keymap: { layers: [] }
    })
    vi.spyOn(github, 'createBranch').mockRejectedValue(
      Object.assign(new Error('conflict'), {
        response: {
          data: { errors: ['A branch with that name already exists'] }
        }
      })
    )
    const logout = vi.spyOn(github, 'logout').mockResolvedValue(undefined)
    const onLogout = vi.fn()

    open(vi.fn(), onLogout)
    await vi.waitFor(() => {
      expect(target.querySelector('#branch')).toBeInstanceOf(HTMLSelectElement)
    })

    clickButton('Create new branch')
    const input = target.querySelector('#new-branch')
    if (!(input instanceof HTMLInputElement)) throw new Error('missing branch input')
    input.value = 'main'
    input.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()
    clickButton('Create')

    await vi.waitFor(() => {
      expect(target.querySelector('[role="alert"]')?.textContent).toContain(
        'A branch with that name already exists'
      )
    })

    clickButton('Log out')
    await vi.waitFor(() => {
      expect(logout).toHaveBeenCalled()
      expect(onLogout).toHaveBeenCalled()
    })
  })
})
