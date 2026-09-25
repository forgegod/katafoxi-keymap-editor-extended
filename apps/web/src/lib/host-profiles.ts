/**
 * Named host-legend profiles in IndexedDB.
 * A profile belongs to one language column. Symbol tables are not stored yet:
 * a user profile remembers which builtin layout it aliases.
 */

import {
  builtinLanguageProfileId,
  builtinProfileIdForChoice,
  hostLayoutChoice,
  hostLayoutChoiceLabel,
  layoutForBuiltinProfile,
  parseBuiltinLanguageProfileId,
  assignHostLanguageLayout,
  reservedHostProfileNames,
  type HostLanguageId,
  type HostLayoutKind,
  type HostLegendView
} from '@keymap-editor/keymap-core'

export const SYSTEM_HOST_PROFILE_KIND = 'system' as const
export const IN_LAYOUT_HOST_PROFILE_KIND = 'in-layout' as const

const DB_NAME = 'keymap-editor-host-profiles'
const PROFILES_STORE = 'profiles'
const SETTINGS_STORE = 'settings'
const DB_VERSION = 2
const ACTIVE_SETTING_ID = 'active'

export interface HostProfile {
  id: string
  name: string
  language: HostLanguageId
  layoutId: string
  updatedAt: number
}

export interface ActiveLanguageProfiles {
  en: string
  ru: string
  uk: string
  de: string
}

type ActiveSetting = {
  id: typeof ACTIVE_SETTING_ID
  en: string
  ru: string
  uk?: string
  de?: string
}

export function defaultActiveLanguageProfiles(): ActiveLanguageProfiles {
  return {
    en: builtinLanguageProfileId('en', 'in-layout'),
    ru: builtinLanguageProfileId('ru', 'in-layout'),
    uk: builtinLanguageProfileId('uk', 'system'),
    de: builtinLanguageProfileId('de', 'system')
  }
}

export function isBuiltinLanguageProfile(id: string): boolean {
  return parseBuiltinLanguageProfileId(id) != null
}

export function builtinProfileLabel(id: string): string | undefined {
  const choice = layoutForBuiltinProfile(id)
  return choice ? hostLayoutChoiceLabel(choice) : undefined
}

export function layoutIdForProfile(
  id: string,
  profiles: readonly HostProfile[]
): string | undefined {
  const builtin = layoutForBuiltinProfile(id)
  if (builtin) return builtin.id
  return profiles.find(profile => profile.id === id)?.layoutId
}

export function profileIdForLayout(
  language: HostLanguageId,
  layoutId: string,
  activeId: string,
  profiles: readonly HostProfile[]
): string {
  const active = profiles.find(profile => profile.id === activeId)
  if (active?.language === language && active.layoutId === layoutId) return active.id
  const choice = hostLayoutChoice(layoutId)
  if (choice?.language === language) {
    return builtinProfileIdForChoice(choice)
  }
  return builtinLanguageProfileId(language, 'in-layout')
}

export function reservedProfileName(name: string): boolean {
  const key = name.toLocaleLowerCase('ru')
  return reservedHostProfileNames().some(
    reserved => reserved.toLocaleLowerCase('ru') === key
  )
}

/** Keep column and layer visibility, and replace one language column. */
export function hostLegendWithLayout(
  current: HostLegendView,
  language: HostLanguageId,
  layoutId: string
): HostLegendView {
  return assignHostLanguageLayout(current, language, layoutId)
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'))
      return
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error ?? new Error('IDB open failed'))
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = event => {
      const db = request.result
      if (!db.objectStoreNames.contains(PROFILES_STORE)) {
        db.createObjectStore(PROFILES_STORE, { keyPath: 'id' })
      } else if (event.oldVersion < 2) {
        db.deleteObjectStore(PROFILES_STORE)
        db.createObjectStore(PROFILES_STORE, { keyPath: 'id' })
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

function isLanguageProfile(row: unknown): row is HostProfile {
  if (!row || typeof row !== 'object') return false
  const item = row as HostProfile
  return (
    typeof item.id === 'string' &&
    typeof item.name === 'string' &&
    (item.language === 'en' ||
      item.language === 'ru' ||
      item.language === 'uk' ||
      item.language === 'de') &&
    typeof item.layoutId === 'string'
  )
}

export async function loadHostProfiles(): Promise<HostProfile[]> {
  const db = await openDb()
  try {
    const tx = db.transaction(PROFILES_STORE, 'readonly')
    const rows = await idbRequest(tx.objectStore(PROFILES_STORE).getAll())
    await txDone(tx)
    return (rows as unknown[]).filter(isLanguageProfile)
  } finally {
    db.close()
  }
}

export async function deleteHostProfile(id: string): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(PROFILES_STORE, 'readwrite')
    await idbRequest(tx.objectStore(PROFILES_STORE).delete(id))
    await txDone(tx)
  } finally {
    db.close()
  }
}

export async function saveHostProfile(profile: HostProfile): Promise<void> {
  const record: HostProfile = {
    id: profile.id,
    name: profile.name,
    language: profile.language,
    layoutId: profile.layoutId,
    updatedAt: profile.updatedAt
  }
  const db = await openDb()
  try {
    const tx = db.transaction(PROFILES_STORE, 'readwrite')
    await idbRequest(tx.objectStore(PROFILES_STORE).put(record))
    await txDone(tx)
  } finally {
    db.close()
  }
}

export async function loadActiveLanguageProfiles(): Promise<ActiveLanguageProfiles> {
  const defaults = defaultActiveLanguageProfiles()
  const db = await openDb()
  try {
    const tx = db.transaction(SETTINGS_STORE, 'readonly')
    const row = await idbRequest<Partial<ActiveSetting> | undefined>(
      tx.objectStore(SETTINGS_STORE).get(ACTIVE_SETTING_ID)
    )
    await txDone(tx)
    if (!row) return defaults
    return {
      en: typeof row.en === 'string' ? row.en : defaults.en,
      ru: typeof row.ru === 'string' ? row.ru : defaults.ru,
      uk: typeof row.uk === 'string' ? row.uk : defaults.uk,
      de: typeof row.de === 'string' ? row.de : defaults.de
    }
  } finally {
    db.close()
  }
}

export async function saveActiveLanguageProfiles(
  active: ActiveLanguageProfiles
): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite')
    const record: ActiveSetting = {
      id: ACTIVE_SETTING_ID,
      en: active.en,
      ru: active.ru,
      uk: active.uk,
      de: active.de
    }
    await idbRequest(tx.objectStore(SETTINGS_STORE).put(record))
    await txDone(tx)
  } finally {
    db.close()
  }
}

export async function clearHostProfileStore(): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction([PROFILES_STORE, SETTINGS_STORE], 'readwrite')
    tx.objectStore(PROFILES_STORE).clear()
    tx.objectStore(SETTINGS_STORE).clear()
    await txDone(tx)
  } finally {
    db.close()
  }
}

export type { HostLanguageId, HostLayoutKind }
