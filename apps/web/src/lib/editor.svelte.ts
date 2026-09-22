/**
 * Shared editor document state (Svelte 5 runes).
 * Baseline (last load / successful publish+reload) vs draft (live edits).
 */

import {
  diffKeymaps,
  getBehaviorCatalog,
  getKeycodeCatalog,
  summarizeKeymapDiff,
  type KeyBindingNode,
  type LayoutKey,
  type ParsedKeymap
} from '@keymap-editor/keymap-core'
import type { Definitions } from './context'

export type LegendMode = 'zmk' | 'composed'

export type SaveNotice = {
  kind: 'warning' | 'error'
  messages: string[]
}

export type GithubMeta = { repository: string; branch: string }

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
  saving = $state(false)
  legendMode = $state<LegendMode>('zmk')
  saveNotice = $state<SaveNotice | null>(null)

  /** Bumps on select / new publish so stale reloads are ignored. */
  #publishGeneration = 0

  get isDirty(): boolean {
    if (!this.baselineKeymap || !this.draftKeymap) return false
    return diffKeymaps(this.baselineKeymap, this.draftKeymap).length > 0
  }

  get dirtySummary(): string {
    if (!this.baselineKeymap || !this.draftKeymap) return ''
    return summarizeKeymapDiff(
      diffKeymaps(this.baselineKeymap, this.draftKeymap)
    )
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

  initCatalogs() {
    this.definitions = {
      keycodes: getKeycodeCatalog(),
      behaviours: getBehaviorCatalog()
    }
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

  selectKeyboard(event: KeyboardSelection) {
    this.#publishGeneration += 1
    this.source = event.source ?? null
    this.githubMeta = event.github ?? null
    this.layout = event.layout ?? null
    const km = event.keymap ?? null
    if (!km) {
      this.baselineKeymap = null
      this.draftKeymap = null
    } else {
      const baseline = cloneParsedKeymap(km)
      this.baselineKeymap = baseline
      this.draftKeymap = cloneParsedKeymap(baseline)
    }
    this.saveNotice = null
  }

  updateKeymap(next: ParsedKeymap) {
    this.draftKeymap = cloneParsedKeymap(next)
  }

  /**
   * After successful publish + successful reload: replace baseline and draft
   * from re-read keymap, then apply save-response warnings.
   */
  applyPublished(reloaded: ParsedKeymap, saveMeta?: unknown) {
    const baseline = cloneParsedKeymap(reloaded)
    this.baselineKeymap = baseline
    this.draftKeymap = cloneParsedKeymap(baseline)
    const warnings = formatWarnings(
      saveMeta && typeof saveMeta === 'object'
        ? (saveMeta as { warnings?: unknown }).warnings
        : undefined
    )
    this.saveNotice =
      warnings.length > 0 ? { kind: 'warning', messages: warnings } : null
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
}

export const editor = new EditorState()
