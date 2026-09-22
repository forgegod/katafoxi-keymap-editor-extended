/**
 * Shared editor document state (Svelte 5 runes).
 * Catalogs, active keymap, dirty buffer, and save notices live here so
 * App / pickers / future Clipboard sources share one reactive source of truth.
 */

import {
  getBehaviorCatalog,
  getKeycodeCatalog,
  type LayoutKey,
  type ParsedKeymap
} from '@keymap-editor/keymap-core'
import type { Definitions } from './context'

export type LegendMode = 'zmk' | 'composed'

export type SaveNotice = {
  kind: 'warning' | 'error'
  messages: string[]
}

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

export type KeyboardSelection = {
  source?: string
  layout?: LayoutKey[] | null
  keymap?: ParsedKeymap | null
  github?: { repository: string; branch: string }
  [key: string]: unknown
}

class EditorState {
  definitions = $state<Definitions | null>(null)
  source = $state<string | null>(null)
  githubMeta = $state<{ repository: string; branch: string } | null>(null)
  layout = $state<LayoutKey[] | null>(null)
  keymap = $state<ParsedKeymap | null>(null)
  editingKeymap = $state<ParsedKeymap | null>(null)
  saving = $state(false)
  legendMode = $state<LegendMode>('zmk')
  saveNotice = $state<SaveNotice | null>(null)

  get activeKeymap(): ParsedKeymap | null {
    return this.editingKeymap ?? this.keymap
  }

  get isDirty(): boolean {
    return this.editingKeymap != null
  }

  initCatalogs() {
    this.definitions = {
      keycodes: getKeycodeCatalog(),
      behaviours: getBehaviorCatalog()
    }
  }

  selectKeyboard(event: KeyboardSelection) {
    this.source = event.source ?? null
    this.githubMeta = event.github ?? null
    this.layout = event.layout ?? null
    const km = event.keymap ?? null
    if (km && !km.layer_names) {
      km.layer_names = km.layers.map((_, i) => `Layer ${i}`)
    }
    this.keymap = km
    this.editingKeymap = null
    this.saveNotice = null
  }

  updateKeymap(next: ParsedKeymap) {
    this.editingKeymap = next
  }

  applySaveSuccess(data: unknown) {
    const warnings = formatWarnings(
      data && typeof data === 'object'
        ? (data as { warnings?: unknown }).warnings
        : undefined
    )
    this.saveNotice =
      warnings.length > 0 ? { kind: 'warning', messages: warnings } : null
    if (this.editingKeymap) {
      this.keymap = this.editingKeymap
      this.editingKeymap = null
    }
  }

  applySaveFailure(data: unknown) {
    this.saveNotice = { kind: 'error', messages: extractErrorMessages(data) }
  }
}

export const editor = new EditorState()
