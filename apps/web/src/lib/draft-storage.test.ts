import { beforeEach, describe, expect, it } from 'vitest'
import type { ParsedKeymap } from '@keymap-editor/keymap-core'
import {
  buildDraftIdentity,
  deleteStoredDraft,
  draftIdentityKey,
  loadStoredDraft,
  listStoredFilesystemDrafts,
  saveStoredDraft
} from './draft-storage'

function tinyKeymap(code: string): ParsedKeymap {
  return {
    keyboard: 'lark',
    layer_names: ['default'],
    layers: [[{ value: '&kp', params: [{ value: code, params: [] }] }]]
  }
}

describe('draft-storage', () => {
  it('lists disconnected filesystem recovery without mixing other source identities', async () => {
    const identity = buildDraftIdentity({ source: 'filesystem', filesystemDocumentId: `fs:1:${crypto.randomUUID()}` })!
    const other = buildDraftIdentity({ source: 'clipboard', keyboard: 'recovery-list' })!
    const baseline = { route: { kind: 'file' as const }, bytes: [65], source: 'A', keymap: tinyKeymap('A'), layout: [{ x: 0, y: 0, row: 0, col: 0 }] }
    await saveStoredDraft(identity, tinyKeymap('B'), undefined, undefined, { expected: null, isCurrent: () => true }, { version: 1, baseline })
    await saveStoredDraft(other, tinyKeymap('C'))
    const before = await loadStoredDraft(identity)
    const rows = await listStoredFilesystemDrafts()
    expect(rows.find(row => row.id === before!.id)).toEqual(before)
    expect(rows.every(row => row.source === 'filesystem' && row.schemaVersion === 3)).toBe(true)
    expect(await loadStoredDraft(identity)).toEqual(before)
  })

  it('isolates selected GitHub files with equal keyboard metadata from each other and legacy rows', async () => {
    const input = { source: 'github', repo: 'acme/boards', branch: 'main', keyboard: 'same' }
    const legacy = buildDraftIdentity(input)!
    const a = buildDraftIdentity({ ...input, keymapPath: 'config/a.keymap' })!
    const b = buildDraftIdentity({ ...input, keymapPath: 'config/b.keymap' })!
    await saveStoredDraft(legacy, tinyKeymap('L'))
    await saveStoredDraft(a, tinyKeymap('A'))
    expect(await loadStoredDraft(b)).toBeNull()
    expect((await loadStoredDraft(a))?.draftKeymap).toEqual(tinyKeymap('A'))
    expect((await loadStoredDraft(legacy))?.draftKeymap).toEqual(tinyKeymap('L'))
    expect(a.schemaVersion).toBe(2)
    expect(draftIdentityKey(a)).not.toBe(draftIdentityKey(b))
    expect(buildDraftIdentity({ ...input, keymapPath: '../bad.keymap' })).toBeNull()
  })

  const identity = buildDraftIdentity({
    source: 'local',
    keyboard: 'lark'
  })!

  beforeEach(async () => {
    await deleteStoredDraft(identity)
  })

  it('round-trips a draft for a matching identity', async () => {
    const draft = tinyKeymap('M')
    await saveStoredDraft(identity, draft)

    const loaded = await loadStoredDraft(identity)
    expect(loaded).not.toBeNull()
    expect(loaded!.id).toBe(draftIdentityKey(identity))
    expect(loaded!.draftKeymap.layers[0][0].params[0].value).toBe('M')
  })

  it('does not return a draft for a different keyboard identity', async () => {
    await saveStoredDraft(identity, tinyKeymap('M'))
    const other = buildDraftIdentity({
      source: 'local',
      keyboard: 'other-board'
    })!
    expect(await loadStoredDraft(other)).toBeNull()
  })

  it('delete removes the stored draft', async () => {
    await saveStoredDraft(identity, tinyKeymap('M'))
    await deleteStoredDraft(identity)
    expect(await loadStoredDraft(identity)).toBeNull()
  })
})
