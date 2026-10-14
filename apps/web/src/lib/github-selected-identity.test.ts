import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addHostLanguage, parseKeymap, hostLayout } from '@keymap-editor/keymap-core'
import { editor } from './editor.svelte.js'
import { loadStoredDraft, deleteStoredDraft } from './draft-storage'
import { clearHostLayoutStore, loadGithubHostCache, saveGithubHostCache } from './host-layout-store'
import * as draftStorage from './draft-storage'
import * as hostStorage from './host-layout-store'
import { publishKeymap } from './publish-keymap'
import type { GithubKeyboardSelection, KeyboardSelection } from './editor/types'

const km = (code: string) => parseKeymap({ keyboard: 'same', layer_names: ['base'], layers: [[`&kp ${code}`]] })
const board = (path = 'config/a.keymap', headSha = 's'): GithubKeyboardSelection => ({
  source: 'github', github: { repository: 'acme/scoped', branch: 'main', keymapPath: path, headSha },
  layout: [{ x: 0, y: 0, row: 0, col: 0 }], keymap: km('A')
})
beforeEach(async () => { editor.resetForTests(); await clearHostLayoutStore(); vi.spyOn(window, 'confirm').mockReturnValue(true) })
afterEach(async () => { const id = editor.currentDraftIdentity(); editor.resetForTests(); if (id) await deleteStoredDraft(id); vi.restoreAllMocks() })

describe('selected GitHub editor identity', () => {
  it.each([
    ['demo', true], ['clipboard', true], ['local', true], ['github', true],
    ['demo', false], ['clipboard', false], ['local', false], ['github', false]
  ] as const)('retains handled firmware recovery through no-draft %s and flush (restore=%s)', async (source, restore) => {
    const selection = board()
    await editor.selectKeyboard(selection)
    editor.updateKeymap(km('Z'))
    editor.layerOperationSnapshot = { ...editor.layerOperationSnapshot!, identityAware: true }
    editor.layerView = { shown: [0, 3], layer0Raw: true }
    await editor.flushPendingPersist()
    const identity = editor.currentDraftIdentity()!
    const stored = (await loadStoredDraft(identity))!
    expect(stored.layerOperation).toBeDefined()
    editor.resetForTests()
    vi.mocked(window.confirm).mockReturnValue(restore)
    await editor.selectKeyboard(selection)
    expect(window.confirm).toHaveBeenCalledTimes(1)
    expect(editor.hasPendingFirmwareRecovery).toBe(!restore)
    vi.mocked(window.confirm).mockClear()

    await editor.selectKeyboard(source === 'github'
      ? board('config/b.keymap')
      : { source, layout: selection.layout, keymap: km('A') })
    const destination = editor.currentDraftIdentity()!
    expect(destination).not.toEqual(identity)
    expect(editor.draftKeymap).toEqual(km('A'))
    expect(editor.hasPendingFirmwareRecovery).toBe(false)
    await editor.flushPendingPersist()
    expect(await loadStoredDraft(destination)).toBeNull()
    const retained = (await loadStoredDraft(identity))!

    await editor.selectKeyboard({ ...board('config/a.keymap', 'new-head'), keymap: km('B') })
    expect(window.confirm).not.toHaveBeenCalled()
    expect.soft(editor.draftKeymap).toEqual(restore ? retained.draftKeymap : retained.githubBaseline!.keymap)
    expect.soft(editor.baselineKeymap).toEqual(retained.githubBaseline!.keymap)
    expect.soft(editor.githubMeta?.headSha).toBe(retained.githubBaseline!.headSha)
    expect.soft(editor.hasPendingFirmwareRecovery).toBe(!restore)
    expect.soft(editor.isDirty).toBe(restore)
    if (restore) expect.soft(editor._storedLayerOperation()).toEqual(retained.layerOperation)
    await editor.flushPendingPersist()
    const flushed = await loadStoredDraft(identity)
    if (restore) expect.soft(flushed).toMatchObject({ draftKeymap: retained.draftKeymap, githubBaseline: retained.githubBaseline, layerOperation: retained.layerOperation })
    else expect.soft(flushed).toEqual(retained)
    expect(await loadStoredDraft(destination)).toBeNull()
  })

  it.each([true, false])('keeps handled firmware provenance despite stale host head on return (restore=%s)', async restore => {
    const selection = board()
    await editor.selectKeyboard(selection)
    editor.updateKeymap(km('Z'))
    await editor.setHostKeyLevel('en', 'A', 0, 'Ω')
    await editor.flushPendingPersist()
    await editor._hostCacheWrites
    const identity = editor.currentDraftIdentity()!
    const key = draftStorage.draftIdentityKey(identity)
    editor.resetForTests()
    vi.mocked(window.confirm).mockReturnValue(restore)
    await editor.selectKeyboard(selection)
    await editor.selectKeyboard(board('config/b.keymap'))
    const retained = (await loadStoredDraft(identity))!
    const cached = (await loadGithubHostCache(key))!
    await saveGithubHostCache(key, { ...cached, headSha: 'stale-host-head', baselineSha: 'host-origin-head' }, cached.revision)
    vi.mocked(window.confirm).mockClear()

    await editor.selectKeyboard({ ...board('config/a.keymap', 'new-remote-head'), keymap: km('B') })
    expect(window.confirm).not.toHaveBeenCalled()
    expect.soft(editor.githubMeta?.headSha).toBe(retained.githubBaseline!.headSha)
    expect.soft(editor.baselineKeymap).toEqual(retained.githubBaseline!.keymap)
    expect.soft(editor.baselineLayout).toEqual(retained.githubBaseline!.layout)
    expect(editor._hostRepoBaselineSha).toBe('host-origin-head')
    expect(editor._encodeLiveHostSnapshot()).toBe(cached.workingEncoded)
    await editor.flushPendingPersist()
    expect.soft((await loadStoredDraft(identity))?.githubBaseline).toEqual(retained.githubBaseline)
  })

  it.each(['demo', 'clipboard', 'local', 'github'] as const)('restores handled identity host recovery after a no-draft %s destination', async source => {
    const selection = board()
    await editor.selectKeyboard(selection)
    editor.updateKeymap(km('Z'))
    await editor.setHostKeyLevel('en', 'A', 0, 'Ω')
    await editor.flushPendingPersist()
    await editor._hostCacheWrites
    const identity = editor.currentDraftIdentity()!
    const key = draftStorage.draftIdentityKey(identity)
    const firmware = await loadStoredDraft(identity)
    const privateId = editor.activeProfileId('en')
    const host = editor._encodeLiveHostSnapshot()
    const cached = (await loadGithubHostCache(key))!

    editor.resetForTests()
    await editor.selectKeyboard(selection)
    expect(editor.draftKeymap).toEqual(km('Z'))
    expect(editor._handledDraftIdentityKey).toBe(key)
    expect(hostLayout(privateId)?.byZmk.get('A')?.glyphs[0]).toBe('Ω')
    vi.mocked(window.confirm).mockClear()

    await editor.selectKeyboard(source === 'github'
      ? board('config/b.keymap')
      : { source, layout: selection.layout, keymap: km('A') })
    expect(editor.source).toBe(source)
    expect(editor._handledDraftIdentityKey).toBe(key)
    expect(hostLayout(privateId)).toBeUndefined()
    const destination = editor.currentDraftIdentity()!
    expect(await loadStoredDraft(destination)).toBeNull()
    editor.hostLegend = addHostLanguage(editor.hostLegend, 'de')
    await editor._persistHostLegend()
    const destinationKey = draftStorage.draftIdentityKey(destination)
    const destinationView = await hostStorage.loadHostLegendView(hostStorage.hostLegendSettingId(destinationKey))
    const destinationCache = await loadGithubHostCache(destinationKey)
    const retainedFirmware = await loadStoredDraft(identity)
    expect(retainedFirmware?.draftKeymap).toEqual(firmware?.draftKeymap)

    await editor.selectKeyboard(selection)
    expect(editor.currentDraftIdentity()).toEqual(identity)
    expect(editor._handledDraftIdentityKey).toBe(key)
    expect(window.confirm).not.toHaveBeenCalled()
    expect.soft(editor.activeProfileId('en')).toBe(privateId)
    expect.soft(hostLayout(privateId)?.byZmk.get('A')?.glyphs[0]).toBe('Ω')
    expect.soft(editor._encodeLiveHostSnapshot()).toBe(host)
    // A subsequent host write must not copy the intervening source's legend to A.
    await editor._persistHostLegend()
    expect.soft(await loadGithubHostCache(key)).toMatchObject({
      workingEncoded: host, baselineEncoded: cached.baselineEncoded,
      baselineSha: cached.baselineSha, headSha: cached.headSha
    })
    expect(await loadStoredDraft(identity)).toEqual(retainedFirmware)
    expect(await hostStorage.loadHostLegendView(hostStorage.hostLegendSettingId(destinationKey))).toEqual(destinationView)
    const retainedDestinationCache = await loadGithubHostCache(destinationKey)
    expect(retainedDestinationCache && { ...retainedDestinationCache, revision: 0 }).toEqual(destinationCache && { ...destinationCache, revision: 0 })
  })

  it('clears firmware recovery loading after invalid selected GitHub host-cache hydration fails', async () => {
    // Exercise hydration's decoder, rather than the earlier storage-read guard.
    vi.spyOn(hostStorage, 'loadGithubHostCache').mockResolvedValue({
      revision: 1, baselineEncoded: null, baselineSha: null,
      workingEncoded: '{invalid', headSha: 's'
    })

    await expect(editor.selectKeyboard(board())).rejects.toThrow('Invalid host recovery')

    expect(editor.githubMeta?.keymapPath).toBe('config/a.keymap')
    expect.soft(editor._firmwareRecoveryLoading).toBe(false)
    expect(editor.hasPendingFirmwareRecovery).toBe(false)
    editor.updateKeymap(km('Z'))
    expect(editor.draftKeymap).toEqual(km('Z'))
    expect(editor.isDirty).toBe(true)
  })

  it('clears firmware recovery loading when a hydration select is superseded by a refused selection', async () => {
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    const load = hostStorage.loadHostAssemblies
    vi.spyOn(hostStorage, 'loadHostAssemblies').mockImplementation(async key => { await held; return load(key) })
    const selecting = editor.selectKeyboard(board())
    await vi.waitFor(() => expect(hostStorage.loadHostAssemblies).toHaveBeenCalled())
    expect(editor._firmwareRecoveryLoading).toBe(true)
    const generation = editor._selectGeneration

    // Carry refuses a different file after superseding the in-flight select.
    await editor.selectKeyboard({ ...board('config/b.keymap'), preserveSession: true })
    expect(editor._selectGeneration).toBeGreaterThan(generation)
    release()
    await selecting

    expect(editor.githubMeta?.keymapPath).toBe('config/a.keymap')
    expect(editor.saveNotice?.messages).toContain('Cannot carry drafts into a different keymap file.')
    expect.soft(editor._firmwareRecoveryLoading).toBe(false)
    expect(editor.hasPendingFirmwareRecovery).toBe(false)
    editor.updateKeymap(km('Z'))
    expect(editor.draftKeymap).toEqual(km('Z'))
    expect(editor.isDirty).toBe(true)
  })

  it.each(['head', 'baseline', 'identity'] as const)('refuses changed %s during branch-carry destination reads', async changed => {
    await editor.selectKeyboard({ ...board(), hostSnapshotError: 'invalid' })
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    const load = draftStorage.loadStoredDraft
    vi.spyOn(draftStorage, 'loadStoredDraft').mockImplementation(async id => {
      if (id.branch === 'copied') await held
      return load(id)
    })
    const selecting = editor.selectKeyboard({ ...board(), github: { ...board().github, branch: 'copied' }, preserveSession: true, hostSnapshotError: 'invalid' })
    await vi.waitFor(() => expect(draftStorage.loadStoredDraft).toHaveBeenCalledWith(expect.objectContaining({ branch: 'copied' })))
    if (changed === 'head') editor.githubMeta = { ...editor.githubMeta!, headSha: 'new' }
    if (changed === 'baseline') editor.baselineKeymap = km('B')
    if (changed === 'identity') editor.githubMeta = { ...editor.githubMeta!, repository: 'acme/other' }
    const before = JSON.stringify({ meta: editor.githubMeta, baseline: editor.baselineKeymap })
    release()
    await selecting
    expect(JSON.stringify({ meta: editor.githubMeta, baseline: editor.baselineKeymap })).toBe(before)
    expect(editor.saveNotice?.messages.join(' ')).toMatch(/Work changed/)
  })

  it.each(['firmware', 'layer', 'view', 'head', 'baseline', 'layout', 'identity', 'host', 'host origin', 'host assemblies'] as const)('refuses changed %s after destination recovery reads', async changed => {
    await editor.selectKeyboard({ ...board(), hostSnapshotError: 'invalid' })
    editor.updateKeymap(km('Z'))
    await editor.flushPendingPersist()
    const identity = editor.currentDraftIdentity()!
    const retained = await loadStoredDraft(identity)
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    const load = draftStorage.loadStoredDraft
    vi.spyOn(draftStorage, 'loadStoredDraft').mockImplementation(async id => {
      if (id.keymapPath === 'config/b.keymap') await held
      return load(id)
    })
    const selecting = editor.selectKeyboard(board('config/b.keymap'))
    await vi.waitFor(() => expect(draftStorage.loadStoredDraft).toHaveBeenCalledWith(expect.objectContaining({ keymapPath: 'config/b.keymap' })))
    if (changed === 'firmware') editor.updateKeymap(km('X'))
    if (changed === 'layer') editor.addLayer()
    if (changed === 'view') editor.layerView = { shown: [0], layer0Raw: true }
    if (changed === 'head') editor.githubMeta = { ...editor.githubMeta!, headSha: 'new' }
    if (changed === 'baseline') editor.baselineKeymap = km('B')
    if (changed === 'layout') editor.baselineLayout = [{ ...board().layout![0], x: 4 }]
    if (changed === 'identity') editor.githubMeta = { ...editor.githubMeta!, branch: 'changed' }
    if (changed === 'host') editor.hostLegend = addHostLanguage(editor.hostLegend, 'de')
    if (changed === 'host origin') editor._hostLocalOriginEncoded = 'changed'
    if (changed === 'host assemblies') editor.hostAssemblies = [{ id: 'remembered', view: addHostLanguage(editor.hostLegend, 'de') }]
    const expected = JSON.stringify({ draft: editor.draftKeymap, meta: editor.githubMeta, baseline: editor.baselineKeymap, layout: editor.baselineLayout, layer: editor.layerOperationSnapshot, view: editor.layerView, host: editor._encodeLiveHostSnapshot(), origin: editor._hostLocalOriginEncoded, assemblies: editor.hostAssemblies, history: editor.undoStack })
    release()
    await selecting
    expect(JSON.stringify({ draft: editor.draftKeymap, meta: editor.githubMeta, baseline: editor.baselineKeymap, layout: editor.baselineLayout, layer: editor.layerOperationSnapshot, view: editor.layerView, host: editor._encodeLiveHostSnapshot(), origin: editor._hostLocalOriginEncoded, assemblies: editor.hostAssemblies, history: editor.undoStack })).toBe(expected)
    expect(editor.saveNotice?.messages.join(' ')).toMatch(changed === 'host' || changed === 'host origin' ? /Discard local host edits/ : /Work changed.*retained/)
    expect(await load(identity)).toEqual(retained)
    await deleteStoredDraft(identity)
  })

  it('keeps pre-existing live divergence during recovery and warns against reopening', async () => {
    await editor.selectKeyboard(board())
    editor.updateKeymap(km('Z'))
    await editor.flushPendingPersist()
    const identity = editor.currentDraftIdentity()!
    const stored = await loadStoredDraft(identity)
    editor.resetForTests()
    vi.mocked(window.confirm).mockReturnValue(false)
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    const load = hostStorage.loadHostAssemblies
    vi.spyOn(hostStorage, 'loadHostAssemblies').mockImplementation(async key => { await held; return load(key) })
    const selecting = editor.selectKeyboard(board())
    await vi.waitFor(() => expect(hostStorage.loadHostAssemblies).toHaveBeenCalled())
    // A stale/older caller must not let recovery overwrite an existing live edit.
    editor.draftKeymap = km('X')
    release()
    await selecting
    expect(editor.draftKeymap).toEqual(km('X'))
    expect(editor.hasPendingFirmwareRecovery).toBe(true)
    await editor.flushPendingPersist()
    expect(await loadStoredDraft(identity)).toEqual(stored)
    expect(editor.statusText).not.toMatch(/Reopen to restore/)
    expect(editor.statusText).toMatch(/not saved.*Do not reload/)
    expect(editor.saveNotice?.messages.join(' ')).toMatch(/not saved.*Do not reload/)
    expect(await editor.retainWorkForTransition()).toBe(false)
  })

  it('refuses edits while selected recovery is still loading before the restore decision', async () => {
    await editor.selectKeyboard(board())
    editor.updateKeymap(km('Z'))
    await editor.flushPendingPersist()
    const identity = editor.currentDraftIdentity()!
    const stored = await loadStoredDraft(identity)
    editor.resetForTests()
    vi.mocked(window.confirm).mockReturnValue(false)
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    const load = hostStorage.loadHostAssemblies
    vi.spyOn(hostStorage, 'loadHostAssemblies').mockImplementation(async key => { await held; return load(key) })
    const selecting = editor.selectKeyboard(board())
    await vi.waitFor(() => expect(hostStorage.loadHostAssemblies).toHaveBeenCalled())
    const live = editor.draftKeymap
    editor.updateKeymap(km('X'))
    editor.addLayer()
    const refused = editor.draftKeymap === live
    const notice = editor.saveNotice?.messages.join(' ')
    release()
    await selecting
    expect(refused).toBe(true)
    expect(notice).toMatch(/Firmware editing is blocked.*recovery/i)
    expect(editor.hasPendingFirmwareRecovery).toBe(true)
    expect(await loadStoredDraft(identity)).toEqual(stored)
  })

  it.each(['binding', 'add', 'rename', 'delete', 'duplicate', 'reorder', 'undo', 'redo', 'sensor', 'combos', 'hold-taps', 'conditional', 'promote'] as const)('refuses %s edits after declining firmware recovery without changing either revision', async operation => {
    const selection = board()
    selection.keymap = { ...km('A'), layer_names: ['base', 'extra'], layers: [...km('A').layers, ...km('B').layers], sensorBindings: [[{ value: '&inc_dec_kp', params: [] }], [{ value: '&inc_dec_kp', params: [] }]] }
    await editor.selectKeyboard(selection)
    editor.renameLayer(1, 'stored')
    await editor.flushPendingPersist()
    const identity = editor.currentDraftIdentity()!
    const stored = await loadStoredDraft(identity)
    editor.resetForTests()
    vi.mocked(window.confirm).mockReturnValue(false)
    await editor.selectKeyboard(selection)
    // Existing history must not provide a back door into a pending session.
    editor.undoStack = [km('U')]
    editor.redoStack = [km('R')]
    editor.schemeMode = true
    editor.layout = [{ ...board().layout![0], absent: true }]
    const before = JSON.stringify({ draft: editor.draftKeymap, layer: editor.layerOperationSnapshot, view: editor.layerView, layout: editor.layout, undo: editor.undoStack, redo: editor.redoStack })
    const actions = {
      binding: () => editor.updateKeymap(km('X')),
      add: () => editor.addLayer(), rename: () => editor.renameLayer(1, 'new'), delete: () => editor.deleteLayer(1),
      duplicate: () => editor.duplicateLayer(0), reorder: () => editor.reorderLayers([1, 0]),
      undo: () => editor.undo(), redo: () => editor.redo(),
      sensor: () => editor.updateSensorBinding(0, 0, { value: '&none', params: [] }),
      combos: () => editor.updateCombos([]), 'hold-taps': () => editor.updateHoldTaps([]), conditional: () => editor.updateConditionalLayers([]),
      promote: () => editor.promoteAbsentKey(0, km('X').layers[0][0])
    }
    actions[operation]()
    expect(JSON.stringify({ draft: editor.draftKeymap, layer: editor.layerOperationSnapshot, view: editor.layerView, layout: editor.layout, undo: editor.undoStack, redo: editor.redoStack })).toBe(before)
    expect(editor.saveNotice?.messages.join(' ')).toMatch(/Firmware editing is blocked.*recovery/i)
    await editor.flushPendingPersist()
    expect(await loadStoredDraft(identity)).toEqual(stored)
    editor.resetForTests()
    vi.mocked(window.confirm).mockReturnValue(true)
    await editor.selectKeyboard(selection)
    expect(editor.draftKeymap?.layer_names?.[1]).toBe('stored')
  })

  it.each(['file', 'repository', 'branch', 'carry', 'demo', 'clipboard', 'local'] as const)('retains both firmware revisions when switching to %s with pre-existing live divergence', async destination => {
    await editor.selectKeyboard(board())
    editor.updateKeymap(km('Z'))
    await editor.flushPendingPersist()
    const identity = editor.currentDraftIdentity()!
    const stored = await loadStoredDraft(identity)
    editor.resetForTests()
    vi.mocked(window.confirm).mockReturnValue(false)
    await editor.selectKeyboard(board())
    expect(editor.hasPendingFirmwareRecovery).toBe(true)
    // Simulate a revision already introduced by an older/in-flight caller,
    // bypassing the newly guarded public edit operations deliberately.
    editor.draftKeymap = { ...km('X'), layers: [...km('X').layers, ...km('B').layers] }
    expect(editor.draftKeymap?.layers).toHaveLength(2)
    editor.layerOperationSnapshot = { ...editor.layerOperationSnapshot!, identityAware: true }
    editor.layerView = { shown: [0, 3], layer0Raw: true }
    const live = JSON.stringify(editor.draftKeymap)
    const layer = editor._storedLayerOperation()
    const meta = { ...editor.githubMeta }
    const history = JSON.stringify(editor.undoStack)
    const target: KeyboardSelection = destination === 'file' ? board('config/b.keymap')
      : destination === 'repository' ? { ...board(), github: { ...board().github, repository: 'acme/other' } }
      : destination === 'branch' || destination === 'carry' ? { ...board(), github: { ...board().github, branch: 'copied' }, preserveSession: destination === 'carry' }
      : { source: destination, keymap: km('B'), layout: board().layout }

    await editor.selectKeyboard(target)

    expect(editor.currentDraftIdentity()).toEqual(identity)
    expect(editor.githubMeta).toEqual(meta)
    expect(JSON.stringify(editor.draftKeymap)).toBe(live)
    expect(editor._storedLayerOperation()).toEqual(layer)
    expect(JSON.stringify(editor.undoStack)).toBe(history)
    expect(editor.hasPendingFirmwareRecovery).toBe(true)
    expect(await loadStoredDraft(identity)).toEqual(stored)
    await deleteStoredDraft(identity)
  })

  it('retains live edits made after declined recovery while destination storage is being read', async () => {
    await editor.selectKeyboard(board())
    editor.updateKeymap(km('Z'))
    await editor.flushPendingPersist()
    const identity = editor.currentDraftIdentity()!
    const stored = await loadStoredDraft(identity)
    editor.resetForTests()
    vi.mocked(window.confirm).mockReturnValue(false)
    await editor.selectKeyboard(board())
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    const load = hostStorage.loadGithubHostCache
    vi.spyOn(hostStorage, 'loadGithubHostCache').mockImplementation(async key => {
      if (key.includes('b.keymap')) await held
      return load(key)
    })
    const transition = editor.selectKeyboard(board('config/b.keymap'))
    await vi.waitFor(() => expect(hostStorage.loadGithubHostCache).toHaveBeenCalledWith(expect.stringContaining('b.keymap')))
    editor.draftKeymap = km('X')
    const live = JSON.stringify(editor.draftKeymap)
    release()
    await transition
    expect(editor.currentDraftIdentity()).toEqual(identity)
    expect(JSON.stringify(editor.draftKeymap)).toBe(live)
    expect(editor.hasPendingFirmwareRecovery).toBe(true)
    expect(await loadStoredDraft(identity)).toEqual(stored)
    await deleteStoredDraft(identity)
  })

  it.each([
    [true, 'draft'], [true, 'layer'], [true, 'head'], [true, 'baseline keymap'], [true, 'baseline layout'],
    [false, 'head'], [false, 'baseline keymap'], [false, 'baseline layout']
  ] as const)('refuses transition when competing writes replace exact firmware recovery (pending=%s, %s)', async (pending, changed) => {
    await editor.selectKeyboard(board())
    editor.layerOperationSnapshot = { ...editor.layerOperationSnapshot!, identityAware: true }
    editor.updateKeymap(km('Z'))
    await editor.flushPendingPersist()
    const identity = editor.currentDraftIdentity()!
    const expected = (await loadStoredDraft(identity))!
    if (pending) {
      editor.resetForTests()
      vi.mocked(window.confirm).mockReturnValue(false)
      await editor.selectKeyboard(board())
      expect(editor.hasPendingFirmwareRecovery).toBe(true)
    }
    const live = JSON.stringify(editor.draftKeymap)
    const meta = { ...editor.githubMeta }
    let release!: () => void
    editor._draftWrites = new Promise<void>(resolve => { release = resolve })
    const transition = editor.selectKeyboard(board('config/b.keymap'))
    const competing = structuredClone(expected)
    if (changed === 'draft') competing.draftKeymap = km('X')
    if (changed === 'layer') competing.layerOperation!.view.layer0Raw = !competing.layerOperation!.view.layer0Raw
    if (changed === 'head') competing.githubBaseline!.headSha = 'another-head'
    if (changed === 'baseline keymap') competing.githubBaseline!.keymap = km('B')
    if (changed === 'baseline layout') competing.githubBaseline!.layout[0].x = 9
    await draftStorage.saveStoredDraft(identity, competing.draftKeymap, competing.layerOperation, competing.githubBaseline)
    const stored = await loadStoredDraft(identity)
    release()
    await transition
    expect(editor.currentDraftIdentity()).toEqual(identity)
    expect(editor.githubMeta).toEqual(meta)
    expect(JSON.stringify(editor.draftKeymap)).toBe(live)
    expect(editor.hasPendingFirmwareRecovery).toBe(pending)
    expect(await loadStoredDraft(identity)).toEqual(stored)
    expect(editor.saveNotice?.messages).toContain('Could not verify local recovery. The current selection and unpublished work were retained.')
    await deleteStoredDraft(identity)
  })

  it.each([false, true])('allows transition only with unchanged exact firmware recovery (pending=%s)', async pending => {
    await editor.selectKeyboard(board())
    editor.updateKeymap(km('Z'))
    await editor.flushPendingPersist()
    const identity = editor.currentDraftIdentity()!
    const expected = await loadStoredDraft(identity)
    if (pending) {
      editor.resetForTests()
      vi.mocked(window.confirm).mockReturnValue(false)
      await editor.selectKeyboard(board())
    }
    expect(await editor.retainWorkForTransition()).toBe(true)
    expect(await loadStoredDraft(identity)).toEqual(expected)
  })

  it('rechecks firmware provenance after awaiting host retention', async () => {
    await editor.selectKeyboard(board())
    editor.updateKeymap(km('Z'))
    await editor.flushPendingPersist()
    editor.hostLegend = addHostLanguage(editor.hostLegend, 'de')
    expect(editor.hasLocalHostRecovery).toBe(true)
    const identity = editor.currentDraftIdentity()!
    const expected = (await loadStoredDraft(identity))!
    const persistHost = editor._persistGithubHostCache.bind(editor)
    vi.spyOn(editor, '_persistGithubHostCache').mockImplementation(async () => {
      await persistHost()
      await draftStorage.saveStoredDraft(identity, expected.draftKeymap, expected.layerOperation, { ...expected.githubBaseline!, headSha: 'competing-head' })
    })
    expect(await editor.retainWorkForTransition()).toBe(false)
    expect(editor.currentDraftIdentity()).toEqual(identity)
    expect(editor.githubMeta?.headSha).toBe('s')
    expect((await loadStoredDraft(identity))?.githubBaseline?.headSha).toBe('competing-head')
  })

  it('does not let a stale host load clear the newer file omission state', async () => {
    await editor.selectKeyboard(board())
    const snapshot = editor.buildCurrentHostKeymapSnapshot()!
    editor.resetForTests()
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    const load = hostStorage.loadHostAssemblies
    vi.spyOn(hostStorage, 'loadHostAssemblies').mockImplementation(async key => {
      if (key.includes('a.keymap')) await held
      return load(key)
    })
    const old = editor.selectKeyboard({ ...board(), hostSnapshot: snapshot })
    await vi.waitFor(() => expect(hostStorage.loadHostAssemblies).toHaveBeenCalled())
    await editor.selectKeyboard({ ...board('config/b.keymap', 't'), hostSnapshotError: 'invalid' })
    const before = editor._hostRepoBaselineSha
    release()
    await old
    expect(editor.githubMeta?.keymapPath).toBe('config/b.keymap')
    expect(editor.buildCurrentHostKeymapSnapshot()).toBeNull()
    expect(editor._hostRepoBaselineSha).toBe(before)
  })

  it('does not retarget an omitted-host carry when destination host-origin persistence fails', async () => {
    await editor.selectKeyboard({ ...board(), hostSnapshotError: 'invalid' })
    editor.updateKeymap(km('Z'))
    await editor.flushPendingPersist()
    const identity = editor.currentDraftIdentity()!
    const before = await loadStoredDraft(identity)
    const save = hostStorage.saveGithubHostCache
    vi.spyOn(hostStorage, 'saveGithubHostCache').mockImplementation((key, ...args) => key.includes('copied') ? Promise.reject(new Error('quota')) : save(key, ...args))
    await editor.selectKeyboard({ ...board(), github: { ...board().github, branch: 'copied' }, hostSnapshotError: 'invalid', preserveSession: true })
    expect(editor.githubMeta?.branch).toBe('main')
    expect(editor.draftKeymap).toEqual(km('Z'))
    expect(await loadStoredDraft(identity)).toEqual(before)
    expect(editor.saveNotice?.kind).toBe('error')
    await deleteStoredDraft({ ...identity, branch: 'copied' })
  })

  it('keeps selected firmware recovery with missing provenance unattached and protected', async () => {
    const identity = draftStorage.buildDraftIdentity({ source: 'github', repo: board().github.repository, branch: 'main', keymapPath: 'config/a.keymap', keyboard: 'same' })!
    await draftStorage.saveStoredDraft(identity, km('Z'))
    const before = await loadStoredDraft(identity)
    await editor.selectKeyboard(board())
    expect(editor.draftKeymap).toEqual(km('A'))
    expect(editor.hasPendingFirmwareRecovery).toBe(true)
    await editor.flushPendingPersist()
    expect(await loadStoredDraft(identity)).toEqual(before)
  })

  it('keeps clean same-identity Reload host state synchronized with its new remote baseline', async () => {
    await editor.selectKeyboard(board())
    const first = editor.buildCurrentHostKeymapSnapshot()!
    const second = { ...first, view: addHostLanguage(first.view, 'de') }
    await editor.selectKeyboard({ ...board(), hostSnapshot: first })
    await editor.selectKeyboard({ ...board('config/a.keymap', 't'), hostSnapshot: second })
    expect(editor.hostLegend.columns.map(c => c.language)).toEqual(['en', 'de'])
    expect(editor.hasLocalHostRecovery).toBe(false)
    expect(editor.githubMeta?.headSha).toBe('t')
  })

  it.each([false, true])('preserves another tab firmware recovery when this tab flushes (dirty=%s)', async dirty => {
    await editor.selectKeyboard(board())
    const identity = editor.currentDraftIdentity()!
    await draftStorage.saveStoredDraft(identity, km('X'))
    const other = await loadStoredDraft(identity)
    if (dirty) editor.updateKeymap(km('Z'))
    await editor.flushPendingPersist()
    expect(await loadStoredDraft(identity)).toEqual(other)
    expect(editor.saveNotice?.kind).toBe('error')
  })

  it('does not replace the active identity when destination host storage cannot be read', async () => {
    await editor.selectKeyboard(board())
    editor.updateKeymap(km('Z'))
    await editor.flushPendingPersist()
    const identity = editor.currentDraftIdentity()!
    const before = await loadStoredDraft(identity)
    vi.spyOn(hostStorage, 'loadGithubHostCache').mockRejectedValue(new Error('unavailable'))
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2030-01-01T00:00:00Z'))
    await editor.selectKeyboard(board('config/b.keymap'))
    vi.useRealTimers()
    expect(editor.currentDraftIdentity()).toEqual(identity)
    expect(editor.draftKeymap).toEqual(km('Z'))
    expect(await loadStoredDraft(identity)).toEqual(before)
    expect(editor.saveNotice?.kind).toBe('error')
  })

  it('does not carry a stale firmware revision or overwrite destination recovery from another tab', async () => {
    await editor.selectKeyboard({ ...board(), hostSnapshotError: 'invalid' })
    editor.updateKeymap(km('Z'))
    await editor.flushPendingPersist()
    const original = editor.currentDraftIdentity()!
    const destination = { ...original, branch: 'copied' }
    const load = draftStorage.loadStoredDraft
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    vi.spyOn(draftStorage, 'loadStoredDraft').mockImplementation(async identity => {
      const row = await load(identity)
      if (identity.branch === 'copied') await held
      return row
    })
    const carry = editor.selectKeyboard({ ...board(), github: { ...board().github, branch: 'copied' }, hostSnapshotError: 'invalid', preserveSession: true })
    await vi.waitFor(() => expect(draftStorage.loadStoredDraft).toHaveBeenCalledWith(destination))
    await draftStorage.saveStoredDraft(destination, km('X'))
    editor.updateKeymap(km('Y'))
    release()
    await carry
    expect(editor.githubMeta?.branch).toBe('main')
    expect(editor.draftKeymap).toEqual(km('Y'))
    expect((await load(destination))?.draftKeymap).toEqual(km('X'))
    await deleteStoredDraft(destination)
  })

  it('does not let a stale carry failure change the newer selection notice', async () => {
    await editor.selectKeyboard(board())
    editor.updateKeymap(km('Z'))
    await editor.flushPendingPersist()
    const load = draftStorage.loadStoredDraft
    let reject!: (error: Error) => void
    const held = new Promise<never>((_, fail) => { reject = fail })
    vi.spyOn(draftStorage, 'loadStoredDraft').mockImplementation(identity => identity.branch === 'copied' ? held : load(identity))
    const carry = editor.selectKeyboard({ ...board(), github: { ...board().github, branch: 'copied' }, preserveSession: true })
    await vi.waitFor(() => expect(draftStorage.loadStoredDraft).toHaveBeenCalledWith(expect.objectContaining({ branch: 'copied' })))
    await editor.selectKeyboard(board('config/b.keymap'))
    const notice = editor.saveNotice
    reject(new Error('late failure'))
    await carry
    expect(editor.githubMeta?.keymapPath).toBe('config/b.keymap')
    expect(editor.saveNotice).toEqual(notice)
  })

  it('refuses stale host-cache writes at the storage transaction boundary', async () => {
    await editor.selectKeyboard(board())
    const key = draftStorage.draftIdentityKey(editor.currentDraftIdentity()!)
    const cached = (await loadGithubHostCache(key))!
    await saveGithubHostCache(key, { ...cached, headSha: 'newer' }, cached.revision)
    await expect(saveGithubHostCache(key, cached, cached.revision)).rejects.toThrow(/another session/)
    expect((await loadGithubHostCache(key))?.headSha).toBe('newer')
  })

  it('keeps the original branch and draft when destination persistence fails', async () => {
    await editor.selectKeyboard({ ...board(), hostSnapshotError: 'invalid' })
    editor.updateKeymap(km('Z'))
    await editor.flushPendingPersist()
    const identity = editor.currentDraftIdentity()!
    const stored = await loadStoredDraft(identity)
    const save = draftStorage.saveStoredDraft
    vi.spyOn(draftStorage, 'saveStoredDraft').mockImplementation((id, ...rest) => id.branch === 'copied' ? Promise.reject(new Error('quota')) : save(id, ...rest))
    await editor.selectKeyboard({ ...board(), github: { ...board().github, branch: 'copied' }, hostSnapshotError: 'invalid', preserveSession: true })
    expect(editor.githubMeta?.branch).toBe('main')
    expect(editor.draftKeymap).toEqual(km('Z'))
    expect(await loadStoredDraft(identity)).toEqual(stored)
    expect(editor.saveNotice?.kind).toBe('error')
  })

  it('carries compatible host work without clearing either source recovery half', async () => {
    await editor.selectKeyboard(board())
    const baseline = editor.buildCurrentHostKeymapSnapshot()!
    editor.acceptHostRepoBaseline()
    await editor._hostCacheWrites
    editor.hostLegend = addHostLanguage(editor.hostLegend, 'de')
    await editor._persistHostLegend()
    editor.updateKeymap(km('Z'))
    await editor.flushPendingPersist()
    const identity = editor.currentDraftIdentity()!
    const before = await loadStoredDraft(identity)
    const host = editor._encodeLiveHostSnapshot()
    await editor.selectKeyboard({ ...board(), github: { ...board().github, branch: 'copied' }, hostSnapshot: baseline, preserveSession: true })
    expect(editor.githubMeta?.branch).toBe('copied')
    expect(editor._encodeLiveHostSnapshot()).toBe(host)
    expect(editor.isHostRepoDirty).toBe(true)
    expect(await loadStoredDraft(identity)).toEqual(before)
    await deleteStoredDraft(identity)
  })

  it('carries omitted-host firmware to a copied branch without deleting source recovery or copying its historical host origin', async () => {
    await editor.selectKeyboard(board())
    editor.hostLegend = addHostLanguage(editor.hostLegend, 'de')
    editor.acceptHostRepoBaseline()
    await editor._hostCacheWrites
    editor.noteHostSnapshotLoad('invalid')
    editor.updateKeymap(km('Z'))
    await editor.flushPendingPersist()
    const sourceIdentity = editor.currentDraftIdentity()!
    const before = await loadStoredDraft(sourceIdentity)
    await editor.selectKeyboard({ ...board(), github: { ...board().github, branch: 'copied' }, hostSnapshotError: 'invalid', preserveSession: true })
    expect(editor.githubMeta?.branch).toBe('copied')
    expect(editor.draftKeymap).toEqual(km('Z'))
    expect(await loadStoredDraft(sourceIdentity)).toEqual(before)
    expect((await loadStoredDraft(editor.currentDraftIdentity()!))?.draftKeymap).toEqual(km('Z'))
    expect(editor.hostLegend.columns.map(c => c.language)).toEqual(['en'])
    expect(editor.hasLocalHostRecovery).toBe(false)
    await deleteStoredDraft(sourceIdentity)
  })

  it('keeps declined GitHub recovery and its original baseline across changed-head reopen', async () => {
    await editor.selectKeyboard(board())
    editor.updateKeymap(km('Z'))
    await editor.flushPendingPersist()
    const identity = editor.currentDraftIdentity()!
    const stored = await loadStoredDraft(identity)
    editor.resetForTests()
    vi.mocked(window.confirm).mockReturnValue(false)
    await editor.selectKeyboard({ ...board('config/a.keymap', 't'), keymap: km('B') })
    await editor.flushPendingPersist()
    expect(await loadStoredDraft(identity)).toEqual(stored)
    expect(editor.hasPendingFirmwareRecovery).toBe(true)
    expect(editor.githubMeta?.headSha).toBe('s')
    expect(editor.baselineKeymap).toEqual(km('A'))
    expect(editor.isPublishDirty).toBe(false)
  })

  it('refuses explicit branch carry into a different selected file', async () => {
    await editor.selectKeyboard(board())
    editor.updateKeymap(km('Z'))
    await editor.selectKeyboard({ ...board('config/b.keymap'), preserveSession: true })
    expect(editor.githubMeta?.keymapPath).toBe('config/a.keymap')
    expect(editor.draftKeymap).toEqual(km('Z'))
  })

  it('isolates same-named remote host tables without changing their wire IDs', async () => {
    const global = { id: 'user:shared', name: 'Saved global profile', language: 'en' as const, origin: { from: 'copy' as const, layoutId: 'system-us' }, updatedAt: 1, layout: hostLayout('system-us')! }
    await hostStorage.saveUserHostLayout(global)
    editor._registerUserLayout(global)
    const storedGlobal = (await hostStorage.loadUserHostLayouts()).find(row => row.id === global.id)
    const host = (glyph: string) => ({ version: 1 as const, view: { columns: [{ language: 'en' as const, layoutId: 'user:shared', visible: true, altGr: true, altGrShift: true }], open: null }, layouts: [{ id: 'user:shared', name: 'shared', language: 'en' as const, origin: { from: 'copy' as const, layoutId: 'system-us' }, keys: [{ zmk: 'A', keysyms: [glyph, 'A', 'NoSymbol', 'NoSymbol'] as [string,string,string,string], glyphs: [glyph, 'A', '', ''] as [string,string,string,string] }] }] })
    await editor.selectKeyboard({ ...board(), hostSnapshot: host('a') })
    const aId = editor.activeProfileId('en')
    const storedA = (await hostStorage.loadUserHostLayouts()).find(row => row.id === aId)
    expect(editor.buildCurrentHostKeymapSnapshot()?.layouts[0].id).toBe('user:shared')
    await editor.selectKeyboard({ ...board('config/b.keymap'), hostSnapshot: host('b') })
    const bId = editor.activeProfileId('en')
    expect(bId).not.toBe(aId)
    await editor.setHostKeyLevel('en', 'A', 0, 'z')
    expect(hostLayout(aId)).toBeUndefined()
    expect((await hostStorage.loadUserHostLayouts()).find(row => row.id === aId)).toEqual(storedA)
    expect(hostLayout(bId)?.byZmk.get('A')?.glyphs[0]).toBe('z')
    expect(hostLayout(global.id)?.byZmk.get('A')?.glyphs[0]).toBe('a')
    expect((await hostStorage.loadUserHostLayouts()).find(row => row.id === global.id)).toEqual(storedGlobal)
    editor.resetForTests()
    await editor.selectKeyboard({ ...board('config/b.keymap'), hostSnapshotError: 'invalid' })
    expect(editor.buildCurrentHostKeymapSnapshot()).toBeNull()
    expect(editor._encodeLiveHostSnapshot()).toContain('"z"')
    expect(editor.hasLocalHostRecovery).toBe(true)
  })

  it('retains a verified clean host origin on incompatible reopen and keeps omitted edits recoverable', async () => {
    await editor.selectKeyboard(board())
    editor.hostLegend = addHostLanguage(editor.hostLegend, 'de')
    const baseline = editor.buildCurrentHostKeymapSnapshot()!
    editor.resetForTests()
    await editor.selectKeyboard({ ...board(), hostSnapshot: baseline })
    const original = editor._encodeLiveHostSnapshot()
    editor.resetForTests()
    await editor.selectKeyboard({ ...board('config/a.keymap', 't'), hostSnapshotError: 'invalid' })
    expect(editor._encodeLiveHostSnapshot()).toBe(original)
    expect(editor.hasLocalHostRecovery).toBe(false)
    editor.hostLegend = addHostLanguage(editor.hostLegend, 'fr')
    await editor._persistHostLegend()
    const dirty = editor._encodeLiveHostSnapshot()
    editor.resetForTests()
    await editor.selectKeyboard({ ...board('config/a.keymap', 't'), hostSnapshotError: 'invalid' })
    expect(editor._encodeLiveHostSnapshot()).toBe(dirty)
    expect(editor.hasLocalHostRecovery).toBe(true)
    expect(editor._hostRepoBaselineEncoded).toBe(original)
  })

  it('cannot restore or accept publication from A into B with equal keyboard metadata', async () => {
    await editor.selectKeyboard(board())
    editor.updateKeymap(km('Z'))
    await editor.flushPendingPersist()
    const a = editor.currentDraftIdentity()!
    const generation = editor.beginPublish()
    const meta = editor.githubMeta
    await editor.selectKeyboard(board('config/b.keymap'))
    expect(editor.currentDraftIdentity()?.keymapPath).toBe('config/b.keymap')
    expect(editor.draftKeymap).toEqual(km('A'))
    expect(editor.isPublishCurrent(generation, 'github', meta)).toBe(false)
    expect((await loadStoredDraft(a))?.draftKeymap).toEqual(km('Z'))
    await deleteStoredDraft(a)
  })

  it('same-identity changed-head Reload preserves live firmware and its original publish base', async () => {
    await editor.selectKeyboard(board())
    editor.updateKeymap(km('Z'))
    await editor.flushPendingPersist()
    const before = await loadStoredDraft(editor.currentDraftIdentity()!)
    await editor.selectKeyboard({ ...board('config/a.keymap', 't'), keymap: km('B') })
    expect(editor.githubMeta?.headSha).toBe('s')
    expect(editor.draftKeymap).toEqual(km('Z'))
    expect(editor.baselineKeymap).toEqual(km('A'))
    expect(await loadStoredDraft(editor.currentDraftIdentity()!)).toEqual(before)
  })

  it.each(['invalid', 'unsupported_version', 'incompatible'] as const)('keeps browser-local host work across Reload and firmware-only publication for %s', async error => {
    await editor.selectKeyboard({ ...board(), hostSnapshotError: error })
    editor.hostLegend = addHostLanguage(editor.hostLegend, 'de')
    await editor._persistHostLegend()
    editor.updateKeymap(km('Z'))
    const live = editor._encodeLiveHostSnapshot()
    expect(editor.hasLocalHostRecovery).toBe(true)
    expect(editor.isHostRepoDirty).toBe(false)
    expect(editor.buildCurrentHostKeymapSnapshot()).toBeNull()
    await editor.selectKeyboard({ ...board(), hostSnapshotError: error })
    expect(editor._encodeLiveHostSnapshot()).toBe(live)
    expect(editor.draftKeymap).toEqual(km('Z'))
    await publishKeymap(editor, { write: async () => ({ hostWritesOmitted: true, hostSnapshotError: error }), reload: async () => ({ keymap: km('Z'), keymapPath: 'config/a.keymap', headSha: 't' }) })
    expect(editor.isDirty).toBe(false)
    expect(editor.hasLocalHostRecovery).toBe(true)
    expect(editor._encodeLiveHostSnapshot()).toBe(live)
    expect(editor.isPublishDirty).toBe(false)
    expect(editor.saveNotice?.messages.join(' ')).toMatch(/browser-local and unpublishable/)
    if (error !== 'unsupported_version') expect(editor.saveNotice?.messages.join(' ')).not.toMatch(/newer/)
  })

  it('does not accept a host baseline when the server omitted a supplied snapshot', async () => {
    await editor.selectKeyboard(board())
    editor.hostLegend = addHostLanguage(editor.hostLegend, 'de')
    editor.updateKeymap(km('Z'))
    const oldBaseline = editor._hostRepoBaselineEncoded
    await publishKeymap(editor, { write: async () => ({ hostWritesOmitted: true, hostSnapshotError: 'incompatible' }), reload: async () => ({ keymap: km('Z'), keymapPath: 'config/a.keymap', headSha: 't' }) })
    expect(editor._hostRepoBaselineEncoded).toBe(oldBaseline)
    expect(editor.hasLocalHostRecovery).toBe(true)
    expect(editor.buildCurrentHostKeymapSnapshot()).toBeNull()
  })

  it('retains established scoped mode and the new firmware base after omitted publication and reopen', async () => {
    await editor.selectKeyboard({ ...board(), github: { ...board().github, ownershipMode: 'scoped-new' }, hostSnapshotError: 'invalid' })
    editor.hostLegend = addHostLanguage(editor.hostLegend, 'de')
    await editor._persistHostLegend()
    editor.updateKeymap(km('Z'))
    await publishKeymap(editor, {
      write: async () => ({ hostWritesOmitted: true, hostSnapshotError: 'invalid' }),
      reload: async () => ({ keymap: km('Z'), keymapPath: 'config/a.keymap', headSha: 't', ownershipMode: 'scoped' as const })
    })
    expect(editor.githubMeta?.ownershipMode).toBe('scoped')
    await editor._hostCacheWrites
    await editor._draftWrites
    editor.resetForTests()
    await editor.selectKeyboard({ ...board('config/a.keymap', 't'), keymap: km('Z'), hostSnapshotError: 'invalid' })
    expect(editor.githubMeta?.headSha).toBe('t')
    expect(editor.hasLocalHostRecovery).toBe(true)
  })
})
