/**
 * Shared editor document state (Svelte 5 runes).
 * Baseline (last load / successful publish+reload) vs draft (live edits).
 *
 * Domain logic lives in sibling modules; this file holds reactive state and
 * a thin façade that exposes the public `editor` singleton.
 */

import {
  diffKeymaps,
  getBehaviorCatalog,
  getKeycodeCatalog,
  resetHostLayoutRegistry,
  standardHostLegendView,
  standardLayerView,
  symbolAlign,
  type HostKeymapDeliverableFile,
  type HostKeymapSnapshot,
  type HostLayout,
  type HostLegendView,
  type KeyBindingNode,
  type KeymapChange,
  type LayerView,
  type LegendHover,
  type LayoutKey,
  type ParsedKeymap,
  type SymbolAlign,
  type ZmkCombo,
  type ZmkConditionalLayer,
  type ZmkHoldTap
} from '@keymap-editor/keymap-core'
import type { Definitions } from '../context'
import type { DemoHostLayoutSeed } from '../demo/host-seeds.js'
import type { DraftIdentity } from '../draft-storage'
import type {
  HostLanguageId,
  StoredHostAssembly,
  UserHostLayout,
  UserHostLayoutOrigin,
  UserHostLayoutRecord
} from '../host-layout-store'
import { assignEditorApi, GETTER_NAMES } from './assign-api'
import * as demoHost from './demo-host'
import * as documentApi from './document.svelte'
import * as hostEditUi from './host-edit-ui.svelte'
import * as hostLegendApi from './host-legend.svelte'
import * as hostRepo from './host-repo'
import * as persistDraft from './persist-draft'
import * as publishBridge from './publish-bridge'
import * as selectKeyboardApi from './select-keyboard'
import type {
  GithubKeyboardSelection,
  GithubMeta,
  HostKeyLevelEditResult,
  HostProfilePrompt,
  HostSymbolEditTarget,
  KeyboardSelection,
  KeyboardSelectionSource,
  SaveNotice
} from './types'

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
} from './types'
export { hostLegendAnchorIndex } from './helpers'
export { adoptHoldTaps, cloneParsedKeymap } from './keymap-clone'

export class EditorState {
  definitions = $state<Definitions | null>(null)
  source = $state<KeyboardSelectionSource | null>(null)
  githubMeta = $state<GithubMeta | null>(null)
  /** Pasted `.keymap` kept for clipboard splice / Copy. */
  clipboardOriginalSource = $state<string | null>(null)
  layout = $state<LayoutKey[] | null>(null)
  /**
   * Layout as last loaded. Scheme-mode `promoteAbsentKey` mutates `layout` only;
   * Discard restores this baseline. Not part of undo/redo.
   */
  baselineLayout = $state<LayoutKey[] | null>(null)
  /** Last loaded / successfully published+reloaded keymap. */
  baselineKeymap = $state<ParsedKeymap | null>(null)
  /** Live editor document; always set after load. */
  draftKeymap = $state<ParsedKeymap | null>(null)
  /** ZMK draft snapshots for step undo (not host edits; not vs baseline). */
  undoStack = $state<ParsedKeymap[]>([])
  /**
   * Hold-tap list staged by the key dialog. The next keymap update absorbs it
   * so Apply writes the new node and the key in one step. Cancel never sets it.
   */
  _holdTapsOnNextUpdate: ZmkHoldTap[] | null = null
  redoStack = $state<ParsedKeymap[]>([])
  saving = $state(false)
  /** View over the host profile. It does not edit the keymap. */
  _hostLegend = $state<HostLegendView>(standardHostLegendView())
  get hostLegend(): HostLegendView {
    return this._hostLegend
  }
  set hostLegend(view: HostLegendView) {
    this._hostLegend = view
    // Stack needs three columns; drop the preference when the board no longer qualifies.
    if (view.columns.length < 3) this.multilangView = false
  }
  /** Column sets remembered for this keyboard. Each one points at layouts. */
  hostAssemblies = $state<StoredHostAssembly[]>([])
  /**
   * Bumps when a user layout is registered/replaced in the core registry.
   * The registry is not reactive; board compose reads this so keycaps repaint.
   */
  hostLayoutRevision = $state(0)
  /**
   * Deliverable fingerprint (`layoutIds|revision`) captured by the last
   * Linux/Windows export via `markHostDelivered`. Host is dirty while
   * deliverable user layouts exist and the live fingerprint differs.
   */
  hostDeliveredFingerprint = $state('')
  /**
   * Session toggle. On underlines a symbol that sits on a different key and
   * outlines AltGr cells the combined Windows file cannot keep. Not stored
   * with the legend view.
   */
  symbolAlignOn = $state(true)
  /**
   * Session toggle. Stacks every host language on the key and hides other
   * firmware layers. Needs at least three host columns (`multilangViewOn`).
   * Not stored with the legend view or the layer view.
   */
  multilangView = $state(false)
  /**
   * Session toggle. Soft wash tint per firmware layer on the keycap and in the
   * legend table. Off by default; not stored with the legend view.
   */
  layerTonesOn = $state(false)
  /** Full matrix + layout row/col rails on the board. Session-only; not stored. */
  schemeMode = $state(false)
  /**
   * Session mode: list/edit ZMK combos and pick `key-positions` on the board.
   * Not stored with the keymap draft identity.
   */
  comboMode = $state(false)
  /** Selected combo id while `comboMode` is on. */
  activeComboId = $state<string | null>(null)
  /** Short hint while editing combos (key count or a shared chord). */
  comboNotice = $state<string | null>(null)

  /** Which firmware layers are drawn on the keycap. */
  layerView = $state<LayerView>(standardLayerView())
  userLayouts = $state<UserHostLayout[]>([])
  hostProfilePrompt = $state<HostProfilePrompt | null>(null)
  hostProfileNote = $state<string | null>(null)
  legendHover = $state<LegendHover | null>(null)
  /** Persistent host-symbol catalog (docked, not per-cell popover). */
  hostSymbolCatalogOpen = $state(false)
  hostSymbolEditTarget = $state<HostSymbolEditTarget | null>(null)
  /**
   * Alt+click host-edit session on a composed row. Instant writes still go through
   * setHostKeyLevel; this only locks the decode card until Accept/Cancel.
   */
  hostEditSession = $state<{ keyIndex: number; layer: number } | null>(null)
  saveNotice = $state<SaveNotice | null>(null)

  /** Bumps on select / new publish so stale reloads are ignored. */
  _publishGeneration = 0
  /** Bumps on select so stale IDB restore prompts are ignored. */
  _selectGeneration = 0
  /** Bumps to cancel in-flight / debounced IDB writes. */
  _persistGeneration = 0
  _persistTimer: ReturnType<typeof setTimeout> | null = null
  /**
   * Identity we already offered Restore/Discard for this session.
   * Prevents picker effect re-entry from wiping a restored draft.
   */
  _handledDraftIdentityKey: string | null = null
  /**
   * Encoded `host_keymap/snapshot.json` last loaded from or committed to the
   * GitHub repo. Null when this session has no repo host baseline yet.
   */
  _hostRepoBaselineEncoded: string | null = null

  _changes = $derived.by(() => {
    if (!this.baselineKeymap || !this.draftKeymap) return []
    return diffKeymaps(this.baselineKeymap, this.draftKeymap)
  })

  /** Null when the toggle is off or fewer than two languages are on the key. */
  symbolAlignIndex = $derived.by((): SymbolAlign | null => {
    void this.hostLayoutRevision
    if (!this.symbolAlignOn) return null
    const pair = this._alignInputs()
    if (!pair) return null
    return symbolAlign(pair.left, pair.right, { winMerge: pair.winMerge })
  })

  /** Encoded binding before the unpublished edit, keyed by `keyIndex:layer`. */
  unpublishedBefore = $derived.by(() => {
    const map = new Map<string, string>()
    for (const change of this._changes) {
      if (change.type === 'binding') map.set(`${change.index}:${change.layer}`, change.before)
    }
    return map
  })

  initCatalogs() {
    this.definitions = {
      keycodes: getKeycodeCatalog(),
      behaviours: getBehaviorCatalog()
    }
  }

  /**
   * Drop the loaded keymap session (document, modes, host-edit UI).
   * Host layout profiles stay in the browser. Shared with `resetForTests`.
   */
  reset() {
    this._cancelPersistTimer()
    this._persistGeneration += 1
    this._selectGeneration += 1
    this._publishGeneration += 1
    this._hostRepoBaselineEncoded = null
    this.endHostEditSession()
    this.legendHover = null
    this.source = null
    this.githubMeta = null
    this.clipboardOriginalSource = null
    this.layout = null
    this.baselineLayout = null
    this.baselineKeymap = null
    this.draftKeymap = null
    this.clearHistory()
    this.saving = false
    this.schemeMode = false
    this.comboMode = false
    this.activeComboId = null
    this.comboNotice = null
    this.saveNotice = null
  }

  /** Drop the loaded keymap after GitHub logout. Host layouts stay in the browser. */
  clearLoadedKeymap() {
    this.reset()
  }

  /** Reset singleton between vitest cases (no-op outside test/dev). */
  resetForTests() {
    if (import.meta.env.MODE !== 'test' && !import.meta.env.DEV) return
    this.reset()
    this._handledDraftIdentityKey = null
    this._holdTapsOnNextUpdate = null
    this.definitions = null
    resetHostLayoutRegistry()
    this.hostLegend = standardHostLegendView()
    this.hostAssemblies = []
    this.hostLayoutRevision = 0
    this.hostDeliveredFingerprint = ''
    this.symbolAlignOn = true
    this.multilangView = false
    this.layerTonesOn = false
    this.layerView = standardLayerView()
    this.userLayouts = []
    this.hostProfilePrompt = null
    this.hostProfileNote = null
  }

  declare promoteAbsentKey: (keyIndex: number, binding: KeyBindingNode) => void
  declare readonly isDirty: boolean
  declare readonly changes: KeymapChange[]
  declare readonly statusText: string
  declare readonly canUndo: boolean
  declare readonly canRedo: boolean
  declare readonly hostLegendLayerNames: string[]
  declare clearHistory: () => void
  declare addLayer: () => void
  declare renameLayer: (index: number, name: string) => void
  declare deleteLayer: (index: number) => void
  declare updateSensorBinding: (
    layer: number,
    index: number,
    binding: KeyBindingNode
  ) => void
  declare armHoldTapsForNextUpdate: (holdTaps: ZmkHoldTap[] | null) => void
  declare updateHoldTaps: (holdTaps: ZmkHoldTap[]) => void
  declare updateConditionalLayers: (conditionalLayers: ZmkConditionalLayer[]) => void
  declare updateKeymap: (next: ParsedKeymap) => void
  declare updateCombos: (combos: ZmkCombo[]) => void
  declare toggleComboMode: () => void
  declare tryExitComboMode: () => boolean
  declare refreshComboNotice: () => void
  declare toggleComboPosition: (keyIndex: number) => void
  declare undo: () => void
  declare redo: () => void
  declare discardDraft: () => Promise<boolean>
  declare currentDraftIdentity: () => DraftIdentity | null
  declare _cancelPersistTimer: () => void
  declare schedulePersist: () => void
  declare _flushPersist: (token: number) => Promise<void>
  declare clearPersistedDraft: () => Promise<void>
  declare _maybeRestorePersistedDraft: (selectToken: number) => Promise<void>
  declare _draftIdentityMatches: (identityKey: string) => boolean
  declare selectKeyboard: (event: KeyboardSelection) => Promise<void>
  declare _preserveGithubSession: (
    event: GithubKeyboardSelection,
    upcomingIdentity: DraftIdentity | null,
    upcomingKey: string | null,
    selectToken: number
  ) => Promise<boolean>
  declare _migrateSessionIdentity: (
    previous: DraftIdentity | null,
    next: DraftIdentity | null
  ) => Promise<void>
  declare beginPublish: () => number
  declare isPublishCurrent: (
    token: number,
    source: string | null,
    github: GithubMeta | null
  ) => boolean
  declare readonly isPublishDirty: boolean
  declare applyPublished: (reloaded: ParsedKeymap, saveMeta?: unknown) => void
  declare applyClipboardCopied: (reloaded: ParsedKeymap, _saveMeta?: unknown) => void
  declare applyReloadFailure: (source?: string | null) => void
  declare applySaveFailure: (data: unknown) => void
  declare restoreHostProfiles: () => Promise<void>
  declare _registerUserLayout: (record: UserHostLayoutRecord) => void
  declare _materializeUserHostLayoutFromTable: (
    language: HostLanguageId,
    preferredName: string,
    source: HostLayout,
    origin: UserHostLayoutOrigin
  ) => Promise<string>
  declare _hostLegendSettingId: () => string | null
  declare _persistHostLegend: () => Promise<void>
  declare _restoreHostLegend: (selectToken: number) => Promise<void>
  declare _hostAssembliesSettingId: () => string | null
  declare _persistHostAssemblies: () => Promise<void>
  declare _restoreHostAssemblies: (selectToken: number) => Promise<void>
  declare _layoutShortName: (layoutId: string, language: HostLanguageId) => string
  declare hostAssemblyParts: (
    view: HostLegendView
  ) => { language: HostLanguageId; layoutName: string }[]
  declare hostAssemblyLabel: (view: HostLegendView) => string
  declare hostAssemblyActive: (view: HostLegendView) => boolean
  declare hostAssemblySaved: () => boolean
  declare hostAssemblyRememberBlocked: () => boolean
  declare rememberHostAssembly: () => Promise<void>
  declare showHostAssembly: (id: string) => Promise<void>
  declare forgetHostAssembly: (id: string) => Promise<void>
  declare activeProfileId: (language: HostLanguageId) => string
  declare _alignInputs: () => {
    left: HostLayout
    right: HostLayout
    winMerge: { base: HostLayout; extra: HostLayout } | null
  } | null
  declare readonly canAlignHostSymbols: boolean
  declare readonly symbolAlignShowsWinAltGr: boolean
  declare readonly multilangViewOn: boolean
  declare ensureEditableUserHostLayout: (language: HostLanguageId) => Promise<string>
  declare setHostKeyLevel: (
    language: HostLanguageId,
    zmk: string,
    level: number,
    text: string
  ) => Promise<HostKeyLevelEditResult>
  declare _commitUserHostLayout: (layoutId: string, layout: HostLayout) => Promise<boolean>
  declare revertHostKeyLevel: (
    language: HostLanguageId,
    zmk: string,
    level: number
  ) => Promise<HostKeyLevelEditResult>
  declare profilesForLanguage: (language: HostLanguageId) => UserHostLayout[]
  declare commitHostMap: (next: HostLegendView) => Promise<void>
  declare selectLanguageProfile: (language: HostLanguageId, id: string) => Promise<void>
  declare beginSaveHostProfile: (language: HostLanguageId) => void
  declare beginCopyHostProfile: (language: HostLanguageId, layoutId?: string) => void
  declare importHostLayoutFromXkb: (
    language: HostLanguageId,
    text: string,
    section: string,
    fileName: string
  ) => Promise<string | null>
  declare _showHostLanguage: (language: HostLanguageId) => void
  declare importHostLayoutFromKlc: (
    language: HostLanguageId,
    source: Uint8Array | string,
    fileName: string
  ) => Promise<string | null>
  declare exportUserHostLayoutXkb: (
    layoutId: string
  ) => { text: string; name: string } | null
  declare exportUserHostLayoutKlc: (
    layoutId: string
  ) => { bytes: Uint8Array; name: string } | null
  declare listCapsAlphabetKlcExports: () => Array<{
    capsLanguage: HostLanguageId
    capsLanguageName: string
    baseLanguageName: string
    baseLayoutName: string
    capsLayoutName: string
    fileStem: string
  }>
  declare exportCapsAlphabetKlc: (
    capsLanguage: HostLanguageId,
    version?: number
  ) => { bytes: Uint8Array; name: string; kbdId: string } | null
  declare _layoutColumnName: (layoutId: string, language: HostLanguageId) => string
  declare beginRenameHostProfile: (language: HostLanguageId, profileId?: string) => void
  declare beginDeleteHostProfile: (language: HostLanguageId, profileId?: string) => void
  declare deleteActiveHostProfile: () => Promise<void>
  declare cancelHostProfilePrompt: () => void
  declare confirmHostProfileName: (raw: string) => Promise<string | null>
  declare _renameHostProfile: (
    language: HostLanguageId,
    name: string
  ) => Promise<string | null>
  declare readonly hostDeliverableLayoutIds: string[]
  declare readonly hostDeliverableFingerprint: string
  declare readonly isHostDirty: boolean
  declare markHostDelivered: () => void
  declare listActiveHostLayoutExports: () => Array<{
    layoutId: string
    language: HostLanguageId
    languageName: string
    flag: string
    xkbModule: string
    name: string
    text: string
    exampleSystemPath: string
    exampleUserPath: string
  }>
  declare exportActiveHostLayoutsXkb: () => { text: string; name: string } | null
  declare buildCurrentHostKeymapSnapshot: () => HostKeymapSnapshot
  declare buildCurrentHostKeymapDeliverables: () => HostKeymapDeliverableFile[]
  declare _encodeLiveHostSnapshot: () => string
  declare readonly isHostRepoDirty: boolean
  declare acceptHostRepoBaseline: (encoded?: string) => void
  declare _applyHostKeymapSnapshot: (
    snapshot: HostKeymapSnapshot,
    selectToken: number
  ) => Promise<void>
  declare _rollbackUserHostLayoutWrites: (ids: string[]) => Promise<void>
  declare armHostSymbolEdit: (target: HostSymbolEditTarget) => void
  declare clearHostSymbolEdit: () => void
  declare beginHostEditSession: (keyIndex: number, layer: number, zmk?: string) => void
  declare endHostEditSession: () => void
  declare closeHostSymbolCatalog: () => void
  declare stepHostSymbolEdit: (delta: number) => void
  declare pickHostSymbol: (text: string) => Promise<HostKeyLevelEditResult>
  declare _seedDemoHostLayouts: (
    seeds: DemoHostLayoutSeed[],
    selectToken: number
  ) => Promise<void>
  declare _maybeAddPreferredDemoLanguage: (selectToken: number) => Promise<void>
}

for (const mod of [
  documentApi,
  persistDraft,
  selectKeyboardApi,
  publishBridge,
  hostLegendApi,
  hostRepo,
  hostEditUi,
  demoHost
]) {
  assignEditorApi(EditorState.prototype, mod as Record<string, unknown>, GETTER_NAMES)
}

export const editor = new EditorState()
