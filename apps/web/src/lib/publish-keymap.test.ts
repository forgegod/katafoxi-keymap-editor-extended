import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addHostLanguage,
  assignHostLanguageLayout,
  type ParsedKeymap
} from '@keymap-editor/keymap-core'
import {
  buildDraftIdentity,
  deleteStoredDraft,
  loadStoredDraft
} from './draft-storage'
import { editor } from './editor.svelte.js'
import type { KeyboardFilesResult } from './github/api.svelte.js'
import { publishKeymap } from './publish-keymap'

type PublishReload = Pick<KeyboardFilesResult, 'keymap'> &
  Partial<Pick<KeyboardFilesResult, 'layout'>>

function km(code: string, keyboard = 'lark'): ParsedKeymap {
  return {
    keyboard,
    layer_names: ['default'],
    layers: [[{ value: '&kp', params: [{ value: code, params: [] }] }]]
  }
}

function deferred<T = unknown>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

const layout = [{ x: 0, y: 0, row: 0, col: 0 }]

function keyCode(keymap: ParsedKeymap | null | undefined): string {
  return keymap!.layers[0][0].params[0].value as string
}

describe('publishKeymap', () => {
  beforeEach(async () => {
    editor.resetForTests()
    const identity = buildDraftIdentity({ source: 'local', keyboard: 'lark' })
    if (identity) await deleteStoredDraft(identity)
  })

  afterEach(() => {
    vi.useRealTimers()
    editor.resetForTests()
  })

  it('ignores a stale reload after switching to another keyboard', async () => {
    await editor.selectKeyboard({
      source: 'local',
      layout,
      keymap: km('A')
    })
    editor.updateKeymap(km('M'))

    const write = deferred()
    const reload = deferred<PublishReload>()
    const writeFn = vi.fn(() => write.promise)
    const reloadFn = vi.fn(() => reload.promise)

    const published = publishKeymap(editor, {
      write: writeFn,
      reload: reloadFn
    })

    write.resolve({})
    await vi.waitFor(() => expect(reloadFn).toHaveBeenCalled())

    await editor.selectKeyboard({
      source: 'local',
      layout,
      keymap: km('A', 'other')
    })
    editor.updateKeymap(km('X', 'other'))

    reload.resolve({ keymap: km('M') })

    await expect(published).resolves.toBe(false)
    expect(editor.draftKeymap!.keyboard).toBe('other')
    expect(keyCode(editor.draftKeymap)).toBe('X')
    expect(editor.saveNotice).toBeNull()
  })

  it('ignores a stale reload after switching GitHub branch', async () => {
    await editor.selectKeyboard({
      source: 'github',
      github: { repository: 'owner/repo', branch: 'main' },
      layout,
      keymap: km('A')
    })
    editor.updateKeymap(km('M'))

    const write = deferred()
    const reload = deferred<PublishReload>()
    const writeFn = vi.fn(() => write.promise)
    const reloadFn = vi.fn(() => reload.promise)

    const published = publishKeymap(editor, {
      write: writeFn,
      reload: reloadFn
    })

    write.resolve({})
    await vi.waitFor(() => expect(reloadFn).toHaveBeenCalled())

    await editor.selectKeyboard({
      source: 'github',
      github: { repository: 'owner/repo', branch: 'dev' },
      layout,
      keymap: km('A')
    })
    editor.updateKeymap(km('X'))

    reload.resolve({ keymap: km('M') })

    await expect(published).resolves.toBe(false)
    expect(editor.githubMeta?.branch).toBe('dev')
    expect(keyCode(editor.draftKeymap)).toBe('X')
    expect(editor.saveNotice).toBeNull()
  })

  it('keeps the dirty draft when reload throws after a successful write', async () => {
    await editor.selectKeyboard({
      source: 'local',
      layout,
      keymap: km('A')
    })
    editor.updateKeymap(km('M'))

    const write = deferred()
    const reload = deferred<PublishReload>()
    const published = publishKeymap(editor, {
      write: () => write.promise,
      reload: () => reload.promise
    })

    write.resolve({})
    await Promise.resolve()
    reload.reject(new Error('disk gone'))

    await expect(published).resolves.toBe(false)
    expect(editor.isDirty).toBe(true)
    expect(keyCode(editor.draftKeymap)).toBe('M')
    expect(editor.saveNotice?.kind).toBe('error')
    expect(editor.saveNotice?.messages[0]).toMatch(/reloading from disk failed/)
  })

  it('surfaces write errors and never reloads', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })

    await editor.selectKeyboard({
      source: 'local',
      layout,
      keymap: km('A')
    })
    editor.updateKeymap(km('M'))

    const write = vi.fn(() =>
      Promise.reject({ response: { data: { errors: ['boom'] } } })
    )
    const reload = vi.fn()

    await expect(
      publishKeymap(editor, { write, reload })
    ).resolves.toBe(false)

    expect(editor.isDirty).toBe(true)
    expect(editor.saveNotice?.messages).toEqual(['boom'])
    expect(reload).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(400)
    const identity = buildDraftIdentity({ source: 'local', keyboard: 'lark' })!
    expect(await loadStoredDraft(identity)).not.toBeNull()
  })

  it('rejects a second publish while the first is awaiting write', async () => {
    await editor.selectKeyboard({
      source: 'local',
      layout,
      keymap: km('A')
    })
    editor.updateKeymap(km('M'))

    const write = deferred()
    const reload = deferred<PublishReload>()
    const writeFn = vi.fn(() => write.promise)
    const reloadFn = vi.fn(() => reload.promise)
    const handlers = { write: writeFn, reload: reloadFn }

    const first = publishKeymap(editor, handlers)
    await expect(publishKeymap(editor, handlers)).resolves.toBe(false)
    expect(writeFn).toHaveBeenCalledTimes(1)

    write.resolve({})
    reload.resolve({ keymap: km('M') })
    await expect(first).resolves.toBe(true)
    expect(editor.saving).toBe(false)
  })

  it('does not write when the draft is clean', async () => {
    await editor.selectKeyboard({
      source: 'local',
      layout,
      keymap: km('A')
    })

    const write = vi.fn()
    const reload = vi.fn()
    await expect(
      publishKeymap(editor, { write, reload })
    ).resolves.toBe(false)
    expect(write).not.toHaveBeenCalled()
    expect(reload).not.toHaveBeenCalled()
  })

  it('keeps host-repo dirty for edits made while Commit is in flight', async () => {
    await editor.selectKeyboard({
      source: 'github',
      github: { repository: 'owner/repo', branch: 'main' },
      layout,
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
    editor.updateKeymap(km('M'))
    expect(editor.isHostRepoDirty).toBe(false)

    const write = deferred()
    const reload = deferred<PublishReload>()
    const published = publishKeymap(editor, {
      write: () => write.promise,
      reload: () => reload.promise
    })

    editor.hostLegend = assignHostLanguageLayout(
      addHostLanguage(editor.hostLegend, 'ru'),
      'ru',
      'system-ru-legacy'
    )
    expect(editor.isHostRepoDirty).toBe(true)

    write.resolve({})
    reload.resolve({ layout, keymap: km('M') })

    await expect(published).resolves.toBe(true)
    expect(editor.isDirty).toBe(false)
    expect(editor.isHostRepoDirty).toBe(true)
  })
})
