/**
 * Public editor entry — re-exports the split modules under `./editor/`.
 */
export {
  EditorState,
  editor,
  hostLegendAnchorIndex
} from './editor/index.js'
export type {
  ClipboardKeyboardSelection,
  DemoKeyboardSelection,
  GithubKeyboardSelection,
  GithubMeta,
  HostKeyLevelEditResult,
  HostProfilePrompt,
  HostSymbolEditTarget,
  KeyboardSelection,
  KeyboardSelectionSource,
  KeymapPickerPayload,
  LocalKeyboardSelection,
  SaveNotice
} from './editor/index.js'
