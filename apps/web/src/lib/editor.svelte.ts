/**
 * Shared editor document state (Svelte 5 runes).
 * Baseline (last load / successful publish+reload) vs draft (live edits).
 */

import {
  diffKeymaps,
  getBehaviorCatalog,
  getKeycodeCatalog,
  addHostLanguage,
  assignHostLanguageLayout,
  hostAssemblyName,
  HOST_ASSEMBLY_LIMIT,
  sameHostLegendView,
  decodeKlc,
  hostLanguage,
  hostLanguageName,
  hostLanguagesAvailable,
  preferredAddableHostLanguage,
  windowsCapsPairingRecommended,
  hostLayout,
  hostLayoutChoice,
  hostLayoutChoiceLabel,
  hostLayoutFromXkb,
  hostLayoutMeta,
  hostLegendColumns,
  hostLayoutToXkbSection,
  hostLayoutToKlc,
  hostLayoutsToCapsKlc,
  pairedKbdId,
  encodeKlc,
  windowsLocale,
  listXkbSections,
  parseKlc,
  primarySystemLayoutId,
  glyphToKeysym,
  hostLevels,
  keysymToGlyph,
  registerHostLayout,
  resetHostLayoutRegistry,
  standardHostLegendView,
  toggleHostLanguage,
  isLegacyBilingualHostLegend,
  standardLayerView,
  remapShownLayersAfterDelete,
  remapConditionalLayersAfterDelete,
  unregisterHostLayout,
  summarizeKeymapDiff,
  withHostKey,
  symbolAlign,
  symbolAlignPairFromView,
  promoteAbsentLayoutKey,
  isBlankLayerBinding,
  buildHostKeymapSnapshot,
  encodeHostKeymapSnapshot,
  hostLayoutFromKeymapSnapshotKeys,
  buildHostKeymapDeliverableFiles,
  cloneHostLegendView,
  cloneHostLayoutTable,
  type HostKeymapSnapshot,
  type HostKeymapDeliverableFile,
  type HostLayout,
  type SymbolAlign,
  type HostLegendView,
  type KeysymRejection,
  type LayerView,
  type LegendHover,
  type KeyBindingNode,
  type KeymapChange,
  type LayoutKey,
  type ParsedKeymap,
  type ZmkCombo,
  type ZmkConditionalLayer,
  type ZmkHoldTap,
  COMBO_MAX_KEYS,
  comboChordOverlap,
  comboChordOverlapPartners,
  comboKeysIssue,
  comboKeysMessage,
  comboOverlapMessage,
  normalizeParsedKeymap
} from '@keymap-editor/keymap-core'
import type { Definitions } from './context'
import {
  demoHostLayoutTable,
  type DemoHostLayoutSeed
} from './demo/host-seeds.js'
import {
  baselineFingerprint,
  buildDraftIdentity,
  deleteStoredDraft,
  draftIdentityKey,
  loadStoredDraft,
  saveStoredDraft,
  type DraftIdentity
} from './draft-storage'
import {
  readClipboardOriginalSource,
  writeClipboardOriginalSource
} from './clipboard/session.js'
import {
  deleteUserHostLayout,
  isUserHostLayoutId,
  deleteHostLegendView,
  hostAssembliesSettingId,
  hostLegendSettingId,
  loadHostAssemblies,
  loadHostLegendView,
  loadUserHostLayouts,
  reservedProfileName,
  uniqueUserHostLayoutName,
  sanitizeHostLegendView,
  saveHostAssemblies,
  saveHostLegendView,
  saveUserHostLayout,
  UNKNOWN_HOST_LAYOUT_NOTE,
  type HostLanguageId,
  type StoredHostAssembly,
  type UserHostLayout,
  type UserHostLayoutOrigin,
  type UserHostLayoutRecord
} from './host-layout-store'
import { defaultHostEditTarget, stepHostEditTarget } from './host-edit-cycle'
import {
  formatKeymapSaveWarningNotices,
  formatKeymapSaveWarnings
} from './keymap-save-warnings.js'

export type HostProfilePrompt =
  | { kind: 'save-as'; language: HostLanguageId }
  | { kind: 'copy'; language: HostLanguageId; layoutId?: string }
  | { kind: 'rename'; language: HostLanguageId; profileId?: string }
  | { kind: 'delete'; language: HostLanguageId; profileId?: string }

/** Armed host-level cell that receives glyphs from the persistent symbol catalog. */
export type HostSymbolEditTarget = {
  language: HostLanguageId
  zmk: string
  level: number
}

/** Result of editing one host-layout level from the decode card. */
export type HostKeyLevelEditResult =
  | {
      ok: true
      keysym: string
      layoutId: string
      /** Base level is a non-character keysym — the key drops out of composition. */
      dropsFromCompose: boolean
    }
  | {
      ok: false
      reason: 'rejected' | 'unknown-key' | 'missing-layout' | 'no-target'
      detail?: KeysymRejection
    }

export type SaveNotice = {
  kind: 'warning' | 'error'
  messages: string[]
  /** Optional help links for load/save warnings (e.g. Shield Wizard). */
  links?: Array<{ href: string; label: string }>
}

export type GithubMeta = { repository: string; branch: string }

/** Max draft snapshots kept for undo / redo. */
const HISTORY_LIMIT = 50

/** Debounce for IndexedDB draft writes. */
const PERSIST_DEBOUNCE_MS = 400

function pairedImportNames(
  description: string,
  caps: HostLanguageId,
  stem: string
): { baseName: string; capsName: string } {
  const parts = description.split(/\s+\+\s+/)
  if (parts.length >= 2 && parts[0].trim() && parts[1].trim()) {
    return { baseName: parts[0].trim(), capsName: parts.slice(1).join(' + ').trim() }
  }
  return {
    baseName: description.trim() || stem,
    capsName: hostLanguageName(caps)
  }
}

function extractErrorMessages(data: unknown): string[] {
  if (
    data &&
    typeof data === 'object' &&
    Array.isArray((data as { errors?: unknown }).errors)
  ) {
    return (data as { errors: unknown[] }).errors.map(String)
  }
  return ['Save failed.']
}

const LETTER_KEYCODE = /^[A-Z]$/

/** Index of the host-legend sample key: `&kp E` on layer0, else the first letter `&kp`. */
export function hostLegendAnchorIndex(keymap: ParsedKeymap | null | undefined): number {
  const layer0 = keymap?.layers[0]
  if (!layer0 || layer0.length === 0) return 0
  const eAt = layer0.findIndex(
    node => node.value === '&kp' && String(node.params[0]?.value ?? '') === 'E'
  )
  if (eAt >= 0) return eAt
  const letterAt = layer0.findIndex(
    node =>
      node.value === '&kp' &&
      LETTER_KEYCODE.test(String(node.params[0]?.value ?? ''))
  )
  return letterAt >= 0 ? letterAt : 0
}

/** Deep clone plain ParsedKeymap (value+params only). Never structuredClone reactive graphs. */
function cloneSensorBinding(node: KeyBindingNode): KeyBindingNode {
  return {
    value: node.value,
    params: Array.isArray(node.params) ? node.params.map(cloneSensorBinding) : []
  }
}

export function cloneParsedKeymap(km: ParsedKeymap): ParsedKeymap {
  const cloneBinding = cloneSensorBinding
  const normalized = normalizeParsedKeymap(km)

  const out: ParsedKeymap = {
    layer_names: normalized.layer_names!,
    layers: normalized.layers.map(layer => layer.map(cloneBinding))
  }
  if (normalized.keyboard != null) out.keyboard = normalized.keyboard
  if (normalized.keymap != null) out.keymap = normalized.keymap
  if (normalized.layout != null) out.layout = normalized.layout
  // Keep explicit `combos: []` so Save can drop the DTS block (absent ≠ empty).
  if (normalized.combos !== undefined) {
    out.combos = normalized.combos.map(c => {
      const combo: ZmkCombo = {
        id: c.id,
        keyPositions: [...c.keyPositions],
        binding: cloneBinding(c.binding)
      }
      if (c.timeoutMs !== undefined) combo.timeoutMs = c.timeoutMs
      if (c.requirePriorIdleMs !== undefined) {
        combo.requirePriorIdleMs = c.requirePriorIdleMs
      }
      if (c.slowRelease) combo.slowRelease = true
      if (c.layers) combo.layers = [...c.layers]
      return combo
    })
  }
  if (normalized.conditionalLayers) {
    out.conditionalLayers = normalized.conditionalLayers.map(rule => ({
      id: rule.id,
      ifLayers: [...rule.ifLayers],
      thenLayer: rule.thenLayer
    }))
  }
  if (normalized.holdTaps) {
    out.holdTaps = normalized.holdTaps.map(holdTap => {
      const copy: ZmkHoldTap = { code: holdTap.code }
      if (holdTap.override) copy.override = true
      if (holdTap.nodeName) copy.nodeName = holdTap.nodeName
      if (holdTap.tappingTermMs != null) copy.tappingTermMs = holdTap.tappingTermMs
      if (holdTap.quickTapMs != null) copy.quickTapMs = holdTap.quickTapMs
      if (holdTap.requirePriorIdleMs != null) copy.requirePriorIdleMs = holdTap.requirePriorIdleMs
      if (holdTap.flavor) copy.flavor = holdTap.flavor
      if (holdTap.bindings) copy.bindings = [...holdTap.bindings]
      if (holdTap.params) copy.params = [...holdTap.params]
      return copy
    })
  }
  if (normalized.sensorBindings) {
    out.sensorBindings = normalized.sensorBindings.map(row => row.map(cloneBinding))
  }
  return out
}

/**
 * Hold-tap timings come from the keymap file. A draft saved before that load
 * keeps its bindings and takes the timings from the loaded keymap.
 * An explicit list on the draft, including empty, stays as saved.
 */
export function adoptHoldTaps(draft: ParsedKeymap, loaded: ParsedKeymap | null): ParsedKeymap {
  if (draft.holdTaps != null || !loaded?.holdTaps) return draft
  return cloneParsedKeymap({ ...draft, holdTaps: loaded.holdTaps })
}

/**
 * Encoder lists come from the keymap file. A draft saved before that load
 * keeps its bindings and takes the encoder rows from the loaded keymap.
 * An explicit list on the draft, including empty, stays as saved.
 */
function adoptSensorBindings(
  draft: ParsedKeymap,
  loaded: ParsedKeymap | null
): ParsedKeymap {
  if (draft.sensorBindings != null || !loaded?.sensorBindings) return draft
  return cloneParsedKeymap({ ...draft, sensorBindings: loaded.sensorBindings })
}

export type KeyboardSelection = {
  source?: string
  layout?: LayoutKey[] | null
  keymap?: ParsedKeymap | null
  github?: GithubMeta
  /**
   * Keep the live draft and Host legend when retargeting the same GitHub repo
   * (Create branch ≈ `git checkout -b`). Baseline becomes the loaded tip.
   */
  preserveSession?: boolean
  /** Demo-only host layouts to open when the legend is still English-only. */
  demoHost?: DemoHostLayoutSeed[]
  /** Pasted `.keymap` text for clipboard Copy (splice). */
  clipboardOriginalSource?: string | null
  /** Clipboard load warning codes (`clipboard_inferred_layout`, …). */
  warnings?: string[]
  /**
   * Host snapshot from `host_keymap/snapshot.json` (GitHub). When present it
   * wins over IndexedDB for this keymap identity.
   */
  hostSnapshot?: HostKeymapSnapshot | null
  [key: string]: unknown
}

export class EditorState {
  definitions = $state<Definitions | null>(null)
  source = $state<string | null>(null)
  githubMeta = $state<GithubMeta | null>(null)
  /** Pasted `.keymap` kept for clipboard splice / Copy. */
  clipboardOriginalSource = $state<string | null>(null)
  layout = $state<LayoutKey[] | null>(null)
  /** Last loaded / successfully published+reloaded keymap. */
  baselineKeymap = $state<ParsedKeymap | null>(null)
  /** Live editor document; always set after load. */
  draftKeymap = $state<ParsedKeymap | null>(null)
  /** Plain draft snapshots for step undo (not vs baseline). */
  undoStack = $state<ParsedKeymap[]>([])
  /**
   * Hold-tap list staged by the key dialog. The next keymap update absorbs it
   * so Apply writes the new node and the key in one step. Cancel never sets it.
   */
  #holdTapsOnNextUpdate: ZmkHoldTap[] | null = null
  redoStack = $state<ParsedKeymap[]>([])
  saving = $state(false)
  /** View over the host profile. It does not edit the keymap. */
  hostLegend = $state<HostLegendView>(standardHostLegendView())
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

  /**
   * In scheme mode, a real binding on an absent slot promotes it to a
   * physical key for this session (clears `absent` on the live layout).
   */
  promoteAbsentKey(keyIndex: number, binding: KeyBindingNode) {
    if (!this.schemeMode || !this.layout) return
    if (isBlankLayerBinding(binding)) return
    const next = promoteAbsentLayoutKey(this.layout, keyIndex)
    if (next !== this.layout) this.layout = next
  }

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

  armHostSymbolEdit(target: HostSymbolEditTarget) {
    this.hostSymbolEditTarget = target
    this.hostSymbolCatalogOpen = true
  }

  clearHostSymbolEdit() {
    this.hostSymbolEditTarget = null
  }

  /**
   * Start an Alt+click host-edit session. When `zmk` is known, arm the first
   * AltGr cycle cell (extras before base) so the catalog is ready to write.
   */
  beginHostEditSession(keyIndex: number, layer: number, zmk?: string) {
    this.hostEditSession = { keyIndex, layer }
    this.hostSymbolCatalogOpen = true
    if (zmk) {
      const target = defaultHostEditTarget(zmk, this.hostLegend)
      this.hostSymbolEditTarget = target
    } else {
      this.hostSymbolEditTarget = null
    }
  }

  /** Close catalog + clear armed cell; caller unpins the decode card. */
  endHostEditSession() {
    this.hostEditSession = null
    this.hostSymbolEditTarget = null
    this.hostSymbolCatalogOpen = false
  }

  closeHostSymbolCatalog() {
    this.hostSymbolCatalogOpen = false
  }

  /** Move the armed cell along the AltGr cycle without writing. */
  stepHostSymbolEdit(delta: number) {
    const target = this.hostSymbolEditTarget
    if (!target || delta === 0) return
    this.hostSymbolEditTarget = stepHostEditTarget(target, this.hostLegend, delta)
  }

  async pickHostSymbol(text: string): Promise<HostKeyLevelEditResult> {
    const target = this.hostSymbolEditTarget
    if (!target) {
      return { ok: false, reason: 'no-target' }
    }
    const result = await this.setHostKeyLevel(
      target.language,
      target.zmk,
      target.level,
      text
    )
    if (result.ok) this.stepHostSymbolEdit(1)
    return result
  }

  /** Bumps on select / new publish so stale reloads are ignored. */
  #publishGeneration = 0
  /** Bumps on select so stale IDB restore prompts are ignored. */
  #selectGeneration = 0
  /** Bumps to cancel in-flight / debounced IDB writes. */
  #persistGeneration = 0
  #persistTimer: ReturnType<typeof setTimeout> | null = null
  /**
   * Identity we already offered Restore/Discard for this session.
   * Prevents picker effect re-entry from wiping a restored draft.
   */
  #handledDraftIdentityKey: string | null = null
  /**
   * Encoded `host_keymap/snapshot.json` last loaded from or committed to the
   * GitHub repo. Null when this session has no repo host baseline yet.
   */
  #hostRepoBaselineEncoded: string | null = null

  #changes = $derived.by(() => {
    if (!this.baselineKeymap || !this.draftKeymap) return []
    return diffKeymaps(this.baselineKeymap, this.draftKeymap)
  })

  /** Null when the toggle is off or fewer than two languages are on the key. */
  symbolAlignIndex = $derived.by((): SymbolAlign | null => {
    void this.hostLayoutRevision
    if (!this.symbolAlignOn) return null
    const pair = this.#alignInputs()
    if (!pair) return null
    return symbolAlign(pair.left, pair.right, { winMerge: pair.winMerge })
  })

  /** Encoded binding before the unpublished edit, keyed by `keyIndex:layer`. */
  unpublishedBefore = $derived.by(() => {
    const map = new Map<string, string>()
    for (const change of this.#changes) {
      if (change.type === 'binding') map.set(`${change.index}:${change.layer}`, change.before)
    }
    return map
  })

  get isDirty(): boolean {
    return this.#changes.length > 0
  }

  /**
   * Live host snapshot text for the open legend + referenced user layouts.
   * Used for GitHub Commit and dirty comparison against the repo baseline.
   */
  buildCurrentHostKeymapSnapshot(): HostKeymapSnapshot {
    void this.hostLayoutRevision
    void this.hostLegend
    const layouts = this.userLayouts.flatMap(meta => {
      const layout = hostLayout(meta.id)
      if (!layout) return []
      return [
        {
          id: meta.id,
          name: meta.name,
          language: meta.language,
          origin: meta.origin,
          layout
        }
      ]
    })
    return buildHostKeymapSnapshot(this.hostLegend, layouts)
  }

  /**
   * Linux xkb + Windows `.klc` sources for the same Commit as the host snapshot.
   * Empty when every column is still a system layout.
   */
  buildCurrentHostKeymapDeliverables(): HostKeymapDeliverableFile[] {
    void this.hostLayoutRevision
    void this.hostLegend
    const layoutsById = new Map<
      string,
      {
        id: string
        name: string
        language: HostLanguageId
        layout: HostLayout
        user: boolean
      }
    >()
    for (const column of this.hostLegend.columns) {
      if (layoutsById.has(column.layoutId)) continue
      const table = hostLayout(column.layoutId)
      if (!table) continue
      const user = this.userLayouts.find(item => item.id === column.layoutId)
      layoutsById.set(column.layoutId, {
        id: column.layoutId,
        name: user?.name ?? hostLayoutMeta(column.layoutId)?.name ?? column.language,
        language: column.language,
        layout: table,
        user: Boolean(user)
      })
    }
    return buildHostKeymapDeliverableFiles(this.hostLegend, layoutsById)
  }

  #encodeLiveHostSnapshot(): string {
    return encodeHostKeymapSnapshot(this.buildCurrentHostKeymapSnapshot())
  }

  /** Host half differs from the last GitHub load/commit (ADR 0005). */
  get isHostRepoDirty(): boolean {
    if (this.source !== 'github') return false
    void this.hostLayoutRevision
    void this.hostLegend
    const live = this.#encodeLiveHostSnapshot()
    if (this.#hostRepoBaselineEncoded === null) {
      return (
        live !==
        encodeHostKeymapSnapshot(
          buildHostKeymapSnapshot(standardHostLegendView(), [])
        )
      )
    }
    return live !== this.#hostRepoBaselineEncoded
  }

  /** ZMK draft and/or host snapshot need a GitHub Commit. */
  get isPublishDirty(): boolean {
    return this.isDirty || this.isHostRepoDirty
  }

  /**
   * After a successful Commit, set the repo tip to the snapshot that was sent.
   * Pass the encoding captured at write time so mid-flight host edits stay dirty.
   */
  acceptHostRepoBaseline(encoded?: string) {
    this.#hostRepoBaselineEncoded =
      encoded !== undefined ? encoded : this.#encodeLiveHostSnapshot()
  }

  get changes(): KeymapChange[] {
    return this.#changes
  }

  get dirtySummary(): string {
    return summarizeKeymapDiff(this.changes)
  }

  /**
   * User layouts currently assigned to legend columns — work that should be
   * installed on the host OS (not merely stored in IndexedDB).
   */
  get hostDeliverableLayoutIds(): string[] {
    void this.hostLayoutRevision
    void this.hostLegend
    const ids: string[] = []
    const seen = new Set<string>()
    for (const column of hostLegendColumns(this.hostLegend)) {
      if (!isUserHostLayoutId(column.layoutId) || seen.has(column.layoutId)) continue
      seen.add(column.layoutId)
      ids.push(column.layoutId)
    }
    return ids
  }

  /**
   * Fingerprint of the OS deliverable set: user layout ids in column order
   * (duplicates kept) plus `hostLayoutRevision`, so both content edits and
   * reassignment of an existing profile mark host dirty until delivered.
   */
  get hostDeliverableFingerprint(): string {
    void this.hostLayoutRevision
    void this.hostLegend
    const ids = hostLegendColumns(this.hostLegend)
      .filter(column => isUserHostLayoutId(column.layoutId))
      .map(column => column.layoutId)
    return `${ids.join('\0')}|${this.hostLayoutRevision}`
  }

  get isHostDirty(): boolean {
    return (
      this.hostDeliverableLayoutIds.length > 0 &&
      this.hostDeliverableFingerprint !== this.hostDeliveredFingerprint
    )
  }

  /** Mark the current host layouts as exported (Linux/Windows install dialog). */
  markHostDelivered() {
    this.hostDeliveredFingerprint = this.hostDeliverableFingerprint
  }

  /**
   * Per-layout xkb sections for active user columns (install dialog / copy).
   */
  listActiveHostLayoutExports(): Array<{
    layoutId: string
    language: HostLanguageId
    languageName: string
    flag: string
    xkbModule: string
    name: string
    text: string
    exampleSystemPath: string
    exampleUserPath: string
  }> {
    const out: Array<{
      layoutId: string
      language: HostLanguageId
      languageName: string
      flag: string
      xkbModule: string
      name: string
      text: string
      exampleSystemPath: string
      exampleUserPath: string
    }> = []
    for (const id of this.hostDeliverableLayoutIds) {
      const profile = this.userLayouts.find(layout => layout.id === id)
      const exported = this.exportUserHostLayoutXkb(id)
      if (!profile || !exported) continue
      const language = hostLanguage(profile.language)
      out.push({
        layoutId: id,
        language: profile.language,
        languageName: language.name,
        flag: language.flag,
        xkbModule: language.xkbModule,
        name: exported.name,
        text: exported.text,
        exampleSystemPath: `/usr/share/X11/xkb/symbols/${language.xkbModule}`,
        exampleUserPath: `~/.xkb/symbols/${language.xkbModule}`
      })
    }
    return out
  }

  /**
   * Concatenated `xkb_symbols` sections for every active user layout.
   * Returns null when there is nothing to install.
   */
  exportActiveHostLayoutsXkb(): { text: string; name: string } | null {
    const parts: string[] = []
    const names: string[] = []
    for (const id of this.hostDeliverableLayoutIds) {
      const exported = this.exportUserHostLayoutXkb(id)
      if (!exported) continue
      parts.push(exported.text.trimEnd())
      names.push(exported.name)
    }
    if (!parts.length) return null
    return {
      text: `${parts.join('\n\n')}\n`,
      name: names.length === 1 ? names[0] : 'host-layouts'
    }
  }

  get statusText(): string {
    if (!this.draftKeymap) return ''
    if (this.isDirty) return 'Draft'
    if (this.isHostRepoDirty) {
      return 'Host layout changed — commit to save with the keymap'
    }
    if (this.source === 'github') return 'Up to date with repo'
    if (this.source === 'clipboard') return 'Ready — copy .keymap out'
    if (this.source === 'demo') return 'Demo — not saved to a repo'
    return 'Up to date with disk'
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
  }

  /** Names for the host-legend table, one per keymap layer. */
  get hostLegendLayerNames(): string[] {
    const km = this.draftKeymap
    if (!km) return []
    return km.layers.map((_, i) => {
      const name = km.layer_names?.[i]
      return typeof name === 'string' && name.length > 0 ? name : `layer${i}`
    })
  }

  clearHistory() {
    this.undoStack = []
    this.redoStack = []
  }

  initCatalogs() {
    this.definitions = {
      keycodes: getKeycodeCatalog(),
      behaviours: getBehaviorCatalog()
    }
  }

  /** Restore user layouts into the registry. The legend view loads with the keymap. */
  async restoreHostProfiles() {
    try {
      resetHostLayoutRegistry()
      const records = await loadUserHostLayouts()
      for (const record of records) this.#registerUserLayout(record)
      this.userLayouts = records.map(({ layout: _layout, ...rest }) => rest)
      // Restored layouts are already on disk in the browser; wait for a new edit.
      this.markHostDelivered()
    } catch {
      resetHostLayoutRegistry()
      this.userLayouts = []
      this.hostLegend = standardHostLegendView()
      this.hostAssemblies = []
      this.layerView = standardLayerView()
      this.hostProfileNote = null
      this.markHostDelivered()
    }
  }

  #registerUserLayout(record: UserHostLayoutRecord) {
    registerHostLayout(
      {
        id: record.id,
        language: record.language,
        name: record.name,
        flag: hostLanguage(record.language).flag,
        origin: 'user'
      },
      record.layout
    )
    this.hostLayoutRevision += 1
  }

  /**
   * Create a user layout from a table: unique name → id → clone → register →
   * assign column → persist layout and view. Shared by xkb import and profile copy.
   */
  async #materializeUserHostLayoutFromTable(
    language: HostLanguageId,
    preferredName: string,
    source: HostLayout,
    origin: UserHostLayoutOrigin
  ): Promise<string> {
    const name = uniqueUserHostLayoutName(language, preferredName, this.userLayouts)
    const id = `user:${crypto.randomUUID()}`
    const layout = cloneHostLayoutTable(source, id)
    const record: UserHostLayoutRecord = {
      id,
      name,
      language,
      origin,
      updatedAt: Date.now(),
      layout
    }
    this.#registerUserLayout(record)
    this.userLayouts = [
      ...this.userLayouts,
      {
        id: record.id,
        name: record.name,
        language: record.language,
        origin: record.origin,
        updatedAt: record.updatedAt
      }
    ]
    this.hostLegend = assignHostLanguageLayout(this.hostLegend, language, id)
    this.hostProfilePrompt = null
    this.hostProfileNote = null
    await saveUserHostLayout(record)
    await this.#persistHostLegend()
    return id
  }

  #hostLegendSettingId(): string | null {
    const identity = this.currentDraftIdentity()
    return identity ? hostLegendSettingId(draftIdentityKey(identity)) : null
  }

  async #persistHostLegend(): Promise<void> {
    const settingId = this.#hostLegendSettingId()
    if (!settingId) return
    await saveHostLegendView(this.hostLegend, settingId)
  }

  /**
   * Load the legend for the open keymap. A leftover browser-wide view is
   * adopted once when it is not the old English+Russian demo default.
   */
  async #restoreHostLegend(selectToken: number): Promise<void> {
    const settingId = this.#hostLegendSettingId()
    if (!settingId) {
      this.hostLegend = standardHostLegendView()
      this.hostAssemblies = []
      return
    }
    try {
      let stored = await loadHostLegendView(settingId)
      if (!stored) {
        const legacy = await loadHostLegendView()
        if (legacy && !isLegacyBilingualHostLegend(legacy)) {
          stored = legacy
          await saveHostLegendView(legacy, settingId)
        }
        if (legacy) await deleteHostLegendView()
      }
      if (selectToken !== this.#selectGeneration) return
      const { view, replaced } = sanitizeHostLegendView(stored ?? standardHostLegendView())
      this.hostLegend = view
      if (replaced.length > 0) {
        this.hostProfileNote = UNKNOWN_HOST_LAYOUT_NOTE
        await saveHostLegendView(view, settingId)
      }
    } catch {
      /* keep the in-memory view */
    }
    if (selectToken !== this.#selectGeneration) return
    await this.#restoreHostAssemblies(selectToken)
  }

  /**
   * Apply a GitHub `host_keymap/snapshot.json`: register layouts, set the
   * legend, mirror into IndexedDB, and set the repo host baseline.
   * Buffer first, then mutate/persist only while `selectToken` is still current
   * so a superseded select cannot leave a partial layout set on disk.
   */
  async #applyHostKeymapSnapshot(
    snapshot: HostKeymapSnapshot,
    selectToken: number
  ): Promise<void> {
    if (selectToken !== this.#selectGeneration) return
    const records: UserHostLayoutRecord[] = snapshot.layouts.map(item => ({
      id: item.id,
      name: item.name,
      language: item.language,
      origin: item.origin,
      updatedAt: Date.now(),
      layout: hostLayoutFromKeymapSnapshotKeys(item.id, item.keys)
    }))
    if (selectToken !== this.#selectGeneration) return

    for (const record of records) {
      if (selectToken !== this.#selectGeneration) return
      this.#registerUserLayout(record)
      const listedItem = {
        id: record.id,
        name: record.name,
        language: record.language,
        origin: record.origin,
        updatedAt: record.updatedAt
      }
      this.userLayouts = this.userLayouts.some(entry => entry.id === record.id)
        ? this.userLayouts.map(entry => (entry.id === record.id ? listedItem : entry))
        : [...this.userLayouts, listedItem]
    }

    const { view, replaced } = sanitizeHostLegendView(snapshot.view)
    const writtenIds: string[] = []
    for (const record of records) {
      if (selectToken !== this.#selectGeneration) {
        await this.#rollbackUserHostLayoutWrites(writtenIds)
        return
      }
      await saveUserHostLayout(record)
      writtenIds.push(record.id)
    }
    if (selectToken !== this.#selectGeneration) {
      await this.#rollbackUserHostLayoutWrites(writtenIds)
      return
    }

    this.hostLegend = view
    if (replaced.length > 0) this.hostProfileNote = UNKNOWN_HOST_LAYOUT_NOTE
    await this.#persistHostLegend()
    if (selectToken !== this.#selectGeneration) return
    this.#hostRepoBaselineEncoded = encodeHostKeymapSnapshot({
      ...snapshot,
      view
    })
    this.markHostDelivered()
    await this.#restoreHostAssemblies(selectToken)
  }

  /** Drop IDB rows written by an aborted select batch. */
  async #rollbackUserHostLayoutWrites(ids: string[]): Promise<void> {
    for (const id of ids) {
      try {
        await deleteUserHostLayout(id)
      } catch {
        /* ignore */
      }
    }
  }

  #hostAssembliesSettingId(): string | null {
    const identity = this.currentDraftIdentity()
    return identity ? hostAssembliesSettingId(draftIdentityKey(identity)) : null
  }

  async #persistHostAssemblies(): Promise<void> {
    const settingId = this.#hostAssembliesSettingId()
    if (!settingId) return
    await saveHostAssemblies(settingId, this.hostAssemblies)
  }

  async #restoreHostAssemblies(selectToken: number): Promise<void> {
    const settingId = this.#hostAssembliesSettingId()
    if (!settingId) {
      this.hostAssemblies = []
      return
    }
    try {
      const items = await loadHostAssemblies(settingId)
      if (selectToken !== this.#selectGeneration) return
      let replacedAny = false
      const next: StoredHostAssembly[] = []
      for (const item of items) {
        const { view, replaced } = sanitizeHostLegendView(item.view)
        if (replaced.length > 0) replacedAny = true
        next.push({ id: item.id, view })
      }
      this.hostAssemblies = next
      if (replacedAny) {
        this.hostProfileNote = UNKNOWN_HOST_LAYOUT_NOTE
        await this.#persistHostAssemblies()
      }
    } catch {
      this.hostAssemblies = []
    }
  }

  /** Short layout name for one column, matching the profile menu. */
  #layoutShortName(layoutId: string, language: HostLanguageId): string {
    const user = this.userLayouts.find(item => item.id === layoutId)
    if (user?.name.trim()) return user.name.trim()
    const choice = hostLayoutChoice(layoutId)
    if (choice) return hostLayoutChoiceLabel(choice)
    return hostLanguageName(language)
  }

  /** Flag plus short layout name for each column. The accessible name stays `hostAssemblyLabel`. */
  hostAssemblyParts(view: HostLegendView): { language: HostLanguageId; layoutName: string }[] {
    return view.columns.map(column => ({
      language: column.language,
      layoutName: this.#layoutShortName(column.layoutId, column.language)
    }))
  }

  hostAssemblyLabel(view: HostLegendView): string {
    return hostAssemblyName(
      view.columns.map(column => ({
        languageName: hostLanguageName(column.language),
        layoutName: this.#layoutShortName(column.layoutId, column.language)
      }))
    )
  }

  hostAssemblyActive(view: HostLegendView): boolean {
    return sameHostLegendView(view, this.hostLegend)
  }

  /** The live columns are already one of the remembered sets. */
  hostAssemblySaved(): boolean {
    return this.hostAssemblies.some(item => sameHostLegendView(item.view, this.hostLegend))
  }

  /** Three sets are kept and the live columns are not one of them. */
  hostAssemblyRememberBlocked(): boolean {
    return this.hostAssemblies.length >= HOST_ASSEMBLY_LIMIT && !this.hostAssemblySaved()
  }

  async rememberHostAssembly(): Promise<void> {
    if (this.hostAssemblySaved() || this.hostAssemblyRememberBlocked()) return
    const { view } = sanitizeHostLegendView(cloneHostLegendView(this.hostLegend))
    this.hostAssemblies = [...this.hostAssemblies, { id: crypto.randomUUID(), view }]
    await this.#persistHostAssemblies()
  }

  async showHostAssembly(id: string): Promise<void> {
    const index = this.hostAssemblies.findIndex(item => item.id === id)
    if (index < 0) return
    const { view, replaced } = sanitizeHostLegendView(
      cloneHostLegendView(this.hostAssemblies[index].view)
    )
    if (replaced.length > 0) {
      const next = this.hostAssemblies.slice()
      next[index] = { id, view }
      this.hostAssemblies = next
      this.hostProfileNote = UNKNOWN_HOST_LAYOUT_NOTE
      await this.#persistHostAssemblies()
    }
    await this.commitHostMap(view)
  }

  async forgetHostAssembly(id: string): Promise<void> {
    const next = this.hostAssemblies.filter(item => item.id !== id)
    if (next.length === this.hostAssemblies.length) return
    this.hostAssemblies = next
    await this.#persistHostAssemblies()
  }

  activeProfileId(language: HostLanguageId): string {
    return this.hostLegend.columns.find(column => column.language === language)?.layoutId ?? ''
  }

  /**
   * Two keycap languages for Differences. Position compares those layouts on
   * every level. Win AltGr marks only when English and `open` are both drawn.
   */
  #alignInputs(): {
    left: HostLayout
    right: HostLayout
    winMerge: { base: HostLayout; extra: HostLayout } | null
  } | null {
    const pair = symbolAlignPairFromView(this.hostLegend)
    if (!pair) return null
    const left = hostLayout(pair.leftLayoutId)
    const right = hostLayout(pair.rightLayoutId)
    if (!left || !right) return null
    let winMerge: { base: HostLayout; extra: HostLayout } | null = null
    if (pair.winMerge) {
      const base = hostLayout(pair.winMerge.baseLayoutId)
      const extra = hostLayout(pair.winMerge.extraLayoutId)
      if (base && extra) winMerge = { base, extra }
    }
    return { left, right, winMerge }
  }

  /** True when two languages are drawn on the key, so Differences applies. */
  get canAlignHostSymbols(): boolean {
    return this.#alignInputs() != null
  }

  /** Win AltGr sample: only for the English × open install pair on the key. */
  get symbolAlignShowsWinAltGr(): boolean {
    return this.#alignInputs()?.winMerge != null
  }

  /** Stacked language face. Two languages already share the key, so this waits for a third. */
  get multilangViewOn(): boolean {
    return this.multilangView && this.hostLegend.columns.length >= 3
  }

  /**
   * User layout id safe to edit for this language column.
   * Returns the active user layout as-is; forks a system layout into a copy first.
   */
  async ensureEditableUserHostLayout(language: HostLanguageId): Promise<string> {
    const layoutId = this.activeProfileId(language)
    if (isUserHostLayoutId(layoutId)) return layoutId
    const source = hostLayout(layoutId)
    if (!source) throw new Error('No layout for this language')
    const choice = hostLayoutChoice(layoutId)
    const preferredName = choice
      ? hostLayoutChoiceLabel(choice)
      : (hostLayoutMeta(layoutId)?.name ?? 'Copy')
    const id = await this.#materializeUserHostLayoutFromTable(
      language,
      preferredName,
      source,
      { from: 'copy', layoutId }
    )
    const name = this.userLayouts.find(layout => layout.id === id)?.name ?? preferredName
    this.hostProfileNote =
      `Created copy “${name}” for edits. The system layout is unchanged.`
    return id
  }

  /**
   * Parse typed text via `glyphToKeysym`, fork a system column if needed, replace
   * one level with `withHostKey`, re-register and persist. Re-register bumps
   * `hostLayoutRevision` so the board recomposes legends.
   */
  async setHostKeyLevel(
    language: HostLanguageId,
    zmk: string,
    level: number,
    text: string
  ): Promise<HostKeyLevelEditResult> {
    const parsed = glyphToKeysym(text)
    if (!parsed.ok) {
      return { ok: false, reason: 'rejected', detail: parsed.reason }
    }
    const layoutId = await this.ensureEditableUserHostLayout(language)
    const current = hostLayout(layoutId)
    if (!current) return { ok: false, reason: 'missing-layout' }
    const next = withHostKey(current, zmk, level, parsed.keysym)
    if (!next) return { ok: false, reason: 'unknown-key' }
    if (!(await this.#commitUserHostLayout(layoutId, next))) {
      return { ok: false, reason: 'missing-layout' }
    }
    return {
      ok: true,
      keysym: parsed.keysym,
      layoutId,
      dropsFromCompose: level === 0 && keysymToGlyph(parsed.keysym) == null
    }
  }

  async #commitUserHostLayout(layoutId: string, layout: HostLayout): Promise<boolean> {
    const profile = this.userLayouts.find(item => item.id === layoutId)
    if (!profile) return false
    const updated: UserHostLayout = { ...profile, updatedAt: Date.now() }
    this.#registerUserLayout({ ...updated, layout })
    this.userLayouts = this.userLayouts.map(item => (item.id === updated.id ? updated : item))
    await saveUserHostLayout({ ...updated, layout })
    return true
  }

  /**
   * Restore one level to the language's primary system layout (or `NoSymbol`
   * when the system layout has no record for the key).
   */
  async revertHostKeyLevel(
    language: HostLanguageId,
    zmk: string,
    level: number
  ): Promise<HostKeyLevelEditResult> {
    const primary = primarySystemLayoutId(language)
    const keysym = primary
      ? (hostLevels(primary, zmk)?.keysyms[level] ?? 'NoSymbol')
      : 'NoSymbol'
    return this.setHostKeyLevel(language, zmk, level, keysym)
  }

  profilesForLanguage(language: HostLanguageId): UserHostLayout[] {
    return this.userLayouts
      .filter(layout => layout.language === language)
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  }

  /**
   * Apply a language-column change immediately.
   * Builtin system picks do not ask for a name.
   */
  commitHostMap(next: HostLegendView): Promise<void> {
    this.hostLegend = { ...next }
    return this.#persistHostLegend()
  }

  selectLanguageProfile(language: HostLanguageId, id: string): Promise<void> {
    if (this.activeProfileId(language) === id) return Promise.resolve()
    this.hostProfilePrompt = null
    this.hostProfileNote = null
    if (!hostLayout(id)) return Promise.resolve()
    this.hostLegend = assignHostLanguageLayout(this.hostLegend, language, id)
    return this.#persistHostLegend()
  }

  beginSaveHostProfile(language: HostLanguageId) {
    this.hostProfileNote = null
    this.hostProfilePrompt = { kind: 'save-as', language }
  }

  beginCopyHostProfile(language: HostLanguageId, layoutId?: string) {
    this.hostProfileNote = null
    this.hostProfilePrompt = { kind: 'copy', language, layoutId }
  }

  /** Import an xkb section as a user layout and assign it to the language column. */
  async importHostLayoutFromXkb(
    language: HostLanguageId,
    text: string,
    section: string,
    fileName: string
  ): Promise<string | null> {
    const listed = listXkbSections(text)
    if (!listed.some(item => item.section === section)) {
      return `Section “${section}” was not found`
    }
    try {
      const imported = hostLayoutFromXkb(text, section, { fileName })
      const label = listed.find(item => item.section === section)?.name ?? section
      await this.#materializeUserHostLayoutFromTable(language, label, imported, {
        from: 'xkb',
        fileName,
        section
      })
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'Could not import xkb'
    }
  }

  /** Open a language column, adding it when the legend does not have it yet. */
  #showHostLanguage(language: HostLanguageId) {
    if (!this.hostLegend.columns.some(column => column.language === language)) {
      this.hostLegend = addHostLanguage(this.hostLegend, language)
      return
    }
    if (language === this.hostLegend.columns[0]?.language) return
    const shown = hostLegendColumns(this.hostLegend).some(
      column => column.language === language && column.shown
    )
    if (!shown) {
      this.hostLegend = toggleHostLanguage(this.hostLegend, language)
      return
    }
    if (this.hostLegend.open !== language) {
      this.hostLegend = { ...this.hostLegend, open: language }
    }
  }

  /**
   * Import a .klc file. A one-language file fills the column that asked.
   * A Caps Lock alphabet fills the base language and that second language.
   * `source` is the file bytes, or already-decoded text from a paste.
   */
  async importHostLayoutFromKlc(
    language: HostLanguageId,
    source: Uint8Array | string,
    fileName: string
  ): Promise<string | null> {
    let parsed
    try {
      parsed = parseKlc(typeof source === 'string' ? source : decodeKlc(source))
    } catch (error) {
      return error instanceof Error ? error.message : 'Could not import klc'
    }
    const stem = fileName.replace(/^.*[/\\]/, '').replace(/\.[^.]+$/, '') || 'klc'
    if (parsed.kind === 'single') {
      await this.#materializeUserHostLayoutFromTable(
        language,
        parsed.description || stem,
        parsed.base,
        { from: 'klc', fileName, role: 'single' }
      )
      if (parsed.warnings.length > 0) this.hostProfileNote = parsed.warnings.join(' ')
      return null
    }
    const baseLanguage = parsed.baseLanguage ?? 'en'
    const capsLanguage =
      parsed.capsLanguage ?? (language !== baseLanguage ? language : null)
    if (!capsLanguage || !parsed.caps) {
      return "This file puts another alphabet on Caps Lock. Import it from that language's column."
    }
    const present = (id: HostLanguageId) =>
      this.hostLegend.columns.some(column => column.language === id) ||
      hostLanguagesAvailable(this.hostLegend).includes(id)
    if (!present(baseLanguage) || !present(capsLanguage)) {
      return 'This .klc file names a language the legend cannot open.'
    }
    this.#showHostLanguage(baseLanguage)
    this.#showHostLanguage(capsLanguage)
    const names = pairedImportNames(parsed.description, capsLanguage, stem)
    await this.#materializeUserHostLayoutFromTable(baseLanguage, names.baseName, parsed.base, {
      from: 'klc',
      fileName,
      role: 'base'
    })
    await this.#materializeUserHostLayoutFromTable(capsLanguage, names.capsName, parsed.caps, {
      from: 'klc',
      fileName,
      role: 'caps'
    })
    const baseLabel = hostLanguageName(baseLanguage)
    const capsLabel = hostLanguageName(capsLanguage)
    const extra = parsed.warnings.length > 0 ? ` ${parsed.warnings.join(' ')}` : ''
    this.hostProfileNote =
      `Imported ${baseLabel} and ${capsLabel} from a paired layout. AltGr is on ${capsLabel}.${extra}`
    return null
  }

  /**
   * Export a user host layout as a standalone `xkb_symbols` section.
   * Section id and `name[Group1]` both use the profile name. Returns null
   * when the id is not a registered user layout.
   */
  exportUserHostLayoutXkb(layoutId: string): { text: string; name: string } | null {
    if (!isUserHostLayoutId(layoutId)) return null
    const profile = this.userLayouts.find(layout => layout.id === layoutId)
    if (!profile) return null
    const layout = hostLayout(layoutId)
    if (!layout) return null
    return {
      text: hostLayoutToXkbSection(layout, { section: profile.name, name: profile.name }),
      name: profile.name
    }
  }

  /**
   * One MSKLC source file for a user layout. UTF-16 LE with BOM.
   * Returns null for system layouts and unknown ids.
   */
  exportUserHostLayoutKlc(layoutId: string): { bytes: Uint8Array; name: string } | null {
    if (!isUserHostLayoutId(layoutId)) return null
    const profile = this.userLayouts.find(layout => layout.id === layoutId)
    if (!profile) return null
    const layout = hostLayout(layoutId)
    if (!layout) return null
    const text = hostLayoutToKlc(layout, {
      name: profile.name,
      locale: windowsLocale(profile.language)
    })
    return { bytes: encodeKlc(text), name: profile.name }
  }

  /**
   * English on the normal keys, each other legend language on Caps Lock.
   * The English column may still be the system layout.
   */
  listCapsAlphabetKlcExports(): Array<{
    capsLanguage: HostLanguageId
    capsLanguageName: string
    baseLanguageName: string
    baseLayoutName: string
    capsLayoutName: string
    fileStem: string
  }> {
    void this.hostLayoutRevision
    void this.hostLegend
    const columns = hostLegendColumns(this.hostLegend)
    const base = columns.find(column => column.language === 'en')
    if (!base || !hostLayout(base.layoutId)) return []
    const baseLanguageName = hostLanguage('en').name
    const baseLayoutName = this.#layoutColumnName(base.layoutId, 'en')
    const out: Array<{
      capsLanguage: HostLanguageId
      capsLanguageName: string
      baseLanguageName: string
      baseLayoutName: string
      capsLayoutName: string
      fileStem: string
    }> = []
    for (const column of columns) {
      if (column.language === 'en') continue
      if (!windowsCapsPairingRecommended(column.language)) continue
      if (!hostLayout(column.layoutId)) continue
      const capsLanguageName = hostLanguage(column.language).name
      out.push({
        capsLanguage: column.language,
        capsLanguageName,
        baseLanguageName,
        baseLayoutName,
        capsLayoutName: this.#layoutColumnName(column.layoutId, column.language),
        fileStem: `${baseLanguageName}-${capsLanguageName}`
      })
    }
    return out
  }

  /**
   * One UTF-16 .klc: English locale and letters, `capsLanguage` on Caps Lock.
   * Returns null when either column is missing.
   */
  exportCapsAlphabetKlc(
    capsLanguage: HostLanguageId,
    version = 1
  ): { bytes: Uint8Array; name: string; kbdId: string } | null {
    const columns = hostLegendColumns(this.hostLegend)
    const base = columns.find(column => column.language === 'en')
    const caps = columns.find(column => column.language === capsLanguage)
    if (!base || !caps || caps.language === 'en') return null
    if (!windowsCapsPairingRecommended(capsLanguage)) return null
    const baseLayout = hostLayout(base.layoutId)
    const capsLayout = hostLayout(caps.layoutId)
    if (!baseLayout || !capsLayout) return null
    const baseName = hostLanguage('en').name
    const capsName = hostLanguage(capsLanguage).name
    const name = `${baseName} + ${capsName}`
    const kbdId = pairedKbdId(baseName, capsName, version)
    const text = hostLayoutsToCapsKlc(baseLayout, capsLayout, {
      name,
      kbdId,
      locale: windowsLocale('en')
    })
    return { bytes: encodeKlc(text), name, kbdId }
  }

  #layoutColumnName(layoutId: string, language: HostLanguageId): string {
    const profile = this.userLayouts.find(layout => layout.id === layoutId)
    if (profile) return profile.name
    return hostLayoutMeta(layoutId)?.name ?? hostLanguage(language).name
  }

  beginRenameHostProfile(language: HostLanguageId, profileId?: string) {
    const id = profileId ?? this.activeProfileId(language)
    if (!isUserHostLayoutId(id)) return
    if (!this.userLayouts.some(layout => layout.id === id)) return
    this.hostProfileNote = null
    this.hostProfilePrompt = { kind: 'rename', language, profileId: id }
  }

  beginDeleteHostProfile(language: HostLanguageId, profileId?: string) {
    const id = profileId ?? this.activeProfileId(language)
    if (!isUserHostLayoutId(id)) return
    if (!this.userLayouts.some(layout => layout.id === id)) return
    this.hostProfileNote = null
    this.hostProfilePrompt = { kind: 'delete', language, profileId: id }
  }

  async deleteActiveHostProfile(): Promise<void> {
    const prompt = this.hostProfilePrompt
    if (prompt?.kind !== 'delete') return
    const language = prompt.language
    const id = prompt.profileId ?? this.activeProfileId(language)
    if (!isUserHostLayoutId(id)) return
    const existed = this.userLayouts.some(layout => layout.id === id)
    if (!existed) return
    this.userLayouts = this.userLayouts.filter(layout => layout.id !== id)
    this.hostProfilePrompt = null
    unregisterHostLayout(id)
    await deleteUserHostLayout(id)
    if (this.activeProfileId(language) === id) {
      const primary = primarySystemLayoutId(language)
      if (primary) await this.selectLanguageProfile(language, primary)
    }
  }

  cancelHostProfilePrompt() {
    this.hostProfilePrompt = null
  }

  /** Returns an error message, or null when the profile was stored. */
  async confirmHostProfileName(raw: string): Promise<string | null> {
    const prompt = this.hostProfilePrompt
    if (!prompt) return null
    const name = raw.trim()
    if (!name) return 'Enter a profile name'
    if (reservedProfileName(name)) return `Name “${name}” is reserved for a built-in profile`
    if (prompt.kind === 'delete') return null
    if (prompt.kind === 'rename') return this.#renameHostProfile(prompt.language, name)
    const language = prompt.language
    const taken = this.userLayouts.some(
      layout =>
        layout.language === language &&
        layout.name.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru')
    )
    if (taken) return 'A profile with this name already exists'
    const sourceId =
      (prompt.kind === 'copy' ? prompt.layoutId : undefined) ??
      hostLegendColumns(this.hostLegend).find(column => column.language === language)
        ?.layoutId ??
      ''
    const source = sourceId ? hostLayout(sourceId) : undefined
    if (!source) return 'No layout for this language'
    await this.#materializeUserHostLayoutFromTable(language, name, source, {
      from: 'copy',
      layoutId: sourceId
    })
    return null
  }

  async #renameHostProfile(language: HostLanguageId, name: string): Promise<string | null> {
    const id =
      this.hostProfilePrompt?.kind === 'rename'
        ? this.hostProfilePrompt.profileId
        : this.activeProfileId(language)
    const current = this.userLayouts.find(layout => layout.id === id)
    if (!current) return null
    if (current.name.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru')) {
      this.hostProfilePrompt = null
      return null
    }
    const taken = this.userLayouts.some(
      layout =>
        layout.id !== current.id &&
        layout.language === language &&
        layout.name.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru')
    )
    if (taken) return 'A profile with this name already exists'
    const table = hostLayout(current.id)
    if (!table) return null
    const updated: UserHostLayout = { ...current, name, updatedAt: Date.now() }
    this.#registerUserLayout({ ...updated, layout: table })
    this.userLayouts = this.userLayouts.map(layout =>
      layout.id === updated.id ? updated : layout
    )
    this.hostProfilePrompt = null
    await saveUserHostLayout({ ...updated, layout: table })
    return null
  }

  showHostProfileStub(note: string) {
    this.hostProfileNote = this.hostProfileNote === note ? null : note
  }

  beginPublish(): number {
    this.#publishGeneration += 1
    return this.#publishGeneration
  }

  /**
   * True when a reload result still matches the publish that started it
   * (same generation, source, and GitHub identity).
   */
  isPublishCurrent(
    token: number,
    source: string | null,
    github: GithubMeta | null
  ): boolean {
    if (token !== this.#publishGeneration) return false
    if (this.source !== source) return false
    if (source === 'github') {
      if (!this.githubMeta || !github) return false
      if (
        this.githubMeta.repository !== github.repository ||
        this.githubMeta.branch !== github.branch
      ) {
        return false
      }
    }
    return true
  }

  /** Identity for the currently loaded editor document (strict restore key). */
  currentDraftIdentity(): DraftIdentity | null {
    return buildDraftIdentity({
      source: this.source,
      repo: this.githubMeta?.repository,
      branch: this.githubMeta?.branch,
      keyboard:
        this.draftKeymap?.keyboard ?? this.baselineKeymap?.keyboard ?? null
    })
  }

  #cancelPersistTimer() {
    if (this.#persistTimer != null) {
      clearTimeout(this.#persistTimer)
      this.#persistTimer = null
    }
  }

  /** Debounced write of dirty draft; deletes IDB record when draft is clean. */
  schedulePersist() {
    const token = this.#persistGeneration
    this.#cancelPersistTimer()
    this.#persistTimer = setTimeout(() => {
      this.#persistTimer = null
      void this.#flushPersist(token)
    }, PERSIST_DEBOUNCE_MS)
  }

  async #flushPersist(token: number) {
    if (token !== this.#persistGeneration) return
    const identity = this.currentDraftIdentity()
    if (!identity || !this.draftKeymap) return
    try {
      if (!this.isDirty) {
        await deleteStoredDraft(identity)
        return
      }
      if (token !== this.#persistGeneration) return
      await saveStoredDraft(identity, cloneParsedKeymap(this.draftKeymap), {
        baselineHint: this.baselineKeymap
          ? baselineFingerprint(this.baselineKeymap)
          : undefined
      })
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('Failed to persist draft to IndexedDB', err)
      }
      this.saveNotice = {
        kind: 'error',
        messages: [
          'Could not save your draft locally. Changes may be lost if you close this tab.'
        ]
      }
    }
  }

  /** Drop persisted draft for current identity; cancels pending writes. */
  async clearPersistedDraft() {
    this.#persistGeneration += 1
    this.#cancelPersistTimer()
    this.#handledDraftIdentityKey = null
    const identity = this.currentDraftIdentity()
    if (!identity) return
    try {
      await deleteStoredDraft(identity)
    } catch {
      /* ignore */
    }
  }

  async selectKeyboard(event: KeyboardSelection) {
    const selectToken = ++this.#selectGeneration
    this.#publishGeneration += 1
    this.#persistGeneration += 1
    this.#cancelPersistTimer()
    this.endHostEditSession()
    this.legendHover = null

    const upcomingIdentity = buildDraftIdentity({
      source: event.source,
      repo: event.github?.repository,
      branch: event.github?.branch,
      keyboard:
        event.keymap && typeof event.keymap === 'object'
          ? ((event.keymap as ParsedKeymap).keyboard ?? null)
          : null
    })
    const upcomingKey = upcomingIdentity
      ? draftIdentityKey(upcomingIdentity)
      : null

    if (
      event.preserveSession &&
      (await this.#preserveGithubSession(event, upcomingIdentity, upcomingKey, selectToken))
    ) {
      return
    }

    const alreadyHandled =
      upcomingKey != null && upcomingKey === this.#handledDraftIdentityKey
    const keepLiveDraft =
      alreadyHandled && this.draftKeymap != null && this.isDirty

    this.source = event.source ?? null
    this.githubMeta = event.github ?? null
    if (event.source !== 'github') {
      this.#hostRepoBaselineEncoded = null
    }
    if (event.source === 'clipboard' && upcomingIdentity) {
      const pasted = event.clipboardOriginalSource ?? null
      this.clipboardOriginalSource =
        pasted ?? readClipboardOriginalSource(upcomingIdentity)
      if (pasted) writeClipboardOriginalSource(upcomingIdentity, pasted)
    } else {
      this.clipboardOriginalSource = null
    }
    this.layout = event.layout ?? null
    this.schemeMode = false
    this.comboMode = false
    this.activeComboId = null
    this.comboNotice = null
    const km = event.keymap ?? null
    if (!km) {
      this.baselineKeymap = null
      this.draftKeymap = null
      this.clearHistory()
    } else {
      const baseline = cloneParsedKeymap(km)
      this.baselineKeymap = baseline
      if (!keepLiveDraft) {
        this.draftKeymap = cloneParsedKeymap(baseline)
        this.clearHistory()
      } else if (this.draftKeymap) {
        const adopted = adoptSensorBindings(
          adoptHoldTaps(this.draftKeymap, baseline),
          baseline
        )
        if (adopted !== this.draftKeymap) this.draftKeymap = adopted
      }
    }
    this.saveNotice = null
    const loadNotices = formatKeymapSaveWarningNotices(event.warnings)
    if (loadNotices.length > 0) {
      const links = loadNotices.flatMap(notice => (notice.link ? [notice.link] : []))
      this.saveNotice = {
        kind: 'warning',
        messages: loadNotices.map(notice => notice.message),
        links: links.length > 0 ? links : undefined
      }
    }

    if (!alreadyHandled) {
      if (event.hostSnapshot) {
        await this.#applyHostKeymapSnapshot(event.hostSnapshot, selectToken)
      } else {
        if (event.source === 'github') this.#hostRepoBaselineEncoded = null
        await this.#restoreHostLegend(selectToken)
      }
    }
    if (selectToken !== this.#selectGeneration) return
    if (alreadyHandled) return
    if (event.demoHost?.length) {
      await this.#seedDemoHostLayouts(event.demoHost, selectToken)
      if (selectToken !== this.#selectGeneration) return
    }
    if (event.source === 'demo') {
      await this.#maybeAddPreferredDemoLanguage(selectToken)
      if (selectToken !== this.#selectGeneration) return
    }
    await this.#maybeRestorePersistedDraft(selectToken)
  }

  /**
   * Retarget the open GitHub repo to another branch without dropping the live
   * draft or Host legend (Create branch ≈ `git checkout -b`).
   */
  async #preserveGithubSession(
    event: KeyboardSelection,
    upcomingIdentity: DraftIdentity | null,
    upcomingKey: string | null,
    selectToken: number
  ): Promise<boolean> {
    const github = event.github
    const km = event.keymap
    if (!github || !km || !this.draftKeymap || !this.baselineKeymap) return false
    if (this.source !== 'github' && event.source !== 'github') return false
    if (
      this.githubMeta &&
      this.githubMeta.repository !== github.repository
    ) {
      return false
    }

    const previousIdentity = this.currentDraftIdentity()
    this.source = 'github'
    this.githubMeta = github
    if (event.layout) this.layout = event.layout
    this.baselineKeymap = cloneParsedKeymap(km)
    const adopted = adoptSensorBindings(
      adoptHoldTaps(this.draftKeymap, this.baselineKeymap),
      this.baselineKeymap
    )
    if (adopted !== this.draftKeymap) this.draftKeymap = adopted
    this.schemeMode = false
    this.comboMode = false
    this.activeComboId = null
    this.comboNotice = null
    this.saveNotice = null
    this.clipboardOriginalSource = null
    if (upcomingKey) this.#handledDraftIdentityKey = upcomingKey

    await this.#migrateSessionIdentity(previousIdentity, upcomingIdentity)
    if (selectToken !== this.#selectGeneration) return true
    this.schedulePersist()
    return true
  }

  /** Move draft + Host legend/assemblies IDB rows to the new identity key. */
  async #migrateSessionIdentity(
    previous: DraftIdentity | null,
    next: DraftIdentity | null
  ): Promise<void> {
    if (!next) return
    const nextKey = draftIdentityKey(next)
    const prevKey = previous ? draftIdentityKey(previous) : null
    if (prevKey === nextKey) {
      await this.#persistHostLegend()
      await this.#persistHostAssemblies()
      return
    }

    try {
      if (this.draftKeymap && this.isDirty) {
        await saveStoredDraft(next, cloneParsedKeymap(this.draftKeymap), {
          baselineHint: this.baselineKeymap
            ? baselineFingerprint(this.baselineKeymap)
            : undefined
        })
      }
      if (previous) await deleteStoredDraft(previous)
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('Failed to migrate draft in IndexedDB', err)
      }
      this.saveNotice = {
        kind: 'error',
        messages: [
          'Could not save your draft locally. Changes may be lost if you close this tab.'
        ]
      }
    }

    try {
      await saveHostLegendView(this.hostLegend, hostLegendSettingId(nextKey))
      await saveHostAssemblies(
        hostAssembliesSettingId(nextKey),
        this.hostAssemblies
      )
    } catch (err) {
      if (import.meta.env.DEV) {
        console.warn('Failed to migrate host settings in IndexedDB', err)
      }
      this.saveNotice = {
        kind: 'error',
        messages: [
          'Could not save your draft locally. Changes may be lost if you close this tab.'
        ]
      }
    }
  }

  /**
   * On a fresh demo (still English-only after restore/seeds), add one host
   * language from the browser locale when we ship a system layout for it.
   */
  async #maybeAddPreferredDemoLanguage(selectToken: number): Promise<void> {
    if (!sameHostLegendView(this.hostLegend, standardHostLegendView())) return
    const locales =
      typeof navigator !== 'undefined'
        ? [...(navigator.languages ?? []), navigator.language].filter(Boolean)
        : []
    const preferred = preferredAddableHostLanguage(locales)
    if (!preferred) return
    if (!hostLanguagesAvailable(this.hostLegend).includes(preferred)) return

    const dirtyBefore = this.isHostDirty
    this.hostLegend = addHostLanguage(this.hostLegend, preferred)
    await this.#persistHostLegend()
    if (selectToken !== this.#selectGeneration) return
    if (!dirtyBefore) this.markHostDelivered()
  }

  /**
   * Keep demo host layouts (`en2` / `ru2` for Lark) registered under stable ids.
   * Assign them on the legend only while it is still the default English-only view.
   * Buffer seeds first; register/persist only while `selectToken` is still current.
   * Demo seed ids are stable shared fixtures — do not delete them on abort.
   */
  async #seedDemoHostLayouts(
    seeds: DemoHostLayoutSeed[],
    selectToken: number
  ): Promise<void> {
    if (selectToken !== this.#selectGeneration) return
    // Re-registering fixtures bumps hostLayoutRevision; do not treat that as a
    // user edit waiting for OS install.
    const dirtyBefore = this.isHostDirty
    const records: UserHostLayoutRecord[] = seeds.map(seed => ({
      id: seed.id,
      name: seed.name,
      language: seed.language,
      origin: { from: 'xkb' as const, fileName: seed.name, section: seed.section },
      updatedAt: Date.now(),
      layout: demoHostLayoutTable(seed)
    }))
    if (selectToken !== this.#selectGeneration) return

    for (const record of records) {
      if (selectToken !== this.#selectGeneration) return
      this.#registerUserLayout(record)
      const listedItem = {
        id: record.id,
        name: record.name,
        language: record.language,
        origin: record.origin,
        updatedAt: record.updatedAt
      }
      this.userLayouts = this.userLayouts.some(item => item.id === record.id)
        ? this.userLayouts.map(item => (item.id === record.id ? listedItem : item))
        : [...this.userLayouts, listedItem]
    }

    for (const record of records) {
      if (selectToken !== this.#selectGeneration) return
      await saveUserHostLayout(record)
    }
    if (selectToken !== this.#selectGeneration) return

    if (!sameHostLegendView(this.hostLegend, standardHostLegendView())) {
      if (!dirtyBefore) this.markHostDelivered()
      return
    }

    let view = this.hostLegend
    for (const seed of seeds) {
      if (!view.columns.some(column => column.language === seed.language)) {
        view = addHostLanguage(view, seed.language)
      }
      view = assignHostLanguageLayout(view, seed.language, seed.id)
    }

    this.hostLegend = view
    if (selectToken !== this.#selectGeneration) return
    await this.#persistHostLegend()
    if (selectToken !== this.#selectGeneration) return
    this.markHostDelivered()
  }

  async #maybeRestorePersistedDraft(selectToken: number) {
    if (!this.baselineKeymap || !this.draftKeymap) return
    const identity = this.currentDraftIdentity()
    if (!identity) return
    const identityKey = draftIdentityKey(identity)

    let stored
    try {
      stored = await loadStoredDraft(identity)
    } catch {
      return
    }
    if (selectToken !== this.#selectGeneration) return
    if (!this.#draftIdentityMatches(identityKey)) return
    if (!stored) return

    // Stale clean record — drop without prompting.
    if (diffKeymaps(this.baselineKeymap, stored.draftKeymap).length === 0) {
      this.#handledDraftIdentityKey = identityKey
      try {
        await deleteStoredDraft(identity)
      } catch {
        /* ignore */
      }
      return
    }

    // Re-check identity around the blocking prompt so a superseded select cannot
    // show or apply a Restore/Discard decision for the wrong keyboard.
    if (selectToken !== this.#selectGeneration) return
    if (!this.#draftIdentityMatches(identityKey)) return

    const restore = window.confirm(
      'An unpublished draft was saved in this browser. Restore it?\n\nOK = Restore · Cancel = Discard'
    )
    if (selectToken !== this.#selectGeneration) return
    if (!this.#draftIdentityMatches(identityKey)) return

    this.#handledDraftIdentityKey = identityKey

    if (restore) {
      this.draftKeymap = adoptSensorBindings(
        adoptHoldTaps(cloneParsedKeymap(stored.draftKeymap), this.baselineKeymap),
        this.baselineKeymap
      )
      this.clearHistory()
    } else {
      try {
        await deleteStoredDraft(identity)
      } catch {
        /* ignore */
      }
    }
  }

  /** True when the open draft identity still matches `identityKey`. */
  #draftIdentityMatches(identityKey: string): boolean {
    const current = this.currentDraftIdentity()
    return current != null && draftIdentityKey(current) === identityKey
  }

  addLayer() {
    const km = this.draftKeymap
    if (!km) return
    const width = this.layout?.length ?? km.layers[0]?.length ?? 0
    const index = km.layers.length
    const names = this.hostLegendLayerNames
    const blank = (): KeyBindingNode => ({ value: '&trans', params: [] })
    const next: ParsedKeymap = {
      ...km,
      layer_names: [...names, `Layer #${index}`],
      layers: [...km.layers, Array.from({ length: width }, blank)]
    }
    if (km.sensorBindings) {
      const prev = km.sensorBindings[km.sensorBindings.length - 1] ?? []
      next.sensorBindings = [
        ...km.sensorBindings.map(row => row.map(cloneSensorBinding)),
        prev.map(cloneSensorBinding)
      ]
    }
    this.updateKeymap(next)
  }

  renameLayer(index: number, name: string) {
    const km = this.draftKeymap
    if (!km || index < 0 || index >= km.layers.length) return
    const names = [...this.hostLegendLayerNames]
    names[index] = name
    this.updateKeymap({ ...km, layer_names: names })
  }

  deleteLayer(index: number) {
    const km = this.draftKeymap
    if (!km || km.layers.length <= 1) return
    if (index < 0 || index >= km.layers.length) return
    const names = [...this.hostLegendLayerNames]
    names.splice(index, 1)
    const layers = km.layers.filter((_, i) => i !== index)
    const next: ParsedKeymap = { ...km, layer_names: names, layers }
    if (km.conditionalLayers) {
      next.conditionalLayers = remapConditionalLayersAfterDelete(
        km.conditionalLayers,
        index
      )
    }
    if (km.sensorBindings) {
      next.sensorBindings = km.sensorBindings.filter((_, i) => i !== index)
    }
    this.updateKeymap(next)
    this.layerView = remapShownLayersAfterDelete(this.layerView, index, layers.length)
  }

  /** Replace one encoder turn on a layer. */
  updateSensorBinding(layer: number, index: number, binding: KeyBindingNode) {
    const km = this.draftKeymap
    if (!km?.sensorBindings) return
    const rows = km.sensorBindings.map(row => row.map(cloneSensorBinding))
    const row = rows[layer]
    if (!row || index < 0 || index >= row.length) return
    row[index] = cloneSensorBinding(binding)
    this.updateKeymap({ ...km, sensorBindings: rows })
  }

  /**
   * Remember a hold-tap list for the keymap update that applies the open key.
   * A new preset stays out of the draft until that update.
   */
  armHoldTapsForNextUpdate(holdTaps: ZmkHoldTap[] | null) {
    this.#holdTapsOnNextUpdate = holdTaps
  }

  /** Replace hold-tap nodes on the draft. Save rewrites those nodes in the keymap. */
  updateHoldTaps(holdTaps: ZmkHoldTap[]) {
    const km = this.draftKeymap
    if (!km) return
    this.updateKeymap({ ...km, holdTaps })
  }

  /** Replace conditional-layer rules on the draft. An empty list drops the block on save. */
  updateConditionalLayers(conditionalLayers: ZmkConditionalLayer[]) {
    const km = this.draftKeymap
    if (!km) return
    this.updateKeymap({ ...km, conditionalLayers })
  }

  updateKeymap(next: ParsedKeymap) {
    const stagedHoldTaps = this.#holdTapsOnNextUpdate
    this.#holdTapsOnNextUpdate = null
    if (stagedHoldTaps) next = { ...next, holdTaps: stagedHoldTaps }
    if (this.draftKeymap) {
      const prev = cloneParsedKeymap(this.draftKeymap)
      const stack = [...this.undoStack, prev]
      this.undoStack =
        stack.length > HISTORY_LIMIT
          ? stack.slice(stack.length - HISTORY_LIMIT)
          : stack
      this.redoStack = []
    }
    this.draftKeymap = next
    this.schedulePersist()
  }

  /** Replace the combos list on the draft (undoable via updateKeymap). */
  updateCombos(combos: ZmkCombo[]) {
    const km = this.draftKeymap
    if (!km) return
    this.updateKeymap({ ...km, combos })
    if (this.activeComboId && !combos.some(c => c.id === this.activeComboId)) {
      this.activeComboId = combos[0]?.id ?? null
    }
  }

  toggleComboMode() {
    if (this.comboMode) {
      if (!this.tryExitComboMode()) return
      return
    }

    this.comboMode = true
    this.schemeMode = false
    this.comboNotice = null
    const combos = this.draftKeymap?.combos ?? []
    if (
      this.activeComboId == null ||
      !combos.some(c => c.id === this.activeComboId)
    ) {
      this.activeComboId = combos[0]?.id ?? null
    }
  }

  /**
   * Leave combo mode when every kept combo has a valid key count and no two
   * claim the same keys on a shared layer. Drops empty drafts.
   * Returns false when a combo still blocks exit.
   */
  tryExitComboMode(): boolean {
    if (!this.comboMode) return true
    const km = this.draftKeymap
    const list = km?.combos ?? []
    const withoutEmpty = list.filter(c => c.keyPositions.length > 0)
    if (km && withoutEmpty.length !== list.length) {
      this.updateCombos(withoutEmpty)
    }
    const incomplete = withoutEmpty.find(c => comboKeysIssue(c.keyPositions) != null)
    if (incomplete) {
      this.activeComboId = incomplete.id
      this.refreshComboNotice()
      return false
    }
    const overlap = comboChordOverlap(withoutEmpty)
    if (overlap) {
      this.activeComboId = overlap.id
      this.refreshComboNotice()
      return false
    }
    this.comboMode = false
    this.comboNotice = null
    return true
  }

  /** Hard hint for the active combo: key count, then a shared chord. */
  refreshComboNotice() {
    const combos = this.draftKeymap?.combos ?? []
    const combo = combos.find(c => c.id === this.activeComboId)
    if (!combo) {
      this.comboNotice = null
      return
    }
    const issue = comboKeysIssue(combo.keyPositions)
    if (issue) {
      this.comboNotice = comboKeysMessage(issue)
      return
    }
    const otherId = comboChordOverlapPartners(combos).get(combo.id)
    this.comboNotice = comboOverlapMessage(otherId)
  }

  /** Toggle `keyIndex` in the active combo's key-positions. */
  toggleComboPosition(keyIndex: number) {
    const km = this.draftKeymap
    if (!km || this.activeComboId == null) return
    const combos = [...(km.combos ?? [])]
    const i = combos.findIndex(c => c.id === this.activeComboId)
    if (i < 0) return
    const combo = combos[i]
    const set = new Set(combo.keyPositions)
    if (set.has(keyIndex)) {
      set.delete(keyIndex)
    } else {
      if (set.size >= COMBO_MAX_KEYS) {
        this.comboNotice = comboKeysMessage('too_many')
        return
      }
      set.add(keyIndex)
    }
    combos[i] = {
      ...combo,
      keyPositions: [...set].sort((a, b) => a - b)
    }
    this.updateCombos(combos)
    this.refreshComboNotice()
  }

  undo() {
    if (!this.draftKeymap || this.undoStack.length === 0) return
    const stack = this.undoStack
    const prev = stack[stack.length - 1]
    this.undoStack = stack.slice(0, -1)
    this.redoStack = [...this.redoStack, cloneParsedKeymap(this.draftKeymap)]
    this.draftKeymap = cloneParsedKeymap(prev)
    this.schedulePersist()
  }

  redo() {
    if (!this.draftKeymap || this.redoStack.length === 0) return
    const stack = this.redoStack
    const next = stack[stack.length - 1]
    this.redoStack = stack.slice(0, -1)
    this.undoStack = [...this.undoStack, cloneParsedKeymap(this.draftKeymap)]
    this.draftKeymap = cloneParsedKeymap(next)
    this.schedulePersist()
  }

  /**
   * Drop unpublished edits: draft ← baseline, clear step history + IndexedDB.
   * Unlike undo, this works after reload when the session stack is empty.
   */
  async discardDraft(): Promise<boolean> {
    if (!this.baselineKeymap || !this.draftKeymap || !this.isDirty) return false
    this.draftKeymap = cloneParsedKeymap(this.baselineKeymap)
    this.clearHistory()
    this.saveNotice = null
    await this.clearPersistedDraft()
    return true
  }

  /**
   * After successful publish + successful reload: replace baseline and draft
   * from re-read keymap, then apply save-response warnings.
   * Clears IndexedDB draft only here (not on reload failure).
   */
  applyPublished(reloaded: ParsedKeymap, saveMeta?: unknown) {
    const baseline = cloneParsedKeymap(reloaded)
    this.baselineKeymap = baseline
    this.draftKeymap = cloneParsedKeymap(baseline)
    this.clearHistory()
    const warnings = formatKeymapSaveWarnings(
      saveMeta && typeof saveMeta === 'object'
        ? (saveMeta as { warnings?: unknown }).warnings
        : undefined
    )
    this.saveNotice =
      warnings.length > 0 ? { kind: 'warning', messages: warnings } : null
    void this.clearPersistedDraft()
  }

  /** After Copy .keymap: sync baseline; the export sheet carries user-facing notes. */
  applyClipboardCopied(reloaded: ParsedKeymap, _saveMeta?: unknown) {
    const baseline = cloneParsedKeymap(reloaded)
    this.baselineKeymap = baseline
    this.draftKeymap = cloneParsedKeymap(baseline)
    this.clearHistory()
    this.saveNotice = null
    const identity = this.currentDraftIdentity()
    if (identity && this.clipboardOriginalSource) {
      writeClipboardOriginalSource(identity, this.clipboardOriginalSource)
    }
    void this.clearPersistedDraft()
  }

  /** Publish (POST/commit) succeeded but reload failed — keep draft dirty. */
  applyReloadFailure(source: string | null = this.source) {
    const where =
      source === 'github'
        ? 'repository'
        : source === 'clipboard'
          ? 'clipboard'
          : 'disk'
    this.saveNotice = {
      kind: 'error',
      messages: [
        `Write succeeded, but reloading from ${where} failed. Draft is still dirty and may differ from the published files.`
      ]
    }
  }

  applySaveFailure(data: unknown) {
    this.saveNotice = { kind: 'error', messages: extractErrorMessages(data) }
  }

  /** Drop the loaded keymap after GitHub logout. Host layouts stay in the browser. */
  clearLoadedKeymap() {
    this.#cancelPersistTimer()
    this.#persistGeneration += 1
    this.#selectGeneration += 1
    this.#publishGeneration += 1
    this.endHostEditSession()
    this.legendHover = null
    this.source = null
    this.githubMeta = null
    this.#hostRepoBaselineEncoded = null
    this.clipboardOriginalSource = null
    this.layout = null
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

  /** Reset singleton between vitest cases. */
  resetForTests() {
    this.#cancelPersistTimer()
    this.#persistGeneration += 1
    this.#selectGeneration += 1
    this.#publishGeneration += 1
    this.#handledDraftIdentityKey = null
    this.#hostRepoBaselineEncoded = null
    this.definitions = null
    this.source = null
    this.githubMeta = null
    this.clipboardOriginalSource = null
    this.layout = null
    this.baselineKeymap = null
    this.draftKeymap = null
    this.#holdTapsOnNextUpdate = null
    this.clearHistory()
    this.saving = false
    resetHostLayoutRegistry()
    this.hostLegend = standardHostLegendView()
    this.hostAssemblies = []
    this.hostLayoutRevision = 0
    this.hostDeliveredFingerprint = ''
    this.symbolAlignOn = true
    this.multilangView = false
    this.layerTonesOn = false
    this.schemeMode = false
    this.comboMode = false
    this.activeComboId = null
    this.comboNotice = null
    this.layerView = standardLayerView()
    this.userLayouts = []
    this.hostProfilePrompt = null
    this.hostProfileNote = null
    this.legendHover = null
    this.hostSymbolCatalogOpen = false
    this.hostSymbolEditTarget = null
    this.hostEditSession = null
    this.saveNotice = null
  }
}

export const editor = new EditorState()
