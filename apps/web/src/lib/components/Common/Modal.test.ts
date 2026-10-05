import { createRawSnippet, flushSync, mount, tick, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Modal from './Modal.svelte'

describe('Modal', () => {
  let target: HTMLDivElement
  let modalRoot: HTMLDivElement
  let view: ReturnType<typeof mount> | undefined

  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)
    modalRoot = document.createElement('div')
    modalRoot.id = 'modal-root'
    document.body.appendChild(modalRoot)
  })

  afterEach(() => {
    if (view) unmount(view)
    view = undefined
    target.remove()
    modalRoot.remove()
  })

  function body(html: string) {
    return createRawSnippet(() => ({
      render: () => html
    }))
  }

  it('marks the dialog modal, moves focus in, and restores on close', async () => {
    const opener = document.createElement('button')
    opener.type = 'button'
    opener.textContent = 'Open'
    document.body.appendChild(opener)
    opener.focus()

    const onBackdrop = vi.fn()
    view = mount(Modal, {
      target,
      props: {
        onBackdrop,
        children: body('<button type="button">Inside</button>')
      }
    })
    flushSync()
    await tick()

    const dialog = modalRoot.querySelector('.modal-wrapper')
    expect(dialog?.getAttribute('role')).toBe('dialog')
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(document.activeElement?.textContent).toBe('Inside')

    unmount(view)
    view = undefined
    flushSync()
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })

  it('closes on Escape when onBackdrop is set', async () => {
    const onBackdrop = vi.fn()
    view = mount(Modal, {
      target,
      props: {
        onBackdrop,
        children: body('<p>Hello</p>')
      }
    })
    flushSync()
    await tick()

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
    expect(onBackdrop).toHaveBeenCalledTimes(1)
  })

  it('ignores Escape when onBackdrop is omitted', async () => {
    view = mount(Modal, {
      target,
      props: {
        children: body('<p>Busy</p>')
      }
    })
    flushSync()
    await tick()

    expect(() => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
      )
    }).not.toThrow()
    expect(modalRoot.querySelector('.modal-wrapper')).not.toBeNull()
  })
})
