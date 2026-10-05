import {
  addHostLanguage,
  assignHostLanguageLayout,
  encodeHostKeymapSnapshot
} from '@keymap-editor/keymap-core'
import { beforeEach, describe, expect, it } from 'vitest'
import { editor } from './editor.svelte.js'

const BOARD = {
  source: 'github' as const,
  github: { repository: 'acme/lark', branch: 'main' },
  layout: [{ x: 0, y: 0, row: 0, col: 0 }],
  keymap: {
    keyboard: 'board',
    keymap: 'board',
    layout: 'LAYOUT',
    layer_names: ['default'],
    layers: [[{ value: '&kp', params: [{ value: 'A', params: [] }] }]]
  }
}

describe('GitHub host keymap snapshot', () => {
  beforeEach(() => {
    editor.resetForTests()
  })

  it('applies a repo snapshot over IndexedDB and clears host-repo dirty', async () => {
    const snapshot = {
      version: 1 as const,
      view: {
        columns: [
          {
            language: 'en' as const,
            layoutId: 'system-us',
            visible: true,
            altGr: true,
            altGrShift: true
          },
          {
            language: 'ru' as const,
            layoutId: 'user:repo-ru',
            visible: true,
            altGr: true,
            altGrShift: true
          }
        ],
        open: 'ru' as const,
        keycap: ['en' as const, 'ru' as const]
      },
      layouts: [
        {
          id: 'user:repo-ru',
          name: 'from-repo',
          language: 'ru' as const,
          origin: { from: 'copy' as const, layoutId: 'system-ru-legacy' },
          keys: [
            {
              zmk: 'Q',
              keysyms: [
                'Cyrillic_shorti',
                'Cyrillic_SHORTI',
                'NoSymbol',
                'NoSymbol'
              ] as [string, string, string, string],
              glyphs: ['й', 'Й', '', ''] as [string, string, string, string]
            }
          ]
        }
      ]
    }

    await editor.selectKeyboard({
      ...BOARD,
      hostSnapshot: snapshot
    })

    expect(editor.activeProfileId('ru')).toBe('user:repo-ru')
    expect(editor.hostLegend.open).toBe('ru')
    expect(editor.isHostRepoDirty).toBe(false)
    expect(editor.isPublishDirty).toBe(false)
  })

  it('marks host-repo dirty after a live edit until acceptHostRepoBaseline', async () => {
    await editor.selectKeyboard({
      ...BOARD,
      hostSnapshot: {
        version: 1,
        view: {
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
        },
        layouts: []
      }
    })
    expect(editor.isHostRepoDirty).toBe(false)

    editor.hostLegend = assignHostLanguageLayout(
      addHostLanguage(editor.hostLegend, 'ru'),
      'ru',
      'system-ru-legacy'
    )
    expect(editor.isHostRepoDirty).toBe(true)
    expect(editor.isPublishDirty).toBe(true)

    editor.acceptHostRepoBaseline()
    expect(editor.isHostRepoDirty).toBe(false)
  })

  it('acceptHostRepoBaseline uses the passed encoding, not live edits', async () => {
    await editor.selectKeyboard({
      ...BOARD,
      hostSnapshot: {
        version: 1,
        view: {
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
        },
        layouts: []
      }
    })
    const committed = encodeHostKeymapSnapshot(
      editor.buildCurrentHostKeymapSnapshot()
    )
    expect(editor.isHostRepoDirty).toBe(false)

    editor.hostLegend = assignHostLanguageLayout(
      addHostLanguage(editor.hostLegend, 'ru'),
      'ru',
      'system-ru-legacy'
    )
    expect(editor.isHostRepoDirty).toBe(true)

    editor.acceptHostRepoBaseline(committed)
    expect(editor.isHostRepoDirty).toBe(true)
  })
})
