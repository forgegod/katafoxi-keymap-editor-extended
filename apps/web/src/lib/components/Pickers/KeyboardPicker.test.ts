import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadKeymap, loadLayout } from '../../api'
import github from '../../github/api.svelte.js'
import KeyboardPicker from './KeyboardPicker.svelte'

vi.mock('../../config', () => ({
  apiBaseUrl: '',
  appBaseUrl: '',
  githubAppName: '',
  enableGitHub: true,
  enableLocal: true
}))

vi.mock('../../api', () => ({
  loadLayout: vi.fn(),
  loadKeymap: vi.fn()
}))

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

describe('KeyboardPicker', () => {
  let target: HTMLDivElement
  let view: ReturnType<typeof mount> | undefined

  beforeEach(() => {
    target = document.createElement('div')
    document.body.appendChild(target)

    vi.mocked(loadLayout).mockResolvedValue([{ row: 0, col: 0 }])
    vi.mocked(loadKeymap).mockResolvedValue({
      layers: [[{ value: '&trans', params: [] }]]
    })
    vi.spyOn(github, 'init').mockResolvedValue(undefined)
    github.initialized = true
  })

  afterEach(() => {
    if (view) unmount(view)
    view = undefined
    target?.remove()
    localStorage.clear()
    vi.restoreAllMocks()
    github.initialized = false
    github.authorized = false
    github.repositories = null
    github.repoInstallationMap = null
    github.installations = null
  })

  function open(onSelect = vi.fn()) {
    view = mount(KeyboardPicker, { target, props: { onSelect } })
    flushSync()
    return onSelect
  }

  it('defaults to Demo when no source is stored and loads a keyboard', async () => {
    const onSelect = open()

    const select = target.querySelector('#source')
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error('missing source select')
    }
    expect(select.selectedOptions[0]?.textContent?.trim()).toBe('Demo')
    const popover = target.querySelector('.source-popover')
    expect(popover).toBeTruthy()
    expect(popover?.hasAttribute('hidden')).toBe(false)
    expect(target.querySelector('.source-trigger-accent')).toBeTruthy()
    expect(target.querySelector('.source-select-accent')).toBeTruthy()
    await vi.waitFor(() => {
      expect(onSelect).toHaveBeenCalled()
    })
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'demo',
        demo: expect.objectContaining({ id: 'lark' })
      })
    )
    expect(loadLayout).not.toHaveBeenCalled()
  })

  it('closes the first-visit accent when the source menu is dismissed', async () => {
    open()

    expect(target.querySelector('.source-trigger-accent')).toBeTruthy()
    document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    flushSync()

    expect(target.querySelector('.source-popover')?.hasAttribute('hidden')).toBe(
      true
    )
    expect(target.querySelector('.source-trigger-accent')).toBeNull()
    expect(target.querySelector('.source-select-accent')).toBeNull()
  })

  it('starts on GitHub when selectedSource is github and does not fetch local files', () => {
    localStorage.setItem('selectedSource', 'github')

    open()

    const select = target.querySelector('#source')
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error('missing source select')
    }
    expect(select.selectedOptions[0]?.textContent?.trim()).toBe('GitHub')
    expect(target.querySelector('.source-popover')?.hasAttribute('hidden')).toBe(
      true
    )
    expect(target.querySelector('.source-trigger-accent')).toBeNull()
    expect(loadLayout).not.toHaveBeenCalled()
    expect(loadKeymap).not.toHaveBeenCalled()
  })

  it('keeps the source menu closed when Demo was already chosen before', async () => {
    localStorage.setItem('selectedSource', 'demo')

    const onSelect = open()

    expect(target.querySelector('.source-popover')?.hasAttribute('hidden')).toBe(
      true
    )
    expect(target.querySelector('.source-trigger-accent')).toBeNull()
    await vi.waitFor(() => {
      expect(onSelect).toHaveBeenCalled()
    })
  })

  it('leaves the source select empty for a stored source that is not a choice', () => {
    localStorage.setItem('selectedSource', 'nope')

    const onSelect = open()

    const select = target.querySelector('#source')
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error('missing source select')
    }
    expect(select.options).toHaveLength(4)
    expect(localStorage.getItem('selectedSource')).toBe('nope')
    expect(target.querySelector('#repo')).toBeNull()
    expect(onSelect).not.toHaveBeenCalled()
    expect(loadLayout).not.toHaveBeenCalled()
    expect(loadKeymap).not.toHaveBeenCalled()
  })

  it('opens the clipboard picker without loading local files', () => {
    localStorage.setItem('selectedSource', 'clipboard')

    const onSelect = open()

    const select = target.querySelector('#source')
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error('missing source select')
    }
    expect(select.selectedOptions[0]?.textContent?.trim()).toBe('Clipboard')
    expect(target.querySelector('.clipboard-picker')).toBeTruthy()
    expect(target.querySelector('.source-trigger')?.getAttribute('title')).toBe(
      'Paste a .keymap from the clipboard (layout optional)'
    )
    expect(onSelect).not.toHaveBeenCalled()
    expect(loadLayout).not.toHaveBeenCalled()
    expect(loadKeymap).not.toHaveBeenCalled()
  })

  it('marks the Clipboard chip when Load infers a rectangular board', async () => {
    localStorage.setItem('selectedSource', 'clipboard')
    const onSelect = open()

    const areas = target.querySelectorAll('.clipboard-text')
    const keymapArea = areas[0]
    if (!(keymapArea instanceof HTMLTextAreaElement)) {
      throw new Error('missing keymap textarea')
    }
    keymapArea.value = `
/ {
  keymap {
    compatible = "zmk,keymap";
    default_layer {
      bindings = <&kp A &kp B &kp C &kp D>;
    };
  };
};
`
    keymapArea.dispatchEvent(new Event('input', { bubbles: true }))
    flushSync()

    const load = [...target.querySelectorAll('button')].find(
      btn => btn.textContent?.trim() === 'Load'
    )
    if (!(load instanceof HTMLButtonElement)) {
      throw new Error('missing Load button')
    }
    load.click()
    flushSync()

    await vi.waitFor(() => {
      expect(onSelect).toHaveBeenCalled()
    })
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'clipboard',
        clipboardInferredLayout: true,
        warnings: expect.arrayContaining(['clipboard_inferred_layout'])
      })
    )
    expect(target.querySelector('.source-trigger')?.textContent).toMatch(
      /Clipboard · clipboard \(inferred\)/
    )
  })

  it('writes selectedSource and calls onSelect when local is chosen by index', async () => {
    localStorage.setItem('selectedSource', 'github')
    const onSelect = open()

    const select = target.querySelector('#source')
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error('missing source select')
    }
    // Demo=0, Clipboard=1, Local=2, GitHub=3
    select.value = '2'
    select.dispatchEvent(new Event('change', { bubbles: true }))
    flushSync()

    await vi.waitFor(() => {
      expect(onSelect).toHaveBeenCalled()
    })
    expect(localStorage.getItem('selectedSource')).toBe('local')
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'local' })
    )
    expect(loadLayout).toHaveBeenCalled()
    expect(loadKeymap).toHaveBeenCalled()
  })
})
