import { hostLegendView, standardHostLegendView } from '@keymap-editor/keymap-core'
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
    const next = hostLegendView(editor.hostLegend, { altGr: false })
    void editor.commitHostMap(next)
    expect(editor.hostLegend.altGr).toBe(true)
    expect(editor.hostProfilePrompt).toEqual({ kind: 'fork', next })
  })

  it('stores a named fork and restores it after refresh', async () => {
    const next = hostLegendView(editor.hostLegend, { altGr: false })
    void editor.commitHostMap(next)
    expect(await editor.confirmHostProfileName('Домашняя')).toBeNull()
    expect(editor.activeHostProfileId).not.toBe('standard')
    expect(editor.hostLegend.altGr).toBe(false)
    expect(editor.hostLegend.source).toBe('custom')

    editor.resetForTests()
    await editor.restoreHostProfiles()
    expect(editor.hostProfiles.map(profile => profile.name)).toEqual(['Домашняя'])
    expect(editor.hostLegend.altGr).toBe(false)
    expect(editor.activeHostProfileId).not.toBe('standard')
  })

  it('writes later edits into the open profile without a new name', async () => {
    void editor.commitHostMap(hostLegendView(editor.hostLegend, { altGr: false }))
    await editor.confirmHostProfileName('Домашняя')
    const id = editor.activeHostProfileId

    await editor.commitHostMap(hostLegendView(editor.hostLegend, { altGrShift: false }))
    expect(editor.hostProfilePrompt).toBeNull()
    expect(editor.hostLegend.altGrShift).toBe(false)
    expect(editor.activeHostProfileId).toBe(id)

    const stored = await loadHostProfiles()
    expect(stored).toHaveLength(1)
    expect(stored[0].map.altGr).toBe(false)
    expect(stored[0].map.altGrShift).toBe(false)
  })

  it('keeps layer visibility when switching back to standard', async () => {
    editor.hostLegend = { ...editor.hostLegend, layers: [true, false, true, true] }
    editor.beginSaveHostProfile()
    await editor.confirmHostProfileName('Копия')
    await editor.selectHostProfile('standard')
    expect(editor.hostLegend.layers).toEqual([true, false, true, true])
    expect(editor.hostLegend.altGr).toBe(standardHostProfileMap().altGr)
    expect(await loadActiveHostProfileId()).toBe('standard')
  })

  it('rejects an empty name and the reserved standard name', async () => {
    editor.beginSaveHostProfile()
    expect(await editor.confirmHostProfileName('  ')).toMatch(/имя/i)
    expect(editor.hostProfilePrompt?.kind).toBe('save-as')
    expect(await editor.confirmHostProfileName('Стандарт')).toMatch(/занято/)
    expect(editor.hostProfiles).toHaveLength(0)
    expect(editor.hostLegend).toEqual(standardHostLegendView())
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
