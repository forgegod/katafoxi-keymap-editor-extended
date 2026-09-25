import {
  addHostLanguage,
  hostLegendFor,
  SYSTEM_RU_LAYOUT_ID,
  SYSTEM_US_LAYOUT_ID
} from '@keymap-editor/keymap-core'
import { beforeEach, describe, expect, it } from 'vitest'
import { editor } from './editor.svelte.js'
import {
  clearHostProfileStore,
  defaultActiveLanguageProfiles,
  loadActiveLanguageProfiles,
  loadHostProfiles
} from './host-profiles'

describe('host profiles', () => {
  beforeEach(async () => {
    editor.resetForTests()
    await clearHostProfileStore()
  })

  it('switches a language column without asking for a name', async () => {
    await editor.selectLanguageProfile('ru', 'ru:system')
    expect(editor.hostLegend.secondId).toBe(SYSTEM_RU_LAYOUT_ID)
    expect(editor.hostProfilePrompt).toBeNull()
    expect(editor.activeProfileId('ru')).toBe('ru:system')
    expect(hostLegendFor('Q', editor.hostLegend)?.second).toEqual(['й', 'Й'])
    expect(await loadActiveLanguageProfiles()).toEqual({
      ...defaultActiveLanguageProfiles(),
      ru: 'ru:system'
    })
  })

  it('puts system US in the English column', async () => {
    await editor.selectLanguageProfile('en', 'en:system')
    expect(editor.hostLegend.baseId).toBe(SYSTEM_US_LAYOUT_ID)
    expect(hostLegendFor('N1', editor.hostLegend)?.en).toEqual(['1', '!'])
    expect(editor.activeProfileId('en')).toBe('en:system')
  })

  it('stores a named profile for one language and restores it', async () => {
    await editor.selectLanguageProfile('ru', 'ru:system')
    editor.beginSaveHostProfile('ru')
    expect(await editor.confirmHostProfileName('Домашняя')).toBeNull()
    expect(editor.activeProfileId('ru')).not.toBe('ru:system')
    expect(editor.hostLegend.secondId).toBe(SYSTEM_RU_LAYOUT_ID)

    editor.resetForTests()
    await editor.restoreHostProfiles()
    expect(editor.hostProfiles.map(profile => profile.name)).toEqual(['Домашняя'])
    expect(editor.hostProfiles[0]?.language).toBe('ru')
    expect(editor.hostLegend.secondId).toBe(SYSTEM_RU_LAYOUT_ID)
    expect(editor.activeProfileId('en')).toBe('en:in-layout')
  })

  it('keeps English when a Russian profile is saved', async () => {
    await editor.selectLanguageProfile('en', 'en:system')
    editor.beginSaveHostProfile('ru')
    await editor.confirmHostProfileName('Домашняя')
    expect(editor.hostLegend.baseId).toBe(SYSTEM_US_LAYOUT_ID)
    expect(editor.activeProfileId('en')).toBe('en:system')
  })

  it('rejects an empty name and reserved builtin names', async () => {
    editor.beginSaveHostProfile('en')
    expect(await editor.confirmHostProfileName('  ')).toMatch(/имя/i)
    expect(editor.hostProfilePrompt?.kind).toBe('save-as')
    expect(await editor.confirmHostProfileName('Системная')).toMatch(/занято/)
    expect(await editor.confirmHostProfileName('В раскладке')).toMatch(/занято/)
    expect(editor.hostProfiles).toHaveLength(0)
  })

  it('renames a saved profile and keeps its id', async () => {
    editor.beginSaveHostProfile('en')
    await editor.confirmHostProfileName('Домашняя')
    const id = editor.activeProfileId('en')
    editor.beginSaveHostProfile('en')
    await editor.confirmHostProfileName('Другая')
    await editor.selectLanguageProfile('en', id)
    editor.beginRenameHostProfile('en')
    expect(await editor.confirmHostProfileName('Дом')).toBeNull()
    expect(editor.activeProfileId('en')).toBe(id)
    expect(editor.hostProfiles.find(profile => profile.id === id)?.name).toBe('Дом')
    expect((await loadHostProfiles()).find(profile => profile.id === id)?.name).toBe('Дом')

    editor.beginRenameHostProfile('en')
    expect(await editor.confirmHostProfileName('Другая')).toMatch(/уже есть/)
    expect(await editor.confirmHostProfileName('Системная')).toMatch(/занято/)
  })

  it('deletes the active language profile and returns to in-layout', async () => {
    editor.beginSaveHostProfile('ru')
    await editor.confirmHostProfileName('Домашняя')
    editor.beginDeleteHostProfile('ru')
    expect(editor.hostProfilePrompt?.kind).toBe('delete')
    await editor.deleteActiveHostProfile()
    expect(editor.activeProfileId('ru')).toBe('ru:in-layout')
    expect(editor.hostProfiles).toHaveLength(0)
    expect(await loadHostProfiles()).toHaveLength(0)
    expect(editor.hostLegend.secondId).toBe('lark-ru')
  })

  it('copies a named system variant, not only the open profile', async () => {
    await editor.selectLanguageProfile('ru', 'ru:system')
    editor.beginCopyHostProfile('ru', 'system-ru-phonetic')
    expect(await editor.confirmHostProfileName('Фонетика')).toBeNull()
    expect(editor.hostLegend.secondId).toBe('system-ru-phonetic')
    expect(editor.hostProfiles[0]?.layoutId).toBe('system-ru-phonetic')
  })

  it('copies a Ukrainian system variant after the language is added', async () => {
    await editor.commitHostMap(addHostLanguage(editor.hostLegend, 'uk'))
    editor.beginCopyHostProfile('uk', 'system-ua-phonetic')
    expect(await editor.confirmHostProfileName('Фонетика uk')).toBeNull()
    expect(editor.hostLegend.secondId).toBe('system-ua-phonetic')
    expect(editor.activeProfileId('uk')).not.toBe('uk:system')
    expect(editor.hostProfiles[0]).toMatchObject({
      language: 'uk',
      layoutId: 'system-ua-phonetic',
      name: 'Фонетика uk'
    })
    expect(await loadActiveLanguageProfiles()).toMatchObject({
      uk: editor.activeProfileId('uk')
    })

    const savedUk = editor.activeProfileId('uk')
    editor.resetForTests()
    await editor.restoreHostProfiles()
    expect(editor.hostLegend.secondId).toBe('lark-ru')
    expect(editor.activeProfileId('uk')).toBe(savedUk)
  })

  it('copies the open language profile under a new name', async () => {
    await editor.selectLanguageProfile('ru', 'ru:system')
    editor.beginCopyHostProfile('ru')
    expect(editor.hostProfilePrompt?.kind).toBe('copy')
    expect(await editor.confirmHostProfileName('Копия ru')).toBeNull()
    expect(editor.hostLegend.secondId).toBe(SYSTEM_RU_LAYOUT_ID)
    expect(editor.activeProfileId('ru')).not.toBe('ru:system')
    expect(editor.hostProfiles.map(profile => profile.name)).toEqual(['Копия ru'])

    editor.beginCopyHostProfile('ru')
    expect(await editor.confirmHostProfileName('Копия ru')).toMatch(/уже есть/)
    expect(await editor.confirmHostProfileName('Системная')).toMatch(/занято/)
  })

  it('does not rename or delete a builtin language profile', () => {
    editor.beginRenameHostProfile('en')
    editor.beginDeleteHostProfile('en')
    expect(editor.hostProfilePrompt).toBeNull()
  })

  it('keeps layer visibility when switching the English profile', async () => {
    editor.hostLegend = {
      ...editor.hostLegend,
      shownLayers: [0, 2],
      altGr: false
    }
    await editor.selectLanguageProfile('en', 'en:system')
    expect(editor.hostLegend.shownLayers).toEqual([0, 2])
    expect(editor.hostLegend.altGr).toBe(false)
    expect(editor.hostLegend.baseId).toBe(SYSTEM_US_LAYOUT_ID)
  })
})
