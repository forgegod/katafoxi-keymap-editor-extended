/**
 * Host keymap snapshot for GitHub repos (`host_keymap/snapshot.json`).
 * Editor-native JSON: legend view + user layout tables referenced by that view.
 * @see docs/adr/0005-host-keymap-github-snapshot.md
 */

import { isHostLanguageId, type HostLanguageId } from './host-languages.js'
import type { HostKeyLevels, HostLayout } from './host-layout.js'
import { cloneHostLegendView } from './host-legend-view.js'
import type { HostLegendView } from './types.js'
import { keysymToGlyph } from './xkb-keysyms.js'

/** Repo path relative to the repository root (sibling of `config/`). */
export const HOST_KEYMAP_SNAPSHOT_PATH = 'host_keymap/snapshot.json'

export const HOST_KEYMAP_SNAPSHOT_VERSION = 1 as const

export type HostKeymapLayoutOrigin =
  | { from: 'copy'; layoutId: string }
  | { from: 'xkb'; fileName: string; section: string }
  | { from: 'klc'; fileName: string; role: 'single' | 'base' | 'caps' }

export interface HostKeymapKeyRow {
  zmk: string
  keysyms: HostKeyLevels['keysyms']
  glyphs: HostKeyLevels['glyphs']
}

export interface HostKeymapLayoutSnapshot {
  id: string
  name: string
  language: HostLanguageId
  origin: HostKeymapLayoutOrigin
  keys: HostKeymapKeyRow[]
}

export interface HostKeymapSnapshot {
  version: typeof HOST_KEYMAP_SNAPSHOT_VERSION
  view: HostLegendView
  layouts: HostKeymapLayoutSnapshot[]
}

export type HostKeymapLayoutInput = {
  id: string
  name: string
  language: HostLanguageId
  origin: HostKeymapLayoutOrigin
  layout: HostLayout
}

/** Structured parse outcome so callers can tell corrupt JSON from a future schema. */
export type HostKeymapSnapshotParseResult =
  | { ok: true; snapshot: HostKeymapSnapshot }
  | { ok: false; error: 'missing' }
  | { ok: false; error: 'invalid' }
  | { ok: false; error: 'unsupported_version'; version: unknown }

function isStringTuple4(value: unknown): value is [string, string, string, string] {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every(item => typeof item === 'string')
  )
}

function isUserLayoutId(id: string): boolean {
  return id.startsWith('user:')
}

function glyphsFromKeysyms(
  keysyms: [string, string, string, string]
): HostKeyLevels['glyphs'] {
  return [
    keysymToGlyph(keysyms[0]) ?? '',
    keysymToGlyph(keysyms[1]) ?? '',
    keysymToGlyph(keysyms[2]) ?? '',
    keysymToGlyph(keysyms[3]) ?? ''
  ]
}

/** Stable key order for dirty compare — Map insertion order is not enough. */
function serializeLayoutKeys(layout: HostLayout): HostKeymapKeyRow[] {
  return [...layout.byZmk.entries()]
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([zmk, levels]) => ({
      zmk,
      keysyms: [levels.keysyms[0], levels.keysyms[1], levels.keysyms[2], levels.keysyms[3]],
      glyphs: [levels.glyphs[0], levels.glyphs[1], levels.glyphs[2], levels.glyphs[3]]
    }))
}

/** Rebuild a runtime layout table from snapshot rows. */
export function hostLayoutFromKeymapSnapshotKeys(
  id: string,
  keys: readonly HostKeymapKeyRow[]
): HostLayout {
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

function parseOrigin(raw: unknown): HostKeymapLayoutOrigin | null {
  if (!raw || typeof raw !== 'object') return null
  const origin = raw as Record<string, unknown>
  if (origin.from === 'copy' && typeof origin.layoutId === 'string') {
    return { from: 'copy', layoutId: origin.layoutId }
  }
  if (
    origin.from === 'xkb' &&
    typeof origin.fileName === 'string' &&
    typeof origin.section === 'string'
  ) {
    return { from: 'xkb', fileName: origin.fileName, section: origin.section }
  }
  if (
    origin.from === 'klc' &&
    typeof origin.fileName === 'string' &&
    (origin.role === 'single' || origin.role === 'base' || origin.role === 'caps')
  ) {
    return { from: 'klc', fileName: origin.fileName, role: origin.role }
  }
  return null
}

function parseKeyRow(raw: unknown): HostKeymapKeyRow | null {
  if (!raw || typeof raw !== 'object') return null
  const row = raw as Record<string, unknown>
  if (typeof row.zmk !== 'string' || !row.zmk) return null
  if (!isStringTuple4(row.keysyms)) return null
  return {
    zmk: row.zmk,
    keysyms: row.keysyms,
    glyphs: glyphsFromKeysyms(row.keysyms)
  }
}

function parseLayout(raw: unknown): HostKeymapLayoutSnapshot | null {
  if (!raw || typeof raw !== 'object') return null
  const layout = raw as Record<string, unknown>
  if (typeof layout.id !== 'string' || !isUserLayoutId(layout.id)) return null
  if (typeof layout.name !== 'string') return null
  if (typeof layout.language !== 'string' || !isHostLanguageId(layout.language)) return null
  const origin = parseOrigin(layout.origin)
  if (!origin) return null
  if (!Array.isArray(layout.keys)) return null
  const keys: HostKeymapKeyRow[] = []
  for (const item of layout.keys) {
    const row = parseKeyRow(item)
    if (!row) return null
    keys.push(row)
  }
  return {
    id: layout.id,
    name: layout.name,
    language: layout.language,
    origin,
    keys
  }
}

function parseView(raw: unknown): HostLegendView | null {
  if (!raw || typeof raw !== 'object') return null
  const view = raw as Record<string, unknown>
  if (!Array.isArray(view.columns) || view.columns.length === 0) return null
  const columns: HostLegendView['columns'] = []
  for (const item of view.columns) {
    if (!item || typeof item !== 'object') return null
    const column = item as Record<string, unknown>
    if (typeof column.language !== 'string' || !isHostLanguageId(column.language)) return null
    if (typeof column.layoutId !== 'string' || !column.layoutId) return null
    if (typeof column.visible !== 'boolean') return null
    if (typeof column.altGr !== 'boolean') return null
    if (typeof column.altGrShift !== 'boolean') return null
    columns.push({
      language: column.language,
      layoutId: column.layoutId,
      visible: column.visible,
      altGr: column.altGr,
      altGrShift: column.altGrShift
    })
  }
  if (columns[0]?.language !== 'en') return null
  let open: HostLanguageId | null = null
  if (view.open !== null && view.open !== undefined) {
    if (typeof view.open !== 'string' || !isHostLanguageId(view.open)) return null
    open = view.open
  }
  const next: HostLegendView = { columns, open }
  if (view.keycap !== undefined) {
    if (!Array.isArray(view.keycap) || view.keycap.length === 0) return null
    const keycap: HostLanguageId[] = []
    for (const language of view.keycap) {
      if (typeof language !== 'string' || !isHostLanguageId(language)) return null
      keycap.push(language)
    }
    next.keycap = keycap.slice(-2)
  }
  return next
}

/**
 * Build a versioned snapshot from the live legend and the user layouts it
 * references. System layout ids stay as pointers in `view` only.
 */
export function buildHostKeymapSnapshot(
  view: HostLegendView,
  layouts: readonly HostKeymapLayoutInput[]
): HostKeymapSnapshot {
  const byId = new Map(layouts.map(layout => [layout.id, layout]))
  const seen = new Set<string>()
  const out: HostKeymapLayoutSnapshot[] = []
  for (const column of view.columns) {
    if (!isUserLayoutId(column.layoutId) || seen.has(column.layoutId)) continue
    const record = byId.get(column.layoutId)
    if (!record) continue
    seen.add(column.layoutId)
    out.push({
      id: record.id,
      name: record.name,
      language: record.language,
      origin: record.origin,
      keys: serializeLayoutKeys(record.layout)
    })
  }
  return {
    version: HOST_KEYMAP_SNAPSHOT_VERSION,
    view: cloneHostLegendView(view),
    layouts: out
  }
}

/** Stable JSON text for git blobs and dirty comparison. */
export function encodeHostKeymapSnapshot(snapshot: HostKeymapSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`
}

/**
 * Parse and validate a snapshot document.
 * Distinguishes missing input, unsupported schema version, and invalid payload.
 */
export function parseHostKeymapSnapshot(raw: unknown): HostKeymapSnapshotParseResult {
  if (raw === null || raw === undefined) return { ok: false, error: 'missing' }
  if (typeof raw === 'string' && raw.trim() === '') return { ok: false, error: 'missing' }

  let data = raw
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw)
    } catch {
      return { ok: false, error: 'invalid' }
    }
  }
  if (!data || typeof data !== 'object') return { ok: false, error: 'invalid' }
  const doc = data as Record<string, unknown>
  if (doc.version !== HOST_KEYMAP_SNAPSHOT_VERSION) {
    if (doc.version === undefined || doc.version === null) {
      return { ok: false, error: 'invalid' }
    }
    return { ok: false, error: 'unsupported_version', version: doc.version }
  }
  const view = parseView(doc.view)
  if (!view) return { ok: false, error: 'invalid' }
  if (!Array.isArray(doc.layouts)) return { ok: false, error: 'invalid' }
  const layouts: HostKeymapLayoutSnapshot[] = []
  const ids = new Set<string>()
  for (const item of doc.layouts) {
    const layout = parseLayout(item)
    if (!layout) return { ok: false, error: 'invalid' }
    if (ids.has(layout.id)) return { ok: false, error: 'invalid' }
    ids.add(layout.id)
    layouts.push(layout)
  }
  return {
    ok: true,
    snapshot: { version: HOST_KEYMAP_SNAPSHOT_VERSION, view, layouts }
  }
}
