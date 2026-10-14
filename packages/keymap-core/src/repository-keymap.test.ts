import { describe, expect, it } from 'vitest'
import * as contract from './repository-keymap.js'
import { parseHostKeymapSnapshot } from './host-keymap-snapshot.js'

describe('selected repository keymap contract', () => {
  it('requires host references to resolve within owned tables or the builtin catalog', () => {
    const parsed = parseHostKeymapSnapshot({ version: 1, layouts: [], view: { open: null, columns: [{ language: 'en', layoutId: 'system-us', visible: true, altGr: true, altGrShift: true }] } })
    if (!parsed.ok) throw new Error('invalid fixture')
    expect(contract.isOwnedHostSnapshotCompatible(parsed.snapshot)).toBe(true)
    parsed.snapshot.view.columns[0].layoutId = 'user:missing'
    expect(contract.isOwnedHostSnapshotCompatible(parsed.snapshot)).toBe(false)
    parsed.snapshot.view.columns[0].layoutId = 'system-unknown'
    expect(contract.isOwnedHostSnapshotCompatible(parsed.snapshot)).toBe(false)
    parsed.snapshot.view.columns[0].layoutId = 'system-de'
    expect(contract.isOwnedHostSnapshotCompatible(parsed.snapshot)).toBe(false)
  })

  it('preserves exact safe spelling and refuses unsafe path normalization', () => {
    expect(contract.isRepositoryKeymapPath('config/A board.keymap')).toBe(true)
    for (const path of ['config/../a.keymap', '/config/a.keymap', 'config/a/b.keymap', 'config/a.keymap.template', 'config/%61.keymap', 'config/a\\b.keymap', 'config/.keymap', 'config/a\0.keymap']) {
      expect(contract.isRepositoryKeymapPath(path), path).toBe(false)
    }
  })

  it('separates firmware cache and host roots from physical geometry', () => {
    expect(contract.repositoryKeymapPaths('config/a.keymap', 'scoped')).toEqual({
      firmwareJson: 'config/a.keymap.json', template: 'config/a.keymap.template',
      hostRoot: 'host_keymap/keymaps/a.keymap/', snapshot: 'host_keymap/keymaps/a.keymap/snapshot.json'
    })
    expect(contract.repositoryKeymapPaths('config/a.keymap', 'legacy').firmwareJson).toBe('config/keymap.json')
    expect(() => contract.repositoryKeymapPaths('config/../a.keymap', 'scoped')).toThrow()
  })
})
