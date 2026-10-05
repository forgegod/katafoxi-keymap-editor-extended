import {
  addHostLanguage,
  assignHostLanguageLayout,
  encodeHostKeymapSnapshot
} from '@keymap-editor/keymap-core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { editor } from './editor.svelte.js'
import * as hostLayoutStore from './host-layout-store'
import {
  clearHostLayoutStore,
  loadUserHostLayouts
} from './host-layout-store'

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

function snapshotWithLayouts(
  layouts: Array<{ id: string; name: string; language: 'en' | 'ru' }>
) {
  return {
    version: 1 as const,
    view: {
      columns: [
        {
          language: 'en' as const,
          layoutId: 'system-us',
          visible: true,
          altGr: true,
          altGrShift: true
        }
      ],
      open: null
    },
    layouts: layouts.map(item => ({
      id: item.id,
      name: item.name,
      language: item.language,
      origin: { from: 'copy' as const, layoutId: 'system-us' },
      keys: [
        {
          zmk: 'Q',
          keysyms: ['q', 'Q', 'NoSymbol', 'NoSymbol'] as [
            string,
            string,
            string,
            string
          ],
          glyphs: ['q', 'Q', '', ''] as [string, string, string, string]
        }
      ]
    }))
  }
}

describe('GitHub host keymap snapshot', () => {
  beforeEach(async () => {
    editor.resetForTests()
    await clearHostLayoutStore()
    await editor.restoreHostProfiles()
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

  it('rolls back host layout IDB writes when keyboard selection is superseded', async () => {
    let saveCount = 0
    let nestedSelect: Promise<void> | undefined
    const originalSave = hostLayoutStore.saveUserHostLayout
    const saveSpy = vi
      .spyOn(hostLayoutStore, 'saveUserHostLayout')
      .mockImplementation(async record => {
        saveCount += 1
        await originalSave(record)
        if (saveCount === 1) {
          nestedSelect = editor.selectKeyboard({
            ...BOARD,
            github: { repository: 'acme/lark', branch: 'other' },
            keymap: { ...BOARD.keymap, keyboard: 'other' },
            hostSnapshot: snapshotWithLayouts([])
          })
        }
      })

    await editor.selectKeyboard({
      ...BOARD,
      hostSnapshot: snapshotWithLayouts([
        { id: 'user:stale-a', name: 'stale-a', language: 'en' },
        { id: 'user:stale-b', name: 'stale-b', language: 'ru' }
      ])
    })
    await nestedSelect

    const stored = await loadUserHostLayouts()
    expect(stored.map(row => row.id)).not.toContain('user:stale-a')
    expect(stored.map(row => row.id)).not.toContain('user:stale-b')
    expect(editor.draftKeymap!.keyboard).toBe('other')

    saveSpy.mockRestore()
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
