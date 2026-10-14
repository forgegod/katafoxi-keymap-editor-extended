import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { addHostLanguage, parseKeymap, hostLayout } from '@keymap-editor/keymap-core'
import { editor } from './editor.svelte.js'
import { loadStoredDraft, deleteStoredDraft } from './draft-storage'
import { clearHostLayoutStore, loadGithubHostCache, saveGithubHostCache } from './host-layout-store'
import * as draftStorage from './draft-storage'
import * as hostStorage from './host-layout-store'
import { publishKeymap } from './publish-keymap'
import type { GithubKeyboardSelection } from './editor/types'

const km = (code: string) => parseKeymap({ keyboard: 'same', layer_names: ['base'], layers: [[`&kp ${code}`]] })
const board = (path = 'config/a.keymap', headSha = 's'): GithubKeyboardSelection => ({
  source: 'github', github: { repository: 'acme/scoped', branch: 'main', keymapPath: path, headSha },
  layout: [{ x: 0, y: 0, row: 0, col: 0 }], keymap: km('A')
})
beforeEach(async () => { editor.resetForTests(); await clearHostLayoutStore(); vi.spyOn(window, 'confirm').mockReturnValue(true) })
afterEach(async () => { const id = editor.currentDraftIdentity(); editor.resetForTests(); if (id) await deleteStoredDraft(id); vi.restoreAllMocks() })

describe('selected GitHub editor identity', () => {
  it('does not let a stale host load clear the newer file omission state', async () => {
    await editor.selectKeyboard(board())
    const snapshot = editor.buildCurrentHostKeymapSnapshot()!
    editor.resetForTests()
    let release!: () => void
    const held = new Promise<void>(resolve => { release = resolve })
    const save = hostStorage.saveHostLegendView
    vi.spyOn(hostStorage, 'saveHostLegendView').mockImplementation(async (view, key) => {
      if (key?.includes('a.keymap')) await held
      return save(view, key)
    })
    const old = editor.selectKeyboard({ ...board(), hostSnapshot: snapshot })
    await vi.waitFor(() => expect(hostStorage.saveHostLegendView).toHaveBeenCalled())
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
    await editor.selectKeyboard(board('config/b.keymap'))
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
    expect(editor.buildCurrentHostKeymapSnapshot()?.layouts[0].id).toBe('user:shared')
    await editor.selectKeyboard({ ...board('config/b.keymap'), hostSnapshot: host('b') })
    const bId = editor.activeProfileId('en')
    expect(bId).not.toBe(aId)
    await editor.setHostKeyLevel('en', 'A', 0, 'z')
    expect(hostLayout(aId)?.byZmk.get('A')?.glyphs[0]).toBe('a')
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
