/**
 * Shared editor document state (Svelte 5 runes).
 * Baseline (last load / successful publish+reload) vs draft (live edits).
 */

import {
  diffKeymaps,
  getBehaviorCatalog,
  getKeycodeCatalog,
  standardHostLegendView,
  summarizeKeymapDiff,
  type HostLegendView,
  type LegendHover,
  type KeyBindingNode,
  type KeymapChange,
  type LayoutKey,
  type ParsedKeymap
} from '@keymap-editor/keymap-core'
import type { Definitions } from './context'
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
  STANDARD_HOST_PROFILE_ID,
  builtinHostProfile,
  builtinHostProfiles,
  hostLegendWithMap,
  hostProfileMap,
  loadActiveHostProfileId,
  deleteHostProfile,
  loadHostProfiles,
  sameHostProfileMap,
  saveActiveHostProfileId,
  saveHostProfile,
  type HostProfile
} from './host-profiles'

export type LegendMode = 'zmk' | 'composed'

export type HostProfilePrompt =
  | { kind: 'fork'; next: HostLegendView }
  | { kind: 'save-as' }
  | { kind: 'copy' }
  | { kind: 'rename' }
  | { kind: 'delete' }

export type SaveNotice = {
  kind: 'warning' | 'error'
  messages: string[]
}

export type GithubMeta = { repository: string; branch: string }

/** Max draft snapshots kept for undo / redo. */
const HISTORY_LIMIT = 50

/** Debounce for IndexedDB draft writes. */
const PERSIST_DEBOUNCE_MS = 400

const WARNING_MESSAGES: Record<string, string> = {
  macros_expanded:
    'Macros were expanded to raw keycodes (for example VU → C_VOL_UP). #define lines in the keymap may now be unused.',
  generated_default_template:
    'No existing keymap or template was used, so the file was saved from the default generated template.'
}

function formatWarnings(warnings: unknown): string[] {
  if (!Array.isArray(warnings) || warnings.length === 0) return []
  return warnings.map(code => {
    const key = String(code)
    return WARNING_MESSAGES[key] ?? key
  })
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

/** Deep clone plain ParsedKeymap (value+params only). Never structuredClone reactive graphs. */
export function cloneParsedKeymap(km: ParsedKeymap): ParsedKeymap {
  const cloneBinding = (node: KeyBindingNode): KeyBindingNode => ({
    value: node.value,
    params: Array.isArray(node.params) ? node.params.map(cloneBinding) : []
  })

  const layer_names = (
    km.layer_names ?? km.layers.map((_, i) => `Layer ${i}`)
  ).map(String)

  const out: ParsedKeymap = {
    layer_names,
    layers: km.layers.map(layer => layer.map(cloneBinding))
  }
  if (km.keyboard != null) out.keyboard = km.keyboard
  if (km.keymap != null) out.keymap = km.keymap
  if (km.layout != null) out.layout = km.layout
  return out
}

export type KeyboardSelection = {
  source?: string
  layout?: LayoutKey[] | null
  keymap?: ParsedKeymap | null
  github?: GithubMeta
  [key: string]: unknown
}

class EditorState {
  definitions = $state<Definitions | null>(null)
  source = $state<string | null>(null)
  githubMeta = $state<GithubMeta | null>(null)
  layout = $state<LayoutKey[] | null>(null)
  /** Last loaded / successfully published+reloaded keymap. */
  baselineKeymap = $state<ParsedKeymap | null>(null)
  /** Live editor document; always set after load. */
  draftKeymap = $state<ParsedKeymap | null>(null)
  /** Plain draft snapshots for step undo (not vs baseline). */
  undoStack = $state<ParsedKeymap[]>([])
  redoStack = $state<ParsedKeymap[]>([])
  saving = $state(false)
  legendMode = $state<LegendMode>('zmk')
  /** View over the host profile. It does not edit the keymap. */
  hostLegend = $state<HostLegendView>(standardHostLegendView())
  hostProfiles = $state<HostProfile[]>([])
  activeHostProfileId = $state(STANDARD_HOST_PROFILE_ID)
  hostProfilePrompt = $state<HostProfilePrompt | null>(null)
  hostProfileNote = $state<string | null>(null)
  legendHover = $state<LegendHover | null>(null)
  saveNotice = $state<SaveNotice | null>(null)

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

  #changes = $derived.by(() => {
    if (!this.baselineKeymap || !this.draftKeymap) return []
    return diffKeymaps(this.baselineKeymap, this.draftKeymap)
  })

  get isDirty(): boolean {
    return this.#changes.length > 0
  }

  get changes(): KeymapChange[] {
    return this.#changes
  }

  get dirtySummary(): string {
    return summarizeKeymapDiff(this.changes)
  }

  get statusText(): string {
    if (!this.draftKeymap) return ''
    if (!this.isDirty) {
      return this.source === 'github'
        ? 'Up to date with repo'
        : 'Up to date with disk'
    }
    const summary = this.dirtySummary
    return summary ? `Draft · ${summary}` : 'Draft'
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0
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

  /** Restore named host profiles. Failures leave the standard profile. */
  async restoreHostProfiles() {
    try {
      const profiles = await loadHostProfiles()
      const activeId = await loadActiveHostProfileId()
      this.hostProfiles = profiles
      const preset = builtinHostProfile(activeId)
      if (preset) {
        this.activeHostProfileId = preset.id
        this.hostLegend = { ...preset.view }
        return
      }
      const active = profiles.find(profile => profile.id === activeId)
      if (!active) {
        this.activeHostProfileId = STANDARD_HOST_PROFILE_ID
        this.hostLegend = standardHostLegendView()
        return
      }
      this.activeHostProfileId = active.id
      this.hostLegend = hostLegendWithMap(
        standardHostLegendView(),
        active.map,
        'custom'
      )
    } catch {
      this.hostProfiles = []
      this.activeHostProfileId = STANDARD_HOST_PROFILE_ID
      this.hostLegend = standardHostLegendView()
    }
  }

  /**
   * Apply a language change.
   * A builtin profile is immutable: the first divergence asks for a name.
   * A named profile stores the new map immediately.
   */
  commitHostMap(next: HostLegendView): Promise<void> {
    const map = hostProfileMap(next)
    const preset = builtinHostProfile(this.activeHostProfileId)
    if (preset) {
      if (sameHostProfileMap(map, hostProfileMap(preset.view))) {
        this.hostLegend = { ...next, source: preset.view.source }
        return Promise.resolve()
      }
      this.hostProfileNote = null
      this.hostProfilePrompt = { kind: 'fork', next }
      return Promise.resolve()
    }
    const current = this.hostProfiles.find(
      profile => profile.id === this.activeHostProfileId
    )
    if (!current) {
      this.hostProfileNote = null
      this.hostProfilePrompt = { kind: 'fork', next }
      return Promise.resolve()
    }
    this.hostLegend = { ...next, source: 'custom' }
    if (sameHostProfileMap(map, current.map)) return Promise.resolve()
    const updated: HostProfile = { ...current, map, updatedAt: Date.now() }
    this.hostProfiles = this.hostProfiles.map(profile =>
      profile.id === updated.id ? updated : profile
    )
    return saveHostProfile(updated)
  }

  selectHostProfile(id: string): Promise<void> {
    if (id === this.activeHostProfileId) return Promise.resolve()
    this.hostProfilePrompt = null
    this.hostProfileNote = null
    const preset = builtinHostProfile(id)
    if (preset) {
      this.activeHostProfileId = preset.id
      this.hostLegend = {
        ...preset.view,
        layers: this.hostLegend.layers ?? preset.view.layers
      }
      return saveActiveHostProfileId(id)
    }
    const profile = this.hostProfiles.find(item => item.id === id)
    if (!profile) return Promise.resolve()
    this.activeHostProfileId = id
    this.hostLegend = hostLegendWithMap(this.hostLegend, profile.map, 'custom')
    return saveActiveHostProfileId(id)
  }

  beginSaveHostProfile() {
    this.hostProfileNote = null
    this.hostProfilePrompt = { kind: 'save-as' }
  }

  beginCopyHostProfile() {
    this.hostProfileNote = null
    this.hostProfilePrompt = { kind: 'copy' }
  }

  beginRenameHostProfile() {
    if (builtinHostProfile(this.activeHostProfileId)) return
    this.hostProfileNote = null
    this.hostProfilePrompt = { kind: 'rename' }
  }

  beginDeleteHostProfile() {
    if (builtinHostProfile(this.activeHostProfileId)) return
    this.hostProfileNote = null
    this.hostProfilePrompt = { kind: 'delete' }
  }

  async deleteActiveHostProfile(): Promise<void> {
    const id = this.activeHostProfileId
    if (builtinHostProfile(id)) return
    const existed = this.hostProfiles.some(profile => profile.id === id)
    if (!existed) return
    this.hostProfiles = this.hostProfiles.filter(profile => profile.id !== id)
    this.hostProfilePrompt = null
    await deleteHostProfile(id)
    await this.selectHostProfile(STANDARD_HOST_PROFILE_ID)
  }

  cancelHostProfilePrompt() {
    this.hostProfilePrompt = null
  }

  /** Returns an error message, or null when the profile was stored. */
  async confirmHostProfileName(raw: string): Promise<string | null> {
    const prompt = this.hostProfilePrompt
    if (!prompt) return null
    const name = raw.trim()
    if (!name) return 'Введите имя профиля'
    const reserved = builtinHostProfiles().some(
      profile => profile.name.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru')
    )
    if (reserved) return `Имя «${name.trim()}» занято встроенным профилем`
    if (prompt.kind === 'delete') return null
    if (prompt.kind === 'rename') return this.#renameHostProfile(name)
    if (prompt.kind !== 'fork' && prompt.kind !== 'save-as' && prompt.kind !== 'copy') {
      return null
    }
    const taken = this.hostProfiles.some(
      profile => profile.name.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru')
    )
    if (taken) return 'Профиль с таким именем уже есть'
    const map =
      prompt.kind === 'fork'
        ? hostProfileMap(prompt.next)
        : hostProfileMap(this.hostLegend)
    const profile: HostProfile = {
      id: crypto.randomUUID(),
      name,
      map,
      updatedAt: Date.now()
    }
    this.hostProfiles = [...this.hostProfiles, profile]
    this.activeHostProfileId = profile.id
    this.hostLegend =
      prompt.kind === 'fork'
        ? { ...prompt.next, source: 'custom' }
        : hostLegendWithMap(this.hostLegend, map, 'custom')
    this.hostProfilePrompt = null
    await saveHostProfile(profile)
    await saveActiveHostProfileId(profile.id)
    return null
  }

  async #renameHostProfile(name: string): Promise<string | null> {
    const current = this.hostProfiles.find(
      profile => profile.id === this.activeHostProfileId
    )
    if (!current) return null
    if (current.name.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru')) {
      this.hostProfilePrompt = null
      return null
    }
    const taken = this.hostProfiles.some(
      profile =>
        profile.id !== current.id &&
        profile.name.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru')
    )
    if (taken) return 'Профиль с таким именем уже есть'
    const updated: HostProfile = { ...current, name, updatedAt: Date.now() }
    this.hostProfiles = this.hostProfiles.map(profile =>
      profile.id === updated.id ? updated : profile
    )
    this.hostProfilePrompt = null
    await saveHostProfile(updated)
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
    } catch {
      /* IDB failures are non-fatal */
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

    const alreadyHandled =
      upcomingKey != null && upcomingKey === this.#handledDraftIdentityKey
    const keepLiveDraft =
      alreadyHandled && this.draftKeymap != null && this.isDirty

    this.source = event.source ?? null
    this.githubMeta = event.github ?? null
    this.layout = event.layout ?? null
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
      }
    }
    this.saveNotice = null

    if (alreadyHandled) return
    await this.#maybeRestorePersistedDraft(selectToken)
  }

  async #maybeRestorePersistedDraft(selectToken: number) {
    if (!this.baselineKeymap || !this.draftKeymap) return
    const identity = this.currentDraftIdentity()
    if (!identity) return

    let stored
    try {
      stored = await loadStoredDraft(identity)
    } catch {
      return
    }
    if (selectToken !== this.#selectGeneration) return
    if (!stored) return

    // Stale clean record — drop without prompting.
    if (diffKeymaps(this.baselineKeymap, stored.draftKeymap).length === 0) {
      this.#handledDraftIdentityKey = draftIdentityKey(identity)
      try {
        await deleteStoredDraft(identity)
      } catch {
        /* ignore */
      }
      return
    }

    const restore = window.confirm(
      'An unpublished draft was saved in this browser. Restore it?\n\nOK = Restore · Cancel = Discard'
    )
    if (selectToken !== this.#selectGeneration) return

    this.#handledDraftIdentityKey = draftIdentityKey(identity)

    if (restore) {
      this.draftKeymap = cloneParsedKeymap(stored.draftKeymap)
      this.clearHistory()
    } else {
      try {
        await deleteStoredDraft(identity)
      } catch {
        /* ignore */
      }
    }
  }

  updateKeymap(next: ParsedKeymap) {
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
    const warnings = formatWarnings(
      saveMeta && typeof saveMeta === 'object'
        ? (saveMeta as { warnings?: unknown }).warnings
        : undefined
    )
    this.saveNotice =
      warnings.length > 0 ? { kind: 'warning', messages: warnings } : null
    void this.clearPersistedDraft()
  }

  /** Publish (POST/commit) succeeded but reload failed — keep draft dirty. */
  applyReloadFailure(source: string | null = this.source) {
    const where = source === 'github' ? 'repository' : 'disk'
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

  /** Reset singleton between vitest cases. */
  resetForTests() {
    this.#cancelPersistTimer()
    this.#persistGeneration += 1
    this.#selectGeneration += 1
    this.#publishGeneration += 1
    this.#handledDraftIdentityKey = null
    this.definitions = null
    this.source = null
    this.githubMeta = null
    this.layout = null
    this.baselineKeymap = null
    this.draftKeymap = null
    this.clearHistory()
    this.saving = false
    this.legendMode = 'zmk'
    this.hostLegend = standardHostLegendView()
    this.hostProfiles = []
    this.activeHostProfileId = STANDARD_HOST_PROFILE_ID
    this.hostProfilePrompt = null
    this.hostProfileNote = null
    this.legendHover = null
    this.saveNotice = null
  }
}

export const editor = new EditorState()
