import { afterEach, describe, expect, it, vi } from 'vitest'
import { encodeHostKeymapSnapshot, parseHostKeymapSnapshot, parseKeymap, REPOSITORY_KEYMAP_MODE_CONTENT, REPOSITORY_KEYMAP_MODE_PATH } from '@keymap-editor/keymap-core'
import * as api from './api.js'
import * as auth from './auth.js'
import * as files from './files.js'

const repo = 'acme/boards'
const sha = 'head-s'
const a = 'config/a.keymap'
const b = 'config/b.keymap'
const source = (keys: string) => `#define KEEP_ME 1\n/ { keymap { compatible = "zmk,keymap"; base { bindings = < ${keys} >; }; }; };\n`
const layout = [{ x: 0, y: 0, row: 0, col: 0 }, { x: 1, y: 0, row: 0, col: 1 }]
const snapshot = { version: 1, view: { columns: [{ language: 'en', layoutId: 'system-us', visible: true, altGr: true, altGrShift: true }], open: null }, layouts: [] }
const baseBlobs = () => ({
  [a]: source('&kp A'), [b]: source('&kp B &kp C'),
  'config/a.json': JSON.stringify({ layouts: { LAYOUT: { layout: layout.slice(0, 1) } } }),
  'config/b.json': JSON.stringify({ layouts: { LAYOUT: { layout } } }),
  'config/keymap.json': JSON.stringify({ layers: [['&kp Z']] }),
  [REPOSITORY_KEYMAP_MODE_PATH]: REPOSITORY_KEYMAP_MODE_CONTENT,
  'host_keymap/snapshot.json': 'legacy host sentinel',
  'README.md': 'unrelated'
})
function fixture(blobs: Record<string, string> = baseBlobs(), treeOverride?: unknown) {
  vi.spyOn(auth, 'createInstallationToken').mockResolvedValue({ data: { token: 'synthetic' } } as never)
  const writes: Array<{ path: string; content: string }> = []
  let head = sha
  let pending: typeof writes = []
  const request = vi.spyOn(api, 'request').mockImplementation(async options => {
    const o = typeof options === 'string' ? { url: options } : options
    const method = o.method ?? 'GET'
    if (method !== 'GET') {
      if (o.url.endsWith('/git/trees')) {
        pending = (o.data as { tree: typeof writes }).tree
        writes.push(...pending)
      }
      if (method === 'PATCH') {
        for (const file of pending) blobs[file.path] = file.content
        head = 'new-sha'
      }
      return { data: { sha: 'new-sha' }, headers: {}, status: 200 }
    }
    let data: unknown
    if (o.url.endsWith('/commits/main')) data = { sha: head, commit: { tree: { sha: 'tree-s' } } }
    else if (o.url.endsWith('/git/trees/tree-s')) data = treeOverride ?? { truncated: false, tree: Object.keys(blobs).map(path => ({ path, type: 'blob', mode: '100644' })) }
    else {
      const path = decodeURIComponent(o.url.split('/contents/')[1] ?? '')
      expect(o.params?.ref).toBe(head)
      if (path === 'config') data = Object.keys(blobs).filter(p => /^config\/[^/]+$/.test(p)).map(path => ({ path, name: path.slice(7), type: 'file' }))
      else if (path in blobs) data = blobs[path]
      else throw Object.assign(new Error('not found'), { response: { status: 404 } })
    }
    return { data, headers: {}, status: 200 }
  })
  return { blobs, request, writes }
}
const edited = () => parseKeymap({ layers: [['&kp B', '&kp D']] })
const choice = (input: 'legacy' | 'dts' = 'dts') => ({ repository: repo, branch: 'main', keymapPath: b, headSha: sha, input })
const save = (selection: object = { keymapPath: b }, host: unknown = null, deliverables: unknown = null) =>
  files.commitChanges('1', repo, 'main', layout, edited(), host as never, deliverables as never, sha, selection)

afterEach(() => vi.restoreAllMocks())

describe('selected keymap ownership', () => {
  it.each(['POST trees', 'POST commits', 'PATCH refs'])('leaves selected and unrelated remote blobs intact after %s failure', async failure => {
    const f = fixture()
    const before = { ...f.blobs }
    const request = f.request.getMockImplementation()!
    f.request.mockImplementation(async options => {
      const o = typeof options === 'string' ? { url: options } : options
      if ((failure === 'POST trees' && o.method === 'POST' && o.url.endsWith('/git/trees')) ||
          (failure === 'POST commits' && o.method === 'POST' && o.url.endsWith('/git/commits')) ||
          (failure === 'PATCH refs' && o.method === 'PATCH')) throw new Error('synthetic write failure')
      return request(options)
    })
    await expect(save({ keymapPath: b, jsonChoice: choice() }, snapshot)).rejects.toThrow('synthetic write failure')
    expect(f.blobs).toEqual(before)
  })

  it('validates explicit legacy JSON adoption without following a symlink', async () => {
    const blobs = baseBlobs()
    const tree = Object.keys(blobs).map(path => ({ path, type: 'blob', mode: path === 'config/keymap.json' ? '120000' : '100644' }))
    const f = fixture(blobs, { truncated: false, tree })
    await expect(files.fetchKeyboardFiles('1', repo, 'main', { keymapPath: b, jsonSource: 'legacy' })).rejects.toThrow()
    expect(f.request.mock.calls.some(([o]) => typeof o !== 'string' && o.url.endsWith('/contents/config/keymap.json'))).toBe(false)
  })

  it('verifies B by readback while every unrelated blob remains byte-identical', async () => {
    const f = fixture()
    const before = { ...f.blobs }
    await save({ keymapPath: b, jsonChoice: choice() }, snapshot)
    const reloaded = await files.fetchKeyboardFiles('1', repo, 'main', { keymapPath: b, expectedMode: 'scoped' })
    expect(reloaded.keymap).toMatchObject({ layers: [['&kp B', '&kp D']] })
    expect(reloaded.headSha).toBe('new-sha')
    for (const [path, content] of Object.entries(before)) if (path !== b) expect(f.blobs[path], path).toBe(content)
    expect(Object.keys(f.blobs).filter(path => !(path in before))).toEqual([`${b}.json`])
  })

  it('never treats a listed but unreadable owned host snapshot as missing', async () => {
    const hostPath = 'host_keymap/keymaps/b.keymap/snapshot.json'
    const f = fixture({ ...baseBlobs(), [hostPath]: JSON.stringify(snapshot) })
    const request = f.request.getMockImplementation()!
    f.request.mockImplementation(async options => {
      const o = typeof options === 'string' ? { url: options } : options
      if (decodeURIComponent(o.url).endsWith(`/contents/${hostPath}`)) throw Object.assign(new Error('not found'), { response: { status: 404 } })
      return request(options)
    })
    await expect(save({ keymapPath: b, jsonChoice: choice() }, snapshot)).rejects.toThrow()
    expect(f.writes).toEqual([])
  })

  it.each(['config/../b.keymap', '/config/b.keymap', 'config/%62.keymap', 'config/b.keymap.template', 'config/nested/b.keymap', 'config/absent.keymap'])('refuses unsafe or vanished selection %s without fallback', async keymapPath => {
    const f = fixture()
    await expect(files.fetchKeyboardFiles('1', repo, 'main', { keymapPath })).rejects.toThrow()
    await expect(save({ keymapPath, jsonChoice: choice() })).rejects.toThrow()
    expect(f.writes).toEqual([])
  })

  it('lists all eligible files, refuses ambiguity, and never follows symlinks', async () => {
    const blobs = baseBlobs()
    const tree = Object.keys(blobs).map(path => ({ path, type: 'blob', mode: path === a ? '120000' : '100644' }))
    const f = fixture(blobs, { truncated: false, tree })
    expect((await files.fetchKeymapInventory('1', repo, 'main')).candidates).toEqual([{ name: 'b.keymap', path: b }])
    await expect(save({ keymapPath: a })).rejects.toThrow()
    expect(f.writes).toEqual([])
    vi.restoreAllMocks()
    fixture()
    await expect(files.fetchKeyboardFiles('1', repo, 'main')).rejects.toThrow('Select a keymap file')
  })

  it.each(['invalid', 'missing', 'truncated', 'conflicting-type'])('refuses unknown mode %s before any mutation', async kind => {
    const blobs: Record<string, string> = baseBlobs()
    if (kind === 'invalid') blobs[REPOSITORY_KEYMAP_MODE_PATH] = '{}'
    if (kind === 'missing') { delete blobs[REPOSITORY_KEYMAP_MODE_PATH]; blobs[`${b}.json`] = '{"layers":[["&kp B","&kp C"]]}' }
    const tree = Object.keys(blobs).map(path => ({ path, type: 'blob', mode: kind === 'conflicting-type' && path === REPOSITORY_KEYMAP_MODE_PATH ? '120000' : '100644' }))
    const f = fixture(blobs, { truncated: kind === 'truncated', tree })
    await expect(save({ keymapPath: b, jsonChoice: choice() })).rejects.toThrow()
    expect(f.request.mock.calls.some(([o]) => typeof o !== 'string' && o.method === 'POST')).toBe(false)
  })

  it('keeps scoped mode after all scoped data and the other candidate disappear', async () => {
    const blobs: Record<string, string> = baseBlobs()
    delete blobs[a]
    const f = fixture(blobs)
    const loaded = await files.fetchKeyboardFiles('1', repo, 'main', { keymapPath: b })
    expect(loaded).toMatchObject({ ownershipMode: 'scoped', jsonChoiceRequired: true })
    await expect(save()).rejects.toThrow(/choice/i)
    await save({ keymapPath: b, jsonChoice: choice() })
    expect(f.writes.map(w => w.path)).toEqual([b, `${b}.json`])
  })

  it('establishes the marker only with the authorized first scoped write', async () => {
    const blobs: Record<string, string> = baseBlobs()
    delete blobs[REPOSITORY_KEYMAP_MODE_PATH]
    const f = fixture(blobs)
    expect((await files.fetchKeyboardFiles('1', repo, 'main', { keymapPath: b })).ownershipMode).toBe('scoped-new')
    await expect(save()).rejects.toThrow(/choice/i)
    expect(f.writes).toEqual([])
    await save({ keymapPath: b, jsonChoice: choice() })
    expect(f.writes.map(w => w.path)).toEqual([b, `${b}.json`, REPOSITORY_KEYMAP_MODE_PATH])
    expect(f.writes[2].content).toBe(REPOSITORY_KEYMAP_MODE_CONTENT)
  })

  it('preserves legacy primary JSON and paths without scoped consent or marker', async () => {
    const blobs: Record<string, string> = baseBlobs()
    delete blobs[a]; delete blobs[REPOSITORY_KEYMAP_MODE_PATH]
    blobs['config/keymap.json'] = JSON.stringify({ layers: [['&kp X', '&kp Y']], holdTaps: [], sensorBindings: [] })
    blobs['host_keymap/snapshot.json'] = JSON.stringify(snapshot)
    const f = fixture(blobs)
    const loaded = await files.fetchKeyboardFiles('1', repo, 'main')
    expect(loaded).toMatchObject({ ownershipMode: 'legacy', jsonChoiceRequired: false, keymap: { layers: [['&kp X', '&kp Y']] } })
    await save({ keymapPath: b }, snapshot)
    expect(f.writes.map(w => w.path)).toEqual([b, 'config/keymap.json', 'host_keymap/snapshot.json'])
  })

  it.each([{ keymapPath: a }, { headSha: 'old-head' }, { branch: 'other' }, { repository: 'other/repo' }])('refuses stale or cross-identity consent %s', async mismatch => {
    const f = fixture()
    await expect(save({ keymapPath: b, jsonChoice: { ...choice(), ...mismatch } })).rejects.toThrow(/choice/i)
    expect(f.writes).toEqual([])
  })

  it('uses only the matching template and owned primary JSON', async () => {
    const template = (label: string) => `/* ${label} */\n/ { keymap { compatible = "zmk,keymap";\n{{rendered_layers}}\n}; };`
    const f = fixture({ ...baseBlobs(), [`${a}.template`]: template('A ONLY'), [`${b}.template`]: template('B ONLY'), [`${b}.json`]: JSON.stringify({ layers: [['&kp X', '&kp Y']], holdTaps: [], sensorBindings: [] }) })
    expect((await files.fetchKeyboardFiles('1', repo, 'main', { keymapPath: b })).keymap).toMatchObject({ layers: [['&kp X', '&kp Y']] })
    await save()
    expect(f.writes[0].content).toContain('B ONLY')
    expect(f.writes[0].content).not.toContain('A ONLY')
  })

  it.each(['not json', '', '{"version":99}', JSON.stringify({ ...snapshot, view: { ...snapshot.view, columns: [{ ...snapshot.view.columns[0], layoutId: 'user:missing' }] } })])('omits every host path for incompatible remote snapshot %s', async remote => {
    const f = fixture({ ...baseBlobs(), 'host_keymap/keymaps/b.keymap/snapshot.json': remote })
    const loaded = await files.fetchKeyboardFiles('1', repo, 'main', { keymapPath: b })
    expect(loaded.hostSnapshotError).toBe(remote.includes('99') ? 'unsupported_version' : remote.includes('user:missing') ? 'incompatible' : 'invalid')
    const result = await save({ keymapPath: b, jsonChoice: choice() }, snapshot, [{ path: 'host_keymap/linux/en.xkb', content: 'no' }])
    expect(result.hostWritesOmitted).toBe(true)
    expect(f.writes.map(w => w.path)).toEqual([b, `${b}.json`])
  })

  it.each(['legacy', 'dts'] as const)('publishes owned compatible host in the same commit after %s JSON choice', async input => {
    const f = fixture({ ...baseBlobs(), 'host_keymap/keymaps/b.keymap/snapshot.json': JSON.stringify(snapshot) })
    const result = await save({ keymapPath: b, jsonChoice: choice(input) }, snapshot, [{ path: 'host_keymap/linux/en.xkb', content: 'sent' }])
    expect(result.hostWritesOmitted).toBe(false)
    expect(f.writes.map(w => w.path)).toEqual([b, `${b}.json`, 'host_keymap/keymaps/b.keymap/snapshot.json', 'host_keymap/keymaps/b.keymap/linux/en.xkb'])
  })

  it('rejects invalid owned geometry before mutation', async () => {
    const f = fixture({ ...baseBlobs(), 'config/b.json': '{"layouts":false}' })
    await expect(save({ keymapPath: b, jsonChoice: choice() })).rejects.toThrow()
    expect(f.writes).toEqual([])
  })

  it.each(['legacy', 'scoped'])('writes only the parsed host snapshot in %s mode', async mode => {
    const blobs: Record<string, string> = baseBlobs()
    const hostPath = mode === 'legacy' ? 'host_keymap/snapshot.json' : 'host_keymap/keymaps/b.keymap/snapshot.json'
    if (mode === 'legacy') { delete blobs[a]; delete blobs[REPOSITORY_KEYMAP_MODE_PATH] }
    blobs[hostPath] = JSON.stringify(snapshot)
    const f = fixture(blobs)
    const submitted = {
      ...snapshot, extra: 'must not publish',
      view: { ...snapshot.view, extra: 'must not publish', columns: [{ ...snapshot.view.columns[0], layoutId: 'user:custom' }], keycap: ['en', 'en', 'de'] },
      layouts: [{
        id: 'user:custom', name: 'Custom', language: 'en', extra: 'must not publish',
        origin: { from: 'copy', layoutId: 'system-us', extra: 'must not publish' },
        keys: [
          { zmk: 'A', keysyms: ['a', 'A', 'NoSymbol', 'NoSymbol'], glyphs: ['wrong', 'wrong', 'wrong', 'wrong'], extra: 'must not publish' },
          { zmk: 'A', keysyms: ['b', 'B', 'NoSymbol', 'NoSymbol'] },
          { zmk: 'UNKNOWN_KEY', keysyms: ['c', 'C', 'NoSymbol', 'NoSymbol'] }
        ]
      }]
    }
    const parsed = parseHostKeymapSnapshot(submitted)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) throw new Error('expected valid snapshot')
    expect(parsed.warnings).toEqual(['duplicate_zmk:A', 'unknown_zmk:UNKNOWN_KEY'])

    await save({ keymapPath: b, jsonChoice: choice() }, submitted)

    const encoded = f.writes.find(file => file.path === hostPath)!.content
    expect(encoded).toBe(encodeHostKeymapSnapshot(parsed.snapshot))
    expect(JSON.parse(encoded).view.keycap).toEqual(['en'])
    expect(JSON.parse(encoded).layouts[0].keys).toEqual([
      { zmk: 'A', keysyms: ['a', 'A', 'NoSymbol', 'NoSymbol'], glyphs: ['a', 'A', '', ''] }
    ])
    expect(encoded).not.toContain('must not publish')
    expect(f.blobs[hostPath]).toBe(encoded)
    const reloaded = await files.fetchKeyboardFiles('1', repo, 'main', { keymapPath: b })
    expect(reloaded.hostSnapshot).toEqual(parsed.snapshot)
  })

  it('does not normalize caller host paths or accept another scoped root', async () => {
    const f = fixture({ ...baseBlobs(), 'host_keymap/keymaps/b.keymap/snapshot.json': JSON.stringify(snapshot) })
    await save({ keymapPath: b, jsonChoice: choice() }, snapshot, ['host_keymap/linux//en.xkb', 'host_keymap/linux/./en.xkb', 'host_keymap/linux/%2e.xkb', 'host_keymap/keymaps/a.keymap/linux/en.xkb'].map(path => ({ path, content: 'no' })))
    expect(f.writes.map(w => w.path)).toEqual([b, `${b}.json`, 'host_keymap/keymaps/b.keymap/snapshot.json'])
  })

  it('requires scoped JSON consent before mutations, then writes B only under host omission', async () => {
    const f = fixture()
    await expect(save()).rejects.toThrow(/choice/i)
    expect(f.request.mock.calls.some(([o]) => typeof o !== 'string' && o.method === 'POST')).toBe(false)
    const result = await save({ keymapPath: b, jsonChoice: choice() }, snapshot, [{ path: 'host_keymap/linux/en.xkb', content: 'must not write' }])
    expect(result).toMatchObject({ hostWritesOmitted: true, hostSnapshotError: 'incompatible' })
    expect(f.writes.map(w => w.path)).toEqual([b, `${b}.json`])
    expect(f.writes[0].content).toContain('#define KEEP_ME 1')
    expect(f.writes[0].content).toContain('&kp D')
  })

  it('loads B DTS/geometry without attaching A or shared sidecars', async () => {
    fixture()
    const result = await files.fetchKeyboardFiles('1', repo, 'main', { keymapPath: b })
    expect(result).toMatchObject({ keymapPath: b, ownershipMode: 'scoped', jsonSource: 'dts', jsonChoiceRequired: true, hostSnapshot: null, hostSnapshotError: 'incompatible', headSha: sha })
    expect(result.keymap.layers).toEqual([['&kp B', '&kp C']])
    expect(result.info).toEqual(JSON.parse(baseBlobs()['config/b.json']))
  })
})
