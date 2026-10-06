import {
  addHostLanguage,
  assignHostLanguageLayout,
  decodeKlc,
  encodeKlc,
  hostAssemblyName,
  HOST_ASSEMBLY_LIMIT,
  hostLanguage,
  hostLanguageName,
  hostLanguagesAvailable,
  hostLayout,
  hostLayoutChoice,
  hostLayoutChoiceLabel,
  hostLayoutFromXkb,
  hostLayoutMeta,
  hostLayoutToKlc,
  hostLayoutToXkbSection,
  hostLayoutsToCapsKlc,
  hostLegendColumns,
  hostLevels,
  glyphToKeysym,
  isLegacyBilingualHostLegend,
  keysymToGlyph,
  listXkbSections,
  pairedKbdId,
  parseKlc,
  primarySystemLayoutId,
  registerHostLayout,
  resetHostLayoutRegistry,
  sameHostLegendView,
  standardHostLegendView,
  standardLayerView,
  symbolAlignPairFromView,
  toggleHostLanguage,
  unregisterHostLayout,
  windowsCapsPairingRecommended,
  windowsLocale,
  withHostKey,
  cloneHostLegendView,
  cloneHostLayoutTable,
  type HostLayout,
  type HostLegendView
} from '@keymap-editor/keymap-core'
import {
  deleteHostLegendView,
  deleteUserHostLayout,
  foldHostProfileName,
  hostAssembliesSettingId,
  hostLegendSettingId,
  isUserHostLayoutId,
  loadHostAssemblies,
  loadHostLegendView,
  loadUserHostLayouts,
  reservedProfileName,
  sanitizeHostLegendView,
  saveHostAssemblies,
  saveHostLegendView,
  saveUserHostLayout,
  uniqueUserHostLayoutName,
  HOST_LAYOUT_SAVE_FAIL_NOTE,
  UNKNOWN_HOST_LAYOUT_NOTE,
  type HostLanguageId,
  type StoredHostAssembly,
  type UserHostLayout,
  type UserHostLayoutOrigin,
  type UserHostLayoutRecord
} from '../host-layout-store'
import { draftIdentityKey } from '../draft-storage'
import { pairedImportNames } from './helpers'
import type { EditorState } from './state.svelte'
import type { HostKeyLevelEditResult } from './types'

/** Restore user layouts into the registry. The legend view loads with the keymap. */
export async function restoreHostProfiles(this: EditorState) {
  try {
    resetHostLayoutRegistry()
    const records = await loadUserHostLayouts()
    for (const record of records) this._registerUserLayout(record)
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

export function _registerUserLayout(this: EditorState, record: UserHostLayoutRecord) {
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
export async function _materializeUserHostLayoutFromTable(this: EditorState, 
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
  this._registerUserLayout(record)
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
  const generation = this._selectGeneration
  const legendSettingId = this._hostLegendSettingId()
  await this._persistHostLayoutWrite(() => saveUserHostLayout(record))
  if (generation !== this._selectGeneration) return id
  await this._persistHostLegend(legendSettingId, generation)
  return id
}

export function _noteHostLayoutSaveFailed(this: EditorState) {
  this.hostProfileNote = HOST_LAYOUT_SAVE_FAIL_NOTE
  this.saveNotice = { kind: 'error', messages: [HOST_LAYOUT_SAVE_FAIL_NOTE] }
}

/** Run an IndexedDB host write; on failure, notify and do not throw. */
export async function _persistHostLayoutWrite(
  this: EditorState,
  write: () => Promise<void>
): Promise<void> {
  try {
    await write()
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('Failed to save host layout in IndexedDB', err)
    }
    this._noteHostLayoutSaveFailed()
  }
}

export function _hostLegendSettingId(this: EditorState): string | null {
  const identity = this.currentDraftIdentity()
  return identity ? hostLegendSettingId(draftIdentityKey(identity)) : null
}

export async function _persistHostLegend(
  this: EditorState,
  settingId?: string | null,
  generation: number = this._selectGeneration
): Promise<void> {
  const id = settingId !== undefined ? settingId : this._hostLegendSettingId()
  if (!id || generation !== this._selectGeneration) return
  const view = this.hostLegend
  await this._persistHostLayoutWrite(async () => {
    if (generation !== this._selectGeneration) return
    await saveHostLegendView(view, id)
  })
}

/**
 * Load the legend for the open keymap. A leftover browser-wide view is
 * adopted once when it is not the old English+Russian demo default.
 */
export async function _restoreHostLegend(this: EditorState, selectToken: number): Promise<void> {
  const settingId = this._hostLegendSettingId()
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
        await this._persistHostLayoutWrite(() => saveHostLegendView(legacy, settingId))
      }
      if (legacy) await this._persistHostLayoutWrite(() => deleteHostLegendView())
    }
    if (selectToken !== this._selectGeneration) return
    const { view, replaced } = sanitizeHostLegendView(stored ?? standardHostLegendView())
    this.hostLegend = view
    if (replaced.length > 0) {
      this.hostProfileNote = UNKNOWN_HOST_LAYOUT_NOTE
      await this._persistHostLayoutWrite(() => saveHostLegendView(view, settingId))
    }
  } catch {
    /* keep the in-memory view */
  }
  if (selectToken !== this._selectGeneration) return
  await this._restoreHostAssemblies(selectToken)
}

export function _hostAssembliesSettingId(this: EditorState): string | null {
  const identity = this.currentDraftIdentity()
  return identity ? hostAssembliesSettingId(draftIdentityKey(identity)) : null
}

export async function _persistHostAssemblies(
  this: EditorState,
  settingId?: string | null,
  generation: number = this._selectGeneration
): Promise<void> {
  const id = settingId !== undefined ? settingId : this._hostAssembliesSettingId()
  if (!id || generation !== this._selectGeneration) return
  const assemblies = this.hostAssemblies
  await this._persistHostLayoutWrite(async () => {
    if (generation !== this._selectGeneration) return
    await saveHostAssemblies(id, assemblies)
  })
}

export async function _restoreHostAssemblies(this: EditorState, selectToken: number): Promise<void> {
  const settingId = this._hostAssembliesSettingId()
  if (!settingId) {
    this.hostAssemblies = []
    return
  }
  try {
    const items = await loadHostAssemblies(settingId)
    if (selectToken !== this._selectGeneration) return
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
      await this._persistHostAssemblies()
    }
  } catch {
    this.hostAssemblies = []
  }
}

/** Short layout name for one column, matching the profile menu. */
export function _layoutShortName(this: EditorState, layoutId: string, language: HostLanguageId): string {
  const user = this.userLayouts.find(item => item.id === layoutId)
  if (user?.name.trim()) return user.name.trim()
  const choice = hostLayoutChoice(layoutId)
  if (choice) return hostLayoutChoiceLabel(choice)
  return hostLanguageName(language)
}

/** Flag plus short layout name for each column. The accessible name stays `hostAssemblyLabel`. */
export function hostAssemblyParts(this: EditorState, view: HostLegendView): { language: HostLanguageId; layoutName: string }[] {
  return view.columns.map(column => ({
    language: column.language,
    layoutName: this._layoutShortName(column.layoutId, column.language)
  }))
}

export function hostAssemblyLabel(this: EditorState, view: HostLegendView): string {
  return hostAssemblyName(
    view.columns.map(column => ({
      languageName: hostLanguageName(column.language),
      layoutName: this._layoutShortName(column.layoutId, column.language)
    }))
  )
}

export function hostAssemblyActive(this: EditorState, view: HostLegendView): boolean {
  return sameHostLegendView(view, this.hostLegend)
}

/** The live columns are already one of the remembered sets. */
export function hostAssemblySaved(this: EditorState): boolean {
  return this.hostAssemblies.some(item => sameHostLegendView(item.view, this.hostLegend))
}

/** Three sets are kept and the live columns are not one of them. */
export function hostAssemblyRememberBlocked(this: EditorState): boolean {
  return this.hostAssemblies.length >= HOST_ASSEMBLY_LIMIT && !this.hostAssemblySaved()
}

export async function rememberHostAssembly(this: EditorState): Promise<void> {
  if (this.hostAssemblySaved() || this.hostAssemblyRememberBlocked()) return
  const generation = this._selectGeneration
  const settingId = this._hostAssembliesSettingId()
  const { view } = sanitizeHostLegendView(cloneHostLegendView(this.hostLegend))
  this.hostAssemblies = [...this.hostAssemblies, { id: crypto.randomUUID(), view }]
  if (generation !== this._selectGeneration) return
  await this._persistHostAssemblies(settingId, generation)
}

export async function showHostAssembly(this: EditorState, id: string): Promise<void> {
  const generation = this._selectGeneration
  const legendSettingId = this._hostLegendSettingId()
  const assembliesSettingId = this._hostAssembliesSettingId()
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
    await this._persistHostAssemblies(assembliesSettingId, generation)
    if (generation !== this._selectGeneration) return
  }
  if (generation !== this._selectGeneration) return
  await this.commitHostMap(view, legendSettingId, generation)
}

export async function forgetHostAssembly(this: EditorState, id: string): Promise<void> {
  const next = this.hostAssemblies.filter(item => item.id !== id)
  if (next.length === this.hostAssemblies.length) return
  this.hostAssemblies = next
  await this._persistHostAssemblies()
}

export function activeProfileId(this: EditorState, language: HostLanguageId): string {
  return this.hostLegend.columns.find(column => column.language === language)?.layoutId ?? ''
}

/**
 * Two keycap languages for Differences. Position compares those layouts on
 * every level. Win AltGr marks only when English and `open` are both drawn.
 */
export function _alignInputs(this: EditorState): {
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
export function canAlignHostSymbols(this: EditorState): boolean {
  return this._alignInputs() != null
}

/** Win AltGr sample: only for the English × open install pair on the key. */
export function symbolAlignShowsWinAltGr(this: EditorState): boolean {
  return this._alignInputs()?.winMerge != null
}

/** Stacked language face. Two languages already share the key, so this waits for a third. */
export function multilangViewOn(this: EditorState): boolean {
  return this.multilangView && this.hostLegend.columns.length >= 3
}

/**
 * User layout id safe to edit for this language column.
 * Returns the active user layout as-is; forks a system layout into a copy first.
 */
export async function ensureEditableUserHostLayout(this: EditorState, language: HostLanguageId): Promise<string> {
  const layoutId = this.activeProfileId(language)
  if (isUserHostLayoutId(layoutId)) return layoutId
  const source = hostLayout(layoutId)
  if (!source) throw new Error('No layout for this language')
  const choice = hostLayoutChoice(layoutId)
  const preferredName = choice
    ? hostLayoutChoiceLabel(choice)
    : (hostLayoutMeta(layoutId)?.name ?? 'Copy')
  const id = await this._materializeUserHostLayoutFromTable(
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
export async function setHostKeyLevel(this: EditorState, 
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
  if (!(await this._commitUserHostLayout(layoutId, next))) {
    return { ok: false, reason: 'missing-layout' }
  }
  return {
    ok: true,
    keysym: parsed.keysym,
    layoutId,
    dropsFromCompose: level === 0 && keysymToGlyph(parsed.keysym) == null
  }
}

export async function _commitUserHostLayout(this: EditorState, layoutId: string, layout: HostLayout): Promise<boolean> {
  const profile = this.userLayouts.find(item => item.id === layoutId)
  if (!profile) return false
  const updated: UserHostLayout = { ...profile, updatedAt: Date.now() }
  this._registerUserLayout({ ...updated, layout })
  this.userLayouts = this.userLayouts.map(item => (item.id === updated.id ? updated : item))
  await this._persistHostLayoutWrite(() => saveUserHostLayout({ ...updated, layout }))
  return true
}

/**
 * Restore one level to the language's primary system layout (or `NoSymbol`
 * when the system layout has no record for the key).
 */
export async function revertHostKeyLevel(this: EditorState, 
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

export function profilesForLanguage(this: EditorState, language: HostLanguageId): UserHostLayout[] {
  return this.userLayouts
    .filter(layout => layout.language === language)
    .sort((a, b) => a.name.localeCompare(b.name, 'en'))
}

/**
 * Apply a language-column change immediately.
 * Builtin system picks do not ask for a name.
 */
export function commitHostMap(
  this: EditorState,
  next: HostLegendView,
  settingId?: string | null,
  generation: number = this._selectGeneration
): Promise<void> {
  if (generation !== this._selectGeneration) return Promise.resolve()
  this.hostLegend = { ...next }
  return this._persistHostLayoutWrite(() => this._persistHostLegend(settingId, generation))
}

export function selectLanguageProfile(
  this: EditorState,
  language: HostLanguageId,
  id: string,
  settingId?: string | null,
  generation: number = this._selectGeneration
): Promise<void> {
  if (this.activeProfileId(language) === id) return Promise.resolve()
  this.hostProfilePrompt = null
  this.hostProfileNote = null
  if (!hostLayout(id)) return Promise.resolve()
  if (generation !== this._selectGeneration) return Promise.resolve()
  this.hostLegend = assignHostLanguageLayout(this.hostLegend, language, id)
  return this._persistHostLegend(settingId, generation)
}

export function beginSaveHostProfile(this: EditorState, language: HostLanguageId) {
  this.hostProfileNote = null
  this.hostProfilePrompt = { kind: 'save-as', language }
}

export function beginCopyHostProfile(this: EditorState, language: HostLanguageId, layoutId?: string) {
  this.hostProfileNote = null
  this.hostProfilePrompt = { kind: 'copy', language, layoutId }
}

/** Import an xkb section as a user layout and assign it to the language column. */
export async function importHostLayoutFromXkb(this: EditorState, 
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
    const warnings: string[] = []
    const imported = hostLayoutFromXkb(text, section, { fileName, warnings })
    const label = listed.find(item => item.section === section)?.name ?? section
    await this._materializeUserHostLayoutFromTable(language, label, imported, {
      from: 'xkb',
      fileName,
      section
    })
    if (warnings.length > 0) this.hostProfileNote = warnings.join(' ')
    return null
  } catch (error) {
    return error instanceof Error ? error.message : 'Could not import xkb'
  }
}

/** Open a language column, adding it when the legend does not have it yet. */
export function _showHostLanguage(this: EditorState, language: HostLanguageId) {
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
export async function importHostLayoutFromKlc(this: EditorState, 
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
    await this._materializeUserHostLayoutFromTable(
      language,
      parsed.description || stem,
      parsed.base,
      { from: 'klc', fileName, role: 'single' }
    )
    if (parsed.warnings.length > 0) this.hostProfileNote = parsed.warnings.join(' ')
    return null
  }
  const baseLanguage = parsed.baseLanguage ?? 'en'
  const destination = language !== baseLanguage ? language : null
  const guessed = parsed.capsLanguage
  const preferDestination =
    destination != null &&
    hostLanguage(destination).script === 'latin' &&
    (guessed == null || hostLanguage(guessed).script === 'latin')
  const capsLanguage = preferDestination ? destination : (guessed ?? destination)
  if (!capsLanguage || !parsed.caps) {
    return "This file puts another alphabet on Caps Lock. Import it from that language's column."
  }
  const present = (id: HostLanguageId) =>
    this.hostLegend.columns.some(column => column.language === id) ||
    hostLanguagesAvailable(this.hostLegend).includes(id)
  if (!present(baseLanguage) || !present(capsLanguage)) {
    return 'This .klc file names a language the legend cannot open.'
  }
  this._showHostLanguage(baseLanguage)
  this._showHostLanguage(capsLanguage)
  const names = pairedImportNames(parsed.description, capsLanguage, stem)
  await this._materializeUserHostLayoutFromTable(baseLanguage, names.baseName, parsed.base, {
    from: 'klc',
    fileName,
    role: 'base'
  })
  await this._materializeUserHostLayoutFromTable(capsLanguage, names.capsName, parsed.caps, {
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
export function exportUserHostLayoutXkb(this: EditorState, layoutId: string): { text: string; name: string } | null {
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
export function exportUserHostLayoutKlc(this: EditorState, layoutId: string): { bytes: Uint8Array; name: string } | null {
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
export function listCapsAlphabetKlcExports(this: EditorState): Array<{
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
  const baseLayoutName = this._layoutColumnName(base.layoutId, 'en')
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
      capsLayoutName: this._layoutColumnName(column.layoutId, column.language),
      fileStem: `${baseLanguageName}-${capsLanguageName}`
    })
  }
  return out
}

/**
 * One UTF-16 .klc: English locale and letters, `capsLanguage` on Caps Lock.
 * Returns null when either column is missing.
 */
export function exportCapsAlphabetKlc(this: EditorState, 
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

export function _layoutColumnName(this: EditorState, layoutId: string, language: HostLanguageId): string {
  const profile = this.userLayouts.find(layout => layout.id === layoutId)
  if (profile) return profile.name
  return hostLayoutMeta(layoutId)?.name ?? hostLanguage(language).name
}

export function beginRenameHostProfile(this: EditorState, language: HostLanguageId, profileId?: string) {
  const id = profileId ?? this.activeProfileId(language)
  if (!isUserHostLayoutId(id)) return
  if (!this.userLayouts.some(layout => layout.id === id)) return
  this.hostProfileNote = null
  this.hostProfilePrompt = { kind: 'rename', language, profileId: id }
}

export function beginDeleteHostProfile(this: EditorState, language: HostLanguageId, profileId?: string) {
  const id = profileId ?? this.activeProfileId(language)
  if (!isUserHostLayoutId(id)) return
  if (!this.userLayouts.some(layout => layout.id === id)) return
  this.hostProfileNote = null
  this.hostProfilePrompt = { kind: 'delete', language, profileId: id }
}

export async function deleteActiveHostProfile(this: EditorState): Promise<void> {
  const prompt = this.hostProfilePrompt
  if (prompt?.kind !== 'delete') return
  const language = prompt.language
  const id = prompt.profileId ?? this.activeProfileId(language)
  if (!isUserHostLayoutId(id)) return
  const existed = this.userLayouts.some(layout => layout.id === id)
  if (!existed) return
  const generation = this._selectGeneration
  const settingId = this._hostLegendSettingId()
  this.userLayouts = this.userLayouts.filter(layout => layout.id !== id)
  this.hostProfilePrompt = null
  unregisterHostLayout(id)
  await this._persistHostLayoutWrite(() => deleteUserHostLayout(id))
  if (generation !== this._selectGeneration) return
  if (this.activeProfileId(language) === id) {
    const primary = primarySystemLayoutId(language)
    if (primary) await this.selectLanguageProfile(language, primary, settingId, generation)
  }
}

export function cancelHostProfilePrompt(this: EditorState) {
  this.hostProfilePrompt = null
}

/** Returns an error message, or null when the profile was stored. */
export async function confirmHostProfileName(this: EditorState, raw: string): Promise<string | null> {
  const prompt = this.hostProfilePrompt
  if (!prompt) return null
  const name = raw.trim()
  if (!name) return 'Enter a profile name'
  if (reservedProfileName(name)) return `Name “${name}” is reserved for a built-in profile`
  if (prompt.kind === 'delete') return null
  if (prompt.kind === 'rename') return this._renameHostProfile(prompt.language, name)
  const language = prompt.language
  const taken = this.userLayouts.some(
    layout =>
      layout.language === language &&
      foldHostProfileName(layout.name) === foldHostProfileName(name)
  )
  if (taken) return 'A profile with this name already exists'
  const sourceId =
    (prompt.kind === 'copy' ? prompt.layoutId : undefined) ??
    hostLegendColumns(this.hostLegend).find(column => column.language === language)
      ?.layoutId ??
    ''
  const source = sourceId ? hostLayout(sourceId) : undefined
  if (!source) return 'No layout for this language'
  await this._materializeUserHostLayoutFromTable(language, name, source, {
    from: 'copy',
    layoutId: sourceId
  })
  return null
}

export async function _renameHostProfile(this: EditorState, language: HostLanguageId, name: string): Promise<string | null> {
  const id =
    this.hostProfilePrompt?.kind === 'rename'
      ? this.hostProfilePrompt.profileId
      : this.activeProfileId(language)
  const current = this.userLayouts.find(layout => layout.id === id)
  if (!current) return null
  if (foldHostProfileName(current.name) === foldHostProfileName(name)) {
    this.hostProfilePrompt = null
    return null
  }
  const taken = this.userLayouts.some(
    layout =>
      layout.id !== current.id &&
      layout.language === language &&
      foldHostProfileName(layout.name) === foldHostProfileName(name)
  )
  if (taken) return 'A profile with this name already exists'
  const table = hostLayout(current.id)
  if (!table) return null
  const updated: UserHostLayout = { ...current, name, updatedAt: Date.now() }
  this._registerUserLayout({ ...updated, layout: table })
  this.userLayouts = this.userLayouts.map(layout =>
    layout.id === updated.id ? updated : layout
  )
  this.hostProfilePrompt = null
  await this._persistHostLayoutWrite(() => saveUserHostLayout({ ...updated, layout: table }))
  return null
}

/**
 * User layouts currently assigned to legend columns — work that should be
 * installed on the host OS (not merely stored in IndexedDB).
 */
export function hostDeliverableLayoutIds(this: EditorState): string[] {
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
export function hostDeliverableFingerprint(this: EditorState): string {
  void this.hostLayoutRevision
  void this.hostLegend
  const ids = hostLegendColumns(this.hostLegend)
    .filter(column => isUserHostLayoutId(column.layoutId))
    .map(column => column.layoutId)
  return `${ids.join('\0')}|${this.hostLayoutRevision}`
}

export function isHostDirty(this: EditorState): boolean {
  return (
    this.hostDeliverableLayoutIds.length > 0 &&
    this.hostDeliverableFingerprint !== this.hostDeliveredFingerprint
  )
}

/** Mark the current host layouts as exported (Linux/Windows install dialog). */
export function markHostDelivered(this: EditorState) {
  this.hostDeliveredFingerprint = this.hostDeliverableFingerprint
}

/**
 * Per-layout xkb sections for active user columns (install dialog / copy).
 */
export function listActiveHostLayoutExports(this: EditorState): Array<{
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
export function exportActiveHostLayoutsXkb(this: EditorState): { text: string; name: string } | null {
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

