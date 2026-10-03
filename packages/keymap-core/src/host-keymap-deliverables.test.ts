import { describe, expect, it } from 'vitest'
import {
  buildHostKeymapDeliverableFiles,
  HOST_KEYMAP_DIR,
  safeHostKeymapFileStem
} from './host-keymap-deliverables.js'
import type { HostLayout } from './host-layout.js'
import type { HostLegendView } from './types.js'

function layout(id: string, glyph: string): HostLayout {
  return {
    id,
    byZmk: new Map([
      [
        'Q',
        {
          keysyms: ['a', 'A', 'NoSymbol', 'NoSymbol'],
          glyphs: [glyph, glyph.toUpperCase(), '', '']
        }
      ]
    ])
  }
}

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
      altGrShift: true
    }
  ],
  open: 'ru'
}

describe('host-keymap-deliverables', () => {
  it('sanitizes file stems', () => {
    expect(safeHostKeymapFileStem('My Layout / v2')).toBe('My-Layout-_-v2')
    expect(safeHostKeymapFileStem('   ')).toBe('host-layout')
  })

  it('writes linux xkb and windows klc for user columns plus en-ru combined', () => {
    const map = new Map([
      [
        'system-us',
        {
          id: 'system-us',
          name: 'US',
          language: 'en' as const,
          layout: layout('system-us', 'q'),
          user: false
        }
      ],
      [
        'user:ru-1',
        {
          id: 'user:ru-1',
          name: 'typewriter',
          language: 'ru' as const,
          layout: layout('user:ru-1', 'й'),
          user: true
        }
      ]
    ])
    const files = buildHostKeymapDeliverableFiles(VIEW, map)
    const paths = files.map(file => file.path).sort()
    expect(paths).toEqual([
      `${HOST_KEYMAP_DIR}/linux/ru.xkb`,
      `${HOST_KEYMAP_DIR}/windows/en-ru.klc`,
      `${HOST_KEYMAP_DIR}/windows/ru.klc`
    ])
    const xkb = files.find(file => file.path.endsWith('/ru.xkb'))?.content ?? ''
    expect(xkb).toContain('xkb_symbols "typewriter"')
    expect(xkb).toContain('key <AD01>')
    const klc = files.find(file => file.path.endsWith('/ru.klc'))?.content ?? ''
    expect(klc).toContain('KBD')
    expect(klc.includes('\r\n')).toBe(true)
  })

  it('does not write a Caps Lock paired file for dense Latin languages', () => {
    const view: HostLegendView = {
      columns: [
        {
          language: 'en',
          layoutId: 'system-us',
          visible: true,
          altGr: true,
          altGrShift: true
        },
        {
          language: 'fr',
          layoutId: 'user:fr-1',
          visible: true,
          altGr: true,
          altGrShift: true
        }
      ],
      open: 'fr'
    }
    const files = buildHostKeymapDeliverableFiles(
      view,
      new Map([
        [
          'system-us',
          {
            id: 'system-us',
            name: 'US',
            language: 'en',
            layout: layout('system-us', 'q'),
            user: false
          }
        ],
        [
          'user:fr-1',
          {
            id: 'user:fr-1',
            name: 'AZERTY',
            language: 'fr',
            layout: layout('user:fr-1', 'a'),
            user: true
          }
        ]
      ])
    )
    const paths = files.map(file => file.path).sort()
    expect(paths).toEqual([
      `${HOST_KEYMAP_DIR}/linux/fr.xkb`,
      `${HOST_KEYMAP_DIR}/windows/fr.klc`
    ])
    expect(paths.some(path => path.includes('en-fr'))).toBe(false)
  })

  it('skips deliverables when every column is a system layout', () => {
    const view: HostLegendView = {
      columns: [
        {
          language: 'en',
          layoutId: 'system-us',
          visible: true,
          altGr: true,
          altGrShift: true
        }
      ],
      open: null
    }
    const files = buildHostKeymapDeliverableFiles(
      view,
      new Map([
        [
          'system-us',
          {
            id: 'system-us',
            name: 'US',
            language: 'en',
            layout: layout('system-us', 'q'),
            user: false
          }
        ]
      ])
    )
    expect(files).toEqual([])
  })
})
