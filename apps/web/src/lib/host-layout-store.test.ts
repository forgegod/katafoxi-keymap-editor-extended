import {
  addHostLanguage,
  composeKey,
  composeLegendDecode,
  hostLayout,
  hostLayoutFromSymbols,
  hostLayoutFromXkb,
  parseKeyBinding,
  setHostColumnAlt,
  SYSTEM_RU_LAYOUT_ID,
  SYSTEM_US_LAYOUT_ID,
  type HostKeyLevels,
  type HostLayout,
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

function byZmkRecord(layout: HostLayout): Record<string, HostKeyLevels> {
  return Object.fromEntries(
    [...layout.byZmk.entries()].sort(([left], [right]) => left.localeCompare(right))
  )
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
    expect(await editor.confirmHostProfileName('  ')).toMatch(/name/i)
    expect(editor.hostProfilePrompt?.kind).toBe('save-as')
    expect(await editor.confirmHostProfileName('System')).toMatch(/reserved/)
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
    expect(await editor.confirmHostProfileName('Другая')).toMatch(/already exists/)
    expect(await editor.confirmHostProfileName('System')).toMatch(/reserved/)
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
    expect(await editor.confirmHostProfileName('Копия ru')).toMatch(/already exists/)
    expect(await editor.confirmHostProfileName('System')).toMatch(/reserved/)
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
    expect(uniqueUserHostLayoutName('en', 'System', [])).toBe('System 2')
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

  it('forks a system layout into a user copy before edit', async () => {
    await editor.selectLanguageProfile('ru', SYSTEM_RU_LAYOUT_ID)
    const system = hostLayout(SYSTEM_RU_LAYOUT_ID)!
    const byZmkRef = system.byZmk
    const qKeysyms = system.byZmk.get('Q')!.keysyms
    const expectedName = uniqueUserHostLayoutName('ru', 'System', [])

    const id = await editor.ensureEditableUserHostLayout('ru')
    expect(id).toMatch(/^user:/)
    expect(id).not.toBe(SYSTEM_RU_LAYOUT_ID)
    expect(editor.activeProfileId('ru')).toBe(id)
    expect(openLayoutId(editor.hostLegend)).toBe(id)
    expect(editor.userLayouts).toHaveLength(1)
    expect(editor.userLayouts[0]?.name).toBe(expectedName)
    expect(editor.userLayouts[0]?.origin).toEqual({
      from: 'copy',
      layoutId: SYSTEM_RU_LAYOUT_ID
    })
    expect(editor.hostProfileNote).toBe(
      `Created copy “${expectedName}” for edits. The system layout is unchanged.`
    )
    expect(hostLayout(SYSTEM_RU_LAYOUT_ID)?.byZmk).toBe(byZmkRef)
    expect(hostLayout(SYSTEM_RU_LAYOUT_ID)?.byZmk.get('Q')?.keysyms).toBe(qKeysyms)
    expect(hostLayout(id)?.byZmk.get('Q')?.keysyms).toEqual([...qKeysyms])

    const again = await editor.ensureEditableUserHostLayout('ru')
    expect(again).toBe(id)
    expect(editor.userLayouts).toHaveLength(1)

    editor.resetForTests()
    await editor.restoreHostProfiles()
    expect(editor.activeProfileId('ru')).toBe(id)
    expect(editor.userLayouts.map(layout => layout.name)).toEqual([expectedName])
    expect((await loadUserHostLayouts()).map(layout => layout.id)).toEqual([id])
  })

  it('edits one host key level and forks a system column first', async () => {
    await editor.selectLanguageProfile('ru', SYSTEM_RU_LAYOUT_ID)
    const beforeQ = [...hostLayout(SYSTEM_RU_LAYOUT_ID)!.byZmk.get('Q')!.keysyms]
    const beforeA = [...hostLayout(SYSTEM_RU_LAYOUT_ID)!.byZmk.get('A')!.keysyms]
    const noteBefore = editor.hostProfileNote

    const edited = await editor.setHostKeyLevel('ru', 'Q', 0, 'ё')
    expect(edited).toMatchObject({
      ok: true,
      keysym: 'Cyrillic_io',
      dropsFromCompose: false
    })
    if (!edited.ok) throw new Error('edit failed')
    expect(edited.layoutId).toMatch(/^user:/)
    expect(editor.activeProfileId('ru')).toBe(edited.layoutId)
    expect(hostLayout(SYSTEM_RU_LAYOUT_ID)?.byZmk.get('Q')?.keysyms).toEqual(beforeQ)
    expect(hostLayout(edited.layoutId)?.byZmk.get('Q')?.keysyms).toEqual([
      'Cyrillic_io',
      beforeQ[1],
      beforeQ[2],
      beforeQ[3]
    ])
    expect(hostLayout(edited.layoutId)?.byZmk.get('A')?.keysyms).toEqual(beforeA)
    expect(editor.hostProfileNote).toMatch(/Created copy/)
    expect(editor.hostProfileNote).not.toBe(noteBefore)

    const again = await editor.setHostKeyLevel('ru', 'Q', 2, '±')
    expect(again).toMatchObject({ ok: true, layoutId: edited.layoutId, keysym: 'plusminus' })
    expect(editor.userLayouts).toHaveLength(1)
    expect(hostLayout(edited.layoutId)?.byZmk.get('Q')?.keysyms[0]).toBe('Cyrillic_io')
    expect(hostLayout(edited.layoutId)?.byZmk.get('Q')?.keysyms[2]).toBe('plusminus')
  })

  it('rejects multi-code-point host level input without changing the layout', async () => {
    await editor.selectLanguageProfile('en', SYSTEM_US_LAYOUT_ID)
    const forked = await editor.ensureEditableUserHostLayout('en')
    const before = [...hostLayout(forked)!.byZmk.get('A')!.keysyms]
    const note = 'keep this note'
    editor.hostProfileNote = note

    const rejected = await editor.setHostKeyLevel('en', 'A', 1, 'ab')
    expect(rejected).toEqual({
      ok: false,
      reason: 'rejected',
      detail: 'multiple-code-points'
    })
    expect(hostLayout(forked)?.byZmk.get('A')?.keysyms).toEqual(before)
    expect(editor.hostProfileNote).toBe(note)
    expect(editor.userLayouts).toHaveLength(1)
  })

  it('stores NoSymbol for empty host level input', async () => {
    await editor.selectLanguageProfile('en', SYSTEM_US_LAYOUT_ID)
    const result = await editor.setHostKeyLevel('en', 'A', 2, '')
    expect(result).toMatchObject({ ok: true, keysym: 'NoSymbol' })
    if (!result.ok) throw new Error('edit failed')
    expect(hostLayout(result.layoutId)?.byZmk.get('A')?.keysyms[2]).toBe('NoSymbol')
    expect(hostLayout(result.layoutId)?.byZmk.get('A')?.glyphs[2]).toBe('')
  })

  it('reverts a host level to the system primary and clears the differ', async () => {
    await editor.selectLanguageProfile('ru', SYSTEM_RU_LAYOUT_ID)
    const systemKeysym = hostLayout(SYSTEM_RU_LAYOUT_ID)!.byZmk.get('Q')!.keysyms[0]
    const edited = await editor.setHostKeyLevel('ru', 'Q', 0, 'ё')
    expect(edited.ok).toBe(true)
    if (!edited.ok) throw new Error('edit failed')
    expect(hostLayout(edited.layoutId)?.byZmk.get('Q')?.keysyms[0]).toBe('Cyrillic_io')

    const reverted = await editor.revertHostKeyLevel('ru', 'Q', 0)
    expect(reverted).toMatchObject({ ok: true, keysym: systemKeysym, layoutId: edited.layoutId })
    expect(hostLayout(edited.layoutId)?.byZmk.get('Q')?.keysyms[0]).toBe(systemKeysym)

    const card = composeLegendDecode(parseKeyBinding('&kp Q'), editor.hostLegend)
    const ru = card.current.find(column => column.language === 'ru')
    expect(ru?.slots[0].differs).toBe(false)
  })

  it('persists a host key level edit across reset and restore', async () => {
    await editor.selectLanguageProfile('en', SYSTEM_US_LAYOUT_ID)
    const edited = await editor.setHostKeyLevel('en', 'A', 0, 'α')
    expect(edited.ok).toBe(true)
    if (!edited.ok) throw new Error('edit failed')
    const layoutId = edited.layoutId
    expect(hostLayout(layoutId)?.byZmk.get('A')?.keysyms[0]).toBe('Greek_alpha')

    editor.resetForTests()
    await editor.restoreHostProfiles()
    expect(editor.activeProfileId('en')).toBe(layoutId)
    expect(hostLayout(layoutId)?.byZmk.get('A')?.keysyms[0]).toBe('Greek_alpha')
    expect(hostLayout(layoutId)?.byZmk.get('A')?.glyphs[0]).toBe('α')
  })

  it('warns when the base host level becomes a non-character keysym', async () => {
    await editor.selectLanguageProfile('en', SYSTEM_US_LAYOUT_ID)
    const result = await editor.setHostKeyLevel('en', 'A', 0, 'dead_acute')
    expect(result).toEqual({
      ok: true,
      keysym: 'dead_acute',
      layoutId: expect.stringMatching(/^user:/),
      dropsFromCompose: true
    })
  })

  it('bumps hostLayoutRevision on in-place register without changing view or layout id', async () => {
    await editor.selectLanguageProfile('en', SYSTEM_US_LAYOUT_ID)
    const layoutId = await editor.ensureEditableUserHostLayout('en')
    const viewBefore = {
      open: editor.hostLegend.open,
      columns: editor.hostLegend.columns.map(column => ({ ...column }))
    }
    const revisionBefore = editor.hostLayoutRevision

    const edited = await editor.setHostKeyLevel('en', 'A', 0, 'α')
    expect(edited).toMatchObject({ ok: true, layoutId })
    expect(editor.activeProfileId('en')).toBe(layoutId)
    expect(editor.hostLegend.open).toBe(viewBefore.open)
    expect(editor.hostLegend.columns).toEqual(viewBefore.columns)
    expect(editor.hostLayoutRevision).toBe(revisionBefore + 1)
    expect(hostLayout(layoutId)?.byZmk.get('A')?.glyphs[0]).toBe('α')
  })

  it('does not bump hostLayoutRevision on hover-only editor state', async () => {
    await editor.selectLanguageProfile('en', SYSTEM_US_LAYOUT_ID)
    const before = editor.hostLayoutRevision
    editor.legendHover = { kind: 'altGr' }
    expect(editor.hostLayoutRevision).toBe(before)
    editor.legendHover = null
    expect(editor.hostLayoutRevision).toBe(before)
  })

  it('exports a user host layout as xkb that round-trips through parse', async () => {
    await editor.selectLanguageProfile('en', SYSTEM_US_LAYOUT_ID)
    const edited = await editor.setHostKeyLevel('en', 'A', 0, 'α')
    expect(edited.ok).toBe(true)
    if (!edited.ok) throw new Error('edit failed')
    const layoutId = edited.layoutId
    await editor.setHostKeyLevel('en', 'A', 2, '')
    await editor.setHostKeyLevel('en', 'Q', 1, 'ё')

    const profile = editor.userLayouts.find(layout => layout.id === layoutId)
    expect(profile).toBeDefined()
    const exported = editor.exportUserHostLayoutXkb(layoutId)
    expect(exported).not.toBeNull()
    if (!exported) throw new Error('export failed')
    expect(exported.name).toBe(profile!.name)
    expect(exported.text).toContain(`xkb_symbols "${profile!.name}"`)
    expect(exported.text).toContain(`name[Group1]= "${profile!.name}";`)

    const original = hostLayout(layoutId)!
    const viaXkb = hostLayoutFromXkb(exported.text, profile!.name, { fileName: 'export.xkb' })
    const viaSymbols = hostLayoutFromSymbols(exported.text, profile!.name, 'round-trip')
    expect(byZmkRecord(viaXkb)).toEqual(byZmkRecord(original))
    expect(byZmkRecord(viaSymbols)).toEqual(byZmkRecord(original))

    expect(editor.exportUserHostLayoutXkb(SYSTEM_US_LAYOUT_ID)).toBeNull()
  })

  it('treats active user layouts as host-dirty deliverables for chrome download', async () => {
    expect(editor.isHostDirty).toBe(false)
    expect(editor.hostDeliverableLayoutIds).toEqual([])
    expect(editor.exportActiveHostLayoutsXkb()).toBeNull()

    const edited = await editor.setHostKeyLevel('en', 'A', 0, 'b')
    expect(edited.ok).toBe(true)
    if (!edited.ok) throw new Error('edit failed')
    expect(editor.isHostDirty).toBe(true)
    expect(editor.hostDeliverableLayoutIds).toEqual([edited.layoutId])

    const exported = editor.exportActiveHostLayoutsXkb()
    expect(exported?.name).toBeTruthy()
    expect(exported?.text).toContain('xkb_symbols')

    await editor.selectLanguageProfile('en', SYSTEM_US_LAYOUT_ID)
    expect(editor.isHostDirty).toBe(false)
    expect(editor.exportActiveHostLayoutsXkb()).toBeNull()
  })
})
