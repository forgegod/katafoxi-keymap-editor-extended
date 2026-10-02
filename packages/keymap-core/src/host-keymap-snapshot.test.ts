import { describe, expect, it } from 'vitest'
import {
  buildHostKeymapSnapshot,
  encodeHostKeymapSnapshot,
  hostLayoutFromKeymapSnapshotKeys,
  HOST_KEYMAP_SNAPSHOT_PATH,
  parseHostKeymapSnapshot
} from './host-keymap-snapshot.js'
import type { HostLayout } from './host-layout.js'
import type { HostLegendView } from './types.js'

const VIEW: HostLegendView = {
  columns: [
    {
      language: 'en',
      layoutId: 'system-us',
      visible: true,
      altGr: true,
      altGrShift: true
    },
    {
      language: 'ru',
      layoutId: 'user:ru-1',
      visible: true,
      altGr: true,
      altGrShift: false
    }
  ],
  open: 'ru',
  keycap: ['en', 'ru']
}

function sampleLayout(id: string): HostLayout {
  return {
    id,
    byZmk: new Map([
      [
        'Q',
        {
          keysyms: ['Cyrillic_shorti', 'Cyrillic_SHORTI', 'NoSymbol', 'NoSymbol'],
          glyphs: ['й', 'Й', '', '']
        }
      ]
    ])
  }
}

describe('host-keymap-snapshot', () => {
  it('exports the repo path constant', () => {
    expect(HOST_KEYMAP_SNAPSHOT_PATH).toBe('host_keymap/snapshot.json')
  })

  it('builds only user layouts referenced by the view', () => {
    const snapshot = buildHostKeymapSnapshot(VIEW, [
      {
        id: 'user:ru-1',
        name: 'typewriter',
        language: 'ru',
        origin: { from: 'copy', layoutId: 'system-ru-legacy' },
        layout: sampleLayout('user:ru-1')
      },
      {
        id: 'user:orphan',
        name: 'unused',
        language: 'uk',
        origin: { from: 'copy', layoutId: 'system-uk' },
        layout: sampleLayout('user:orphan')
      }
    ])
    expect(snapshot.version).toBe(1)
    expect(snapshot.view.open).toBe('ru')
    expect(snapshot.layouts).toHaveLength(1)
    expect(snapshot.layouts[0]?.id).toBe('user:ru-1')
    expect(snapshot.layouts[0]?.keys[0]?.glyphs[0]).toBe('й')
  })

  it('round-trips encode and parse', () => {
    const snapshot = buildHostKeymapSnapshot(VIEW, [
      {
        id: 'user:ru-1',
        name: 'typewriter',
        language: 'ru',
        origin: { from: 'xkb', fileName: 'ru.xkb', section: 'legacy' },
        layout: sampleLayout('user:ru-1')
      }
    ])
    const text = encodeHostKeymapSnapshot(snapshot)
    expect(text.endsWith('\n')).toBe(true)
    const parsed = parseHostKeymapSnapshot(text)
    expect(parsed).toEqual(snapshot)
    const layout = hostLayoutFromKeymapSnapshotKeys(
      parsed!.layouts[0]!.id,
      parsed!.layouts[0]!.keys
    )
    expect(layout.byZmk.get('Q')?.glyphs[0]).toBe('й')
  })

  it('rejects bad version and duplicate layout ids', () => {
    expect(parseHostKeymapSnapshot({ version: 2, view: VIEW, layouts: [] })).toBeNull()
    expect(
      parseHostKeymapSnapshot({
        version: 1,
        view: VIEW,
        layouts: [
          {
            id: 'user:ru-1',
            name: 'a',
            language: 'ru',
            origin: { from: 'copy', layoutId: 'system-ru-legacy' },
            keys: []
          },
          {
            id: 'user:ru-1',
            name: 'b',
            language: 'ru',
            origin: { from: 'copy', layoutId: 'system-ru-legacy' },
            keys: []
          }
        ]
      })
    ).toBeNull()
  })
})
