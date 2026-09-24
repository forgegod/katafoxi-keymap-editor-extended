/**
 * Named host-legend profiles in IndexedDB.
 * A profile is the language pair and AltGr columns, not layer-row visibility
 * and not the ZMK keymap. Symbol tables are not stored yet.
 */

import {
  standardHostLegendView,
  type HostLegendView
} from '@keymap-editor/keymap-core'

export const STANDARD_HOST_PROFILE_ID = 'standard'

const DB_NAME = 'keymap-editor-host-profiles'
const PROFILES_STORE = 'profiles'
const SETTINGS_STORE = 'settings'
const DB_VERSION = 1
const ACTIVE_SETTING_ID = 'active'

export interface HostProfileMap {
  baseId: string
  secondId: string | null
  altGr: boolean
  altGrShift: boolean
}

export interface HostProfile {
  id: string
  name: string
  map: HostProfileMap
  updatedAt: number
}

type ActiveSetting = {
  id: typeof ACTIVE_SETTING_ID
  profileId: string
}

export function hostProfileMap(view: HostLegendView): HostProfileMap {
  return {
    baseId: view.baseId,
    secondId: view.secondId,
    altGr: view.altGr,
    altGrShift: view.altGrShift
  }
}

export function standardHostProfileMap(): HostProfileMap {
  return hostProfileMap(standardHostLegendView())
}

export function sameHostProfileMap(a: HostProfileMap, b: HostProfileMap): boolean {
  return (
    a.baseId === b.baseId &&
    a.secondId === b.secondId &&
    a.altGr === b.altGr &&
    a.altGrShift === b.altGrShift
  )
}

/** Keep preview flags (eyes, layer rows) and replace the stored map. */
export function hostLegendWithMap(
  current: HostLegendView,
  map: HostProfileMap,
  source: HostLegendView['source']
): HostLegendView {
  return { ...current, ...map, source }
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
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(PROFILES_STORE)) {
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

export async function loadHostProfiles(): Promise<HostProfile[]> {
  const db = await openDb()
  try {
    const tx = db.transaction(PROFILES_STORE, 'readonly')
    const rows = await idbRequest(tx.objectStore(PROFILES_STORE).getAll())
    await txDone(tx)
    return (rows as HostProfile[]).filter(row => row?.id && row.name && row.map)
  } finally {
    db.close()
  }
}

export async function saveHostProfile(profile: HostProfile): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(PROFILES_STORE, 'readwrite')
    await idbRequest(tx.objectStore(PROFILES_STORE).put(profile))
    await txDone(tx)
  } finally {
    db.close()
  }
}

export async function loadActiveHostProfileId(): Promise<string> {
  const db = await openDb()
  try {
    const tx = db.transaction(SETTINGS_STORE, 'readonly')
    const row = await idbRequest<ActiveSetting | undefined>(
      tx.objectStore(SETTINGS_STORE).get(ACTIVE_SETTING_ID)
    )
    await txDone(tx)
    return row?.profileId || STANDARD_HOST_PROFILE_ID
  } finally {
    db.close()
  }
}

export async function saveActiveHostProfileId(profileId: string): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(SETTINGS_STORE, 'readwrite')
    const record: ActiveSetting = { id: ACTIVE_SETTING_ID, profileId }
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
