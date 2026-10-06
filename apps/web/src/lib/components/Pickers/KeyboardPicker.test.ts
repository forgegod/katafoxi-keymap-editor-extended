import { flushSync, mount, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadKeymap, loadLayout } from '../../api'
import github from '../../github/api.svelte.js'
import KeyboardPicker from './KeyboardPicker.svelte'

vi.mock('../../config', () => ({
  apiBaseUrl: '',
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

  function selectedSourceCard(): HTMLButtonElement {
    const card = target.querySelector('.source-card.selected')
    if (!(card instanceof HTMLButtonElement)) {
      throw new Error('missing selected source card')
    }
    return card
  }

  function clickSource(id: string) {
    const card = target.querySelector(`[data-source="${id}"]`)
    if (!(card instanceof HTMLButtonElement)) {
      throw new Error(`missing source card: ${id}`)
    }
    card.click()
    flushSync()
  }

  it('defaults to Demo when no source is stored and loads a keyboard', async () => {
    const onSelect = open()

    expect(selectedSourceCard().dataset.source).toBe('demo')
    expect(selectedSourceCard().textContent).toContain('Try a sample keyboard')
    const popover = target.querySelector('.source-popover')
    expect(popover).toBeTruthy()
    expect(popover?.hasAttribute('hidden')).toBe(true)
    expect(target.querySelector('.source-trigger-accent')).toBeTruthy()
    await vi.waitFor(() => {
      expect(onSelect).toHaveBeenCalled()
    })
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'demo',
        demo: expect.objectContaining({ id: 'corne' })
      })
    )
    expect(loadLayout).not.toHaveBeenCalled()
  })

  it('opens a requested source from the coach tour CTA', () => {
    const onOpenSourceConsumed = vi.fn()
    view = mount(KeyboardPicker, {
      target,
      props: {
        onSelect: vi.fn(),
        openSource: 'clipboard',
        onOpenSourceConsumed
      }
    })
    flushSync()

    expect(target.querySelector('.clipboard-picker')).toBeTruthy()
    expect(target.querySelector('.source-popover')?.hasAttribute('hidden')).toBe(
      false
    )
    expect(onOpenSourceConsumed).toHaveBeenCalled()
    expect(target.querySelector('.source-trigger-accent')).toBeNull()
  })

  it('keeps the source menu open after clicking Demo, then closes on a keyboard', async () => {
    localStorage.setItem('selectedSource', 'github')
    const onSelect = open()

    const trigger = target.querySelector('.source-trigger')
    if (!(trigger instanceof HTMLButtonElement)) {
      throw new Error('missing source trigger')
    }
    trigger.click()
    flushSync()

    const popover = target.querySelector('.source-popover')
    if (!(popover instanceof HTMLElement)) {
      throw new Error('missing source popover')
    }
    expect(popover.hasAttribute('hidden')).toBe(false)

    clickSource('demo')
    await vi.waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'demo' })
      )
    })
    expect(popover.hasAttribute('hidden')).toBe(false)

    await vi.waitFor(() => {
      expect(
        [...target.querySelectorAll('.demo-card')].some(card =>
          card.textContent?.includes('Lily58')
        )
      ).toBe(true)
    })
    const lily = [...target.querySelectorAll('.demo-card')].find(card =>
      card.textContent?.includes('Lily58')
    )
    if (!(lily instanceof HTMLButtonElement)) {
      throw new Error('missing Lily58 demo')
    }
    lily.click()
    await vi.waitFor(() => {
      expect(popover.hasAttribute('hidden')).toBe(true)
    })
    expect(getComputedStyle(popover).display).toBe('none')
  })

  it('keeps the Demo trigger pulsing while Demo is selected', async () => {
    open()

    expect(target.querySelector('.source-popover')?.hasAttribute('hidden')).toBe(
      true
    )
    expect(target.querySelector('.source-trigger-accent')).toBeTruthy()

    ;(target.querySelector('.source-trigger') as HTMLButtonElement).click()
    flushSync()

    expect(target.querySelector('.source-popover')?.hasAttribute('hidden')).toBe(
      false
    )
    expect(target.querySelector('.source-trigger-accent')).toBeTruthy()
    expect(selectedSourceCard().dataset.source).toBe('demo')
  })

  it('stops the Demo pulse when leaving Demo', () => {
    localStorage.setItem('selectedSource', 'github')
    open()
    expect(target.querySelector('.source-trigger-accent')).toBeNull()
  })

  it('starts on GitHub when selectedSource is github and does not fetch local files', () => {
    localStorage.setItem('selectedSource', 'github')

    open()

    expect(selectedSourceCard().dataset.source).toBe('github')
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
    expect(target.querySelector('.source-trigger-accent')).toBeTruthy()
    await vi.waitFor(() => {
      expect(onSelect).toHaveBeenCalled()
    })
  })

  it('leaves no source selected for a stored source that is not a choice', () => {
    localStorage.setItem('selectedSource', 'nope')

    const onSelect = open()

    expect(target.querySelectorAll('.source-card')).toHaveLength(4)
    expect(target.querySelector('.source-card.selected')).toBeNull()
    expect(localStorage.getItem('selectedSource')).toBe('nope')
    expect(target.querySelector('#repo')).toBeNull()
    expect(onSelect).not.toHaveBeenCalled()
    expect(loadLayout).not.toHaveBeenCalled()
    expect(loadKeymap).not.toHaveBeenCalled()
  })

  it('opens the clipboard picker without loading local files', () => {
    localStorage.setItem('selectedSource', 'clipboard')

    const onSelect = open()

    expect(selectedSourceCard().dataset.source).toBe('clipboard')
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

  it('writes selectedSource and calls onSelect when local is chosen', async () => {
    localStorage.setItem('selectedSource', 'github')
    const onSelect = open()

    clickSource('local')

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

  it('ignores a stale local load after switching source', async () => {
    function deferred<T>() {
      let resolve!: (value: T) => void
      const promise = new Promise<T>(res => {
        resolve = res
      })
      return { promise, resolve }
    }

    localStorage.setItem('selectedSource', 'local')
    const layoutGate = deferred<Array<{ row: number; col: number }>>()
    const keymapGate = deferred<{ layers: Array<Array<{ value: string; params: never[] }>> }>()
    vi.mocked(loadLayout).mockReturnValue(layoutGate.promise as never)
    vi.mocked(loadKeymap).mockReturnValue(keymapGate.promise as never)

    const onSelect = open()
    expect(loadLayout).toHaveBeenCalled()
    expect(loadKeymap).toHaveBeenCalled()
    expect(onSelect).not.toHaveBeenCalled()

    clickSource('demo')
    await vi.waitFor(() => {
      expect(onSelect).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'demo' })
      )
    })
    const callsAfterDemo = onSelect.mock.calls.length

    layoutGate.resolve([{ row: 0, col: 0 }])
    keymapGate.resolve({
      layers: [[{ value: '&kp', params: [] }]]
    })
    await Promise.resolve()
    flushSync()
    await Promise.resolve()
    flushSync()

    expect(onSelect.mock.calls.length).toBe(callsAfterDemo)
    expect(onSelect).not.toHaveBeenCalledWith(
      expect.objectContaining({ source: 'local' })
    )
  })
})
