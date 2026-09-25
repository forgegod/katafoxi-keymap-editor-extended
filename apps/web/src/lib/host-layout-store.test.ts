import {
  addHostLanguage,
  composeKey,
  hostLayout,
  parseKeyBinding,
  setHostColumnAlt,
  SYSTEM_RU_LAYOUT_ID,
  SYSTEM_US_LAYOUT_ID,
  type HostLegendView
} from '@keymap-editor/keymap-core'
import { beforeEach, describe, expect, it } from 'vitest'
import { EditorState, editor } from './editor.svelte.js'
import {
  clearHostLayoutStore,
  HOST_LAYOUT_DB_NAME,
  loadUserHostLayouts,
  saveHostLegendView,
  UNKNOWN_HOST_LAYOUT_NOTE,
  uniqueUserHostLayoutName
} from './host-layout-store'

function openLayoutId(view: HostLegendView): string | null {
  if (view.open == null) return null
  return view.columns.find(column => column.language === view.open)?.layoutId ?? null
}

function deleteHostLayoutDb(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase(HOST_LAYOUT_DB_NAME)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error ?? new Error('deleteDatabase failed'))
    request.onblocked = () => resolve()
  })
}

function seedV2HostProfiles(data: {
  profiles: Array<{
    id: string
    name: string
    language: string
    layoutId: string
    updatedAt: number
  }>
  active: Record<string, string>
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(HOST_LAYOUT_DB_NAME, 2)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('profiles')) {
        db.createObjectStore('profiles', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'id' })
      }
    }
    request.onerror = () => reject(request.error ?? new Error('v2 open failed'))
    request.onsuccess = () => {
      const db = request.result
      const tx = db.transaction(['profiles', 'settings'], 'readwrite')
      for (const profile of data.profiles) {
        tx.objectStore('profiles').put(profile)
      }
      tx.objectStore('settings').put({ id: 'active', ...data.active })
      tx.oncomplete = () => {
        db.close()
        resolve()
      }
      tx.onerror = () => reject(tx.error ?? new Error('v2 seed failed'))
    }
  })
}

describe('host layout store', () => {
  beforeEach(async () => {
    editor.resetForTests()
    await clearHostLayoutStore()
  })

  it('switches a language column without asking for a name', async () => {
    await editor.selectLanguageProfile('ru', SYSTEM_RU_LAYOUT_ID)
    expect(openLayoutId(editor.hostLegend)).toBe(SYSTEM_RU_LAYOUT_ID)
    expect(editor.hostProfilePrompt).toBeNull()
    expect(editor.activeProfileId('ru')).toBe(SYSTEM_RU_LAYOUT_ID)
    expect(
      composeKey({
        binding: parseKeyBinding('&kp Q'),
        hostView: editor.hostLegend
      })?.columns.find(column => column.language === 'ru' && column.onKeycap)?.pair
    ).toEqual(['й', 'Й'])
  })

  it('puts system US in the English column', async () => {
    await editor.selectLanguageProfile('en', SYSTEM_US_LAYOUT_ID)
    expect(editor.hostLegend.columns[0].layoutId).toBe(SYSTEM_US_LAYOUT_ID)
    expect(
      composeKey({
        binding: parseKeyBinding('&kp N1'),
        hostView: editor.hostLegend
      })?.columns[0]?.pair
    ).toEqual(['1', '!'])
    expect(editor.activeProfileId('en')).toBe(SYSTEM_US_LAYOUT_ID)
  })

  it('stores a named user layout and restores it', async () => {
    await editor.selectLanguageProfile('ru', SYSTEM_RU_LAYOUT_ID)
    editor.beginSaveHostProfile('ru')
    expect(await editor.confirmHostProfileName('Домашняя')).toBeNull()
    expect(editor.activeProfileId('ru')).toMatch(/^user:/)
    expect(openLayoutId(editor.hostLegend)).toBe(editor.activeProfileId('ru'))
    expect(hostLayout(editor.activeProfileId('ru'))?.byZmk.get('Q')?.glyphs).toEqual(
      hostLayout(SYSTEM_RU_LAYOUT_ID)?.byZmk.get('Q')?.glyphs
    )

    editor.resetForTests()
    await editor.restoreHostProfiles()
    expect(editor.userLayouts.map(layout => layout.name)).toEqual(['Домашняя'])
    expect(editor.userLayouts[0]?.language).toBe('ru')
    expect(openLayoutId(editor.hostLegend)).toBe(editor.activeProfileId('ru'))
    expect(editor.activeProfileId('en')).toBe(SYSTEM_US_LAYOUT_ID)
  })

  it('keeps English when a Russian layout is saved', async () => {
    await editor.selectLanguageProfile('en', SYSTEM_US_LAYOUT_ID)
    editor.beginSaveHostProfile('ru')
    await editor.confirmHostProfileName('Домашняя')
    expect(editor.hostLegend.columns[0].layoutId).toBe(SYSTEM_US_LAYOUT_ID)
    expect(editor.activeProfileId('en')).toBe(SYSTEM_US_LAYOUT_ID)
  })

  it('rejects an empty name and reserved builtin names', async () => {
    editor.beginSaveHostProfile('en')
    expect(await editor.confirmHostProfileName('  ')).toMatch(/имя/i)
    expect(editor.hostProfilePrompt?.kind).toBe('save-as')
    expect(await editor.confirmHostProfileName('Системная')).toMatch(/занято/)
    expect(editor.userLayouts).toHaveLength(0)
  })

  it('renames a saved layout and keeps its id', async () => {
    editor.beginSaveHostProfile('en')
    await editor.confirmHostProfileName('Домашняя')
    const id = editor.activeProfileId('en')
    editor.beginSaveHostProfile('en')
    await editor.confirmHostProfileName('Другая')
    await editor.selectLanguageProfile('en', id)
    editor.beginRenameHostProfile('en')
    expect(await editor.confirmHostProfileName('Дом')).toBeNull()
    expect(editor.activeProfileId('en')).toBe(id)
    expect(editor.userLayouts.find(layout => layout.id === id)?.name).toBe('Дом')
    expect((await loadUserHostLayouts()).find(layout => layout.id === id)?.name).toBe('Дом')

    editor.beginRenameHostProfile('en')
    expect(await editor.confirmHostProfileName('Другая')).toMatch(/уже есть/)
    expect(await editor.confirmHostProfileName('Системная')).toMatch(/занято/)
  })

  it('deletes the active user layout and returns to the primary system layout', async () => {
    editor.beginSaveHostProfile('ru')
    await editor.confirmHostProfileName('Домашняя')
    editor.beginDeleteHostProfile('ru')
    expect(editor.hostProfilePrompt?.kind).toBe('delete')
    await editor.deleteActiveHostProfile()
    expect(editor.activeProfileId('ru')).toBe(SYSTEM_RU_LAYOUT_ID)
    expect(editor.userLayouts).toHaveLength(0)
    expect(await loadUserHostLayouts()).toHaveLength(0)
    expect(openLayoutId(editor.hostLegend)).toBe(SYSTEM_RU_LAYOUT_ID)
  })

  it('copies a named system variant, not only the open layout', async () => {
    await editor.selectLanguageProfile('ru', SYSTEM_RU_LAYOUT_ID)
    editor.beginCopyHostProfile('ru', 'system-ru-phonetic')
    expect(await editor.confirmHostProfileName('Фонетика')).toBeNull()
    expect(openLayoutId(editor.hostLegend)).toBe(editor.activeProfileId('ru'))
    expect(editor.userLayouts[0]?.origin).toEqual({
      from: 'copy',
      layoutId: 'system-ru-phonetic'
    })
    expect(hostLayout(editor.activeProfileId('ru'))?.byZmk.get('Q')?.glyphs).toEqual(
      hostLayout('system-ru-phonetic')?.byZmk.get('Q')?.glyphs
    )
  })

  it('keeps Ukrainian winkeys after a new EditorState reads the same IDB', async () => {
    await editor.commitHostMap(addHostLanguage(editor.hostLegend, 'uk'))
    await editor.selectLanguageProfile('uk', 'system-ua-winkeys')
    const saved = {
      columns: editor.hostLegend.columns.map(column => ({ ...column })),
      open: editor.hostLegend.open
    }

    const next = new EditorState()
    await next.restoreHostProfiles()
    expect(next.hostLegend.columns).toEqual(saved.columns)
    expect(next.hostLegend.open).toBe('uk')
    expect(next.activeProfileId('uk')).toBe('system-ua-winkeys')
  })

  it('keeps added Ukrainian and German columns after reload', async () => {
    await editor.commitHostMap(addHostLanguage(editor.hostLegend, 'uk'))
    await editor.selectLanguageProfile('uk', 'system-ua-winkeys')
    await editor.commitHostMap(addHostLanguage(editor.hostLegend, 'de'))
    await editor.selectLanguageProfile('de', 'system-de-neo')
    const saved = {
      columns: editor.hostLegend.columns.map(column => ({ ...column })),
      open: editor.hostLegend.open
    }

    editor.resetForTests()
    await editor.restoreHostProfiles()
    expect(editor.hostLegend.columns).toEqual(saved.columns)
    expect(editor.hostLegend.open).toBe(saved.open)
    expect(editor.activeProfileId('uk')).toBe('system-ua-winkeys')
    expect(editor.activeProfileId('de')).toBe('system-de-neo')
  })

  it('copies the open layout under a new name', async () => {
    await editor.selectLanguageProfile('ru', SYSTEM_RU_LAYOUT_ID)
    editor.beginCopyHostProfile('ru')
    expect(editor.hostProfilePrompt?.kind).toBe('copy')
    expect(await editor.confirmHostProfileName('Копия ru')).toBeNull()
    expect(editor.activeProfileId('ru')).toMatch(/^user:/)
    expect(hostLayout(editor.activeProfileId('ru'))?.byZmk.get('Q')?.keysyms).toEqual(
      hostLayout(SYSTEM_RU_LAYOUT_ID)?.byZmk.get('Q')?.keysyms
    )
    expect(editor.userLayouts.map(layout => layout.name)).toEqual(['Копия ru'])

    editor.beginCopyHostProfile('ru')
    expect(await editor.confirmHostProfileName('Копия ru')).toMatch(/уже есть/)
    expect(await editor.confirmHostProfileName('Системная')).toMatch(/занято/)
  })

  it('does not rename or delete a builtin layout', () => {
    editor.beginRenameHostProfile('en')
    editor.beginDeleteHostProfile('en')
    expect(editor.hostProfilePrompt).toBeNull()
  })

  it('keeps layer visibility when switching the English layout', async () => {
    editor.layerView = { ...editor.layerView, shown: [0, 2] }
    await editor.commitHostMap(setHostColumnAlt(editor.hostLegend, 'en', 'altGr', false))
    await editor.selectLanguageProfile('en', SYSTEM_US_LAYOUT_ID)
    expect(editor.layerView.shown).toEqual([0, 2])
    expect(editor.hostLegend.columns[0].altGr).toBe(false)
    expect(editor.hostLegend.columns[0].layoutId).toBe(SYSTEM_US_LAYOUT_ID)
  })

  it('replaces an unknown layout id with the primary system layout once', async () => {
    await saveHostLegendView({
      columns: [
        {
          language: 'en',
          layoutId: 'missing-en',
          visible: true,
          altGr: true,
          altGrShift: true
        },
        {
          language: 'ru',
          layoutId: SYSTEM_RU_LAYOUT_ID,
          visible: true,
          altGr: true,
          altGrShift: true
        }
      ],
      open: 'ru'
    })
    editor.resetForTests()
    await editor.restoreHostProfiles()
    expect(editor.hostLegend.columns[0].layoutId).toBe(SYSTEM_US_LAYOUT_ID)
    expect(editor.hostProfileNote).toBe(UNKNOWN_HOST_LAYOUT_NOTE)
  })

  it('migrates a v2 profile alias into a named user layout and the active view', async () => {
    editor.resetForTests()
    await deleteHostLayoutDb()
    await seedV2HostProfiles({
      profiles: [
        {
          id: 'legacy-ru',
          name: 'Домашняя',
          language: 'ru',
          layoutId: SYSTEM_RU_LAYOUT_ID,
          updatedAt: 1
        }
      ],
      active: {
        en: 'en:system',
        ru: 'legacy-ru',
        uk: 'uk:system',
        de: 'de:system'
      }
    })

    const next = new EditorState()
    await next.restoreHostProfiles()
    expect(next.userLayouts.map(layout => layout.name)).toEqual(['Домашняя'])
    expect(next.userLayouts[0]?.id).toBe('user:legacy-ru')
    expect(next.userLayouts[0]?.origin).toEqual({
      from: 'copy',
      layoutId: SYSTEM_RU_LAYOUT_ID
    })
    expect(next.hostLegend.columns[0].layoutId).toBe(SYSTEM_US_LAYOUT_ID)
    expect(next.activeProfileId('ru')).toBe('user:legacy-ru')
    expect(hostLayout('user:legacy-ru')?.byZmk.get('Q')?.glyphs).toEqual(
      hostLayout(SYSTEM_RU_LAYOUT_ID)?.byZmk.get('Q')?.glyphs
    )
    expect(next.hostLegend.columns.some(column => column.language === 'uk')).toBe(false)
  })

  it('avoids reserved and duplicate imported names', () => {
    expect(uniqueUserHostLayoutName('en', 'Системная', [])).toBe('Системная 2')
    expect(
      uniqueUserHostLayoutName('en', 'Imported EN', [
        { language: 'en', name: 'Imported EN' },
        { language: 'ru', name: 'Imported EN' }
      ])
    ).toBe('Imported EN 2')
  })

  it('imports an xkb section as a user layout assigned to the column', async () => {
    const text = `
      xkb_symbols "basic" {
        name[Group1]= "Imported EN";
        key <AD03> {[ Greek_alpha, Greek_ALPHA, at, numbersign ]};
      };
    `
    expect(await editor.importHostLayoutFromXkb('en', text, 'basic', 'imported.xkb')).toBeNull()
    expect(editor.activeProfileId('en')).toMatch(/^user:/)
    expect(editor.userLayouts[0]?.origin).toEqual({
      from: 'xkb',
      fileName: 'imported.xkb',
      section: 'basic'
    })
    expect(editor.userLayouts[0]?.name).toBe('Imported EN')
    expect(hostLayout(editor.activeProfileId('en'))?.byZmk.get('E')?.glyphs).toEqual([
      'α',
      'Α',
      '@',
      '#'
    ])

    const next = new EditorState()
    await next.restoreHostProfiles()
    expect(next.activeProfileId('en')).toBe(editor.activeProfileId('en'))
    expect(hostLayout(next.activeProfileId('en'))?.byZmk.get('E')?.glyphs).toEqual([
      'α',
      'Α',
      '@',
      '#'
    ])
  })

  it('names an unresolved include when importing xkb', async () => {
    const text = `
      xkb_symbols "broken" {
        include "level3(ralt_switch)"
        key <AC01> {[ a, A ]};
      };
    `
    expect(await editor.importHostLayoutFromXkb('en', text, 'broken', 'broken.xkb')).toBe(
      'Unresolved xkb include "level3(ralt_switch)"'
    )
    expect(editor.userLayouts).toHaveLength(0)
  })
})
