import {
  loadKeyboardBundle, resolveCatalogLayout,
  type CatalogLayoutResult, type LayoutCatalog, type LayoutCatalogRequest
} from '@keymap-editor/keymap-core'
import type { EditorState } from './editor/state.svelte'

/** Source proof supplied by the source adapter, never inferred from a board name. */
export type LayoutDiscoveryInput = { code: string | null; explicit: boolean; sourceId?: string; sourceRevision?: string }

function checkAvailable(editor: EditorState) {
  if (!['clipboard', 'github'].includes(editor.source ?? '') || !editor.draftKeymap || !editor.layout) throw new Error('Load a Clipboard or GitHub document first.')
  if (editor.layoutDiscoveryInput?.explicit) throw new Error('Supplied layout JSON takes precedence. Discovery cannot replace it.')
  if (!editor.layoutDiscoveryInput?.code) throw new Error('Selected .keymap source is unavailable. Reload with the original source or supply explicit layout JSON.')
  if (editor.source === 'github') {
    const meta = editor.githubMeta
    if (!meta?.headSha || editor.layoutDiscoveryInput.sourceRevision !== meta.headSha ||
        editor.layoutDiscoveryInput.sourceId !== JSON.stringify([meta.repository, meta.branch, meta.keymapPath])) {
      throw new Error('Selected source proof is stale. Reload before discovering a layout.')
    }
  } else if (!editor.clipboardOriginalSource) throw new Error('Reload with the original Clipboard source.')
  if (editor.isDirty || editor.hasPendingFirmwareRecovery || editor.hasLocalHostRecovery || editor.hostRecoveryBusy || editor._firmwareRecoveryLoading) throw new Error('Finish or discard edits and resolve recovery before discovering a layout.')
  const blocker = editor.layerOperationBlocker()
  if (blocker) throw new Error(blocker)
}

function revision(editor: EditorState) {
  return JSON.stringify({
    generation: editor._selectGeneration, publish: editor._publishGeneration,
    source: editor.source, github: editor.githubMeta, input: editor.layoutDiscoveryInput,
    code: editor.clipboardOriginalSource, keymap: editor.draftKeymap,
    layout: editor.layout, baseline: editor.baselineLayout,
    undo: editor.undoStack, redo: editor.redoStack, layer: editor.layerOperationSnapshot
  })
}

export function captureLayoutDocument(editor: EditorState) {
  checkAvailable(editor)
  return {
    keymap: editor.draftKeymap!, revision: revision(editor),
    source: {
      id: JSON.stringify(editor.currentDraftIdentity()),
      revision: editor.source === 'github' ? editor.githubMeta?.headSha ?? '' : `clipboard/${editor._selectGeneration}/${editor._publishGeneration}`,
      code: editor.source === 'clipboard' ? editor.clipboardOriginalSource! : editor.layoutDiscoveryInput!.code!
    }
  }
}
export type LayoutDocument = ReturnType<typeof captureLayoutDocument>

// Only a preview produced for this captured document can authorize acceptance.
const previews = new WeakMap<object, { document: LayoutDocument; json: string }>()
export function previewLayout(document: LayoutDocument, catalog: LayoutCatalog, entryId: string, candidate?: LayoutCatalogRequest['selection']['candidate']): CatalogLayoutResult {
  const result = resolveCatalogLayout({ catalog, source: document.source, keymap: document.keymap,
    selection: { entryId, sourceId: document.source.id, sourceRevision: document.source.revision, catalogRevision: catalog.revision, candidate } })
  if (result.status === 'candidate') {
    const json = JSON.stringify({ layouts: { default: { layout: result.layout.layout } }, discovery: { ...result.provenance, transform: result.layout.transform, compatible: result.layout.compatible, geometry: result.layout.geometry, positions: result.layout.positions, offset: result.layout.offset, sensorLabels: result.layout.sensorLabels ?? null } }, null, 2)
    // Core validates order/count/geometry again through the exported JSON path.
    loadKeyboardBundle({ infoJson: JSON.parse(json), keymap: document.keymap })
    previews.set(result, { document, json })
  }
  return result
}

export function exportLayout(editor: EditorState, document: LayoutDocument, result: CatalogLayoutResult): string {
  checkAvailable(editor)
  const receipt = previews.get(result)
  if (revision(editor) !== document.revision || receipt?.document !== document) throw new Error('Document or source changed. Close and reopen Layout discovery.')
  if (result.status !== 'candidate' || !receipt) throw new Error('Preview a valid layout first.')
  return receipt.json
}

export function acceptLayout(editor: EditorState, document: LayoutDocument, result: CatalogLayoutResult, acknowledged: boolean) {
  const json = exportLayout(editor, document, result)
  if (!acknowledged) throw new Error('Acknowledge unverified firmware compatibility and catalog provenance first.')
  const bundle = loadKeyboardBundle({ infoJson: JSON.parse(json), keymap: document.keymap })
  // Session display only: keep the loaded baseline for branch carry, recovery and Discard.
  editor.layout = bundle.layout.map(key => ({ ...key }))
  editor.legendHover = null
  editor.saveNotice = { kind: 'warning', messages: [
    `Layout accepted for this session: ${result.status === 'candidate' && result.layout.geometry === 'source-declared' ? 'source-declared geometry, not independently measured' : 'inferred electrical arrangement, not measured physical geometry'}. Scheme shows serialization slots, not electrical coordinates. No files written; reload requires a new preview or explicit layout JSON.`
  ] }
}
