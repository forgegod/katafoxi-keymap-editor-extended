import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { editor } from '../editor.svelte.js'
import HostProfileMenu from './HostProfileMenu.svelte'

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

  beforeEach(() => {
    editor.resetForTests()
    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    if (view) unmount(view)
    view = undefined
    target?.remove()
    editor.resetForTests()
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
