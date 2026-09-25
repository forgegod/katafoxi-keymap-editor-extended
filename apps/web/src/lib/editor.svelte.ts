/**
 * Shared editor document state (Svelte 5 runes).
 * Baseline (last load / successful publish+reload) vs draft (live edits).
 */

import {
  diffKeymaps,
  getBehaviorCatalog,
  getKeycodeCatalog,
  assignHostLanguageLayout,
  hostLanguage,
  hostLayout,
  hostLayoutFromXkb,
  hostLegendColumns,
  listXkbSections,
  primarySystemLayoutId,
  registerHostLayout,
  resetHostLayoutRegistry,
  standardHostLegendView,
  standardLayerView,
  remapShownLayersAfterDelete,
  unregisterHostLayout,
  summarizeKeymapDiff,
  type HostLegendView,
  type LayerView,
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
  cloneHostLayoutTable,
  deleteUserHostLayout,
  isUserHostLayoutId,
  loadHostLegendView,
  loadUserHostLayouts,
  reservedProfileName,
  uniqueUserHostLayoutName,
  sanitizeHostLegendView,
  saveHostLegendView,
  saveUserHostLayout,
  UNKNOWN_HOST_LAYOUT_NOTE,
  type HostLanguageId,
  type UserHostLayout,
  type UserHostLayoutRecord
} from './host-layout-store'

export type LegendMode = 'zmk' | 'composed'

export type HostProfilePrompt =
  | { kind: 'save-as'; language: HostLanguageId }
  | { kind: 'copy'; language: HostLanguageId; layoutId?: string }
  | { kind: 'rename'; language: HostLanguageId; profileId?: string }
  | { kind: 'delete'; language: HostLanguageId; profileId?: string }

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

export class EditorState {
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
  legendMode = $state<LegendMode>('composed')
  /** View over the host profile. It does not edit the keymap. */
  hostLegend = $state<HostLegendView>(standardHostLegendView())
  /** Which firmware layers are drawn on the keycap. */
  layerView = $state<LayerView>(standardLayerView())
  userLayouts = $state<UserHostLayout[]>([])
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

  /** Restore user layouts into the registry, then the saved view. */
  async restoreHostProfiles() {
    try {
      resetHostLayoutRegistry()
      const records = await loadUserHostLayouts()
      for (const record of records) this.#registerUserLayout(record)
      this.userLayouts = records.map(({ layout: _layout, ...rest }) => rest)
      const stored = await loadHostLegendView()
      const { view, replaced } = sanitizeHostLegendView(
        stored ?? standardHostLegendView()
      )
      this.hostLegend = view
      this.hostProfileNote = replaced.length > 0 ? UNKNOWN_HOST_LAYOUT_NOTE : null
      if (replaced.length > 0) await saveHostLegendView(view)
    } catch {
      resetHostLayoutRegistry()
      this.userLayouts = []
      this.hostLegend = standardHostLegendView()
      this.layerView = standardLayerView()
      this.hostProfileNote = null
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
  }

  activeProfileId(language: HostLanguageId): string {
    return this.hostLegend.columns.find(column => column.language === language)?.layoutId ?? ''
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
    return saveHostLegendView(this.hostLegend)
  }

  selectLanguageProfile(language: HostLanguageId, id: string): Promise<void> {
    if (this.activeProfileId(language) === id) return Promise.resolve()
    this.hostProfilePrompt = null
    this.hostProfileNote = null
    if (!hostLayout(id)) return Promise.resolve()
    this.hostLegend = assignHostLanguageLayout(this.hostLegend, language, id)
    return saveHostLegendView(this.hostLegend)
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
      return `Секция «${section}» не найдена`
    }
    try {
      const imported = hostLayoutFromXkb(text, section, { fileName })
      const label = listed.find(item => item.section === section)?.name ?? section
      const name = uniqueUserHostLayoutName(language, label, this.userLayouts)
      const id = `user:${crypto.randomUUID()}`
      const layout = cloneHostLayoutTable(imported, id)
      const record: UserHostLayoutRecord = {
        id,
        name,
        language,
        origin: { from: 'xkb', fileName, section },
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
      await saveHostLegendView(this.hostLegend)
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'Не удалось импортировать xkb'
    }
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
    if (!name) return 'Введите имя профиля'
    if (reservedProfileName(name)) return `Имя «${name}» занято встроенным профилем`
    if (prompt.kind === 'delete') return null
    if (prompt.kind === 'rename') return this.#renameHostProfile(prompt.language, name)
    const language = prompt.language
    const taken = this.userLayouts.some(
      layout =>
        layout.language === language &&
        layout.name.toLocaleLowerCase('ru') === name.toLocaleLowerCase('ru')
    )
    if (taken) return 'Профиль с таким именем уже есть'
    const sourceId =
      (prompt.kind === 'copy' ? prompt.layoutId : undefined) ??
      hostLegendColumns(this.hostLegend).find(column => column.language === language)
        ?.layoutId ??
      ''
    const source = sourceId ? hostLayout(sourceId) : undefined
    if (!source) return 'Нет раскладки для этого языка'
    const id = `user:${crypto.randomUUID()}`
    const layout = cloneHostLayoutTable(source, id)
    const record: UserHostLayoutRecord = {
      id,
      name,
      language,
      origin: { from: 'copy', layoutId: sourceId },
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
    await saveUserHostLayout(record)
    await saveHostLegendView(this.hostLegend)
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
    if (taken) return 'Профиль с таким именем уже есть'
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

  addLayer() {
    const km = this.draftKeymap
    if (!km) return
    const width = this.layout?.length ?? km.layers[0]?.length ?? 0
    const index = km.layers.length
    const names = this.hostLegendLayerNames
    const blank = (): KeyBindingNode => ({ value: '&trans', params: [] })
    this.updateKeymap({
      ...km,
      layer_names: [...names, `Layer #${index}`],
      layers: [...km.layers, Array.from({ length: width }, blank)]
    })
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
    this.updateKeymap({ ...km, layer_names: names, layers })
    this.layerView = remapShownLayersAfterDelete(this.layerView, index, layers.length)
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
    this.legendMode = 'composed'
    resetHostLayoutRegistry()
    this.hostLegend = standardHostLegendView()
    this.layerView = standardLayerView()
    this.userLayouts = []
    this.hostProfilePrompt = null
    this.hostProfileNote = null
    this.legendHover = null
    this.saveNotice = null
  }
}

export const editor = new EditorState()
