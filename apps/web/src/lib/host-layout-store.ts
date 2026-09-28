/**
 * User host layouts and the legend view in IndexedDB.
 * One id space: catalog ids (`system-ru-legacy`) and `user:<uuid>`.
 */

import {
  addHostLanguage,
  assignHostLanguageLayout,
  catalogLayoutsForLanguage,
  HOST_LANGUAGE_IDS,
  hostLayout,
  hostLayoutMeta,
  isHostLanguageId,
  primarySystemLayoutId,
  reservedHostProfileNames,
  standardHostLegendView,
  type HostKeyLevels,
  type HostLanguageId,
  type HostLayout,
  type HostLegendView
} from '@keymap-editor/keymap-core'

export const HOST_LAYOUT_DB_NAME = 'keymap-editor-host-profiles'
export const UNKNOWN_HOST_LAYOUT_NOTE =
  'Unknown layout was replaced with the primary system layout.'

const DB_NAME = HOST_LAYOUT_DB_NAME
const LAYOUTS_STORE = 'layouts'
const SETTINGS_STORE = 'settings'
const LEGACY_PROFILES_STORE = 'profiles'
const DB_VERSION = 3
const VIEW_SETTING_ID = 'view'

/** Legend view for one keymap identity. The unkeyed `view` row is the old browser-wide record. */
export function hostLegendSettingId(identityKey: string): string {
  return `view:${identityKey}`
}
const LEGACY_ACTIVE_SETTING_ID = 'active'

export type UserHostLayoutOrigin =
  | { from: 'copy'; layoutId: string }
  | { from: 'xkb'; fileName: string; section: string }

export interface UserHostLayout {
  id: string
  name: string
  language: HostLanguageId
  origin: UserHostLayoutOrigin
  updatedAt: number
}

export interface UserHostLayoutRecord extends UserHostLayout {
  layout: HostLayout
}

type StoredKeyRow = {
  zmk: string
  keysyms: HostKeyLevels['keysyms']
  glyphs: HostKeyLevels['glyphs']
}

type StoredUserLayout = UserHostLayout & {
  keys: StoredKeyRow[]
}

type StoredView = {
  id: typeof VIEW_SETTING_ID
  columns: HostLegendView['columns']
  open: HostLegendView['open']
}

type LegacyProfile = {
  id: string
  name: string
  language: HostLanguageId
  layoutId: string
  updatedAt: number
}

type LegacyActive = {
  id: typeof LEGACY_ACTIVE_SETTING_ID
} & Partial<Record<HostLanguageId, string>>

export function isUserHostLayoutId(id: string): boolean {
  return id.startsWith('user:')
}

export function reservedProfileName(name: string): boolean {
  const key = name.toLocaleLowerCase('ru')
  return reservedHostProfileNames().some(
    reserved => reserved.toLocaleLowerCase('ru') === key
  )
}

export function uniqueUserHostLayoutName(
  language: HostLanguageId,
  preferred: string,
  existing: readonly Pick<UserHostLayout, 'language' | 'name'>[]
): string {
  const base = preferred.trim() || 'xkb'
  const taken = new Set(
    existing
      .filter(layout => layout.language === language)
      .map(layout => layout.name.toLocaleLowerCase('ru'))
  )
  const used = (name: string) =>
    reservedProfileName(name) || taken.has(name.toLocaleLowerCase('ru'))
  if (!used(base)) return base
  for (let n = 2; n < 1000; n++) {
    const name = `${base} ${n}`
    if (!used(name)) return name
  }
  return `${base} ${crypto.randomUUID()}`
}

export function cloneHostLayoutTable(source: HostLayout, id: string): HostLayout {
  const byZmk = new Map<string, HostKeyLevels>()
  for (const [zmk, levels] of source.byZmk) {
    byZmk.set(zmk, {
      keysyms: [levels.keysyms[0], levels.keysyms[1], levels.keysyms[2], levels.keysyms[3]],
      glyphs: [levels.glyphs[0], levels.glyphs[1], levels.glyphs[2], levels.glyphs[3]]
    })
  }
  return { id, byZmk }
}

function serializeLayout(layout: HostLayout): StoredKeyRow[] {
  return [...layout.byZmk.entries()].map(([zmk, levels]) => ({
    zmk,
    keysyms: [levels.keysyms[0], levels.keysyms[1], levels.keysyms[2], levels.keysyms[3]],
    glyphs: [levels.glyphs[0], levels.glyphs[1], levels.glyphs[2], levels.glyphs[3]]
  }))
}

function deserializeLayout(id: string, keys: StoredKeyRow[]): HostLayout {
  return {
    id,
    byZmk: new Map(
      keys.map(row => [
        row.zmk,
        {
          keysyms: row.keysyms,
          glyphs: row.glyphs
        }
      ])
    )
  }
}

function layoutIdFromLegacyProfile(id: string): string | undefined {
  const match = /^(en|ru|uk|de):(in-layout|system)(?::([A-Za-z0-9_-]+))?$/.exec(id)
  if (!match || !isHostLanguageId(match[1])) return undefined
  const language = match[1]
  const kind = match[2]
  const variant = match[3]
  const layouts = catalogLayoutsForLanguage(language)
  if (kind === 'in-layout') return primarySystemLayoutId(language)
  if (variant) {
    return layouts.find(
      choice => choice.kind === 'system' && choice.layoutName === variant
    )?.id
  }
  return layouts.find(choice => choice.kind === 'system' && choice.primary)?.id
}

function defaultV2LayoutId(language: HostLanguageId): string | undefined {
  return primarySystemLayoutId(language)
}

function migratedUserId(legacyId: string): string {
  return isUserHostLayoutId(legacyId) ? legacyId : `user:${legacyId}`
}

function resolveV2ActiveId(raw: string, userIds: ReadonlySet<string>): string | undefined {
  const asUser = migratedUserId(raw)
  if (userIds.has(asUser)) return asUser
  return layoutIdFromLegacyProfile(raw)
}

function viewFromV2Active(
  active: Partial<Record<HostLanguageId, string>>,
  userIds: ReadonlySet<string>
): HostLegendView {
  let view = standardHostLegendView()
  for (const language of HOST_LANGUAGE_IDS) {
    const raw = active[language]
    if (typeof raw !== 'string') continue
    const layoutId = resolveV2ActiveId(raw, userIds)
    if (!layoutId) continue
    const hasColumn = view.columns.some(column => column.language === language)
    const isDefault = layoutId === defaultV2LayoutId(language)
    if (!hasColumn) {
      if (isDefault) continue
      view = addHostLanguage(view, language)
    }
    view = assignHostLanguageLayout(view, language, layoutId)
  }
  return view
}

function isLegacyProfile(row: unknown): row is LegacyProfile {
  if (!row || typeof row !== 'object') return false
  const item = row as LegacyProfile
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    isHostLanguageId(item.language) &&
    typeof item.layoutId === 'string'
  )
}

function isStoredUserLayout(row: unknown): row is StoredUserLayout {
  if (!row || typeof row !== 'object') return false
  const item = row as StoredUserLayout
  return (
    isUserHostLayoutId(item.id) &&
    typeof item.name === 'string' &&
    isHostLanguageId(item.language) &&
    !!item.origin &&
    typeof item.origin === 'object' &&
    Array.isArray(item.keys)
  )
}

function isHostLegendView(value: unknown): value is HostLegendView {
  if (!value || typeof value !== 'object') return false
  const view = value as HostLegendView
  if (!Array.isArray(view.columns)) return false
  if (view.open != null && !isHostLanguageId(view.open)) return false
  return view.columns.every(
    column =>
      column &&
      isHostLanguageId(column.language) &&
      typeof column.layoutId === 'string' &&
      typeof column.visible === 'boolean' &&
      typeof column.altGr === 'boolean' &&
      typeof column.altGrShift === 'boolean'
  )
}

export function sanitizeHostLegendView(view: HostLegendView): {
  view: HostLegendView
  replaced: HostLanguageId[]
} {
  const next: HostLegendView = {
    columns: view.columns.map(column => ({ ...column })),
    open: view.open
  }
  const replaced: HostLanguageId[] = []
  for (const column of next.columns) {
    const meta = hostLayoutMeta(column.layoutId)
    if (meta && meta.language === column.language) continue
    const primary = primarySystemLayoutId(column.language)
    if (!primary || primary === column.layoutId) continue
    column.layoutId = primary
    replaced.push(column.language)
  }
  return { view: next, replaced }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error ?? new Error('IDB open failed'))
    request.onsuccess = () => {
      const db = request.result
      void migrateLegacyProfiles(db).then(() => resolve(db), reject)
    }
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(LAYOUTS_STORE)) {
        db.createObjectStore(LAYOUTS_STORE, { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: 'id' })
      }
    }
  })
}

function idbRequest<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('IDB request failed'))
  })
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error ?? new Error('IDB transaction failed'))
    tx.onabort = () => reject(tx.error ?? new Error('IDB transaction aborted'))
  })
}

async function migrateLegacyProfiles(db: IDBDatabase): Promise<void> {
  if (!db.objectStoreNames.contains(LEGACY_PROFILES_STORE)) return
  const tx = db.transaction(
    [LEGACY_PROFILES_STORE, LAYOUTS_STORE, SETTINGS_STORE],
    'readwrite'
  )
  const profileStore = tx.objectStore(LEGACY_PROFILES_STORE)
  const layoutStore = tx.objectStore(LAYOUTS_STORE)
  const settingsStore = tx.objectStore(SETTINGS_STORE)
  const profiles = ((await idbRequest(profileStore.getAll())) as unknown[]).filter(
    isLegacyProfile
  )
  const existing = ((await idbRequest(layoutStore.getAll())) as unknown[]).filter(
    isStoredUserLayout
  )
  const userIds = new Set(existing.map(row => row.id))

  if (existing.length === 0) {
    for (const row of profiles) {
      const source = hostLayout(row.layoutId)
      if (!source) continue
      const id = migratedUserId(row.id)
      const cloned = cloneHostLayoutTable(source, id)
      const record: StoredUserLayout = {
        id,
        name: row.name,
        language: row.language,
        origin: { from: 'copy', layoutId: row.layoutId },
        updatedAt: typeof row.updatedAt === 'number' ? row.updatedAt : Date.now(),
        keys: serializeLayout(cloned)
      }
      await idbRequest(layoutStore.put(record))
      userIds.add(id)
    }
  }

  const viewRow = await idbRequest<StoredView | undefined>(
    settingsStore.get(VIEW_SETTING_ID)
  )
  if (!viewRow) {
    const active = await idbRequest<LegacyActive | undefined>(
      settingsStore.get(LEGACY_ACTIVE_SETTING_ID)
    )
    if (active) {
      const view = viewFromV2Active(active, userIds)
      const record: StoredView = {
        id: VIEW_SETTING_ID,
        columns: view.columns,
        open: view.open
      }
      await idbRequest(settingsStore.put(record))
      await idbRequest(settingsStore.delete(LEGACY_ACTIVE_SETTING_ID))
    }
  }

  await idbRequest(profileStore.clear())
  await txDone(tx)
}

export async function loadUserHostLayouts(): Promise<UserHostLayoutRecord[]> {
  const db = await openDb()
  try {
    const tx = db.transaction(LAYOUTS_STORE, 'readonly')
    const rows = await idbRequest(tx.objectStore(LAYOUTS_STORE).getAll())
    await txDone(tx)
    return (rows as unknown[]).filter(isStoredUserLayout).map(row => ({
      id: row.id,
      name: row.name,
      language: row.language,
      origin: row.origin,
      updatedAt: row.updatedAt,
      layout: deserializeLayout(row.id, row.keys)
    }))
  } finally {
    db.close()
  }
}

function plainOrigin(origin: UserHostLayoutOrigin): UserHostLayoutOrigin {
  if (origin.from === 'copy') return { from: 'copy', layoutId: origin.layoutId }
  return { from: 'xkb', fileName: origin.fileName, section: origin.section }
}

export async function saveUserHostLayout(record: UserHostLayoutRecord): Promise<void> {
  const stored: StoredUserLayout = {
    id: record.id,
    name: record.name,
    language: record.language,
    origin: plainOrigin(record.origin),
    updatedAt: record.updatedAt,
    keys: serializeLayout(record.layout)
  }
  const db = await openDb()
  try {
    const tx = db.transaction(LAYOUTS_STORE, 'readwrite')
    await idbRequest(tx.objectStore(LAYOUTS_STORE).put(stored))
    await txDone(tx)
  } finally {
    db.close()
  }
}

export async function deleteUserHostLayout(id: string): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(LAYOUTS_STORE, 'readwrite')
    await idbRequest(tx.objectStore(LAYOUTS_STORE).delete(id))
    await txDone(tx)
  } finally {
    db.close()
  }
}

export async function loadHostLegendView(
  settingId: string = VIEW_SETTING_ID
): Promise<HostLegendView | null> {
  const db = await openDb()
  try {
    const tx = db.transaction(SETTINGS_STORE, 'readonly')
    const row = await idbRequest<StoredView | undefined>(
      tx.objectStore(SETTINGS_STORE).get(settingId)
    )
    await txDone(tx)
    if (!row || !isHostLegendView(row)) return null
    return { columns: row.columns.map(column => ({ ...column })), open: row.open }
  } finally {
    db.close()
  }
}

export async function deleteHostLegendView(settingId: string = VIEW_SETTING_ID): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite')
    await idbRequest(tx.objectStore(SETTINGS_STORE).delete(settingId))
    await txDone(tx)
  } finally {
    db.close()
  }
}

export async function saveHostLegendView(
  view: HostLegendView,
  settingId: string = VIEW_SETTING_ID
): Promise<void> {
  const record: StoredView = {
    id: settingId,
    columns: view.columns.map(column => ({ ...column })),
    open: view.open
  }
  const db = await openDb()
  try {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite')
    await idbRequest(tx.objectStore(SETTINGS_STORE).put(record))
    await txDone(tx)
  } finally {
    db.close()
  }
}

export async function clearHostLayoutStore(): Promise<void> {
  const db = await openDb()
  try {
    const stores = [LAYOUTS_STORE, SETTINGS_STORE]
    if (db.objectStoreNames.contains(LEGACY_PROFILES_STORE)) {
      stores.push(LEGACY_PROFILES_STORE)
    }
    const tx = db.transaction(stores, 'readwrite')
    tx.objectStore(LAYOUTS_STORE).clear()
    tx.objectStore(SETTINGS_STORE).clear()
    if (db.objectStoreNames.contains(LEGACY_PROFILES_STORE)) {
      tx.objectStore(LEGACY_PROFILES_STORE).clear()
    }
    await txDone(tx)
  } finally {
    db.close()
  }
}

export type { HostLanguageId }
