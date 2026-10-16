import {
  buildKeymapCode, cloneParsedKeymap, diffKeymaps, macroDefinitionsFingerprint, parseDtsMacros,
  type ParsedKeymap
} from '@keymap-editor/keymap-core'
import type { EditorState } from './editor/state.svelte'

/** UI transaction state; all source proof and generation remain in core. */
function checkBusy(editor: EditorState, ownGuard?: () => string | null) {
  if (editor.saving || editor.hostEditSession || editor.hostRecoveryBusy || editor.hasPendingFirmwareRecovery || editor._firmwareRecoveryLoading) {
    throw new Error('Finish publication, recovery or host editing before changing macros.')
  }
  if (editor._holdTapsOnNextUpdate || editor._rgbLayerRecipeOnNextUpdate !== null) throw new Error('Finish the staged binding definition first.')
  for (const guard of editor._layerDraftGuards.values()) {
    const reason = guard === ownGuard ? null : guard()
    if (reason) throw new Error(`Close the ${reason} draft before changing macros.`)
  }
}

export function captureMacroDocument(editor: EditorState, ownGuard?: () => string | null) {
  checkBusy(editor, ownGuard)
  if (!editor.draftKeymap || !editor.layout || !editor.layerOperationSnapshot) throw new Error('Load a document first.')
  if (editor.source !== 'demo' && (editor.source !== 'clipboard' || !editor.clipboardOriginalSource)) {
    throw new Error('Macro authoring requires Demo or matching Clipboard source. GitHub/local and missing-source documents are read-only here.')
  }
  return {
    keymap: editor.draftKeymap,
    layout: editor.layout,
    source: editor.clipboardOriginalSource,
    kind: editor.source,
    generation: editor._selectGeneration,
    snapshot: editor.layerOperationSnapshot,
    ownGuard
  }
}
export type MacroDocument = ReturnType<typeof captureMacroDocument>

export function buildMacroPreview(document: MacroDocument, keymap: ParsedKeymap) {
  const built = buildKeymapCode(document.layout, keymap, {
    originalSource: document.kind === 'clipboard' ? document.source! : undefined,
    allowSourceFreeMacros: document.kind === 'demo'
  })
  // A subsequent invocation must see a newly created definition in its source.
  // Carry the exact writer result with the semantic model in existing history.
  const definitions = parseDtsMacros(built.code).definitions
  const next = cloneParsedKeymap(keymap)
  next.macros = definitions
  if (document.kind === 'clipboard') next.macroSourceFingerprint = macroDefinitionsFingerprint(definitions)
  return { keymap: next, code: built.code }
}

export function confirmMacroPreview(editor: EditorState, document: MacroDocument, preview: ReturnType<typeof buildMacroPreview>) {
  if (editor.draftKeymap !== document.keymap || editor.layout !== document.layout ||
      editor.clipboardOriginalSource !== document.source || editor.source !== document.kind ||
      editor._selectGeneration !== document.generation || editor.layerOperationSnapshot !== document.snapshot) {
    throw new Error('Document or source changed. Cancel and reopen the macro editor.')
  }
  checkBusy(editor, document.ownGuard)
  if (diffKeymaps(document.keymap, preview.keymap).length === 0) return
  editor.updateKeymap(preview.keymap, document.kind === 'clipboard' ? {
    // Persist the matching source with recovery, not only in undo/redo memory.
    ...document.snapshot, identityAware: true, source: preview.code, sourceModel: cloneParsedKeymap(preview.keymap)
  } : undefined)
}
