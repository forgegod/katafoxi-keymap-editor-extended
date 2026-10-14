import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { buildHostKeymapSnapshot, encodeHostKeymapSnapshot, standardHostLegendView, addHostLanguage, hostLayout, cloneHostLayoutTable } from '@keymap-editor/keymap-core'
import * as store from './host-layout-store'
import { EditorState } from './editor.svelte'
import { loadStoredDraft, draftIdentityKey, deleteStoredDraft } from './draft-storage'

const standard = standardHostLegendView()
const encoded = encodeHostKeymapSnapshot(buildHostKeymapSnapshot(standard, []))
const edited = addHostLanguage(standard, 'de')
const working = encodeHostKeymapSnapshot(buildHostKeymapSnapshot(edited, []))
const privateId = (key: string) => `user:github:${encodeURIComponent(JSON.stringify([key, 'user:copy']))}`

beforeEach(async () => { await store.clearHostLayoutStore() })
afterEach(() => { vi.restoreAllMocks() })

it.each(['clean', 'post-discard', 'pending firmware', 'pending firmware and host'])('reports omitted-host limits truthfully: %s', async mode => {
  const state = new EditorState()
  const event = { source: 'github' as const, github: { repository: `acme/status-${mode}`, branch: 'main', keymapPath: 'config/a.keymap', headSha: 's' },
    layout: [{ x: 0, y: 0 }], keymap: { layers: [[{ value: '&none', params: [] }]] }, hostSnapshotError: 'invalid' as const }
  await state.selectKeyboard(event)
  const identity = state.currentDraftIdentity()!
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  try {
    if (mode === 'post-discard') {
      await state.commitHostMap(edited)
      expect(await state.discardLocalHostEdits()).toBe(true)
    }
    if (mode.startsWith('pending firmware')) {
      state.updateKeymap({ layers: [[{ value: '&trans', params: [] }]] })
      await state.flushPendingPersist()
      state.resetForTests()
      confirm.mockReturnValue(false)
      await state.selectKeyboard(event)
      expect(state.hasPendingFirmwareRecovery).toBe(true)
      expect(state.isPublishDirty).toBe(false)
    }
    if (mode === 'pending firmware and host') await state.commitHostMap(edited)
    expect(state.hasLocalHostRecovery).toBe(mode === 'pending firmware and host')
    if (mode.startsWith('pending firmware')) expect(state.statusText).toContain('Unpublished firmware recovery is retained in this browser. Reopen to restore it before committing.')
    if (mode === 'pending firmware and host') expect(state.statusText).toContain('Host edits are browser-local and unpublishable to GitHub. Commit cannot save them.')
    else {
      expect(state.statusText).not.toMatch(/Host (edits|changes) (are|remain)/)
      expect(state.statusText).toContain('Host snapshot and install-file writes are disabled. Remote host files remain unchanged.')
    }
  } finally {
    state.resetForTests()
    await deleteStoredDraft(identity)
  }
})

async function seed() {
  for (const key of ['A', 'B']) {
    await store.saveGithubHostCache(key, { baselineEncoded: null, baselineSha: null, workingEncoded: working, headSha: 's' }, 0)
    await store.saveHostLegendView(edited, store.hostLegendSettingId(key))
    await store.saveHostAssemblies(store.hostAssembliesSettingId(key), [{ id: 'remembered', view: edited }])
  }
  for (const id of [privateId('A'), privateId('B'), 'user:global']) {
    await store.saveUserHostLayout({ id, name: id, language: 'en', origin: { from: 'copy', layoutId: standard.columns[0].layoutId }, updatedAt: 1,
      layout: cloneHostLayoutTable(hostLayout(standard.columns[0].layoutId)!, id) })
  }
}

it('atomically resets only the selected host identity and leaves global profiles intact', async () => {
  await seed()
  const other = await store.loadGithubHostCache('B')
  const revision = await store.discardGithubHostRecovery('A', 1, () => true)
  expect(revision).toBe(2)
  expect(await store.loadHostLegendView(store.hostLegendSettingId('A'))).toEqual(standard)
  expect(await store.loadHostAssemblies(store.hostAssembliesSettingId('A'))).toEqual([])
  expect(await store.loadGithubHostCache('A')).toMatchObject({ revision: 2, resetRevision: 2, workingEncoded: encoded, headSha: 's' })
  expect(await store.loadGithubHostCache('B')).toEqual(other)
  expect(await store.loadHostLegendView(store.hostLegendSettingId('B'))).toEqual(edited)
  expect((await store.loadUserHostLayouts()).map(row => row.id).sort()).toEqual([privateId('B'), 'user:global'].sort())
})

it.each(['stale', 'cache', 'view', 'assemblies', 'layout-delete', 'superseded'])('retains every host row when reset fails: %s', async failure => {
  await seed()
  const before = await store.loadGithubHostCache('A')
  const other = await store.loadGithubHostCache('B')
  const layouts = await store.loadUserHostLayouts()
  if (['cache', 'view', 'assemblies'].includes(failure)) {
    const id = failure === 'cache' ? 'github-host:A' : failure === 'view' ? store.hostLegendSettingId('A') : store.hostAssembliesSettingId('A')
    const put = IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      if (value.id === id) throw new Error('quota')
      return put.call(this, value, key)
    })
  }
  if (failure === 'layout-delete') {
    const remove = IDBObjectStore.prototype.delete
    vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (this: IDBObjectStore, key) {
      if (key === privateId('A')) throw new Error('quota')
      return remove.call(this, key)
    })
  }
  let checks = 0
  await expect(store.discardGithubHostRecovery('A', failure === 'stale' ? 0 : 1, () => failure !== 'superseded' || ++checks < 3)).rejects.toThrow()
  expect(await store.loadGithubHostCache('A')).toEqual(before)
  expect(await store.loadGithubHostCache('B')).toEqual(other)
  expect(await store.loadHostLegendView(store.hostLegendSettingId('A'))).toEqual(edited)
  expect(await store.loadHostAssemblies(store.hostAssembliesSettingId('A'))).toEqual([{ id: 'remembered', view: edited }])
  expect(await store.loadUserHostLayouts()).toEqual(layouts)
})

it('confirmed host-only discard preserves mixed firmware recovery and stays reset on reopen', async () => {
  const state = new EditorState()
  const event = { source: 'github' as const, github: { repository: 'acme/test', branch: 'main', keymapPath: 'config/a.keymap', headSha: 's', ownershipMode: 'scoped' as const },
    layout: [{ x: 0, y: 0 }], keymap: { keyboard: 'board', layers: [[{ value: '&kp', params: [{ value: 'A', params: [] }] }]] }, hostSnapshotError: 'invalid' as const }
  await state.selectKeyboard(event)
  state.updateKeymap({ ...event.keymap, layers: [[{ value: '&kp', params: [{ value: 'Z', params: [] }] }]] })
  await state.flushPendingPersist()
  await state.setHostKeyLevel('en', 'A', 0, 'Ω')
  const ownedId = state.activeProfileId('en')
  expect(store.isGithubHostLayoutOwnedBy(ownedId, draftIdentityKey(state.currentDraftIdentity()!))).toBe(true)
  const draft = await loadStoredDraft(state.currentDraftIdentity()!)
  const history = JSON.stringify(state.undoStack)
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  expect(await state.discardLocalHostEdits()).toBe(false)
  expect(state.hasLocalHostRecovery).toBe(true)
  confirm.mockReturnValue(true)
  expect(await state.discardLocalHostEdits()).toBe(true)
  expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining('acme/test · main · config/a.keymap'))
  expect(state.hostLegend).toEqual(standard)
  expect((await store.loadUserHostLayouts()).map(row => row.id)).not.toContain(ownedId)
  expect(state.hasLocalHostRecovery).toBe(false)
  expect(state._omitHostKeymapSnapshotOnCommit).toBe(true)
  expect(state.isDirty).toBe(true)
  expect(JSON.stringify(state.undoStack)).toBe(history)
  expect(await loadStoredDraft(state.currentDraftIdentity()!)).toEqual(draft)
  const reopened = new EditorState()
  await reopened.selectKeyboard(event)
  expect(reopened.hostLegend).toEqual(standard)
  expect(reopened.hasLocalHostRecovery).toBe(false)
  state.resetForTests()
  reopened.resetForTests()
})

it('rejects stale-tab view persistence after a durable reset without resurrecting rows', async () => {
  const event = { source: 'github' as const, github: { repository: 'acme/stale', branch: 'main', keymapPath: 'config/a.keymap', headSha: 's' },
    layout: [{ x: 0, y: 0 }], keymap: { layers: [[{ value: '&none', params: [] }]] }, hostSnapshotError: 'invalid' as const }
  const state = new EditorState()
  await state.selectKeyboard(event)
  await state.commitHostMap(edited)
  const key = draftIdentityKey(state.currentDraftIdentity()!)
  const cache = await store.loadGithubHostCache(key)
  // Another tab commits the reset; this tab still has the old recovery revision.
  await store.discardGithubHostRecovery(key, cache!.revision, () => true)
  const reset = await store.loadGithubHostCache(key)
  await state.commitHostMap(addHostLanguage(edited, 'ru'))
  expect(await store.loadHostLegendView(store.hostLegendSettingId(key))).toEqual(standard)
  expect(await store.loadGithubHostCache(key)).toEqual(reset)
  expect(state.hasLocalHostRecovery).toBe(true)
  expect(state.saveNotice?.kind).toBe('error')
  state.resetForTests()
})

it.each(['github', 'demo', 'clipboard', 'local'] as const)('blocks %s transitions until host reset, then retains firmware separately', async source => {
  const state = new EditorState()
  const event = { source: 'github' as const, github: { repository: `acme/transition-${source}`, branch: 'main', keymapPath: 'config/a.keymap', headSha: 's' },
    layout: [{ x: 0, y: 0 }], keymap: { keyboard: source, layers: [[{ value: '&none', params: [] }]] }, hostSnapshotError: 'unsupported_version' as const }
  await state.selectKeyboard(event)
  state.updateKeymap({ ...event.keymap, layers: [[{ value: '&trans', params: [] }]] })
  await state.commitHostMap(edited)
  const identity = state.currentDraftIdentity()!
  const destination = source === 'github' ? { ...event, github: { ...event.github, keymapPath: 'config/b.keymap' } } : { source, layout: event.layout, keymap: { ...event.keymap, keyboard: 'destination' } }
  await state.selectKeyboard(event) // Reload does not discard either half.
  await state.selectKeyboard(destination)
  expect(state.currentDraftIdentity()).toEqual(identity)
  expect(state.hostLegend).toEqual(edited)
  expect(state.isDirty).toBe(true)
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  expect(await state.discardLocalHostEdits()).toBe(true)
  await state.selectKeyboard(destination)
  expect(state.source).toBe(source)
  expect(state.currentDraftIdentity()).not.toEqual(identity)
  expect((await loadStoredDraft(identity))?.draftKeymap.layers[0][0].value).toBe('&trans')
  state.resetForTests()
})
