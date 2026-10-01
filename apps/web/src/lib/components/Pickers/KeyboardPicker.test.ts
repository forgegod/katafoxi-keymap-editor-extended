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

  it('starts on GitHub when selectedSource is github and does not fetch local files', () => {
    localStorage.setItem('selectedSource', 'github')

    open()

    const select = target.querySelector('#source')
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error('missing source select')
    }
    expect(select.selectedOptions[0]?.textContent?.trim()).toBe('GitHub')
    expect(loadLayout).not.toHaveBeenCalled()
    expect(loadKeymap).not.toHaveBeenCalled()
  })

  it('leaves the source select empty for a stored source that is not a choice', () => {
    localStorage.setItem('selectedSource', 'nope')

    const onSelect = open()

    const select = target.querySelector('#source')
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error('missing source select')
    }
    expect(select.options).toHaveLength(3)
    expect(localStorage.getItem('selectedSource')).toBe('nope')
    expect(target.querySelector('#repo')).toBeNull()
    expect(onSelect).not.toHaveBeenCalled()
    expect(loadLayout).not.toHaveBeenCalled()
    expect(loadKeymap).not.toHaveBeenCalled()
  })

  it('writes selectedSource and calls onSelect when local is chosen by index', async () => {
    localStorage.setItem('selectedSource', 'github')
    const onSelect = open()

    const select = target.querySelector('#source')
    if (!(select instanceof HTMLSelectElement)) {
      throw new Error('missing source select')
    }
    // Demo=0, Local=1, GitHub=2
    select.value = '1'
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
