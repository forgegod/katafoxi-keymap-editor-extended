import {
  LAYOUT_DISCOVERY_LIMITS, LAYOUT_STOCK_PREAMBLE, LayoutDiscoveryError, parseLayoutMetadata
} from './layout-discovery.js'
import type { DiscoveredLayout, LayoutDiscoveryFailure, LayoutDiscoveryPart, ParseLayoutMetadataOptions } from './layout-discovery.js'
import { KeymapValidationError } from './errors.js'
import type { ParsedKeymap } from './types.js'

export interface LayoutCatalogEntryInput {
  id: string
  board: string
  revision: string
  shield?: string
  part?: string
  metadata: string | null
  parts?: LayoutDiscoveryPart[]
  candidate?: ParseLayoutMetadataOptions['candidate']
  attribution: { url: string; commit: string; license: string; notice: string; path: string }
  /** Curator's pinned, reviewed non-metadata include evidence; never resolved at runtime. */
  stockIncludes: { line: string; path: string; sha256: string; review: string }[]
}

type Unavailable = { status: 'unavailable'; reason: LayoutDiscoveryFailure; message: string }
type Normalized = { status: 'candidate'; layout: DiscoveredLayout } | Unavailable
export interface LayoutCatalogEntry extends LayoutCatalogEntryInput {
  sourceSha256: string
  outputSha256: string
  normalized: Normalized
}
export interface LayoutCatalog {
  schema: 1
  generator: 'literal-layout-v1'
  version: string
  /** Content-addressed revision includes source, attribution and normalized output. */
  revision: string
  entries: LayoutCatalogEntry[]
}
export interface LayoutCatalogRequest {
  catalog: LayoutCatalog
  source: { id: string; revision: string; code: string; firmwareCommit?: string }
  selection: {
    entryId: string
    sourceId: string
    sourceRevision: string
    catalogRevision: string
    candidate?: ParseLayoutMetadataOptions['candidate']
  }
}
export type CatalogLayoutResult = Unavailable | {
  status: 'candidate'
  layout: DiscoveredLayout
  provenance: {
    entryId: string
    board: string
    revision: string
    shield?: string
    part?: string
    catalogRevision: string
    sourceId: string
    sourceRevision: string
    attribution: LayoutCatalogEntryInput['attribution']
    sourceSha256: string
    firmwareCompatibility: 'revision-matched' | 'unverified'
  }
}

const catalogs = new WeakSet<LayoutCatalog>()
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0
const unavailable = (reason: LayoutDiscoveryFailure, message: string): Unavailable => ({ status: 'unavailable', reason, message })

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => compare(a, b))
      .map(([key, v]) => `${JSON.stringify(key)}:${canonical(v)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

async function digest(text: string): Promise<string> {
  const bytes = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}

function normalized(entry: LayoutCatalogEntryInput, extra: ParseLayoutMetadataOptions = {}): Normalized {
  if (entry.metadata === null) return unavailable('missing', 'No layout metadata; supply explicit layout JSON')
  try {
    return { status: 'candidate', layout: parseLayoutMetadata(entry.metadata, {
      parts: entry.parts, selectedPart: entry.part, candidate: entry.candidate,
      stockIncludes: entry.stockIncludes.map(item => item.line), ...extra
    }) }
  } catch (error) {
    if (!(error instanceof LayoutDiscoveryError)) throw error
    return unavailable(error.reason, `${error.message}. Supply explicit layout JSON or correct the metadata.`)
  }
}

function safePath(path: string): boolean {
  return !!path && !path.startsWith('/') && !/[\\\x00-\x20]/.test(path) &&
    path.split('/').every(segment => !!segment && segment !== '.' && segment !== '..')
}

/**
 * Offline, in-memory catalog compilation: accepts one already-resolved snapshot
 * per entry, not a checkout, include graph or filesystem path to open. Review of
 * the source/license and stock include identity remains the curator's obligation.
 * No real keyboard inventory is bundled. Rebuild serialized inputs to regain the
 * immutable runtime catalog; arbitrary JSON is not an authorized catalog.
 */
export async function buildLayoutCatalog(version: string, inputs: readonly LayoutCatalogEntryInput[]): Promise<LayoutCatalog> {
  if (!version.trim() || inputs.length > 64) throw new LayoutDiscoveryError('unsupported', 'Catalog requires a version and at most 64 entries')
  // Capture caller-owned inputs before the first asynchronous hash.
  const captured = structuredClone([...inputs])
  const ids = new Set<string>()
  for (const entry of captured) {
    const { attribution } = entry
    if (!entry.id || ids.has(entry.id) || !entry.board || !entry.revision) throw new LayoutDiscoveryError('invalid', 'Catalog IDs must be unique with exact board/revision identity')
    ids.add(entry.id)
    if (!/^https:\/\//.test(attribution.url) || !/^[a-f0-9]{40}$/.test(attribution.commit) ||
        !attribution.license.trim() || !attribution.notice.trim() || !safePath(attribution.path)) throw new LayoutDiscoveryError('invalid', 'Catalog attribution requires URL, immutable commit, license, notice and safe source path')
    if (entry.metadata !== null && (entry.metadata.length > LAYOUT_DISCOVERY_LIMITS.sourceBytes ||
        new TextEncoder().encode(entry.metadata).length > LAYOUT_DISCOVERY_LIMITS.sourceBytes)) throw new LayoutDiscoveryError('unsupported', 'Catalog source exceeds 256 KiB')
    if (entry.stockIncludes.length > 2 || new Set(entry.stockIncludes.map(item => item.line)).size !== entry.stockIncludes.length) throw new LayoutDiscoveryError('invalid', 'Duplicate or excessive stock include proofs')
    for (const proof of entry.stockIncludes) {
      if (!LAYOUT_STOCK_PREAMBLE.some(line => line === proof.line) || !safePath(proof.path) ||
          !/^[a-f0-9]{64}$/.test(proof.sha256) || !proof.review.trim()) throw new LayoutDiscoveryError('invalid', 'Unproved stock preamble identity')
    }
    entry.stockIncludes.sort((a, b) => compare(a.line, b.line))
    entry.parts?.sort((a, b) => compare(a.id, b.id))
  }
  captured.sort((a, b) => compare(a.id, b.id))
  const entries: LayoutCatalogEntry[] = []
  for (const entry of captured) {
    const output = normalized(entry)
    entries.push({ ...entry, sourceSha256: await digest(entry.metadata ?? ''), outputSha256: await digest(canonical(output)), normalized: output })
  }
  const artifact = { schema: 1 as const, generator: 'literal-layout-v1' as const, version, entries }
  const revision = `${version}/${await digest(canonical(artifact))}`
  const catalog = freeze(JSON.parse(canonical({ ...artifact, revision })) as LayoutCatalog)
  catalogs.add(catalog)
  return catalog
}

/** Candidate only: no acceptance, persistence or source-identity replacement. */
export function resolveCatalogLayout(request: LayoutCatalogRequest & { keymap: ParsedKeymap }): CatalogLayoutResult {
  const { catalog, source, selection, keymap } = request
  const count = keymap.layers[0]?.length ?? 0
  if (!count || keymap.layers.some(layer => layer.length !== count)) throw new KeymapValidationError(['Discovery requires nonempty, equal-length firmware layers'])
  if (!catalogs.has(catalog)) return unavailable('invalid', 'Build and validate the catalog before discovery')
  if (!source.id || !source.revision || source.id !== selection.sourceId || source.revision !== selection.sourceRevision ||
      catalog.revision !== selection.catalogRevision) return unavailable('stale-selection', 'Metadata selection is stale; select again for this source and catalog revision')
  const entry = catalog.entries.find(item => item.id === selection.entryId)
  if (!entry) return unavailable('unknown-selection', 'Unknown board/shield/revision selection; supply explicit layout JSON')
  const result = normalized(entry, { selectedSource: source.code, ...(selection.candidate ? { candidate: selection.candidate } : {}) })
  if (result.status !== 'candidate') return result
  if (result.layout.layout.length !== count) return unavailable('count-mismatch', 'Metadata map length differs from firmware bindings; using the binding-count rectangle')
  const sensors = result.layout.sensorLabels
  if (sensors && keymap.sensorBindings?.some(row => row.length > 0 && row.length !== sensors.length)) return unavailable('count-mismatch', 'Declared sensor count differs from firmware sensor bindings; association refused')
  return {
    ...result,
    provenance: {
      entryId: entry.id, board: entry.board, revision: entry.revision,
      ...(entry.shield !== undefined ? { shield: entry.shield } : {}),
      ...(entry.part !== undefined ? { part: entry.part } : {}),
      catalogRevision: catalog.revision, sourceId: source.id, sourceRevision: source.revision,
      attribution: { ...entry.attribution }, sourceSha256: entry.sourceSha256,
      firmwareCompatibility: source.firmwareCommit === entry.attribution.commit ? 'revision-matched' : 'unverified'
    }
  }
}
