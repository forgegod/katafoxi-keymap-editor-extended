import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { buildHostKeymapSnapshot, encodeHostKeymapSnapshot, standardHostLegendView, addHostLanguage, hostLayout, cloneHostLayoutTable, cloneHostLegendView } from '@keymap-editor/keymap-core'
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

it.each(['stale', 'layout-delete', 'layout-put', 'superseded', 'global', 'other owner', 'retained'])('rolls back owned-layout reconciliation with the host cache: %s', async failure => {
  await seed()
  const before = await store.loadGithubHostCache('A')
  const other = await store.loadGithubHostCache('B')
  const layouts = await store.loadUserHostLayouts()
  const replacementId = `user:github:${encodeURIComponent(JSON.stringify(['A', 'user:replacement']))}`
  const replacement = { ...layouts.find(row => row.id === privateId('A'))!, id: replacementId }
  if (failure === 'layout-delete') {
    const remove = IDBObjectStore.prototype.delete
    vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (this: IDBObjectStore, key) {
      if (key === privateId('A')) throw new Error('quota')
      return remove.call(this, key)
    })
  }
  if (failure === 'layout-put') {
    const put = IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementation(function (this: IDBObjectStore, value, key) {
      if (value.id === replacementId) throw new Error('quota')
      return put.call(this, value, key)
    })
  }
  let checks = 0
  const deletedId = failure === 'global' ? 'user:global' : failure === 'other owner' ? privateId('B') : failure === 'retained' ? replacementId : privateId('A')
  await expect(store.saveGithubHostCache('A', { ...before!, workingEncoded: encoded }, failure === 'stale' ? 0 : before!.revision,
    () => failure !== 'superseded' || ++checks < 2,
    { view: standard, assemblies: [], layouts: [replacement], deletedLayoutIds: [deletedId] })).rejects.toThrow()
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

it('keeps a completed reset durable when host edits interleave with discard', async () => {
  const state = new EditorState()
  const event = { source: 'github' as const, github: { repository: 'acme/discard-race', branch: 'main', keymapPath: 'config/a.keymap', headSha: 's' },
    layout: [{ x: 0, y: 0 }], keymap: { layers: [[{ value: '&none', params: [] }]] }, hostSnapshotError: 'invalid' as const }
  await state.selectKeyboard(event)
  await state.setHostKeyLevel('en', 'A', 0, 'Ω')
  await state.rememberHostAssembly()
  const key = draftIdentityKey(state.currentDraftIdentity()!)
  const ownedId = state.activeProfileId('en')
  const before = state._encodeLiveHostSnapshot()
  const assemblies = JSON.stringify(state.hostAssemblies)
  const discard = store.discardGithubHostRecovery
  let during: { snapshot: string; assemblies: string; editOk: boolean } | undefined
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  vi.spyOn(store, 'discardGithubHostRecovery').mockImplementation(async (...args) => {
    const revision = await discard(...args)
    // Real IDB commit has finished, but the editor still awaits its receipt.
    expect(state.hostRecoveryBusy).toBe(true)
    const edit = await state.setHostKeyLevel('en', 'A', 0, 'Ж')
    await state.commitHostMap(edited)
    await state.selectLanguageProfile('en', standard.columns[0].layoutId)
    await state.forgetHostAssembly(state.hostAssemblies[0].id)
    await state.rememberHostAssembly()
    during = { snapshot: state._encodeLiveHostSnapshot(), assemblies: JSON.stringify(state.hostAssemblies), editOk: edit.ok }
    return revision
  })
  try {
    expect(await state.discardLocalHostEdits()).toBe(true)
    expect(during).toEqual({ snapshot: before, assemblies, editOk: false })
    expect(state.hostRecoveryBusy).toBe(false)
    expect(state.hostLegend).toEqual(standard)
    expect(state.hostAssemblies).toEqual([])
    expect(state.hasLocalHostRecovery).toBe(false)
    // A later flush must not resurrect the pre-discard snapshot or private table.
    await state._persistGithubHostCache()
    expect(await store.loadGithubHostCache(key)).toMatchObject({ workingEncoded: encoded, originEncoded: encoded })
    expect(await store.loadHostLegendView(store.hostLegendSettingId(key))).toEqual(standard)
    expect(await store.loadHostAssemblies(store.hostAssembliesSettingId(key))).toEqual([])
    expect((await store.loadUserHostLayouts()).map(row => row.id)).not.toContain(ownedId)
    state.resetForTests()
    await state.selectKeyboard(event)
    expect(state.hostLegend).toEqual(standard)
    expect(state.hasLocalHostRecovery).toBe(false)
  } finally {
    state.resetForTests()
  }
})

it('preserves inactive owner-private layouts when reopening and reconciling the host cache', async () => {
  const state = new EditorState()
  const event = { source: 'github' as const, github: { repository: 'acme/inactive-private', branch: 'main', keymapPath: 'config/a.keymap', headSha: 's' },
    layout: [{ x: 0, y: 0 }], keymap: { layers: [[{ value: '&none', params: [] }]] } }
  try {
    await state.selectKeyboard(event)
    await state.setHostKeyLevel('en', 'A', 0, 'Ω')
    const id = state.activeProfileId('en')
    await state.selectLanguageProfile('en', standard.columns[0].layoutId)
    const original = (await store.loadUserHostLayouts()).find(row => row.id === id)
    expect(original).toBeDefined()
    state.resetForTests()
    await state.selectKeyboard(event)
    await state._persistGithubHostCache()
    expect((await store.loadUserHostLayouts()).find(row => row.id === id)).toEqual(original)
  } finally {
    state.resetForTests()
  }
})

it.each([[true, false], [false, false], [true, true]])('keeps a private profile deleted after a delayed cache write and reopen (active=%s, overlappingReload=%s)', async (active, overlappingReload) => {
  await seed()
  const unrelated = await store.loadUserHostLayouts()
  const otherCache = await store.loadGithubHostCache('B')
  const state = new EditorState()
  const event = { source: 'github' as const, github: { repository: 'acme/delete-race', branch: 'main', keymapPath: 'config/a.keymap', headSha: 's' },
    layout: [{ x: 0, y: 0 }], keymap: { layers: [[{ value: '&none', params: [] }]] } }
  let release!: () => void
  let started!: () => void
  const blocked = new Promise<void>(resolve => { release = resolve })
  const entered = new Promise<void>(resolve => { started = resolve })
  try {
    await state.selectKeyboard(event)
    await state.setHostKeyLevel('en', 'A', 0, 'Ω')
    const id = state.activeProfileId('en')
    const key = draftIdentityKey(state.currentDraftIdentity()!)
    if (!active) await state.selectLanguageProfile('en', standard.columns[0].layoutId)
    const before = await store.loadGithubHostCache(key)
    const layoutsBefore = await store.loadUserHostLayouts()
    const save = store.saveGithubHostCache
    vi.spyOn(store, 'saveGithubHostCache').mockImplementationOnce(async (...args) => {
      started()
      await blocked
      return save(...args)
    })
    const queued = state._persistGithubHostCache()
    await entered
    state.beginDeleteHostProfile('en', id)
    const deleting = state.deleteActiveHostProfile()
    const reloading = overlappingReload ? state.selectKeyboard({ ...event, userInitiated: true }) : null
    try {
      await vi.waitFor(() => expect(state.activeProfileId('en')).toBe(standard.columns[0].layoutId))
      // Deletion must not bypass the queued cache transaction.
      expect.soft(await store.loadUserHostLayouts()).toEqual(layoutsBefore)
      expect(await store.loadGithubHostCache(key)).toEqual(before)
    } finally {
      release()
      await queued
      await deleting
      await reloading
    }
    expect.soft(await store.loadUserHostLayouts()).toEqual(unrelated)
    expect((await store.loadGithubHostCache(key))?.revision).toBe(before!.revision + (overlappingReload ? 3 : 2))
    await state._persistGithubHostCache()
    expect.soft(await store.loadUserHostLayouts()).toEqual(unrelated)
    expect(await store.loadGithubHostCache('B')).toEqual(otherCache)
    expect(await store.loadHostLegendView(store.hostLegendSettingId(key))).toEqual(state.hostLegend)
    expect(await store.loadGithubHostCache(key)).toMatchObject({ workingEncoded: state._encodeLiveHostSnapshot() })
    expect(hostLayout(id)).toBeUndefined()

    state.resetForTests()
    await state.restoreHostProfiles()
    await state.selectKeyboard(event)
    await state.restoreHostProfiles()
    expect.soft(state.profilesForLanguage('en').map(row => row.id)).not.toContain(id)
    expect.soft(hostLayout(id)).toBeUndefined()
    expect.soft(await store.loadUserHostLayouts()).toEqual(unrelated)
    expect(state.activeProfileId('en')).toBe(standard.columns[0].layoutId)
  } finally {
    release()
    state.resetForTests()
  }
})

it('retains private deletion requested during host hydration until the cache commits', async () => {
  await seed()
  const unrelated = await store.loadUserHostLayouts()
  const other = await store.loadGithubHostCache('B')
  const state = new EditorState()
  const event = { source: 'github' as const, github: { repository: 'acme/delete-hydrating', branch: 'main', keymapPath: 'config/a.keymap', headSha: 's' },
    layout: [{ x: 0, y: 0 }], keymap: { layers: [[{ value: '&none', params: [] }]] } }
  try {
    await state.selectKeyboard(event)
    await state.setHostKeyLevel('en', 'A', 0, 'Ω')
    const id = state.activeProfileId('en')
    const key = draftIdentityKey(state.currentDraftIdentity()!)
    state.resetForTests()
    const restore = state._restoreHostAssemblies.bind(state)
    vi.spyOn(state, '_restoreHostAssemblies').mockImplementationOnce(async (...args) => {
      expect(state._loadingGithubHost).toBe(state._selectGeneration)
      state.beginDeleteHostProfile('en', id)
      await state.deleteActiveHostProfile()
      // Hydration skips persistence, not the explicit deletion intent.
      expect((await store.loadUserHostLayouts()).some(row => row.id === id)).toBe(true)
      await restore(...args)
    })
    await state.selectKeyboard(event)
    expect.soft(await store.loadUserHostLayouts()).toEqual(unrelated)
    expect(state.activeProfileId('en')).toBe(standard.columns[0].layoutId)
    expect((await store.loadGithubHostCache(key))?.workingEncoded).toBe(state._encodeLiveHostSnapshot())
    expect(hostLayout(id)).toBeUndefined()
    expect(state.hostProfilePrompt).toBeNull()
    await state._persistGithubHostCache()
    state.resetForTests()
    await state.selectKeyboard(event)
    await state.restoreHostProfiles()
    expect.soft(state.profilesForLanguage('en').map(row => row.id)).not.toContain(id)
    expect.soft(await store.loadUserHostLayouts()).toEqual(unrelated)
    expect(await store.loadGithubHostCache('B')).toEqual(other)
  } finally {
    state.resetForTests()
  }
})

it.each(['explicit retry', 'queued retry', 'reload retry'] as const)('preserves private profile memory after a failed delete transaction for %s', async retry => {
  await seed()
  const unrelated = await store.loadUserHostLayouts()
  const other = await store.loadGithubHostCache('B')
  const state = new EditorState()
  const event = { source: 'github' as const, github: { repository: 'acme/delete-retry', branch: 'main', keymapPath: 'config/a.keymap', headSha: 's' },
    layout: [{ x: 0, y: 0 }], keymap: { layers: [[{ value: '&none', params: [] }]] } }
  let release!: () => void
  let started!: () => void
  const blocked = new Promise<void>(resolve => { release = resolve })
  const entered = new Promise<void>(resolve => { started = resolve })
  try {
    await state.selectKeyboard(event)
    await state.setHostKeyLevel('en', 'A', 0, 'Ω')
    const id = state.activeProfileId('en')
    const key = draftIdentityKey(state.currentDraftIdentity()!)
    const before = await store.loadGithubHostCache(key)
    const layouts = await store.loadUserHostLayouts()
    const profile = state.userLayouts.find(row => row.id === id)
    const table = hostLayout(id)
    const remove = IDBObjectStore.prototype.delete
    vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementationOnce(function (this: IDBObjectStore, target) {
      expect(target).toBe(id)
      throw new Error('quota')
    })
    state.beginDeleteHostProfile('en', id)
    const deleting = state.deleteActiveHostProfile()
    // Queue before the first transaction fails: the later snapshot must carry
    // the same deletion intent, not just omit the table from its layout list.
    const save = store.saveGithubHostCache
    let calls = 0
    vi.spyOn(store, 'saveGithubHostCache').mockImplementation(async (...args) => {
      if (++calls === 2) { started(); await blocked }
      return save(...args)
    })
    const queued = retry === 'queued retry' ? state._persistGithubHostCache() : null
    await deleting
    if (queued) await entered
    expect(await store.loadGithubHostCache(key)).toEqual(before)
    expect(await store.loadUserHostLayouts()).toEqual(layouts)
    expect.soft(state.userLayouts.find(row => row.id === id)).toEqual(profile)
    expect.soft(hostLayout(id)).toEqual(table)
    expect.soft(state.hostProfilePrompt).toMatchObject({ kind: 'delete', profileId: id })
    expect(state.hostProfileNote).toBeTruthy()
    // A pending delete is not editable/reselectable, but its confirmation can retry.
    await state.selectLanguageProfile('en', id)
    expect(state.activeProfileId('en')).toBe(standard.columns[0].layoutId)
    vi.mocked(IDBObjectStore.prototype.delete).mockImplementation(remove)
    release()
    if (queued) await queued
    else if (retry === 'reload retry') await state.selectKeyboard({ ...event, userInitiated: true })
    else await state.deleteActiveHostProfile()
    expect.soft(state.activeProfileId('en')).toBe(standard.columns[0].layoutId)
    expect.soft((await store.loadUserHostLayouts()).map(row => row.id)).toEqual(unrelated.map(row => row.id))
    expect.soft(state.userLayouts.some(row => row.id === id)).toBe(false)
    expect.soft(hostLayout(id)).toBeUndefined()
    expect.soft(state.hostProfilePrompt).toBeNull()
    expect((await store.loadGithubHostCache(key))?.workingEncoded).toBe(state._encodeLiveHostSnapshot())
    expect(await store.loadGithubHostCache('B')).toEqual(other)
    await state._persistGithubHostCache()
    state.resetForTests()
    await state.selectKeyboard(event)
    await state.restoreHostProfiles()
    expect(state.profilesForLanguage('en').map(row => row.id)).not.toContain(id)
    expect(await store.loadUserHostLayouts()).toEqual(unrelated)
  } finally {
    release()
    state.resetForTests()
  }
})

it('retains inactive pending deletion memory through same-identity Reload before commit', async () => {
  await seed()
  const unrelated = await store.loadUserHostLayouts()
  const other = await store.loadGithubHostCache('B')
  const state = new EditorState()
  const event = { source: 'github' as const, github: { repository: 'acme/inactive-delete-reload', branch: 'main', keymapPath: 'config/a.keymap', headSha: 's' },
    layout: [{ x: 0, y: 0 }], keymap: { layers: [[{ value: '&none', params: [] }]] } }
  let release!: () => void
  let started!: () => void
  const blocked = new Promise<void>(resolve => { release = resolve })
  const entered = new Promise<void>(resolve => { started = resolve })
  try {
    await state.selectKeyboard(event)
    await state.setHostKeyLevel('en', 'A', 0, 'Ω')
    const id = state.activeProfileId('en')
    await state.selectLanguageProfile('en', standard.columns[0].layoutId)
    const profile = state.userLayouts.find(row => row.id === id)
    const table = hostLayout(id)
    const key = draftIdentityKey(state.currentDraftIdentity()!)
    const before = await store.loadGithubHostCache(key)
    const rows = await store.loadUserHostLayouts()
    const remove = IDBObjectStore.prototype.delete
    const failure = vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (this: IDBObjectStore, target) {
      if (target === id) throw new Error('quota')
      return remove.call(this, target)
    })
    state.beginDeleteHostProfile('en', id)
    await state.deleteActiveHostProfile()
    const save = store.saveGithubHostCache
    vi.spyOn(store, 'saveGithubHostCache').mockImplementationOnce(async (...args) => {
      started()
      await blocked
      return save(...args)
    })
    const reload = state.selectKeyboard({ ...event, userInitiated: true })
    await entered
    try {
      expect.soft(state.userLayouts.find(row => row.id === id)).toEqual(profile)
      expect.soft(hostLayout(id) === table).toBe(true)
      expect.soft(state.hostProfilePrompt).toMatchObject({ kind: 'delete', profileId: id })
      expect(await store.loadGithubHostCache(key)).toEqual(before)
      expect(await store.loadUserHostLayouts()).toEqual(rows)
    } finally {
      release()
      await reload
    }
    expect.soft(state.userLayouts.find(row => row.id === id)).toEqual(profile)
    expect.soft(hostLayout(id) === table).toBe(true)
    expect.soft(state.hostProfilePrompt).toMatchObject({ kind: 'delete', profileId: id })
    expect(state.profilesForLanguage('en').some(row => row.id === id)).toBe(false)
    await state.selectLanguageProfile('en', id)
    expect(state.activeProfileId('en')).toBe(standard.columns[0].layoutId)
    state.beginRenameHostProfile('en', id)
    state.beginCopyHostProfile('en', id)
    expect.soft(state.hostProfilePrompt).toMatchObject({ kind: 'delete', profileId: id })
    // Stale references cannot edit the retained pending table.
    const view = cloneHostLegendView(state.hostLegend)
    state.hostLegend.columns[0].layoutId = id
    expect((await state.setHostKeyLevel('en', 'A', 0, 'Ж')).ok).toBe(false)
    state.hostLegend = view
    expect(await store.loadUserHostLayouts()).toEqual(rows)
    failure.mockRestore()
    await state.deleteActiveHostProfile()
    expect.soft(await store.loadUserHostLayouts()).toEqual(unrelated)
    expect(await store.loadGithubHostCache('B')).toEqual(other)
    expect.soft(hostLayout(id)).toBeUndefined()
    expect(state.hostProfilePrompt).toBeNull()
  } finally {
    release()
    await state._hostCacheWrites
    state.resetForTests()
  }
})

it.each(['demo', 'clipboard', 'local', 'github'] as const)('restores inactive pending deletion retry on owner return from %s', async source => {
  const state = new EditorState()
  const event = { source: 'github' as const, github: { repository: `acme/pending-return-${source}`, branch: 'main', keymapPath: 'config/a.keymap', headSha: 's' },
    layout: [{ x: 0, y: 0 }], keymap: { layers: [[{ value: '&none', params: [] }]] } }
  try {
    await state.selectKeyboard(event)
    await state.setHostKeyLevel('en', 'A', 0, 'Ω')
    const id = state.activeProfileId('en')
    await state.selectLanguageProfile('en', standard.columns[0].layoutId)
    const original = (await store.loadUserHostLayouts()).find(row => row.id === id)!
    const remove = IDBObjectStore.prototype.delete
    const failure = vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (this: IDBObjectStore, target) {
      if (target === id) throw new Error('quota')
      return remove.call(this, target)
    })
    state.beginDeleteHostProfile('en', id)
    await state.deleteActiveHostProfile()
    await state.selectKeyboard(source === 'github'
      ? { ...event, github: { ...event.github, keymapPath: 'config/b.keymap' } }
      : { source, layout: event.layout, keymap: event.keymap })
    expect(state.source).toBe(source)
    expect(hostLayout(id)).toBeUndefined()
    expect(state.userLayouts.some(row => row.id === id)).toBe(false)
    expect(state.hostProfilePrompt).toBeNull()
    const otherIdentity = draftIdentityKey(state.currentDraftIdentity()!)
    const otherCache = await store.loadGithubHostCache(otherIdentity)
    const otherView = await store.loadHostLegendView(store.hostLegendSettingId(otherIdentity))
    expect((await store.loadUserHostLayouts()).find(row => row.id === id)).toEqual(original)

    await state.selectKeyboard(event)
    expect.soft(state.userLayouts.find(row => row.id === id)?.name).toBe(original.name)
    expect.soft(hostLayout(id)?.byZmk.get('A')?.glyphs[0]).toBe('Ω')
    expect.soft(state.hostProfilePrompt).toMatchObject({ kind: 'delete', profileId: id })
    expect(state.profilesForLanguage('en').some(row => row.id === id)).toBe(false)
    await state.selectLanguageProfile('en', id)
    expect(state.activeProfileId('en')).toBe(standard.columns[0].layoutId)
    state.beginRenameHostProfile('en', id)
    state.beginCopyHostProfile('en', id)
    expect.soft(state.hostProfilePrompt).toMatchObject({ kind: 'delete', profileId: id })
    expect((await store.loadUserHostLayouts()).find(row => row.id === id)).toEqual(original)
    failure.mockRestore()
    await state.deleteActiveHostProfile()
    expect.soft((await store.loadUserHostLayouts()).some(row => row.id === id)).toBe(false)
    expect.soft(hostLayout(id)).toBeUndefined()
    expect(state.hostProfilePrompt).toBeNull()
    expect(await store.loadGithubHostCache(otherIdentity)).toEqual(otherCache)
    expect(await store.loadHostLegendView(store.hostLegendSettingId(otherIdentity))).toEqual(otherView)
  } finally {
    state.resetForTests()
  }
})

it('retires pending profile deletes only after a committed host discard', async () => {
  const state = new EditorState()
  const event = { source: 'github' as const, github: { repository: 'acme/delete-discard', branch: 'main', keymapPath: 'config/a.keymap', headSha: 's' },
    layout: [{ x: 0, y: 0 }], keymap: { layers: [[{ value: '&none', params: [] }]] }, hostSnapshotError: 'invalid' as const }
  try {
    await state.selectKeyboard(event)
    await state.commitHostMap(edited)
    await state.setHostKeyLevel('en', 'A', 0, 'Ω')
    const id = state.activeProfileId('en')
    const snapshot = JSON.parse(state._encodeLiveHostSnapshot())
    const key = draftIdentityKey(state.currentDraftIdentity()!)
    const remove = IDBObjectStore.prototype.delete
    const failure = vi.spyOn(IDBObjectStore.prototype, 'delete').mockImplementation(function (this: IDBObjectStore, target) {
      if (target === id) throw new Error('quota')
      return remove.call(this, target)
    })
    state.beginDeleteHostProfile('en', id)
    await state.deleteActiveHostProfile()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    expect(await state.discardLocalHostEdits()).toBe(false)
    expect(state._pendingHostLayoutDeletes.get(key)?.has(id)).toBe(true)
    confirm.mockReturnValue(true)
    expect(await state.discardLocalHostEdits()).toBe(false)
    expect(state._pendingHostLayoutDeletes.get(key)?.has(id)).toBe(true)
    failure.mockRestore()
    expect(await state.discardLocalHostEdits()).toBe(true)
    expect.soft(state._pendingHostLayoutDeletes.get(key)?.has(id) ?? false).toBe(false)
    // Later compatible remote work with the same wire ID is not old deletion consent.
    await state.selectKeyboard({ ...event, userInitiated: true, hostSnapshotError: undefined, hostSnapshot: snapshot })
    expect.soft(state.activeProfileId('en')).toBe(id)
    expect.soft(hostLayout(id)?.byZmk.get('A')?.glyphs[0]).toBe('Ω')
    expect.soft((await store.loadUserHostLayouts()).some(row => row.id === id)).toBe(true)
  } finally {
    state.resetForTests()
  }
})

it('waits for an in-flight private profile rename before atomic discard', async () => {
  const state = new EditorState()
  const event = { source: 'github' as const, github: { repository: 'acme/rename-discard', branch: 'main', keymapPath: 'config/a.keymap', headSha: 's' },
    layout: [{ x: 0, y: 0 }], keymap: { layers: [[{ value: '&none', params: [] }]] }, hostSnapshotError: 'invalid' as const }
  await state.selectKeyboard(event)
  await state.setHostKeyLevel('en', 'A', 0, 'Ω')
  const id = state.activeProfileId('en')
  const key = draftIdentityKey(state.currentDraftIdentity()!)
  let release!: () => void
  let started!: () => void
  const blocked = new Promise<void>(resolve => { release = resolve })
  const entered = new Promise<void>(resolve => { started = resolve })
  const saveLayout = store.saveUserHostLayout
  const saveCache = store.saveGithubHostCache
  // Delay the real owned-table write, whichever persistence entry point owns it.
  vi.spyOn(store, 'saveUserHostLayout').mockImplementation(async record => {
    if (record.id === id && record.name === 'Renamed private') {
      started()
      await blocked
    }
    return saveLayout(record)
  })
  vi.spyOn(store, 'saveGithubHostCache').mockImplementation(async (...args) => {
    if (args[0] === key && args[1].workingEncoded.includes('Renamed private')) {
      started()
      await blocked
    }
    return saveCache(...args)
  })
  const discard = vi.spyOn(store, 'discardGithubHostRecovery')
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  state.beginRenameHostProfile('en', id)
  const renaming = state.confirmHostProfileName('Renamed private')
  await entered
  const discarding = state.discardLocalHostEdits()
  try {
    // Discard's first await must include this already-started owned-table write.
    await Promise.resolve()
    await Promise.resolve()
    expect.soft(discard).not.toHaveBeenCalled()
  } finally {
    release()
  }
  try {
    expect(await renaming).toBeNull()
    expect(await discarding).toBe(true)
    await state._persistGithubHostCache()
    expect((await store.loadUserHostLayouts()).map(row => row.id)).not.toContain(id)
    expect(await store.loadGithubHostCache(key)).toMatchObject({ workingEncoded: encoded, originEncoded: encoded })
    expect(state.hostLegend).toEqual(standard)
    expect(hostLayout(id)).toBeUndefined()
    state.resetForTests()
    await state.selectKeyboard(event)
    expect(state.hostLegend).toEqual(standard)
    expect(state.hasLocalHostRecovery).toBe(false)
    expect((await store.loadUserHostLayouts()).map(row => row.id)).not.toContain(id)
  } finally {
    state.resetForTests()
  }
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

it.each(['demo', 'clipboard', 'local'] as const)('isolates GitHub private profiles from a %s session', async source => {
  const state = new EditorState()
  const event = { source: 'github' as const, github: { repository: `acme/private-${source}`, branch: 'main', keymapPath: 'config/a.keymap', headSha: 's' },
    layout: [{ x: 0, y: 0 }], keymap: { layers: [[{ value: '&none', params: [] }]] } }
  try {
    await state.selectKeyboard(event)
    await state.setHostKeyLevel('en', 'A', 0, 'Ω')
    const id = state.activeProfileId('en')
    const privateView = cloneHostLegendView(state.hostLegend)
    state.acceptHostRepoBaseline()
    await state._hostCacheWrites
    const original = (await store.loadUserHostLayouts()).find(row => row.id === id)!
    expect(original).toBeDefined()
    expect(state.profilesForLanguage('en').map(row => row.id)).toContain(id)

    await state.selectKeyboard({ source, layout: event.layout, keymap: { ...event.keymap, keyboard: `isolation-${source}` } })
    expect(state.source).toBe(source)
    expect.soft(state.profilesForLanguage('en').map(row => row.id)).not.toContain(id)
    await state.selectLanguageProfile('en', id)
    expect.soft(state.activeProfileId('en')).not.toBe(id)

    // An old persisted view or stale callback must not edit an owner's table.
    state.hostLegend = privateView
    const edit = await state.setHostKeyLevel('en', 'A', 0, 'Ж')
    expect.soft(!edit.ok || edit.layoutId !== id).toBe(true)
    expect.soft((await store.loadUserHostLayouts()).find(row => row.id === id)).toEqual(original)
    expect.soft(hostLayout(id)).toBeUndefined()

    const destination = state.currentDraftIdentity()!
    await store.saveHostLegendView(privateView, store.hostLegendSettingId(draftIdentityKey(destination)))
    await store.saveHostAssemblies(store.hostAssembliesSettingId(draftIdentityKey(destination)), [{ id: 'stale-private', view: privateView }])
    await state._restoreHostLegend(state._selectGeneration)
    expect(state.hostLegend).toEqual(standard)
    expect(state.hostAssemblies[0].view).toEqual(standard)
    await state.commitHostMap(privateView)
    expect(state.hostLegend).toEqual(standard)
    state.beginRenameHostProfile('en', id)
    expect(state.hostProfilePrompt).toBeNull()
    state.beginDeleteHostProfile('en', id)
    expect(state.hostProfilePrompt).toBeNull()

    state.resetForTests()
    await state.restoreHostProfiles()
    expect.soft(state.userLayouts.map(row => row.id)).not.toContain(id)
    expect.soft(hostLayout(id)).toBeUndefined()
    await state.selectKeyboard({ source, layout: event.layout, keymap: { ...event.keymap, keyboard: `isolation-${source}` } })
    state.hostLegend = privateView
    expect((await state.setHostKeyLevel('en', 'A', 0, 'Ж')).ok).toBe(false)
    expect((await store.loadUserHostLayouts()).find(row => row.id === id)).toEqual(original)
    await state.commitHostMap(standard)
    expect((await state.setHostKeyLevel('en', 'A', 0, 'Z')).ok).toBe(true)
    const globalId = state.activeProfileId('en')
    expect(globalId).not.toMatch(/^user:github:/)
    expect(state.profilesForLanguage('en').map(row => row.id)).toContain(globalId)
    await state.selectKeyboard(event)
    expect(state.activeProfileId('en')).toBe(id)
    expect(state.profilesForLanguage('en').map(row => row.id)).toContain(id)
    expect(hostLayout(id)?.byZmk.get('A')).toEqual(original.layout.byZmk.get('A'))
    expect((await state.setHostKeyLevel('en', 'A', 0, 'Γ')).ok).toBe(true)
    expect(state.activeProfileId('en')).toBe(id)
  } finally {
    state.resetForTests()
  }
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
