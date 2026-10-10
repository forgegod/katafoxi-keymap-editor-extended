import { flushSync, mount, tick, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hasEscapeOverlay, resetEscapeStackForTests } from '../../../escape-stack'
import ExportSheet from './ExportSheet.svelte'

describe('ExportSheet', () => {
  let target: HTMLDivElement
  let modalRoot: HTMLDivElement
  let view: ReturnType<typeof mount> | undefined

  beforeEach(() => {
    resetEscapeStackForTests()
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
    resetEscapeStackForTests()
    vi.restoreAllMocks()
  })

  it('accepts the export only after Copy again succeeds', async () => {
    const onCopied = vi.fn()
    const code = 'bindings = <&kp ESC>;'
    const writeText = vi.spyOn(navigator.clipboard, 'writeText')
      .mockRejectedValueOnce(new Error('clipboard denied'))
      .mockResolvedValue(undefined)
    view = mount(ExportSheet, {
      target,
      props: { code, copied: false, onCopied, onClose: vi.fn() }
    })
    flushSync()
    await tick()
    const copy = [...document.querySelectorAll('button')]
      .find(button => button.textContent?.trim() === 'Copy again')!
    copy.click()
    await vi.waitFor(() => { expect(writeText).toHaveBeenCalledTimes(1) })
    expect(onCopied).not.toHaveBeenCalled()
    copy.click()
    await vi.waitFor(() => { expect(onCopied).toHaveBeenCalledTimes(1) })
    expect(writeText).toHaveBeenLastCalledWith(code)
    flushSync()
    expect(document.querySelector('[role="status"]')?.textContent).toMatch(/Copied to the system clipboard/)
  })

  it('shows the code for manual copy when the system clipboard write failed, lists warnings, and closes on Escape', async () => {
    const onClose = vi.fn()
    const code = 'bindings = <&kp ESC>;'
    const warning =
      'No info.json — using a flat rectangular board from the binding count. Paste info.json for the real layout.'
    view = mount(ExportSheet, {
      target,
      props: {
        code,
        copied: false,
        warnings: [warning],
        onClose
      }
    })
    flushSync()
    await tick()

    const dialog = document.querySelector('[role="dialog"]')
    expect(dialog?.getAttribute('aria-label')).toBe('Exported keymap')
    expect(hasEscapeOverlay()).toBe(true)

    const textbox = document.querySelector('[role="dialog"] textarea')
    expect(textbox).toBeTruthy()
    expect((textbox as HTMLTextAreaElement).value).toBe(code)

    expect(document.querySelector('[role="status"]')?.textContent).toMatch(
      /Could not write the system clipboard/
    )
    const items = [...document.querySelectorAll('[role="dialog"] li')].map(el =>
      el.textContent?.trim()
    )
    expect(items).toContain(warning)

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    )
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
