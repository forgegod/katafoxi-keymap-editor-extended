import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildKeymapCode, cloneParsedKeymap, composeLayerRows, conditionalLayerCoverWarning, parseDtsKeymap, parseKeyBinding, parseKeymap, toggleShownLayer } from '@keymap-editor/keymap-core'
import { editor } from './editor.svelte.js'
import { buildDraftIdentity, deleteStoredDraft, loadStoredDraft } from './draft-storage'
import { copyClipboardKeymap } from './editor/clipboard-copy'
import { publishKeymap } from './publish-keymap'
import { claimLegendDecode, resetLegendDecodeActive } from './legend-decode-active'

const layout = [{ x: 0, y: 0, row: 0, col: 0 }]
const fixture = () => ({
  keyboard: 'layer-operation-test',
  layer_names: ['Base', 'Lower', 'Raise', 'Adjust'],
  layers: ['&mo 2', '&kp A', '&kp B', '&kp C'].map(binding => [parseKeyBinding(binding)])
})

async function selectFixture() {
  await editor.selectKeyboard({ source: 'demo', layout, keymap: fixture() })
}

beforeEach(async () => {
  editor.resetForTests()
  window.confirm = vi.fn(() => true)
  resetLegendDecodeActive()
  await deleteStoredDraft(buildDraftIdentity({ source: 'demo', keyboard: fixture().keyboard })!)
  await deleteStoredDraft(buildDraftIdentity({ source: 'clipboard', keyboard: 'clipboard-layer-operations' })!)
  await selectFixture()
})
afterEach(() => {
  editor.resetForTests()
  vi.restoreAllMocks()
})

describe('layer identity lifecycle', () => {
  it('keeps a newer structural draft when an older copy sheet is retried', async () => {
    const source = buildKeymapCode(layout, fixture()).code
    const keymap = parseKeymap(parseDtsKeymap(source, { keyboard: 'clipboard-layer-operations' }))
    await editor.selectKeyboard({ source: 'clipboard', layout, keymap, clipboardOriginalSource: source })
    editor.layerView = { shown: [0, 1, 7], layer0Raw: true }
    expect(editor.reorderLayers([0, 2, 1, 3]).ok).toBe(true)
    const sent = cloneParsedKeymap(editor.draftKeymap!)
    const sheet = await copyClipboardKeymap(editor, { writeText: async () => { throw new Error('denied') } })
    expect(sheet?.copied).toBe(false)
    expect(editor.isDirty).toBe(true)
    expect(editor.reorderLayers([0, 2, 1, 3]).ok).toBe(true)
    const live = editor.draftKeymap
    const liveSource = editor.clipboardOriginalSource
    sheet!.onCopied()
    expect(editor.baselineKeymap).toEqual(sent)
    expect(editor.draftKeymap).toBe(live)
    expect(editor.clipboardOriginalSource).toBe(liveSource)
    expect(editor.isDirty).toBe(true)
    await editor.flushPendingPersist()
    editor.resetForTests()
    await editor.selectKeyboard({ source: 'clipboard', layout, keymap: sent, clipboardOriginalSource: sheet!.code })
    expect(editor.draftKeymap).toEqual(live)
    expect(editor.undoStack).toHaveLength(0)
    expect(await editor.discardDraft()).toBe(true)
    expect(editor.clipboardOriginalSource).toBe(sheet!.code)
    expect(editor.layerView).toEqual({ shown: [0, 2, 7], layer0Raw: true })
  })

  it('revalidates copied source before the next operation and ignores superseded copy receipts', async () => {
    const source = buildKeymapCode(layout, fixture()).code
    const keymap = parseKeymap(parseDtsKeymap(source, { keyboard: 'clipboard-layer-operations' }))
    await editor.selectKeyboard({ source: 'clipboard', layout, keymap, clipboardOriginalSource: source })
    expect(editor.duplicateLayer(1).ok).toBe(true)
    const sheet = await copyClipboardKeymap(editor, { writeText: async () => { throw new Error('denied') } })
    await editor.selectKeyboard({ source: 'clipboard', layout, keymap, clipboardOriginalSource: source })
    const snapshot = editor.layerOperationSnapshot
    sheet!.onCopied()
    expect(editor.layerOperationSnapshot).toBe(snapshot)
    expect(editor.isDirty).toBe(false)
    editor.clipboardOriginalSource = `${source}// changed externally\n`
    expect(editor.reorderLayers([0, 2, 1, 3])).toMatchObject({ ok: false, error: expect.stringContaining('Source revision changed') })
    expect(editor.layerOperationSnapshot).toBe(snapshot)
    expect(editor.undoStack).toHaveLength(0)
  })

  it.each(['baseline', 'source'] as const)('refuses recovery against a changed %s', async changed => {
    const source = buildKeymapCode(layout, fixture()).code
    const keymap = parseKeymap(parseDtsKeymap(source, { keyboard: 'clipboard-layer-operations' }))
    await editor.selectKeyboard({ source: 'clipboard', layout, keymap, clipboardOriginalSource: source })
    expect(editor.reorderLayers([0, 2, 1, 3]).ok).toBe(true)
    await editor.flushPendingPersist()
    editor.resetForTests()
    const baseline = cloneParsedKeymap(keymap)
    if (changed === 'baseline') baseline.layers[0][0] = parseKeyBinding('&kp Z')
    await editor.selectKeyboard({ source: 'clipboard', layout, keymap: baseline, clipboardOriginalSource: changed === 'source' ? `${source}// new revision\n` : source })
    expect(editor.draftKeymap).toEqual(baseline)
    expect(editor.isDirty).toBe(false)
    expect(editor.saveNotice?.kind).toBe('warning')
    expect(await loadStoredDraft(editor.currentDraftIdentity()!)).toBeNull()
  })

  it('recomposes the moved layers and conditional warning without changing host state or combo selection', () => {
    editor.updateConditionalLayers([{ id: 'tri', ifLayers: [1, 2], thenLayer: 3 }])
    editor.updateCombos([{ id: 'selected', keyPositions: [0], binding: parseKeyBinding('&to 2'), layers: [2] }])
    editor.activeComboId = 'selected'
    const host = JSON.stringify({ view: editor.hostLegend, assemblies: editor.hostAssemblies, layouts: editor.userLayouts, delivered: editor.hostDeliveredFingerprint, repoDirty: editor.isHostRepoDirty })
    const before = composeLayerRows(editor.draftKeymap!.layers.map(row => row[0]), editor.hostLegend)
    expect(conditionalLayerCoverWarning(editor.draftKeymap!.conditionalLayers![0])).toBeNull()
    expect(editor.reorderLayers([0, 3, 1, 2]).ok).toBe(true)
    const after = composeLayerRows(editor.draftKeymap!.layers.map(row => row[0]), editor.hostLegend)
    expect(after[1].legend).toEqual(before[3].legend)
    expect(after[2].legend).toEqual(before[1].legend)
    expect(after[3].legend).toEqual(before[2].legend)
    expect(after[0].title).toBe('&mo 3')
    expect(conditionalLayerCoverWarning(editor.draftKeymap!.conditionalLayers![0])).toMatch(/below a held layer/)
    expect(editor.activeComboId).toBe('selected')
    expect(JSON.stringify({ view: editor.hostLegend, assemblies: editor.hostAssemblies, layouts: editor.userLayouts, delivered: editor.hostDeliveredFingerprint, repoDirty: editor.isHostRepoDirty })).toBe(host)
  })

  it.each(['local', 'github'] as const)('accepts the exact layer identities sent by ordinary %s publication', async source => {
    await editor.selectKeyboard(source === 'github'
      ? { source, layout, keymap: fixture(), github: { repository: 'synthetic/repo', branch: 'test' } }
      : { source, layout, keymap: fixture() })
    editor.addLayer()
    const sent = cloneParsedKeymap(editor.draftKeymap!)
    const ids = [...editor.layerOperationSnapshot!.ids]
    expect(await publishKeymap(editor, {
      write: async () => ({}),
      reload: async () => ({ keymap: sent })
    })).toBe(true)
    expect(editor.isDirty).toBe(false)
    expect(editor.undoStack).toHaveLength(0)
    expect(editor.layerOperationSnapshot?.ids).toEqual(ids)
    expect(editor._baselineLayerIds).toEqual(ids)
    expect(editor.duplicateLayer(1).ok).toBe(false)
  })

  it('keeps an identity-only undo during copy dirty and recoverable against the copied baseline', async () => {
    const keymap = { ...fixture(), keyboard: 'clipboard-layer-operations', keymap: 'clipboard', layout: 'LAYOUT', layer_names: ['Same', 'Same', 'Same', 'Same'], layers: Array.from({ length: 4 }, () => [parseKeyBinding('&kp A')]) }
    const source = buildKeymapCode(layout, keymap).code
    await editor.selectKeyboard({ source: 'clipboard', layout, keymap, clipboardOriginalSource: source })
    editor.layerView = { shown: [0, 1, 7], layer0Raw: true }
    expect(editor.reorderLayers([0, 2, 1, 3]).ok).toBe(true)
    let finishWrite!: () => void
    const copying = copyClipboardKeymap(editor, {
      writeText: () => new Promise<void>(resolve => { finishWrite = resolve })
    })
    editor.undo()
    finishWrite()
    const copied = await copying
    expect(copied?.copied).toBe(true)
    expect(editor.draftKeymap).toEqual(editor.baselineKeymap)
    expect(editor.isDirty).toBe(true)
    expect(editor.clipboardOriginalSource).toBe(source)
    await editor.flushPendingPersist()
    const stored = await loadStoredDraft(editor.currentDraftIdentity()!)
    expect(stored?.layerOperation?.snapshot.ids).toEqual(['loaded:0', 'loaded:1', 'loaded:2', 'loaded:3'])
    const baseline = cloneParsedKeymap(editor.baselineKeymap!)
    editor.resetForTests()
    await editor.selectKeyboard({ source: 'clipboard', layout, keymap: baseline, clipboardOriginalSource: copied!.code })
    expect(editor.undoStack).toHaveLength(0)
    expect(editor.isDirty).toBe(true)
    expect(editor.clipboardOriginalSource).toBe(source)
    expect(await editor.discardDraft()).toBe(true)
    expect(editor.layerView).toEqual({ shown: [0, 2, 7], layer0Raw: true })
    expect(editor.clipboardOriginalSource).toBe(copied!.code)
    expect(editor.isDirty).toBe(false)
  })

  it('clears both the central hover and the local decode owner after a move', () => {
    const close = vi.fn()
    claimLegendDecode(1, 2, close)
    editor.legendHover = { kind: 'layers', layers: [1, 2], source: 3 }
    expect(editor.reorderLayers([0, 2, 1, 3]).ok).toBe(true)
    expect(editor.legendHover).toBeNull()
    expect(close).toHaveBeenCalledOnce()
  })

  it('keeps IDs aligned through existing add/delete actions after a reorder', async () => {
    expect(editor.reorderLayers([0, 2, 1, 3]).ok).toBe(true)
    editor.addLayer()
    expect(editor.layerOperationSnapshot?.ids).toHaveLength(5)
    expect(editor.layerOperationSnapshot?.ids.slice(0, 4)).toEqual(['loaded:0', 'loaded:2', 'loaded:1', 'loaded:3'])
    editor.deleteLayer(1)
    expect(editor.layerOperationSnapshot?.ids).toHaveLength(4)
    expect(editor.layerOperationSnapshot?.ids.slice(0, 3)).toEqual(['loaded:0', 'loaded:1', 'loaded:3'])
    editor.undo()
    expect(editor.layerOperationSnapshot?.ids).toHaveLength(5)
    await editor.discardDraft()
    expect(editor.layerOperationSnapshot?.ids).toEqual(['loaded:0', 'loaded:1', 'loaded:2', 'loaded:3'])
  })

  it('blocks both operations independently for publication, host editing and every registered owner', () => {
    const before = editor.draftKeymap
    const schedule = vi.spyOn(editor, 'schedulePersist')
    const assertBlocked = () => {
      expect(editor.duplicateLayer(1).ok).toBe(false)
      expect(editor.reorderLayers([0, 2, 1, 3]).ok).toBe(false)
      expect(editor.draftKeymap).toBe(before)
      expect(editor.undoStack).toHaveLength(0)
    }
    editor.saving = true
    assertBlocked()
    editor.saving = false
    editor.beginHostEditSession(0, 1)
    assertBlocked()
    editor.endHostEditSession()
    for (const owner of ['key binding', 'encoder binding', 'combo binding', 'layer name', 'layer deletion', 'conditional rule']) {
      const unregister = editor.registerLayerOperationGuard(() => owner)
      assertBlocked()
      expect(editor.saveNotice?.messages[0]).toContain(owner)
      unregister()
    }
    expect(schedule).not.toHaveBeenCalled()
  })

  it('rechecks owner guards at the commit boundary', () => {
    let reads = 0
    const unregister = editor.registerLayerOperationGuard(() => ++reads > 1 ? 'key binding' : null)
    const before = editor.draftKeymap
    expect(editor.reorderLayers([0, 2, 1, 3]).ok).toBe(false)
    expect(editor.draftKeymap).toBe(before)
    expect(editor.undoStack).toHaveLength(0)
    unregister()
  })

  it('leaves history, redo, stored drafts and view untouched on identity/rejected moves', async () => {
    expect(editor.reorderLayers([0, 2, 1, 3]).ok).toBe(true)
    editor.renameLayer(1, 'Temporary')
    editor.undo()
    await editor.flushPendingPersist()
    const persisted = await loadStoredDraft(editor.currentDraftIdentity()!)
    const draft = editor.draftKeymap
    const baseline = editor.baselineKeymap
    const undo = editor.undoStack
    const redo = editor.redoStack
    const view = editor.layerView
    expect(editor.reorderLayers([0, 1, 2, 3])).toMatchObject({ ok: true, changed: false })
    expect(editor.reorderLayers([1, 0, 2, 3]).ok).toBe(false)
    const sparse = [0, 1, 2, 3]
    delete sparse[1]
    expect(editor.reorderLayers(sparse).ok).toBe(false)
    expect(editor.draftKeymap).toBe(draft)
    expect(editor.baselineKeymap).toBe(baseline)
    expect(editor.undoStack).toBe(undo)
    expect(editor.redoStack).toBe(redo)
    expect(editor.layerView).toBe(view)
    expect(await loadStoredDraft(editor.currentDraftIdentity()!)).toEqual(persisted)
  })

  it.each(['local', 'github', 'clipboard'] as const)('does not interpret missing %s source as source-free provenance', async source => {
    await editor.selectKeyboard(source === 'github'
      ? { source, layout, keymap: fixture(), github: { repository: 'synthetic/repo', branch: 'test' } }
      : { source, layout, keymap: fixture() })
    expect(editor.duplicateLayer(1).ok).toBe(false)
    expect(editor.reorderLayers([0, 2, 1, 3]).ok).toBe(false)
  })

  it('tracks a reorder of identical rows as dirty and recovers it instead of dropping a clean-looking model', async () => {
    const keymap = { ...fixture(), layer_names: ['Same', 'Same', 'Same', 'Same'], layers: Array.from({ length: 4 }, () => [parseKeyBinding('&kp A')]) }
    await editor.selectKeyboard({ source: 'demo', layout, keymap })
    expect(editor.reorderLayers([0, 2, 1, 3]).ok).toBe(true)
    expect(editor.draftKeymap).toEqual(editor.baselineKeymap)
    expect(editor.isDirty).toBe(true)
    await editor.flushPendingPersist()
    editor.resetForTests()
    await editor.selectKeyboard({ source: 'demo', layout, keymap })
    expect(editor.undoStack).toHaveLength(0)
    expect(editor.isDirty).toBe(true)
    expect(await editor.discardDraft()).toBe(true)
    expect(editor.isDirty).toBe(false)
  })

  it('preserves eye inclusion order and future marks on duplicate', () => {
    editor.layerView = { shown: [0, 3, 1, 4], layer0Raw: true }
    const view = editor.layerView
    expect(editor.duplicateLayer(1).ok).toBe(true)
    expect(editor.layerView).toBe(view)
    expect(editor.layerView.shown).toEqual([0, 3, 1, 4])
  })

  it('accepts copied layer identity as the new baseline and discards later reorders back to it', async () => {
    const source = buildKeymapCode(layout, fixture()).code
    const keymap = parseKeymap(parseDtsKeymap(source, { keyboard: 'clipboard-layer-operations' }))
    await editor.selectKeyboard({ source: 'clipboard', layout, keymap, clipboardOriginalSource: source })
    editor.layerView = { shown: [0, 1, 7], layer0Raw: true }
    expect(editor.reorderLayers([0, 2, 1, 3]).ok).toBe(true)
    const copied = await copyClipboardKeymap(editor, { writeText: async () => {} })
    expect(copied?.copied).toBe(true)
    expect(editor.isDirty).toBe(false)
    const published = cloneParsedKeymap(editor.baselineKeymap!)
    expect(editor.reorderLayers([0, 2, 1, 3]).ok).toBe(true)
    expect(await editor.discardDraft()).toBe(true)
    expect(editor.draftKeymap).toEqual(published)
    expect(editor.layerView.shown).toEqual([0, 2, 7])
    expect(editor.clipboardOriginalSource).toBe(copied!.code)
  })

  it('executes real core reorder and duplicate actions as single undoable transactions', () => {
    editor.layerView = { shown: [0, 1, 7], layer0Raw: true }
    const hostBefore = JSON.stringify(editor.hostLegend)
    expect(editor.reorderLayers?.([0, 2, 1, 3])).toMatchObject({ ok: true, changed: true })
    expect(editor.undoStack).toHaveLength(1)
    expect(editor.draftKeymap?.layer_names).toEqual(['Base', 'Raise', 'Lower', 'Adjust'])
    expect(editor.draftKeymap?.layers[0][0].params[0].value).toBe('1')
    expect(editor.layerView.shown).toEqual([0, 2, 7])
    expect(editor.duplicateLayer(2)).toMatchObject({ ok: true, changed: true })
    expect(editor.undoStack).toHaveLength(2)
    expect(editor.draftKeymap?.layer_names?.[4]).toBe('Lower copy')
    expect(editor.layerView.shown).toEqual([0, 2, 7])
    expect(JSON.stringify(editor.hostLegend)).toBe(hostBefore)
    editor.undo()
    editor.undo()
    expect(editor.isDirty).toBe(false)
    expect(editor.layerView.shown).toEqual([0, 1, 7])
    editor.redo()
    editor.redo()
    expect(editor.draftKeymap?.layer_names?.[4]).toBe('Lower copy')
  })

  it('persists identity and view correspondence for recovery with empty history', async () => {
    editor.layerView = { shown: [0, 1, 7], layer0Raw: true }
    expect(editor.reorderLayers([0, 2, 1, 3]).ok).toBe(true)
    await editor.flushPendingPersist()
    const stored = await loadStoredDraft(editor.currentDraftIdentity()!)
    expect(stored?.layerOperation?.snapshot.ids).toEqual(['loaded:0', 'loaded:2', 'loaded:1', 'loaded:3'])
    editor.resetForTests()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await selectFixture()
    expect(editor.undoStack).toEqual([])
    expect(editor.layerView.shown).toEqual([0, 2, 7])
    editor.layerView = toggleShownLayer(editor.layerView, 1)
    await editor.discardDraft()
    expect(editor.layerView).toEqual({ shown: [0, 1, 7, 2], layer0Raw: true })
  })

  it('maps current eye preferences through a structural transaction, undo, redo and discard', async () => {
    editor.layerView = { shown: [0, 1, 7], layer0Raw: true }
    expect(editor.reorderLayers([0, 2, 1, 3]).ok).toBe(true)
    expect(editor.layerView.shown).toEqual([0, 2, 7])
    editor.layerView = toggleShownLayer(editor.layerView, 1)
    editor.undo()
    expect(editor.layerView).toEqual({ shown: [0, 1, 7, 2], layer0Raw: true })
    editor.layerView = toggleShownLayer(editor.layerView, 1)
    editor.redo()
    expect(editor.layerView.shown).toEqual([0, 7, 1])
    editor.clearHistory()
    expect(await editor.discardDraft()).toBe(true)
    expect(editor.layerView).toEqual({ shown: [0, 7, 2], layer0Raw: true })
  })

  it('retains an immutable identity snapshot with each normal edit and undo', () => {
    const before = editor.layerOperationSnapshot
    expect(before?.ids).toEqual(['loaded:0', 'loaded:1', 'loaded:2', 'loaded:3'])
    editor.renameLayer(1, 'Navigation')
    expect(editor.layerOperationSnapshot?.ids).toEqual(before!.ids)
    editor.undo()
    expect(editor.layerOperationSnapshot).toEqual(before)
    expect(editor.draftKeymap).toEqual(editor.baselineKeymap)
  })
})
