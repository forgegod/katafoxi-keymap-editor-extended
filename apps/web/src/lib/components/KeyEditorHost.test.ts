import { flushSync, mount, tick, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import KeyEditorHostHarness from './KeyEditorHostHarness.svelte'

describe('KeyEditorHost Escape', () => {
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

  it('calls onCancel once per Escape', async () => {
    const onCancel = vi.fn()
    view = mount(KeyEditorHostHarness, { target, props: { onCancel } })
    flushSync()
    await tick()

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
    flushSync()
    expect(onCancel).toHaveBeenCalledOnce()
  })
})
