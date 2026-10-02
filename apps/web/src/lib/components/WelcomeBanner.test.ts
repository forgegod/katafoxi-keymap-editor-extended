import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WelcomeBanner from './WelcomeBanner.svelte'

describe('WelcomeBanner', () => {
  let target: HTMLDivElement
  let view: ReturnType<typeof mount> | undefined

  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    localStorage.clear()
  })

  afterEach(() => {
    if (view) unmount(view)
    view = undefined
    target.remove()
    localStorage.clear()
  })

  function open(props: Record<string, unknown> = {}) {
    view = mount(WelcomeBanner, {
      target,
      props: {
        showGithub: true,
        onPasteKeymap: vi.fn(),
        onConnectGithub: vi.fn(),
        ...props
      }
    })
    flushSync()
  }

  it('shows tip links until dismissed', () => {
    const onPasteKeymap = vi.fn()
    const onConnectGithub = vi.fn()
    open({ onPasteKeymap, onConnectGithub })

    expect(target.querySelector('.welcome-banner')).toBeTruthy()
    expect(target.textContent).toMatch(/Alt\+click/)
    expect(target.textContent).toMatch(/Demo · Lark/)
    expect(target.textContent).toMatch(/Paste \.keymap/)
    expect(target.textContent).toMatch(/Connect GitHub/)

    const paste = [...target.querySelectorAll('button')].find(btn =>
      btn.textContent?.includes('Paste .keymap')
    )
    paste?.click()
    flushSync()

    expect(onPasteKeymap).toHaveBeenCalled()
    expect(localStorage.getItem('welcomeBannerDismissed')).toBe('1')
    expect(target.querySelector('.welcome-banner')).toBeNull()
  })

  it('stays hidden after a prior dismiss', () => {
    localStorage.setItem('welcomeBannerDismissed', '1')
    open()
    expect(target.querySelector('.welcome-banner')).toBeNull()
  })
})
