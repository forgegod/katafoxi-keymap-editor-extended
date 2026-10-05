import { flushSync, mount, tick, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ParsedKeymap } from '@keymap-editor/keymap-core'
import { buildDraftIdentity, deleteStoredDraft } from './lib/draft-storage'
import { editor, type KeyboardSelection } from './lib/editor.svelte.js'
import github from './lib/github/api.svelte.js'
import App from './App.svelte'

vi.mock('./lib/config', () => ({
  apiBaseUrl: '',
  appBaseUrl: '',
  githubAppName: 'test-app',
  enableGitHub: true,
  enableLocal: true
}))

// happy-dom comment nodes are not `instanceof Comment`. Svelte skips empty
// comment anchors with that check; without it, Keyboard's wrapper style is
// applied to a text node and mount throws.
const happyComment = document.createComment('')
const CommentCtor = Object.getPrototypeOf(happyComment).constructor
if (!(happyComment instanceof Comment)) {
  Object.defineProperty(globalThis, 'Comment', {
    configurable: true,
    writable: true,
    value: CommentCtor
  })
}

const oneKeyLayout = [{ x: 0, y: 0, row: 0, col: 0 }]

function km(code: string, keyboard = 'lark'): ParsedKeymap {
  return {
    keyboard,
    layer_names: ['default'],
    layers: [[{ value: '&kp', params: [{ value: code, params: [] }] }]]
  }
}

function localSelection(
  code = 'A',
  keyboard = 'lark'
): KeyboardSelection {
  return {
    source: 'local',
    layout: oneKeyLayout,
    keymap: km(code, keyboard)
  }
}

function githubSelection(
  code = 'A',
  keyboard = 'lark'
): KeyboardSelection {
  return {
    source: 'github',
    github: { repository: 'owner/repo', branch: 'main' },
    layout: oneKeyLayout,
    keymap: km(code, keyboard)
  }
}

async function clearDrafts() {
  const identities = [
    buildDraftIdentity({ source: 'local', keyboard: 'lark' }),
    buildDraftIdentity({ source: 'local', keyboard: 'other' }),
    buildDraftIdentity({
      source: 'github',
      repo: 'owner/repo',
      branch: 'main',
      keyboard: 'lark'
    })
  ]
  for (const identity of identities) {
    if (identity) await deleteStoredDraft(identity)
  }
}

function buttonMatching(root: ParentNode, pattern: RegExp) {
  return [...root.querySelectorAll('button')].find(button =>
    pattern.test(button.textContent ?? '')
  )
}

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve(
    new Response(JSON.stringify(data), {
      status,
      headers: { 'Content-Type': 'application/json' }
    })
  )
}

describe('App chrome', () => {
  let target: HTMLDivElement
  let view: ReturnType<typeof mount> | undefined
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(async () => {
    editor.resetForTests()
    await clearDrafts()
    // Idle GitHub source: no Demo auto-load, no Local fetch, no persisted repo.
    localStorage.clear()
    localStorage.setItem('selectedSource', 'github')

    fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/layout')) return jsonResponse(oneKeyLayout)
      if (url.includes('/keymap')) return jsonResponse(km('Z'))
      return jsonResponse({}, 404)
    })
    vi.stubGlobal('fetch', fetchMock)

    vi.spyOn(github, 'commitChanges').mockResolvedValue({ data: {} })
    vi.spyOn(github, 'fetchLayoutAndKeymap').mockResolvedValue({
      layout: oneKeyLayout,
      keymap: km('A'),
      hostSnapshot: null,
      warnings: []
    })
    vi.spyOn(github, 'init').mockResolvedValue(undefined)
    github.initialized = true
    github.authorized = false
    github.repositories = null
    github.repoInstallationMap = null
    github.installations = null

    target = document.createElement('div')
    document.body.appendChild(target)
  })

  afterEach(() => {
    if (view) {
      unmount(view)
      view = undefined
    }
    target?.remove()
    editor.resetForTests()
    github.initialized = false
    github.authorized = false
    github.repositories = null
    github.repoInstallationMap = null
    github.installations = null
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  async function renderApp() {
    view = mount(App, { target })
    flushSync()
    await tick()
    await Promise.resolve()
    flushSync()
    await vi.waitFor(() => {
      expect(target.querySelector('.app-chrome')).not.toBeNull()
    })
    return view
  }

  async function loadKeyboard(selection: KeyboardSelection) {
    await editor.selectKeyboard(selection)
    flushSync()
    await tick()
    flushSync()
  }

  it('keeps short pipeline statuses and a stable Discard control', async () => {
    await renderApp()
    expect(target.querySelector('.chrome-host')).toBeNull()
    await loadKeyboard(localSelection())
    expect(target.querySelector('.chrome-host')).not.toBeNull()
    const source = target.querySelector('.chrome-source')
    const statusEl = target.querySelector('.publish-status')
    expect(source).not.toBeNull()
    expect(statusEl).not.toBeNull()
    // Status sits before source so ZMK / Host status dots share a column.
    expect(
      (statusEl as HTMLElement).compareDocumentPosition(source as HTMLElement) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    expect(target.querySelector('.chrome-tools')).not.toBeNull()
    expect(target.querySelector('#actions .host-legend-wrap')).toBeNull()
    expect(target.querySelector('.board-stack .host-legend-wrap')).toBeNull()
    expect(target.querySelector('.actions-publish .discard-draft')).toBeNull()

    const status = () => target.querySelector('.publish-status')
    const discard = () => target.querySelector('.discard-draft') as HTMLButtonElement | null
    expect(status()?.textContent?.trim()).toBe('Saved')
    expect(status()?.getAttribute('title')).toMatch(/Up to date/)
    expect(discard()).toBeInstanceOf(HTMLButtonElement)
    expect(discard()?.disabled).toBe(true)
    expect(target.querySelector('.change-list')).toBeNull()

    editor.updateKeymap(km('M'))
    flushSync()

    expect(status()?.textContent?.trim()).toBe('Changed')
    expect(status()?.classList.contains('dirty')).toBe(true)
    expect(target.querySelector('.chrome-draft .discard-draft')).toBeInstanceOf(HTMLButtonElement)
    expect(discard()?.disabled).toBe(false)
    expect(target.querySelector('.actions-publish .discard-draft')).toBeNull()
    expect(target.querySelector('.layer-slot.unpublished')?.getAttribute('title')).toBe('Was &kp A')
  })

  it('keeps or discards the draft from the confirm dialog', async () => {
    await renderApp()
    await loadKeyboard(localSelection())
    editor.updateKeymap(km('M'))
    flushSync()

    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    ;(target.querySelector('.discard-draft') as HTMLButtonElement).click()
    flushSync()
    await tick()
    flushSync()

    expect(editor.draftKeymap!.layers[0][0].params[0].value).toBe('M')
    expect(target.querySelector('.publish-status')?.textContent?.trim()).toBe('Changed')
    expect(target.querySelector('.layer-slot.unpublished')).toBeInstanceOf(HTMLElement)

    confirm.mockReturnValue(true)
    ;(target.querySelector('.discard-draft') as HTMLButtonElement).click()
    flushSync()
    await tick()
    flushSync()

    expect(editor.draftKeymap!.layers[0][0].params[0].value).toBe('A')
    expect(editor.isDirty).toBe(false)
    expect(target.querySelector('.publish-status')?.textContent?.trim()).toBe('Saved')
    expect(target.querySelector('.publish-status')?.getAttribute('title')).toMatch(/Up to date/)
    expect(target.querySelector('.discard-draft')).toBeInstanceOf(HTMLButtonElement)
    expect((target.querySelector('.discard-draft') as HTMLButtonElement).disabled).toBe(true)
    expect(target.querySelector('.layer-slot.unpublished')).toBeNull()
  })

  it('disables Write, Commit, and Discard while saving', async () => {
    await renderApp()
    await loadKeyboard(localSelection())
    editor.updateKeymap(km('M'))
    flushSync()

    const write = buttonMatching(target, /Write files/)
    const discard = target.querySelector('.discard-draft')
    expect(write).toBeInstanceOf(HTMLButtonElement)
    expect(write?.textContent).toMatch(/Write files/)
    expect(discard).toBeInstanceOf(HTMLButtonElement)
    expect(write?.disabled).toBe(false)
    expect((discard as HTMLButtonElement).disabled).toBe(false)

    editor.saving = true
    flushSync()
    expect(write?.disabled).toBe(true)
    expect((discard as HTMLButtonElement).disabled).toBe(true)

    editor.saving = false
    await loadKeyboard(githubSelection())
    editor.updateKeymap(km('M'))
    flushSync()

    const commit = buttonMatching(target, /^\s*Commit\s*$/)
    const githubDiscard = target.querySelector('.discard-draft')
    expect(commit).toBeInstanceOf(HTMLButtonElement)
    expect(commit?.textContent?.trim()).toBe('Commit')
    expect(commit?.getAttribute('title')).toMatch(/GitHub/)
    expect(githubDiscard).toBeInstanceOf(HTMLButtonElement)

    editor.saving = true
    flushSync()
    expect(commit?.disabled).toBe(true)
    expect((githubDiscard as HTMLButtonElement).disabled).toBe(true)
  })

  it('undoes with Ctrl+Z while mounted and ignores the chord after unmount', async () => {
    await renderApp()
    await loadKeyboard(localSelection())
    editor.updateKeymap(km('M'))
    flushSync()
    expect(editor.draftKeymap!.layers[0][0].params[0].value).toBe('M')

    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      })
    )
    flushSync()
    expect(editor.draftKeymap!.layers[0][0].params[0].value).toBe('A')

    unmount(view!)
    view = undefined

    const undo = vi.spyOn(editor, 'undo')
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      })
    )
    expect(undo).not.toHaveBeenCalled()
  })

  it('clears the unpublished row when another keyboard is loaded', async () => {
    await renderApp()
    await loadKeyboard(localSelection())
    editor.updateKeymap(km('M'))
    flushSync()
    expect(target.querySelector('.layer-slot.unpublished')).toBeInstanceOf(HTMLElement)

    await loadKeyboard(localSelection('A', 'other'))
    expect(target.querySelector('.layer-slot.unpublished')).toBeNull()
    expect(target.querySelector('.publish-status')?.getAttribute('title')).toMatch(/Up to date/)
  })
})
