import { flushSync, mount, tick, unmount } from 'svelte'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addHostLanguage,
  assignHostLanguageLayout,
  type ParsedKeymap
} from '@keymap-editor/keymap-core'
import { loadClipboardBundle } from './lib/clipboard/load'
import * as draftStorage from './lib/draft-storage'
import { buildDraftIdentity, deleteStoredDraft } from './lib/draft-storage'
import { editor, type KeyboardSelection } from './lib/editor.svelte.js'
import { clearHostLayoutStore } from './lib/host-layout-store'
import github from './lib/github/api.svelte.js'
import App from './App.svelte'

vi.mock('./lib/config', () => ({
  apiBaseUrl: '',
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
  keyboard = 'lark',
  headSha = 'abc123'
): KeyboardSelection {
  return {
    source: 'github',
    github: { repository: 'owner/repo', branch: 'main', headSha },
    layout: oneKeyLayout,
    keymap: km(code, keyboard)
  }
}

async function clearDrafts() {
  const identities = [
    buildDraftIdentity({ source: 'local', keyboard: 'lark' }),
    buildDraftIdentity({ source: 'local', keyboard: 'other' }),
    buildDraftIdentity({ source: 'demo', keyboard: 'lark' }),
    buildDraftIdentity({ source: 'clipboard', keyboard: 'clipboard' }),
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

function beforeUnloadEvent() {
  return new Event('beforeunload', { cancelable: true }) as BeforeUnloadEvent
}

function dispatchBeforeUnload() {
  const event = beforeUnloadEvent()
  window.dispatchEvent(event)
  return event
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const CLIPBOARD_SOURCE = `#include <behaviors.dtsi>
#include <dt-bindings/zmk/keys.h>

/ {
    keymap {
        compatible = "zmk,keymap";

        default_layer {
            bindings = <
                &kp A
            >;
        };
    };
};
`

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
      warnings: [],
      headSha: 'abc123'
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

  afterEach(async () => {
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
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    await clearHostLayoutStore()
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

  it('shows a reload notice when GitHub Commit fails because the branch moved', async () => {
    await renderApp()
    await loadKeyboard(githubSelection())
    editor.updateKeymap(km('M'))
    flushSync()

    vi.mocked(github.commitChanges).mockRejectedValue({
      response: {
        status: 409,
        data: { name: 'StaleRepoBase', errors: ['Branch changed on GitHub — reload'] }
      }
    })

    const commit = buttonMatching(target, /^\s*Commit\s*$/)
    expect(commit).toBeInstanceOf(HTMLButtonElement)
    commit!.click()
    flushSync()
    await tick()
    await vi.waitFor(() => {
      expect(target.querySelector('.save-notice.error')?.textContent).toMatch(
        /Branch changed on GitHub — reload/
      )
    })
  })

  it('retries Commit with the reloaded GitHub head sha', async () => {
    await renderApp()
    await loadKeyboard(githubSelection('A', 'lark', 'old-sha'))
    editor.updateKeymap(km('M'))
    flushSync()

    vi.mocked(github.commitChanges).mockRejectedValueOnce({
      response: {
        status: 409,
        data: { name: 'StaleRepoBase', errors: ['Branch changed on GitHub — reload'] }
      }
    })

    const commit = buttonMatching(target, /^\s*Commit\s*$/)
    expect(commit).toBeInstanceOf(HTMLButtonElement)
    commit!.click()
    flushSync()
    await tick()
    await vi.waitFor(() => {
      expect(target.querySelector('.save-notice.error')?.textContent).toMatch(
        /Branch changed on GitHub — reload/
      )
    })
    expect(github.commitChanges).toHaveBeenLastCalledWith(
      'owner/repo',
      'main',
      oneKeyLayout,
      expect.anything(),
      expect.anything(),
      expect.anything(),
      'old-sha'
    )

    await loadKeyboard(githubSelection('A', 'lark', 'new-sha'))
    expect(editor.githubMeta?.headSha).toBe('new-sha')
    editor.updateKeymap(km('M'))
    flushSync()

    vi.mocked(github.commitChanges).mockResolvedValue({ data: {} })
    commit!.click()
    flushSync()
    await tick()
    await vi.waitFor(() => {
      expect(github.commitChanges).toHaveBeenLastCalledWith(
        'owner/repo',
        'main',
        oneKeyLayout,
        expect.anything(),
        expect.anything(),
        expect.anything(),
        'new-sha'
      )
    })
  })

  it('keeps the current board when GitHub branch listing fails', async () => {
    localStorage.setItem('selectedSource', 'local')
    await renderApp()
    await vi.waitFor(() => {
      expect(editor.source).toBe('local')
      expect(editor.draftKeymap?.layers[0][0].params[0].value).toBe('Z')
    })
    expect(target.querySelector('.key')).toBeTruthy()

    github.authorized = true
    github.installations = [{ id: 1 }]
    github.repositories = [{ id: 11, full_name: 'owner/repo', default_branch: 'main' }]
    github.repoInstallationMap = { 'owner/repo': '1' }
    vi.spyOn(github, 'fetchRepoBranches').mockRejectedValue(
      Object.assign(new Error('Request failed: 502'), {
        response: { status: 502, data: { message: 'Bad gateway' } }
      })
    )

    const trigger = target.querySelector('.source-trigger')
    if (!(trigger instanceof HTMLButtonElement)) throw new Error('missing source trigger')
    trigger.click()
    flushSync()
    const githubCard = target.querySelector('[data-source="github"]')
    if (!(githubCard instanceof HTMLButtonElement)) throw new Error('missing GitHub source')
    githubCard.click()
    flushSync()

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Bad gateway')
    })
    expect(editor.source).toBe('local')
    expect(editor.githubMeta).toBeNull()
    expect(editor.draftKeymap?.layers[0][0].params[0].value).toBe('Z')
    expect(target.querySelector('.key')).toBeTruthy()
  })

  it('does not undo from Ctrl+Z on Apply while the key editor is open', async () => {
    await renderApp()
    await loadKeyboard(localSelection())
    editor.updateKeymap(km('M'))
    flushSync()
    expect(editor.draftKeymap!.layers[0][0].params[0].value).toBe('M')

    const slot = target.querySelector('.key .layer-slot')
    if (!(slot instanceof HTMLElement)) throw new Error('missing .layer-slot')
    slot.click()
    flushSync()
    await tick()
    const apply = document.querySelector('[aria-label="Apply"]')
    if (!(apply instanceof HTMLButtonElement)) throw new Error('missing Apply')

    apply.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
        cancelable: true
      })
    )
    flushSync()
    expect(editor.draftKeymap!.layers[0][0].params[0].value).toBe('M')
    expect(document.querySelector('[aria-label="Apply"]')).toBeInstanceOf(HTMLButtonElement)
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

  it('writes a pending draft on visibilitychange before the 400ms debounce', async () => {
    await renderApp()
    await loadKeyboard(localSelection())
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const save = vi.spyOn(draftStorage, 'saveStoredDraft')

    editor.updateKeymap(km('M'))
    expect(save).not.toHaveBeenCalled()

    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))

    await Promise.resolve()
    expect(save).toHaveBeenCalled()
    await save.mock.results[0]?.value
    expect(vi.getTimerCount()).toBe(0)
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

  it('omits host_keymap/snapshot.json on Commit when the repo snapshot is version 2', async () => {
    await renderApp()
    await loadKeyboard({
      source: 'github',
      github: { repository: 'owner/repo', branch: 'main', headSha: 'abc123' },
      layout: oneKeyLayout,
      keymap: km('A'),
      hostSnapshot: null,
      hostSnapshotError: 'unsupported_version',
      warnings: ['host_snapshot_unsupported_version']
    })

    expect(target.querySelector('.save-notice.warning')?.textContent).toMatch(
      /newer host_keymap\/snapshot\.json than this editor can read/
    )

    editor.updateKeymap(km('M'))
    flushSync()
    const commit = buttonMatching(target, /^\s*Commit\s*$/)
    expect(commit).toBeInstanceOf(HTMLButtonElement)
    commit!.click()
    flushSync()
    await tick()
    await vi.waitFor(() => {
      expect(github.commitChanges).toHaveBeenCalled()
    })

    expect(github.commitChanges).toHaveBeenCalledWith(
      'owner/repo',
      'main',
      oneKeyLayout,
      expect.objectContaining({
        layers: km('M').layers
      }),
      null,
      [],
      'abc123'
    )
    expect(target.querySelector('.save-notice.warning')?.textContent).toMatch(
      /newer host_keymap\/snapshot\.json than this editor can read/
    )
  })

  it('leaves a clean load unguarded and confirms beforeunload after a firmware edit', async () => {
    const addListener = vi.spyOn(window, 'addEventListener')
    await renderApp()
    await loadKeyboard(localSelection())

    const clean = dispatchBeforeUnload()
    expect(clean.defaultPrevented).toBe(false)
    expect(editor.isDirty).toBe(false)
    expect(addListener.mock.calls.filter(([type]) => type === 'beforeunload')).toHaveLength(0)

    editor.updateKeymap(km('M'))
    flushSync()

    const dirty = dispatchBeforeUnload()
    expect(dirty.defaultPrevented).toBe(true)
    expect(dirty.returnValue).toBe('')
    expect(addListener.mock.calls.filter(([type]) => type === 'beforeunload')).toHaveLength(1)
    expect(editor.isDirty).toBe(true)
    expect(editor.draftKeymap!.layers[0][0].params[0].value).toBe('M')
  })

  it('drops the guard after confirmed discard and keeps it when discard is cancelled', async () => {
    await renderApp()
    await loadKeyboard(localSelection())
    editor.updateKeymap(km('M'))
    flushSync()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const discard = target.querySelector('.discard-draft') as HTMLButtonElement
    discard.click()
    flushSync()
    await tick()
    expect(editor.isDirty).toBe(true)
    expect(dispatchBeforeUnload().defaultPrevented).toBe(true)

    confirm.mockReturnValue(true)
    discard.click()
    flushSync()
    await tick()
    await vi.waitFor(() => {
      expect(editor.isDirty).toBe(false)
    })
    flushSync()
    expect(dispatchBeforeUnload().defaultPrevented).toBe(false)
  })

  it('drops the guard after Write files reloads and keeps it when write or reload fails', async () => {
    await renderApp()
    await loadKeyboard(localSelection())
    editor.updateKeymap(km('M'))
    flushSync()

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      if ((init?.method ?? 'GET') === 'POST') return jsonResponse({ errors: ['disk full'] }, 500)
      const url = String(input)
      if (url.includes('/layout')) return jsonResponse(oneKeyLayout)
      if (url.includes('/keymap')) return jsonResponse(km('M'))
      return jsonResponse({}, 404)
    })
    buttonMatching(target, /^\s*Write files\s*$/)!.click()
    flushSync()
    await vi.waitFor(() => {
      expect(editor.saving).toBe(false)
    })
    expect(editor.isDirty).toBe(true)
    expect(dispatchBeforeUnload().defaultPrevented).toBe(true)

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if ((init?.method ?? 'GET') === 'POST') return jsonResponse({})
      if (url.includes('/keymap')) return jsonResponse({ errors: ['missing'] }, 500)
      if (url.includes('/layout')) return jsonResponse(oneKeyLayout)
      return jsonResponse({}, 404)
    })
    buttonMatching(target, /^\s*Write files\s*$/)!.click()
    flushSync()
    await vi.waitFor(() => {
      expect(editor.saving).toBe(false)
    })
    expect(editor.isDirty).toBe(true)
    expect(dispatchBeforeUnload().defaultPrevented).toBe(true)

    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if ((init?.method ?? 'GET') === 'POST') return jsonResponse({})
      if (url.includes('/layout')) return jsonResponse(oneKeyLayout)
      if (url.includes('/keymap')) return jsonResponse(km('M'))
      return jsonResponse({}, 404)
    })
    buttonMatching(target, /^\s*Write files\s*$/)!.click()
    flushSync()
    await vi.waitFor(() => {
      expect(editor.isDirty).toBe(false)
    })
    flushSync()
    expect(dispatchBeforeUnload().defaultPrevented).toBe(false)
  })

  it('keeps the guard when a key changes during an in-flight write', async () => {
    await renderApp()
    await loadKeyboard(localSelection())
    editor.updateKeymap(km('M'))
    flushSync()

    const write = deferred<Response>()
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if ((init?.method ?? 'GET') === 'POST') return write.promise
      if (url.includes('/layout')) return jsonResponse(oneKeyLayout)
      if (url.includes('/keymap')) return jsonResponse(km('M'))
      return jsonResponse({}, 404)
    })

    buttonMatching(target, /^\s*Write files\s*$/)!.click()
    flushSync()
    await vi.waitFor(() => {
      expect(editor.saving).toBe(true)
    })
    editor.updateKeymap(km('X'))
    flushSync()
    expect(dispatchBeforeUnload().defaultPrevented).toBe(true)
    expect(editor.draftKeymap!.layers[0][0].params[0].value).toBe('X')

    write.resolve(
      new Response(JSON.stringify({}), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      })
    )
    await vi.waitFor(() => {
      expect(editor.saving).toBe(false)
    })
    flushSync()
    expect(editor.isDirty).toBe(true)
    expect(dispatchBeforeUnload().defaultPrevented).toBe(true)
  })

  it('drops the guard only after Copy .keymap writes the clipboard', async () => {
    await renderApp()
    const bundle = loadClipboardBundle('', CLIPBOARD_SOURCE)
    await loadKeyboard({
      source: 'clipboard',
      layout: bundle.layout,
      keymap: bundle.keymap,
      clipboardOriginalSource: bundle.originalSource
    })
    editor.updateKeymap({
      ...bundle.keymap,
      layers: [[{ value: '&kp', params: [{ value: 'ESC', params: [] }] }]]
    })
    flushSync()
    expect(dispatchBeforeUnload().defaultPrevented).toBe(true)

    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    writeText.mockRejectedValueOnce(new Error('clipboard denied'))
    buttonMatching(target, /^\s*Copy \.keymap\s*$/)!.click()
    flushSync()
    await vi.waitFor(() => {
      expect(writeText).toHaveBeenCalled()
      expect(editor.saving).toBe(false)
    })
    expect(editor.isDirty).toBe(true)
    expect(dispatchBeforeUnload().defaultPrevented).toBe(true)

    writeText.mockResolvedValueOnce(undefined)
    flushSync()
    const dialog = document.querySelector('[role="dialog"][aria-label="Exported keymap"]')!
    buttonMatching(dialog, /^\s*Copy again\s*$/)!.click()
    flushSync()
    await vi.waitFor(() => {
      expect(editor.isDirty).toBe(false)
    })
    flushSync()
    expect(dispatchBeforeUnload().defaultPrevented).toBe(false)
  })

  it('drops the guard after a GitHub commit reloads and keeps it when reload fails', async () => {
    await renderApp()
    await loadKeyboard(githubSelection())
    editor.updateKeymap(km('M'))
    flushSync()

    vi.mocked(github.fetchLayoutAndKeymap).mockRejectedValueOnce(new Error('reload failed'))
    buttonMatching(target, /^\s*Commit\s*$/)!.click()
    flushSync()
    await vi.waitFor(() => {
      expect(editor.saving).toBe(false)
    })
    expect(editor.isDirty).toBe(true)
    expect(dispatchBeforeUnload().defaultPrevented).toBe(true)

    vi.mocked(github.fetchLayoutAndKeymap).mockResolvedValue({
      layout: oneKeyLayout,
      keymap: km('M'),
      hostSnapshot: null,
      warnings: [],
      headSha: 'def456'
    })
    buttonMatching(target, /^\s*Commit\s*$/)!.click()
    flushSync()
    await vi.waitFor(() => {
      expect(editor.isDirty).toBe(false)
    })
    flushSync()
    expect(dispatchBeforeUnload().defaultPrevented).toBe(false)
  })

  it('guards a dirty GitHub host snapshot without a firmware edit', async () => {
    await renderApp()
    await loadKeyboard({
      source: 'github',
      github: { repository: 'owner/repo', branch: 'main', headSha: 'abc123' },
      layout: oneKeyLayout,
      keymap: km('A'),
      hostSnapshot: {
        version: 1,
        view: {
          columns: [
            {
              language: 'en',
              layoutId: 'system-us',
              visible: true,
              altGr: true,
              altGrShift: true
            }
          ],
          open: null
        },
        layouts: []
      }
    })
    expect(editor.isDirty).toBe(false)
    expect(editor.isHostRepoDirty).toBe(false)
    expect(dispatchBeforeUnload().defaultPrevented).toBe(false)

    editor.hostLegend = assignHostLanguageLayout(
      addHostLanguage(editor.hostLegend, 'ru'),
      'ru',
      'system-ru-legacy'
    )
    flushSync()
    expect(editor.isDirty).toBe(false)
    expect(editor.isHostRepoDirty).toBe(true)
    expect(dispatchBeforeUnload().defaultPrevented).toBe(true)

    vi.mocked(github.fetchLayoutAndKeymap).mockResolvedValue({
      layout: oneKeyLayout,
      keymap: km('A'),
      hostSnapshot: null,
      warnings: [],
      headSha: 'host-sha'
    })
    buttonMatching(target, /^\s*Commit\s*$/)!.click()
    flushSync()
    await vi.waitFor(() => {
      expect(editor.isHostRepoDirty).toBe(false)
    })
    flushSync()
    expect(editor.isDirty).toBe(false)
    expect(dispatchBeforeUnload().defaultPrevented).toBe(false)
  })

  it('does not guard a host-deliverable edit that is not a GitHub snapshot change', async () => {
    await renderApp()
    await loadKeyboard(localSelection())
    const edited = await editor.setHostKeyLevel('en', 'A', 0, 'b')
    expect(edited.ok).toBe(true)
    flushSync()
    expect(editor.isDirty).toBe(false)
    expect(editor.isHostRepoDirty).toBe(false)
    expect(editor.isHostDirty).toBe(true)
    expect(dispatchBeforeUnload().defaultPrevented).toBe(false)

    editor.markHostDelivered()
    flushSync()
    expect(editor.isHostDirty).toBe(false)
    expect(dispatchBeforeUnload().defaultPrevented).toBe(false)
  })

  it('guards a restored Demo firmware draft and ignores a browser-only host edit', async () => {
    await renderApp()
    const identity = buildDraftIdentity({ source: 'demo', keyboard: 'lark' })!
    await draftStorage.saveStoredDraft(identity, km('Z'))
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await loadKeyboard({
      source: 'demo',
      demo: { id: 'lark', name: 'Lark' },
      layout: oneKeyLayout,
      keymap: km('A')
    })
    expect(editor.isDirty).toBe(true)
    flushSync()
    expect(dispatchBeforeUnload().defaultPrevented).toBe(true)

    const edited = await editor.setHostKeyLevel('en', 'A', 0, 'b')
    expect(edited.ok).toBe(true)
    expect(editor.isHostDirty).toBe(true)
    expect(editor.isHostRepoDirty).toBe(false)

    await editor.discardDraft()
    flushSync()
    expect(editor.isDirty).toBe(false)
    expect(editor.isHostDirty).toBe(true)
    expect(dispatchBeforeUnload().defaultPrevented).toBe(false)
  })

  it('flushes pending drafts on pagehide and visibilitychange with or without the guard', async () => {
    await renderApp()
    await loadKeyboard(localSelection())
    const flush = vi.spyOn(editor, 'flushPendingPersist')

    window.dispatchEvent(new Event('pagehide'))
    expect(flush).toHaveBeenCalledTimes(1)
    expect(dispatchBeforeUnload().defaultPrevented).toBe(false)

    editor.updateKeymap(km('M'))
    flushSync()
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new Event('pagehide'))
    expect(flush).toHaveBeenCalledTimes(3)
    expect(dispatchBeforeUnload().defaultPrevented).toBe(true)
  })

  it('drops the guard after undo or loading another keyboard, and on unmount', async () => {
    const addListener = vi.spyOn(window, 'addEventListener')
    const removeListener = vi.spyOn(window, 'removeEventListener')
    await renderApp()
    await loadKeyboard(localSelection())
    editor.updateKeymap(km('M'))
    flushSync()
    expect(dispatchBeforeUnload().defaultPrevented).toBe(true)

    editor.undo()
    flushSync()
    expect(editor.isDirty).toBe(false)
    expect(dispatchBeforeUnload().defaultPrevented).toBe(false)

    editor.redo()
    flushSync()
    expect(dispatchBeforeUnload().defaultPrevented).toBe(true)
    await loadKeyboard(localSelection('A', 'other'))
    expect(editor.isDirty).toBe(false)
    expect(dispatchBeforeUnload().defaultPrevented).toBe(false)

    editor.updateKeymap(km('M', 'other'))
    flushSync()
    expect(dispatchBeforeUnload().defaultPrevented).toBe(true)
    unmount(view!)
    view = undefined
    expect(dispatchBeforeUnload().defaultPrevented).toBe(false)
    expect(editor.isDirty).toBe(true)
    const added = addListener.mock.calls.filter(([type]) => type === 'beforeunload')
    const removed = removeListener.mock.calls.filter(([type]) => type === 'beforeunload')
    expect(added.length).toBeGreaterThan(0)
    expect(removed.map(([, listener]) => listener)).toEqual(added.map(([, listener]) => listener))
  })
})
