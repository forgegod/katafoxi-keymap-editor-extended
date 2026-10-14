import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import github from '../../../github/api.svelte.js'
import * as storage from '../../../github/storage'
import type { GitHubRepo, KeyboardFilesResult } from '../../../github/api.svelte.js'
import { editor } from '../../../editor.svelte.js'
import * as hostStorage from '../../../host-layout-store'
import { deleteStoredDraft } from '../../../draft-storage'
import type { GithubKeyboardSelection } from '../../../editor/types'
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

  beforeEach(async () => {
    editor.resetForTests()
    await hostStorage.clearHostLayoutStore()
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
    vi.spyOn(github, 'fetchKeymaps').mockResolvedValue({ headSha: 's', candidates: [{ name: 'a.keymap', path: 'config/a.keymap' }] })
  })

  afterEach(async () => {
    if (view) await unmount(view)
    const identity = editor.currentDraftIdentity()
    editor.resetForTests()
    await editor._draftWrites
    if (identity) await deleteStoredDraft(identity)
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

  function open(
    onSelect = vi.fn(),
    onLogout?: () => void,
    onStatus?: (status: {
      ready: boolean
      authorized: boolean
      appInstalled: boolean
      loading: boolean
      repoFullName: string | null
      repoFullNames: string[]
      branch: string | null
    }) => void
  ) {
    view = mount(Picker, { target, props: { onSelect, onLogout, onStatus } })
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

  it('requires an explicit keymap choice before loading a multi-file repository', async () => {
    vi.spyOn(github, 'fetchRepoBranches').mockResolvedValue([{ name: 'main' }])
    vi.spyOn(github, 'fetchKeymaps').mockResolvedValue({ headSha: 's', candidates: [
      { name: 'a.keymap', path: 'config/a.keymap' },
      { name: 'b.keymap', path: 'config/b.keymap' }
    ] })
    const fetchFiles = vi.spyOn(github, 'fetchLayoutAndKeymap').mockResolvedValue({
      layout: [{ x: 0, y: 0 }, { x: 1, y: 0 }], keymap: { layers: [] },
      hostSnapshot: null, warnings: [], headSha: 's', keymapPath: 'config/b.keymap', ownershipMode: 'scoped'
    })
    const onSelect = open()
    await vi.waitFor(() => expect(target.querySelector('#keymap-file')).toBeInstanceOf(HTMLSelectElement))
    expect(fetchFiles).not.toHaveBeenCalled()
    const select = target.querySelector('#keymap-file') as HTMLSelectElement
    select.value = 'config/b.keymap'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await vi.waitFor(() => expect(fetchFiles).toHaveBeenCalledWith(repo.full_name, 'main', { keymapPath: 'config/b.keymap' }))
    await vi.waitFor(() => expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({
      github: expect.objectContaining({ keymapPath: 'config/b.keymap' }), layout: [{ x: 0, y: 0 }, { x: 1, y: 0 }]
    })))
  })

  it('remembers an accepted exact path and refuses sole-file fallback when it vanishes on reopen', async () => {
    vi.spyOn(github, 'fetchRepoBranches').mockResolvedValue([{ name: 'main' }])
    vi.mocked(github.fetchKeymaps).mockResolvedValue({ headSha: 's', candidates: [{ name: 'b.keymap', path: 'config/b.keymap' }] })
    const files = vi.spyOn(github, 'fetchLayoutAndKeymap').mockResolvedValue({ layout: [{ x: 0, y: 0 }], keymap: { layers: [] }, hostSnapshot: null, warnings: [], headSha: 's', keymapPath: 'config/b.keymap', ownershipMode: 'scoped' })
    const onSelect = vi.fn((event: Omit<GithubKeyboardSelection, 'source'>) => editor.selectKeyboard({ source: 'github', ...event }))
    open(onSelect)
    await vi.waitFor(() => expect(editor.githubMeta?.keymapPath).toBe('config/b.keymap'))
    await onSelect.mock.results[0].value
    await unmount(view!)
    view = undefined
    editor.resetForTests()
    files.mockClear()
    vi.mocked(github.fetchKeymaps).mockResolvedValue({ headSha: 't', candidates: [{ name: 'a.keymap', path: 'config/a.keymap' }] })
    open(onSelect)
    await vi.waitFor(() => expect(target.textContent).toContain('config/b.keymap is missing'))
    expect(files).not.toHaveBeenCalled()
    expect(editor.githubMeta).toBeNull()
  })

  it('keeps the accepted file visible and remembered when an explicit switch is refused', async () => {
    vi.spyOn(github, 'fetchRepoBranches').mockResolvedValue([{ name: 'main' }])
    vi.mocked(github.fetchKeymaps).mockResolvedValue({ headSha: 's', candidates: [
      { name: 'a.keymap', path: 'config/a.keymap' }, { name: 'b.keymap', path: 'config/b.keymap' }
    ] })
    storage.setPersistedKeymap(repo.full_name, 'main', { keymapPath: 'config/a.keymap' })
    vi.spyOn(github, 'fetchLayoutAndKeymap').mockImplementation(async (_repo, _branch, selected) => ({
      layout: [{ x: 0, y: 0, row: 0, col: 0 }], keymap: { layers: [] },
      hostSnapshot: null, warnings: [], headSha: 's', keymapPath: selected!.keymapPath, ownershipMode: 'scoped'
    }))
    const onSelect = open(vi.fn((event: Omit<GithubKeyboardSelection, 'source'>) => editor.selectKeyboard({ source: 'github', ...event })))
    await vi.waitFor(() => expect(editor.githubMeta?.keymapPath).toBe('config/a.keymap'))
    await onSelect.mock.results[0].value
    vi.spyOn(hostStorage, 'loadGithubHostCache').mockRejectedValue(new Error('unavailable'))
    const select = target.querySelector('#keymap-file') as HTMLSelectElement
    select.value = 'config/b.keymap'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    await vi.waitFor(() => expect(onSelect).toHaveBeenCalledTimes(2))
    await onSelect.mock.results[1].value
    flushSync()
    expect(editor.githubMeta?.keymapPath).toBe('config/a.keymap')
    expect(storage.getPersistedKeymap(repo.full_name, 'main')?.keymapPath).toBe('config/a.keymap')
    await vi.waitFor(() => expect(select.value).toBe('config/a.keymap'))
  })

  it.each(['repository', 'branch', 'inventory', 'branch list', 'file load', 'empty inventory', 'missing inventory', 'file after unaccepted branch'])('rolls back every picker identity after refused %s and Reload targets the accepted draft', async failure => {
    const other = { id: 22, full_name: 'acme/other', default_branch: 'main' }
    github.repositories = [repo, other]
    const fetchBranches = vi.spyOn(github, 'fetchRepoBranches').mockResolvedValue([{ name: 'main' }, { name: 'dev' }])
    const files = vi.spyOn(github, 'fetchLayoutAndKeymap').mockImplementation(async (_repo, _branch, selected) => ({
      layout: [{ x: 0, y: 0, row: 0, col: 0 }],
      keymap: { layers: [[{ value: '&none', params: [] }]] },
      hostSnapshot: null, warnings: [], headSha: 's', keymapPath: selected!.keymapPath, ownershipMode: 'scoped'
    }))
    const status = vi.fn()
    const onSelect = open(vi.fn((event: Omit<GithubKeyboardSelection, 'source'>) => editor.selectKeyboard({ source: 'github', ...event })), undefined, status)
    await vi.waitFor(() => expect(storage.getPersistedKeymap(repo.full_name, 'main')?.keymapPath).toBe('config/a.keymap'))
    editor.updateKeymap({ layers: [[{ value: '&trans', params: [] }]] })
    await editor.flushPendingPersist()
    const draft = JSON.stringify(editor.draftKeymap)
    const meta = { ...editor.githubMeta }
    const persisted = { ...localStorage }
    const change = (id: string, value: string) => {
      const select = target.querySelector(id) as HTMLSelectElement
      select.value = value
      select.dispatchEvent(new Event('change', { bubbles: true }))
      flushSync()
    }
    if (failure === 'inventory') vi.mocked(github.fetchKeymaps).mockRejectedValueOnce(new Error('inventory refused'))
    else if (failure === 'branch list') fetchBranches.mockRejectedValueOnce(new Error('branches refused'))
    else if (failure === 'file load') files.mockRejectedValueOnce(new Error('file refused'))
    else if (failure === 'empty inventory') vi.mocked(github.fetchKeymaps).mockResolvedValueOnce({ headSha: 's', candidates: [] })
    else if (failure === 'missing inventory') {
      storage.setPersistedKeymap(repo.full_name, 'dev', { keymapPath: 'config/missing.keymap' })
      Object.assign(persisted, { ...localStorage })
    } else {
      vi.spyOn(hostStorage, 'loadGithubHostCache').mockRejectedValue(new Error('destination refused'))
      if (failure === 'file after unaccepted branch') vi.mocked(github.fetchKeymaps).mockResolvedValueOnce({ headSha: 's', candidates: [
        { name: 'a.keymap', path: 'config/a.keymap' }, { name: 'b.keymap', path: 'config/b.keymap' }
      ] })
    }
    change(failure === 'repository' || failure === 'branch list' ? '#repo' : '#branch', '1')
    if (failure === 'file after unaccepted branch') {
      await vi.waitFor(() => expect((target.querySelector('#keymap-file') as HTMLSelectElement)?.options.length).toBe(3))
      change('#keymap-file', 'config/b.keymap')
    }
    await vi.waitFor(() => {
      expect(selectedOptionText(target.querySelector('#repo'))).toBe(repo.full_name)
      expect(selectedOptionText(target.querySelector('#branch'))).toBe('main')
      expect((target.querySelector('#keymap-file') as HTMLSelectElement)?.value).toBe('config/a.keymap')
      expect(status).toHaveBeenLastCalledWith(expect.objectContaining({ loading: false, repoFullName: repo.full_name, branch: 'main' }))
    })
    expect(editor.githubMeta).toEqual(meta)
    expect(JSON.stringify(editor.draftKeymap)).toBe(draft)
    expect({ ...localStorage }).toEqual(persisted)
    const calls = onSelect.mock.calls.length
    clickButton('Reload')
    await vi.waitFor(() => expect(onSelect).toHaveBeenCalledTimes(calls + 1))
    expect(files).toHaveBeenLastCalledWith(meta.repository, meta.branch, { keymapPath: meta.keymapPath, expectedMode: meta.ownershipMode })
    expect(editor.githubMeta).toEqual(meta)
    expect(JSON.stringify(editor.draftKeymap)).toBe(draft)
  })

  it('keeps accepted chrome while inventory is pending and restores controls if remount inventory fails', async () => {
    vi.spyOn(github, 'fetchRepoBranches').mockResolvedValue([{ name: 'main' }, { name: 'dev' }])
    const files = vi.spyOn(github, 'fetchLayoutAndKeymap').mockImplementation(async (_repo, _branch, selected) => ({
      layout: [{ x: 0, y: 0, row: 0, col: 0 }], keymap: { layers: [] },
      hostSnapshot: null, warnings: [], headSha: 's', keymapPath: selected!.keymapPath, ownershipMode: 'scoped'
    }))
    const status = vi.fn()
    const onSelect = open(vi.fn((event: Omit<GithubKeyboardSelection, 'source'>) => editor.selectKeyboard({ source: 'github', ...event })), undefined, status)
    await vi.waitFor(() => expect(storage.getPersistedBranch(repo.id)).toBe('main'))
    const inventory = deferred<Awaited<ReturnType<typeof github.fetchKeymaps>>>()
    vi.mocked(github.fetchKeymaps).mockReturnValueOnce(inventory.promise)
    const branch = target.querySelector('#branch') as HTMLSelectElement
    branch.value = '1'
    branch.dispatchEvent(new Event('change', { bubbles: true }))
    await vi.waitFor(() => expect(github.fetchKeymaps).toHaveBeenCalledWith(repo.full_name, 'dev'))
    expect(status).toHaveBeenLastCalledWith(expect.objectContaining({ loading: true, branch: 'main' }))
    inventory.reject(new Error('unavailable'))
    await vi.waitFor(() => expect(selectedOptionText(target.querySelector('#branch'))).toBe('main'))
    await unmount(view!)
    view = undefined
    vi.mocked(github.fetchKeymaps).mockRejectedValueOnce(new Error('unavailable on remount'))
    open(onSelect, undefined, status)
    await vi.waitFor(() => expect(target.textContent).toContain('unavailable on remount'))
    expect((target.querySelector('#keymap-file') as HTMLSelectElement)?.value).toBe('config/a.keymap')
    clickButton('Reload')
    await vi.waitFor(() => expect(files).toHaveBeenCalledTimes(2))
    expect(files).toHaveBeenLastCalledWith(repo.full_name, 'main', { keymapPath: 'config/a.keymap', expectedMode: 'scoped' })
  })

  it('preserves a clean document redo history when the picker remounts', async () => {
    vi.spyOn(github, 'fetchRepoBranches').mockResolvedValue([{ name: 'main' }])
    const keymap = { layers: [[{ value: '&none', params: [] }]] }
    vi.spyOn(github, 'fetchLayoutAndKeymap').mockResolvedValue({
      layout: [{ x: 0, y: 0, row: 0, col: 0 }], keymap,
      hostSnapshot: null, warnings: [], headSha: 's', keymapPath: 'config/a.keymap', ownershipMode: 'scoped'
    })
    const onSelect = open(vi.fn((event: Omit<GithubKeyboardSelection, 'source'>) => editor.selectKeyboard({ source: 'github', ...event })))
    await vi.waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1))
    await onSelect.mock.results[0].value
    editor.updateKeymap({ layers: [[{ value: '&trans', params: [] }]] })
    editor.undo()
    expect(editor.isDirty).toBe(false)
    expect(editor.canRedo).toBe(true)
    const before = JSON.stringify(editor.draftKeymap)
    await unmount(view!)
    view = undefined
    open(onSelect)
    await vi.waitFor(() => expect(onSelect).toHaveBeenCalledTimes(2))
    await onSelect.mock.results[1].value
    expect(editor.canRedo).toBe(true)
    expect(JSON.stringify(editor.draftKeymap)).toBe(before)
  })

  it('remembers independent accepted paths on ordinary branch changes', async () => {
    vi.spyOn(github, 'fetchRepoBranches').mockResolvedValue([{ name: 'main' }, { name: 'dev' }])
    vi.mocked(github.fetchKeymaps).mockResolvedValue({ headSha: 's', candidates: [
      { name: 'a.keymap', path: 'config/a.keymap' }, { name: 'b.keymap', path: 'config/b.keymap' }
    ] })
    storage.setPersistedKeymap(repo.full_name, 'main', { keymapPath: 'config/a.keymap', expectedMode: 'scoped' })
    storage.setPersistedKeymap(repo.full_name, 'dev', { keymapPath: 'config/b.keymap', expectedMode: 'scoped' })
    const fetchFiles = vi.spyOn(github, 'fetchLayoutAndKeymap').mockImplementation(async (_repo, _branch, selected) => ({
      layout: [{ x: 0, y: 0, row: 0, col: 0 }], keymap: { layers: [] },
      hostSnapshot: null, warnings: [], headSha: 's', keymapPath: selected!.keymapPath, ownershipMode: 'scoped'
    }))
    const onSelect = open(vi.fn((event: Omit<GithubKeyboardSelection, 'source'>) => editor.selectKeyboard({ source: 'github', ...event })))
    await vi.waitFor(() => expect(onSelect).toHaveBeenCalledTimes(1))
    await onSelect.mock.results[0].value
    const branch = target.querySelector('#branch') as HTMLSelectElement
    branch.value = '1'
    branch.dispatchEvent(new Event('change', { bubbles: true }))
    await vi.waitFor(() => expect(onSelect).toHaveBeenCalledTimes(2))
    await onSelect.mock.results[1].value
    expect(fetchFiles).toHaveBeenLastCalledWith(repo.full_name, 'dev', { keymapPath: 'config/b.keymap', expectedMode: 'scoped' })
    expect(editor.githubMeta?.keymapPath).toBe('config/b.keymap')
    expect(storage.getPersistedBranch(repo.id)).toBe('dev')
    expect(storage.getPersistedKeymap(repo.full_name, 'main')?.keymapPath).toBe('config/a.keymap')
    branch.value = '0'
    branch.dispatchEvent(new Event('change', { bubbles: true }))
    await vi.waitFor(() => expect(onSelect).toHaveBeenCalledTimes(3))
    await onSelect.mock.results[2].value
    expect(fetchFiles).toHaveBeenLastCalledWith(repo.full_name, 'main', { keymapPath: 'config/a.keymap', expectedMode: 'scoped' })
    expect(editor.githubMeta?.keymapPath).toBe('config/a.keymap')
    expect(storage.getPersistedKeymap(repo.full_name, 'dev')?.keymapPath).toBe('config/b.keymap')
  })

  it('selects the only branch even when storage has a different persisted branch', async () => {
    storage.setPersistedBranch(repo.id, 'main')
    vi.spyOn(github, 'fetchRepoBranches').mockResolvedValue([{ name: 'only' }])
    vi.spyOn(github, 'fetchLayoutAndKeymap').mockResolvedValue({
      layout: [{ x: 0, y: 0, row: 0, col: 0 }],
      keymap: { layers: [] },
      hostSnapshot: null,
      warnings: [],
      headSha: 'abc123'
    })

    const onSelect = open()

    await vi.waitFor(() => {
      expect(target.querySelector('.branch-value')?.textContent?.trim()).toBe('only')
    })
    expect(target.querySelector('.source-trigger')).toBeNull()
    expect(target.querySelector('#branch')).toBeNull()
    expect(target.querySelector('#repo')).toBeNull()
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        github: expect.objectContaining({ repository: repo.full_name, branch: 'only' })
      })
    )
  })

  it('retains the server-selected path for metadata and same-file Reload', async () => {
    vi.mocked(github.fetchKeymaps).mockResolvedValue({ headSha: 's', candidates: [{ name: 'b.keymap', path: 'config/b.keymap' }] })
    vi.spyOn(github, 'fetchRepoBranches').mockResolvedValue([{ name: 'main' }])
    const fetchFiles = vi.spyOn(github, 'fetchLayoutAndKeymap').mockResolvedValue({ layout: [{ x: 0, y: 0 }], keymap: { layers: [] }, hostSnapshot: null, warnings: [], headSha: 's', keymapPath: 'config/b.keymap', ownershipMode: 'scoped' })
    const onSelect = open(vi.fn((event: Omit<GithubKeyboardSelection, 'source'>) => editor.selectKeyboard({ source: 'github', ...event })))
    await vi.waitFor(() => expect(editor.githubMeta?.keymapPath).toBe('config/b.keymap'))
    expect(onSelect.mock.calls[0][0].github).toMatchObject({ keymapPath: 'config/b.keymap', ownershipMode: 'scoped' })
    clickButton('Reload')
    await vi.waitFor(() => expect(fetchFiles).toHaveBeenLastCalledWith(repo.full_name, 'main', { keymapPath: 'config/b.keymap', expectedMode: 'scoped' }))
  })

  it.each(['Reload', 'branch change'])('keeps the accepted path after %s is refused by destination storage', async trigger => {
    vi.spyOn(github, 'fetchRepoBranches').mockResolvedValue([{ name: 'main' }, { name: 'dev' }])
    const accepted: KeyboardFilesResult = {
      layout: [{ x: 0, y: 0, row: 0, col: 0 }],
      keymap: { layers: [[{ value: '&kp', params: [{ value: 'A', params: [] }] }]] },
      hostSnapshot: null, warnings: [], headSha: 's',
      keymapPath: 'config/a.keymap', ownershipMode: 'scoped'
    }
    const fetchFiles = vi.spyOn(github, 'fetchLayoutAndKeymap')
      .mockResolvedValue(accepted)
      .mockResolvedValueOnce(accepted)
      .mockResolvedValueOnce({ ...accepted, keymapPath: 'config/b.keymap', headSha: 't' })
    const onSelect = open(vi.fn((event: Omit<GithubKeyboardSelection, 'source'>) => editor.selectKeyboard({ source: 'github', ...event })))
    await vi.waitFor(() => expect(editor.githubMeta?.keymapPath).toBe('config/a.keymap'))
    await onSelect.mock.results[0].value
    const priorMeta = { ...editor.githubMeta }
    const priorDraft = JSON.stringify(editor.draftKeymap)
    const read = vi.spyOn(hostStorage, 'loadGithubHostCache').mockRejectedValue(new Error('unavailable'))
    const changeBranch = (index: string) => {
      const select = target.querySelector('#branch') as HTMLSelectElement
      select.value = index
      select.dispatchEvent(new Event('change', { bubbles: true }))
      flushSync()
    }

    if (trigger === 'Reload') clickButton('Reload')
    else changeBranch('1')
    await vi.waitFor(() => expect(editor.saveNotice?.messages).toContain('Could not read destination recovery. The current selection was retained.'))
    expect(editor.githubMeta).toEqual(priorMeta)
    expect(JSON.stringify(editor.draftKeymap)).toBe(priorDraft)
    read.mockRestore()

    // Refusal already restored main; Reload must not require a manual switch back.
    await vi.waitFor(() => expect(selectedOptionText(target.querySelector('#branch'))).toBe('main'))
    clickButton('Reload')
    await vi.waitFor(() => expect(fetchFiles).toHaveBeenCalledTimes(3))
    expect(fetchFiles).toHaveBeenLastCalledWith(repo.full_name, 'main', {
      keymapPath: 'config/a.keymap', expectedMode: 'scoped'
    })
    await vi.waitFor(() => expect(onSelect).toHaveBeenCalledTimes(3))
    await onSelect.mock.results[2].value
  })

  it('selects a persisted branch that is still in the list over default_branch', async () => {
    storage.setPersistedBranch(repo.id, 'dev')
    vi.spyOn(github, 'fetchRepoBranches').mockResolvedValue([
      { name: 'main' },
      { name: 'dev' },
      { name: 'feat' }
    ])
    vi.spyOn(github, 'fetchLayoutAndKeymap').mockResolvedValue({
      layout: [{ x: 0, y: 0, row: 0, col: 0 }],
      keymap: { layers: [] },
      hostSnapshot: null,
      warnings: [],
      headSha: 'abc123'
    })

    const onSelect = open()

    await vi.waitFor(() => {
      expect(selectedOptionText(target.querySelector('#branch'))).toBe('dev')
    })
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        github: expect.objectContaining({ repository: repo.full_name, branch: 'dev' })
      })
    )
    expect(onSelect).not.toHaveBeenCalledWith(
      expect.objectContaining({
        github: expect.objectContaining({ repository: repo.full_name, branch: 'main' })
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
      layout: [{ x: 0, y: 0, row: 0, col: 0 }],
      keymap: { layers: [] },
      hostSnapshot: null,
      warnings: [],
      headSha: 'abc123'
    })

    const onSelect = open()

    await vi.waitFor(() => {
      expect(selectedOptionText(target.querySelector('#branch'))).toBe('main')
    })
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        github: expect.objectContaining({ repository: repo.full_name, branch: 'main' })
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

    const oldLayout = deferred<KeyboardFilesResult>()
    const newBranches = deferred<Array<{ name: string }>>()

    vi.spyOn(github, 'fetchRepoBranches').mockImplementation(async next => {
      if (next.id === oldRepo.id) return [{ name: 'main' }]
      return newBranches.promise
    })
    vi.spyOn(github, 'fetchLayoutAndKeymap').mockImplementation(async name => {
      if (name === oldRepo.full_name) return oldLayout.promise
      return {
        layout: [{ x: 0, y: 0, row: 0, col: 0 }],
        keymap: { layers: [] },
        hostSnapshot: null,
        warnings: [],
        headSha: 'abc123'
      }
    })

    const onStatus = vi.fn()
    const onSelect = open(vi.fn(), undefined, onStatus)

    await vi.waitFor(() => {
      expect(github.fetchLayoutAndKeymap).toHaveBeenCalledWith(
        oldRepo.full_name,
        'main',
        { keymapPath: 'config/a.keymap' }
      )
    })
    expect(onStatus).toHaveBeenCalledWith(
      expect.objectContaining({ loading: true, branch: 'main' })
    )
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

    newBranches.resolve([])
    await vi.waitFor(() => {
      expect(onStatus).toHaveBeenCalledWith(
        expect.objectContaining({ loading: false, branch: null })
      )
    })

    oldLayout.resolve({
      layout: [{ x: 0, y: 0, row: 0, col: 0 }],
      keymap: { layers: [] },
      hostSnapshot: null,
      warnings: [],
      headSha: 'abc123'
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

  it('shows loadError when listing branches fails', async () => {
    const err = Object.assign(new Error('Request failed: 502'), {
      response: { status: 502, data: { message: 'Bad gateway' } }
    })
    vi.spyOn(github, 'fetchRepoBranches').mockRejectedValue(err)

    const onSelect = open()

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Bad gateway')
    })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('shows a StaleRepoBase branch-list error and does not select a keyboard', async () => {
    const err = Object.assign(new Error('Request failed: 409'), {
      response: {
        status: 409,
        data: {
          name: 'StaleRepoBase',
          errors: ['Branch changed on GitHub — reload']
        }
      }
    })
    vi.spyOn(github, 'fetchRepoBranches').mockRejectedValue(err)

    const onSelect = open()

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Branch changed on GitHub — reload')
    })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('shows loadError for non-validation fetch failures', async () => {
    vi.spyOn(github, 'fetchRepoBranches').mockResolvedValue([{ name: 'main' }])
    const err = Object.assign(new Error('Request failed: 502'), {
      response: { status: 502, data: { message: 'Bad gateway' } }
    })
    vi.spyOn(github, 'fetchLayoutAndKeymap').mockRejectedValue(err)

    open()

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Bad gateway')
    })
    expect(target.querySelector('.branch-value')?.textContent?.trim()).toBe('main')
  })

  it('warns when the layout has no row/col and still calls onSelect', async () => {
    vi.spyOn(github, 'fetchRepoBranches').mockResolvedValue([{ name: 'main' }])
    vi.spyOn(github, 'fetchLayoutAndKeymap').mockResolvedValue({
      layout: [{ x: 0, y: 0 }, { x: 1, y: 0 }],
      keymap: { layers: [] },
      hostSnapshot: null,
      warnings: [],
      headSha: 'abc123'
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
        github: expect.objectContaining({ repository: repo.full_name, branch: 'main' }),
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
      layout: [{ x: 0, y: 0, row: 0, col: 0 }],
      keymap: { layers: [] },
      hostSnapshot: null,
      warnings: [],
      headSha: 'abc123'
    })
    const create = vi.spyOn(github, 'createBranch').mockResolvedValue({ name: 'topic' })

    const onSelect = open()
    await vi.waitFor(() => {
      expect(selectedOptionText(target.querySelector('#branch'))).toBe('main')
    })

    clickButton('Create new branch')
    const input = target.querySelector('#new-branch')
    if (!(input instanceof HTMLInputElement)) throw new Error('missing branch input')
    expect(target.textContent).toMatch(/Keeps your unpublished edits and\s*Host languages/)
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
          github: expect.objectContaining({ repository: 'acme/lark', branch: 'topic' }),
          preserveSession: true
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
      layout: [{ x: 0, y: 0, row: 0, col: 0 }],
      keymap: { layers: [] },
      hostSnapshot: null,
      warnings: [],
      headSha: 'abc123'
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

  it('ignores a stale Reload after the branch changes', async () => {
    vi.spyOn(github, 'fetchRepoBranches').mockResolvedValue([
      { name: 'main' },
      { name: 'dev' }
    ])

    const initial = deferred<KeyboardFilesResult>()
    const reload = deferred<KeyboardFilesResult>()
    let fetchCount = 0
    vi.spyOn(github, 'fetchLayoutAndKeymap').mockImplementation(async (_repo, _branch) => {
      fetchCount += 1
      if (fetchCount === 1) return initial.promise
      if (fetchCount === 2) return reload.promise
      return {
        layout: [{ x: 0, y: 0, row: 0, col: 0 }],
        keymap: { layers: [[{ value: '&kp', params: [{ value: 'D', params: [] }] }]] },
        hostSnapshot: null,
        warnings: [],
        headSha: 'abc123'
      }
    })

    const onSelect = open()
    initial.resolve({
      layout: [{ x: 0, y: 0, row: 0, col: 0 }],
      keymap: { layers: [[{ value: '&kp', params: [{ value: 'M', params: [] }] }]] },
      hostSnapshot: null,
      warnings: [],
      headSha: 'abc123'
    })
    await vi.waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          github: { repository: repo.full_name, branch: 'main', headSha: 'abc123' }
        })
      )
    })

    clickButton('Reload')
    await vi.waitFor(() => {
      expect(fetchCount).toBe(2)
    })

    const branchSelect = target.querySelector('#branch')
    if (!(branchSelect instanceof HTMLSelectElement)) {
      throw new Error('missing branch select')
    }
    // Selector option values are choice indexes, not branch names.
    branchSelect.value = '1'
    branchSelect.dispatchEvent(new Event('change', { bubbles: true }))
    flushSync()

    await vi.waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          github: expect.objectContaining({ repository: repo.full_name, branch: 'dev' })
        })
      )
    })
    const callsAfterDev = onSelect.mock.calls.length

    reload.resolve({
      layout: [{ x: 0, y: 0, row: 0, col: 0 }],
      keymap: {
        layers: [[{ value: '&kp', params: [{ value: 'STALE', params: [] }] }]]
      },
      hostSnapshot: null,
      warnings: [],
      headSha: 'abc123'
    })
    await Promise.resolve()
    flushSync()
    await Promise.resolve()
    flushSync()

    expect(onSelect.mock.calls.length).toBe(callsAfterDev)
    expect(
      onSelect.mock.calls.some(call => {
        const keymap = (call[0] as { keymap?: { layers?: unknown } }).keymap
        return JSON.stringify(keymap).includes('STALE')
      })
    ).toBe(false)
  })
})
