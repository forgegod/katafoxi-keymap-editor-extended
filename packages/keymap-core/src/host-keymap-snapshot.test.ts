import { describe, expect, it } from 'vitest'
import {
  buildHostKeymapSnapshot,
  encodeHostKeymapSnapshot,
  hostLayoutFromKeymapSnapshotKeys,
  HOST_KEYMAP_SNAPSHOT_PATH,
  parseHostKeymapSnapshot
} from './host-keymap-snapshot.js'
import type { HostKeyLevels, HostLayout } from './host-layout.js'
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

const Q_LEVELS: HostKeyLevels = {
  keysyms: ['Cyrillic_shorti', 'Cyrillic_SHORTI', 'NoSymbol', 'NoSymbol'],
  glyphs: ['й', 'Й', '', '']
}

const A_LEVELS: HostKeyLevels = {
  keysyms: ['Cyrillic_ef', 'Cyrillic_EF', 'NoSymbol', 'NoSymbol'],
  glyphs: ['ф', 'Ф', '', '']
}

function sampleLayout(id: string): HostLayout {
  return {
    id,
    byZmk: new Map([['Q', Q_LEVELS]])
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

  it('serializes layout keys sorted by zmk for stable dirty compare', () => {
    const forward: HostLayout = {
      id: 'user:ru-1',
      byZmk: new Map([
        ['A', A_LEVELS],
        ['Q', Q_LEVELS]
      ])
    }
    const reverse: HostLayout = {
      id: 'user:ru-1',
      byZmk: new Map([
        ['Q', Q_LEVELS],
        ['A', A_LEVELS]
      ])
    }
    const input = {
      id: 'user:ru-1',
      name: 'typewriter',
      language: 'ru' as const,
      origin: { from: 'copy' as const, layoutId: 'system-ru-legacy' },
      layout: forward
    }
    const fromForward = buildHostKeymapSnapshot(VIEW, [input])
    const fromReverse = buildHostKeymapSnapshot(VIEW, [{ ...input, layout: reverse }])
    expect(fromForward.layouts[0]?.keys.map(row => row.zmk)).toEqual(['A', 'Q'])
    expect(encodeHostKeymapSnapshot(fromForward)).toBe(encodeHostKeymapSnapshot(fromReverse))
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
    expect(parsed).toEqual({ ok: true, snapshot, warnings: [] })
    if (!parsed.ok) return
    const layout = hostLayoutFromKeymapSnapshotKeys(
      parsed.snapshot.layouts[0]!.id,
      parsed.snapshot.layouts[0]!.keys
    )
    expect(layout.byZmk.get('Q')?.glyphs[0]).toBe('й')
  })

  it('rederives glyphs from keysyms on load', () => {
    const parsed = parseHostKeymapSnapshot({
      version: 1,
      view: VIEW,
      layouts: [
        {
          id: 'user:ru-1',
          name: 'a',
          language: 'ru',
          origin: { from: 'copy', layoutId: 'system-ru-legacy' },
          keys: [
            {
              zmk: 'Q',
              keysyms: ['Cyrillic_shorti', 'Cyrillic_SHORTI', 'NoSymbol', 'NoSymbol'],
              glyphs: ['WRONG', 'WRONG', 'x', 'y']
            }
          ]
        }
      ]
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.warnings).toEqual([])
    expect(parsed.snapshot.layouts[0]?.keys[0]?.glyphs).toEqual(['й', 'Й', '', ''])
  })

  it('distinguishes missing, unsupported version, and invalid payloads', () => {
    expect(parseHostKeymapSnapshot(null)).toEqual({ ok: false, error: 'missing' })
    expect(parseHostKeymapSnapshot('')).toEqual({ ok: false, error: 'missing' })
    expect(parseHostKeymapSnapshot({ version: 2, view: VIEW, layouts: [] })).toEqual({
      ok: false,
      error: 'unsupported_version',
      version: 2
    })
    expect(parseHostKeymapSnapshot({ view: VIEW, layouts: [] })).toEqual({
      ok: false,
      error: 'invalid'
    })
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
    ).toEqual({ ok: false, error: 'invalid' })
  })

  it('rejects non-English base column and invalid keycap lists', () => {
    const noEnBase: HostLegendView = {
      columns: [
        {
          language: 'ru',
          layoutId: 'user:ru-1',
          visible: true,
          altGr: true,
          altGrShift: true
        }
      ],
      open: 'ru'
    }
    expect(
      parseHostKeymapSnapshot({ version: 1, view: noEnBase, layouts: [] })
    ).toEqual({ ok: false, error: 'invalid' })

    expect(
      parseHostKeymapSnapshot({
        version: 1,
        view: { ...VIEW, keycap: [] },
        layouts: []
      })
    ).toEqual({ ok: false, error: 'invalid' })

    expect(
      parseHostKeymapSnapshot({
        version: 1,
        view: { ...VIEW, keycap: ['en', 'nope'] },
        layouts: []
      })
    ).toEqual({ ok: false, error: 'invalid' })
  })

  it('rejects keysyms that would break xkb text', () => {
    const payload = (keysym: string) => ({
      version: 1,
      view: VIEW,
      layouts: [
        {
          id: 'user:ru-1',
          name: 'a',
          language: 'ru',
          origin: { from: 'copy', layoutId: 'system-ru-legacy' },
          keys: [
            {
              zmk: 'Q',
              keysyms: [keysym, 'NoSymbol', 'NoSymbol', 'NoSymbol']
            }
          ]
        }
      ]
    })
    for (const keysym of [
      'a ] }; include "evil"',
      'foo;bar',
      'quote"mark',
      'line\nbreak'
    ]) {
      expect(parseHostKeymapSnapshot(payload(keysym)), keysym).toEqual({
        ok: false,
        error: 'invalid'
      })
    }
  })

  it('rejects duplicate column languages', () => {
    const duplicateRu: HostLegendView = {
      columns: [
        VIEW.columns[0]!,
        VIEW.columns[1]!,
        { ...VIEW.columns[1]!, layoutId: 'user:ru-2' }
      ],
      open: 'ru',
      keycap: ['en', 'ru']
    }
    expect(
      parseHostKeymapSnapshot({ version: 1, view: duplicateRu, layouts: [] })
    ).toEqual({ ok: false, error: 'invalid' })
  })

  it('canonicalizes zmk, drops unknown keys, and copies keysym tuples', () => {
    const shared = ['a', 'A', 'NoSymbol', 'NoSymbol'] as [string, string, string, string]
    const parsed = parseHostKeymapSnapshot({
      version: 1,
      view: VIEW,
      layouts: [
        {
          id: 'user:ru-1',
          name: 'a',
          language: 'ru',
          origin: { from: 'copy', layoutId: 'system-ru-legacy' },
          keys: [
            { zmk: 'kc_a', keysyms: shared },
            { zmk: '__proto__', keysyms: ['a', 'A', 'NoSymbol', 'NoSymbol'] },
            { zmk: 'A', keysyms: ['b', 'B', 'NoSymbol', 'NoSymbol'] }
          ]
        }
      ]
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.warnings).toEqual(['unknown_zmk:__proto__', 'duplicate_zmk:A'])
    expect(parsed.snapshot.layouts[0]?.keys).toEqual([
      {
        zmk: 'A',
        keysyms: ['a', 'A', 'NoSymbol', 'NoSymbol'],
        glyphs: ['a', 'A', '', '']
      }
    ])
    shared[0] = 'evil'
    expect(parsed.snapshot.layouts[0]?.keys[0]?.keysyms[0]).toBe('a')
  })

  it('dedupes keycap against columns', () => {
    const parsed = parseHostKeymapSnapshot({
      version: 1,
      view: { ...VIEW, keycap: ['en', 'ru', 'en', 'uk'] },
      layouts: []
    })
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.snapshot.view.keycap).toEqual(['en', 'ru'])
  })
})
