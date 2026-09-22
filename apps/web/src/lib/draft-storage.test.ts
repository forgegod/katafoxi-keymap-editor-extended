import { beforeEach, describe, expect, it } from 'vitest'
import type { ParsedKeymap } from '@keymap-editor/keymap-core'
import {
  buildDraftIdentity,
  deleteStoredDraft,
  draftIdentityKey,
  loadStoredDraft,
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
