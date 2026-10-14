import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hostLayout } from '@keymap-editor/keymap-core'
import { editor } from '../editor.svelte.js'
import * as store from '../host-layout-store'
import HostProfileBar from './HostProfileBar.svelte'

const CommentCtor = Object.getPrototypeOf(document.createComment('')).constructor
if (!(document.createComment('') instanceof Comment)) {
  Object.defineProperty(globalThis, 'Comment', { configurable: true, writable: true, value: CommentCtor })
}

const event = { source: 'github' as const, github: { repository: 'acme/delete-dialog', branch: 'main', keymapPath: 'config/a.keymap', headSha: 's' },
  layout: [{ x: 0, y: 0 }], keymap: { layers: [[{ value: '&none', params: [] }]] } }

describe('HostProfileBar', () => {
  let target: HTMLDivElement
  let view: ReturnType<typeof mount> | undefined

  beforeEach(async () => {
    editor.resetForTests()
    await store.clearHostLayoutStore()
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    if (view) unmount(view)
    view = undefined
    target.remove()
    editor.resetForTests()
    vi.restoreAllMocks()
  })

  function click(label: string) {
    const button = [...target.querySelectorAll('button')].find(item => item.textContent?.trim() === label)
    expect(button).toBeDefined()
    button!.click()
    flushSync()
  }

  function dismiss(action: string) {
    if (action === 'Cancel') click('Cancel')
    else {
      const backdrop = target.querySelector<HTMLElement>('.modal-wrapper')
      expect(backdrop).not.toBeNull()
      backdrop!.click()
      flushSync()
    }
  }

  it('retains the pending profile name after active-column replacement and failure', async () => {
    await editor.selectKeyboard(event)
    await editor.setHostKeyLevel('en', 'A', 0, 'Ω')
    const id = editor.activeProfileId('en')
    editor.beginRenameHostProfile('en', id)
    await editor.confirmHostProfileName('Pending owner profile')
    view = mount(HostProfileBar, { target })
    editor.beginDeleteHostProfile('en', id)
    flushSync()
    const message = 'Profile “Pending owner profile” will be removed from this browser.'
    expect(target.textContent).toContain(message)
    let release!: () => void
    let started!: () => void
    const blocked = new Promise<void>(resolve => { release = resolve })
    const entered = new Promise<void>(resolve => { started = resolve })
    const save = store.saveGithubHostCache
    vi.spyOn(store, 'saveGithubHostCache').mockImplementationOnce(async (...args) => {
      started()
      await blocked
      return save(...args)
    })
    const remove = IDBObjectStore.prototype.delete
    const failure = vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (this: IDBObjectStore, key) {
      if (key === id) throw new Error('quota')
      return remove.call(this, key)
    })
    try {
      click('Delete')
      await entered
      expect(editor.activeProfileId('en')).not.toBe(id)
      expect(editor.profilesForLanguage('en').some(row => row.id === id)).toBe(false)
      // Reopening the containing surface must render from retained state, not
      // a previously cached derived profile from before deletion was pending.
      await unmount(view!)
      view = mount(HostProfileBar, { target })
      flushSync()
      expect.soft(target.textContent).toContain(message)
      release()
      await editor._hostCacheWrites
      flushSync()
      expect.soft(target.textContent).toContain(message)
      failure.mockRestore()
      click('Delete')
      await editor._hostCacheWrites
      flushSync()
      expect(target.querySelector('.profile-dialog')).toBeNull()
      expect((await store.loadUserHostLayouts()).some(row => row.id === id)).toBe(false)
    } finally {
      release()
      await editor._hostCacheWrites
    }
  })

  it.each(['Cancel', 'backdrop'])('keeps pending private deletion retry after %s during a queued transaction', async action => {
    await editor.selectKeyboard(event)
    await editor.setHostKeyLevel('en', 'A', 0, 'Ω')
    const id = editor.activeProfileId('en')
    const stored = (await store.loadUserHostLayouts()).find(row => row.id === id)
    view = mount(HostProfileBar, { target })
    editor.beginDeleteHostProfile('en', id)
    flushSync()
    // Before deletion is confirmed, dismissal still cancels without side effects.
    dismiss(action)
    expect(editor.hostProfilePrompt).toBeNull()
    expect((await store.loadUserHostLayouts()).find(row => row.id === id)).toEqual(stored)
    editor.beginDeleteHostProfile('en', id)
    flushSync()

    let release!: () => void
    let started!: () => void
    const blocked = new Promise<void>(resolve => { release = resolve })
    const entered = new Promise<void>(resolve => { started = resolve })
    const save = store.saveGithubHostCache
    vi.spyOn(store, 'saveGithubHostCache').mockImplementationOnce(async (...args) => {
      started()
      await blocked
      return save(...args)
    })
    const queued = editor._persistGithubHostCache()
    await entered
    const remove = IDBObjectStore.prototype.delete
    const failure = vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (this: IDBObjectStore, key) {
      if (key === id) throw new Error('quota')
      return remove.call(this, key)
    })
    try {
      click('Delete')
      dismiss(action)
      expect.soft(editor.hostProfilePrompt).toMatchObject({ kind: 'delete', profileId: id })
      expect.soft(target.querySelector('.profile-dialog')).not.toBeNull()
      expect((await store.loadUserHostLayouts()).find(row => row.id === id)).toEqual(stored)
      release()
      await queued
      await editor._hostCacheWrites
      flushSync()
      expect.soft(editor.hostProfilePrompt).toMatchObject({ kind: 'delete', profileId: id })
      expect.soft(target.querySelector('.profile-dialog')).not.toBeNull()
      expect(hostLayout(id)?.byZmk.get('A')?.glyphs[0]).toBe('Ω')
      expect((await store.loadUserHostLayouts()).find(row => row.id === id)).toEqual(stored)
      // Failure is not permission to dismiss an intent a later flush can execute.
      if (editor.hostProfilePrompt) dismiss(action)
      expect.soft(editor.hostProfilePrompt).toMatchObject({ kind: 'delete', profileId: id })
      failure.mockRestore()
      if (editor.hostProfilePrompt) click('Delete')
      await editor._hostCacheWrites
      flushSync()
      expect.soft((await store.loadUserHostLayouts()).some(row => row.id === id)).toBe(false)
      expect.soft(hostLayout(id)).toBeUndefined()
      expect(editor.hostProfilePrompt).toBeNull()
      expect(target.querySelector('.profile-dialog')).toBeNull()
    } finally {
      release()
      await editor._hostCacheWrites
    }
  })
})
