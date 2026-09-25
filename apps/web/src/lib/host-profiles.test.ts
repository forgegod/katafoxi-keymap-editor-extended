import { hostLegendFor, hostLegendView, standardHostLegendView } from '@keymap-editor/keymap-core'
import { beforeEach, describe, expect, it } from 'vitest'
import { editor } from './editor.svelte.js'
import {
  clearHostProfileStore,
  loadActiveHostProfileId,
  loadHostProfiles,
  standardHostProfileMap
} from './host-profiles'

describe('host profiles', () => {
  beforeEach(async () => {
    editor.resetForTests()
    await clearHostProfileStore()
  })

  it('asks for a name before leaving the standard profile', () => {
    const next = hostLegendView(editor.hostLegend, { secondId: 'system-ru' })
    void editor.commitHostMap(next)
    expect(editor.hostLegend.secondId).toBe('lark-ru')
    expect(editor.hostProfilePrompt).toEqual({ kind: 'fork', next })
  })

  it('stores a named fork and restores it after refresh', async () => {
    const next = hostLegendView(editor.hostLegend, { secondId: 'system-ru' })
    void editor.commitHostMap(next)
    expect(await editor.confirmHostProfileName('Домашняя')).toBeNull()
    expect(editor.activeHostProfileId).not.toBe('standard')
    expect(editor.hostLegend.secondId).toBe('system-ru')
    expect(editor.hostLegend.source).toBe('custom')

    editor.resetForTests()
    await editor.restoreHostProfiles()
    expect(editor.hostProfiles.map(profile => profile.name)).toEqual(['Домашняя'])
    expect(editor.hostLegend.secondId).toBe('system-ru')
    expect(editor.activeHostProfileId).not.toBe('standard')
  })

  it('writes later edits into the open profile without a new name', async () => {
    void editor.commitHostMap(hostLegendView(editor.hostLegend, { secondId: 'system-ru' }))
    await editor.confirmHostProfileName('Домашняя')
    const id = editor.activeHostProfileId

    await editor.commitHostMap(hostLegendView(editor.hostLegend, { secondId: null }))
    expect(editor.hostProfilePrompt).toBeNull()
    expect(editor.hostLegend.secondId).toBeNull()
    expect(editor.activeHostProfileId).toBe(id)

    const stored = await loadHostProfiles()
    expect(stored).toHaveLength(1)
    expect(stored[0].map.secondId).toBeNull()
  })

  it('keeps layer visibility when switching back to standard', async () => {
    editor.hostLegend = {
      ...editor.hostLegend,
      layers: [true, false, true, true],
      altGr: false,
      altGrShift: false
    }
    editor.beginSaveHostProfile()
    await editor.confirmHostProfileName('Копия')
    await editor.selectHostProfile('standard')
    expect(editor.hostLegend.layers).toEqual([true, false, true, true])
    expect(editor.hostLegend.altGr).toBe(true)
    expect(editor.hostLegend.altGrShift).toBe(true)
    expect(editor.hostLegend.secondId).toBe(standardHostProfileMap().secondId)
    expect(await loadActiveHostProfileId()).toBe('standard')
  })

  it('rejects an empty name and the reserved standard name', async () => {
    editor.beginSaveHostProfile()
    expect(await editor.confirmHostProfileName('  ')).toMatch(/имя/i)
    expect(editor.hostProfilePrompt?.kind).toBe('save-as')
    expect(await editor.confirmHostProfileName('Стандарт')).toMatch(/занято/)
    expect(await editor.confirmHostProfileName('Системная ru')).toMatch(/занято/)
    expect(editor.hostProfiles).toHaveLength(0)
    expect(editor.hostLegend).toEqual(standardHostLegendView())
  })

  it('selects the system Russian preset and restores it', async () => {
    await editor.selectHostProfile('system-ru')
    expect(editor.hostLegend.baseId).toBe('lark-en')
    expect(editor.hostLegend.secondId).toBe('system-ru')
    expect(editor.hostLegend.baseVisible).toBe(true)
    expect(editor.hostLegend.secondVisible).toBe(true)
    expect(editor.hostLegend.altGr).toBe(false)
    expect(editor.hostLegend.altGrShift).toBe(false)
    expect(hostLegendFor('Q', editor.hostLegend)?.en).toEqual(['q', 'Q'])
    expect(hostLegendFor('Q', editor.hostLegend)?.second).toEqual(['й', 'Й'])

    await editor.selectHostProfile('standard')
    editor.hostLegend = { ...editor.hostLegend, secondVisible: false }
    await editor.selectHostProfile('system-ru')
    expect(editor.hostLegend.baseVisible).toBe(true)
    expect(editor.hostLegend.secondVisible).toBe(true)

    editor.resetForTests()
    await editor.restoreHostProfiles()
    expect(editor.activeHostProfileId).toBe('system-ru')
    expect(editor.hostLegend.baseId).toBe('lark-en')
    expect(editor.hostLegend.secondId).toBe('system-ru')
    expect(editor.hostLegend.secondVisible).toBe(true)
  })

  it('renames a saved profile and keeps its id', async () => {
    editor.beginSaveHostProfile()
    await editor.confirmHostProfileName('Домашняя')
    const id = editor.activeHostProfileId
    editor.beginSaveHostProfile()
    await editor.confirmHostProfileName('Другая')
    await editor.selectHostProfile(id)
    editor.beginRenameHostProfile()
    expect(await editor.confirmHostProfileName('Дом')).toBeNull()
    expect(editor.activeHostProfileId).toBe(id)
    expect(editor.hostProfiles.find(profile => profile.id === id)?.name).toBe('Дом')
    expect((await loadHostProfiles()).find(profile => profile.id === id)?.name).toBe('Дом')

    editor.beginRenameHostProfile()
    expect(await editor.confirmHostProfileName('Другая')).toMatch(/уже есть/)
    expect(await editor.confirmHostProfileName('Стандарт')).toMatch(/занято/)
  })

  it('deletes the active profile and returns to the standard preset', async () => {
    editor.beginSaveHostProfile()
    await editor.confirmHostProfileName('Домашняя')
    editor.beginDeleteHostProfile()
    expect(editor.hostProfilePrompt?.kind).toBe('delete')
    await editor.deleteActiveHostProfile()
    expect(editor.activeHostProfileId).toBe('standard')
    expect(editor.hostProfiles).toHaveLength(0)
    expect(await loadHostProfiles()).toHaveLength(0)
    expect(editor.hostLegend.baseId).toBe('lark-en')
  })

  it('copies the open profile under a new name', async () => {
    await editor.selectHostProfile('system-ru')
    editor.beginCopyHostProfile()
    expect(editor.hostProfilePrompt?.kind).toBe('copy')
    expect(await editor.confirmHostProfileName('Копия ru')).toBeNull()
    expect(editor.hostLegend.baseId).toBe('lark-en')
    expect(editor.hostLegend.secondId).toBe('system-ru')
    expect(editor.activeHostProfileId).not.toBe('system-ru')
    expect(editor.hostProfiles.map(profile => profile.name)).toEqual(['Копия ru'])

    editor.beginCopyHostProfile()
    expect(await editor.confirmHostProfileName('Копия ru')).toMatch(/уже есть/)
    expect(await editor.confirmHostProfileName('Стандарт')).toMatch(/занято/)
  })

  it('does not rename or delete a builtin profile', () => {
    editor.beginRenameHostProfile()
    editor.beginDeleteHostProfile()
    expect(editor.hostProfilePrompt).toBeNull()
  })

  it('cancelling the fork leaves the standard profile', () => {
    const before = editor.hostLegend
    void editor.commitHostMap(hostLegendView(before, { secondId: null }))
    editor.cancelHostProfilePrompt()
    expect(editor.hostProfilePrompt).toBeNull()
    expect(editor.hostLegend).toBe(before)
    expect(editor.hostProfiles).toHaveLength(0)
  })
})
