import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { editor } from '../editor.svelte.js'
import HostProfileMenu from './HostProfileMenu.svelte'
import { cloneHostLegendView, hostLayout, hostLayoutShelves, standardHostLegendView } from '@keymap-editor/keymap-core'
import { clearHostLayoutStore, loadUserHostLayouts } from '../host-layout-store'

const happyComment = document.createComment('')
const CommentCtor = Object.getPrototypeOf(happyComment).constructor
if (!(happyComment instanceof Comment)) {
  Object.defineProperty(globalThis, 'Comment', {
    configurable: true,
    writable: true,
    value: CommentCtor
  })
}

describe('HostProfileMenu', () => {
  let target: HTMLDivElement
  let view: ReturnType<typeof mount> | undefined

  beforeEach(async () => {
    editor.resetForTests()
    await clearHostLayoutStore()
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    if (view) unmount(view)
    view = undefined
    target?.remove()
    editor.resetForTests()
  })

  it.each(['demo', 'clipboard', 'local', 'github', 'logout'] as const)('drops former-owner private profiles and stale copy/export access on %s', async source => {
    const event = { source: 'github' as const, github: { repository: `acme/shelf-${source}`, branch: 'main', keymapPath: 'config/a.keymap', headSha: 's' },
      layout: [{ x: 0, y: 0 }], keymap: { layers: [[{ value: '&none', params: [] }]] } }
    await editor.selectKeyboard(event)
    await editor.setHostKeyLevel('en', 'A', 0, 'Ω')
    const id = editor.activeProfileId('en')
    editor.beginRenameHostProfile('en', id)
    await editor.confirmHostProfileName('Owner private')
    const privateView = cloneHostLegendView(editor.hostLegend)
    // Explicit owner-created global copies remain permitted after leaving.
    editor.beginCopyHostProfile('en', id)
    expect(await editor.confirmHostProfileName('Permitted global copy')).toBeNull()
    const globalId = editor.activeProfileId('en')
    await editor.selectLanguageProfile('en', id)
    editor.acceptHostRepoBaseline()
    await editor._hostCacheWrites
    const stored = (await loadUserHostLayouts()).find(row => row.id === id)
    editor.beginSaveHostProfile('en')
    const savePrompt = editor.hostProfilePrompt!
    editor.beginCopyHostProfile('en', id)
    const copyPrompt = editor.hostProfilePrompt!
    view = mount(HostProfileMenu, { target, props: { language: 'en', languageName: 'English', open: true, onToggle: () => {}, onClose: () => {} } })
    flushSync()
    expect(target.textContent).toContain('Owner private')

    if (source === 'logout') editor.clearLoadedKeymap()
    else await editor.selectKeyboard(source === 'github'
      ? { ...event, github: { ...event.github, keymapPath: 'config/b.keymap' } }
      : { source, layout: event.layout, keymap: { ...event.keymap, keyboard: `shelf-${source}` } })
    expect(editor.source).toBe(source === 'logout' ? null : source)
    flushSync()
    expect.soft(hostLayout(id)).toBeUndefined()
    expect.soft(editor.userLayouts.map(row => row.id)).not.toContain(id)
    expect.soft(hostLayoutShelves('en').users.map(row => row.id)).not.toContain(id)
    expect.soft(target.textContent).not.toContain('Owner private')
    expect.soft(editor.hostProfilePrompt).toBeNull()
    expect.soft(editor.exportUserHostLayoutXkb(id)).toBeNull()
    expect.soft(editor.exportUserHostLayoutKlc(id)).toBeNull()
    editor.cancelHostProfilePrompt()
    editor.beginCopyHostProfile('en', id)
    expect.soft(editor.hostProfilePrompt).toBeNull()
    editor.cancelHostProfilePrompt()
    editor.hostLegend = privateView
    editor.beginSaveHostProfile('en')
    expect.soft(editor.hostProfilePrompt).toBeNull()
    expect.soft(editor.exportActiveHostLayoutsXkb()).toBeNull()
    // Retained prompt callbacks cannot convert the former owner's table to global.
    for (const prompt of [copyPrompt, savePrompt]) {
      editor.hostLegend = privateView
      editor.hostProfilePrompt = prompt
      expect.soft(await editor.confirmHostProfileName(`Forbidden ${prompt.kind}`)).not.toBeNull()
    }
    expect.soft(editor.userLayouts.some(row => row.name.startsWith('Forbidden'))).toBe(false)
    expect.soft((await loadUserHostLayouts()).find(row => row.id === id)).toEqual(stored)
    editor.cancelHostProfilePrompt()
    editor.hostLegend = standardHostLegendView()
    expect(editor.exportUserHostLayoutXkb(globalId)?.text).toContain('Greek_OMEGA')
    expect(editor.exportUserHostLayoutKlc(globalId)).not.toBeNull()
    flushSync()
    expect(target.textContent).toContain('Permitted global copy')
    await editor.selectKeyboard(event)
    expect(editor.activeProfileId('en')).toBe(id)
    expect(editor.exportUserHostLayoutXkb(id)?.text).toContain('Greek_OMEGA')
  })

  it('opens a menu of actions instead of a listbox with mixed options', () => {
    view = mount(HostProfileMenu, {
      target,
      props: {
        language: 'en',
        languageName: 'English',
        open: true,
        onToggle: () => {},
        onClose: () => {}
      }
    })
    flushSync()

    const trigger = target.querySelector('.profile-trigger')
    const menu = target.querySelector('.profile-list')
    expect(trigger?.getAttribute('aria-haspopup')).toBe('menu')
    expect(menu?.getAttribute('role')).toBe('menu')
    expect(menu?.getAttribute('aria-label')).toBe('Profile English')
    expect(target.querySelector('[role="listbox"]')).toBeNull()
    expect(target.querySelector('[role="option"]')).toBeNull()
    expect(
      [...target.querySelectorAll('.profile-row')].every(
        row => row.getAttribute('role') === 'none'
      )
    ).toBe(true)
    expect(target.querySelectorAll('[role="menuitem"]').length).toBeGreaterThan(0)
    expect(target.querySelectorAll('[role="separator"]').length).toBeGreaterThan(0)
  })
})
