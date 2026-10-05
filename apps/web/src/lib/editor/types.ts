import type { KeysymRejection, HostKeymapSnapshot, LayoutKey, ParsedKeymap } from '@keymap-editor/keymap-core'
import type { DemoHostLayoutSeed } from '../demo/host-seeds.js'
import type { HostLanguageId } from '../host-layout-store'

export type HostProfilePrompt =
  | { kind: 'save-as'; language: HostLanguageId }
  | { kind: 'copy'; language: HostLanguageId; layoutId?: string }
  | { kind: 'rename'; language: HostLanguageId; profileId?: string }
  | { kind: 'delete'; language: HostLanguageId; profileId?: string }

/** Armed host-level cell that receives glyphs from the persistent symbol catalog. */
export type HostSymbolEditTarget = {
  language: HostLanguageId
  zmk: string
  level: number
}

/** Result of editing one host-layout level from the decode card. */
export type HostKeyLevelEditResult =
  | {
      ok: true
      keysym: string
      layoutId: string
      /** Base level is a non-character keysym — the key drops out of composition. */
      dropsFromCompose: boolean
    }
  | {
      ok: false
      reason: 'rejected' | 'unknown-key' | 'missing-layout' | 'no-target'
      detail?: KeysymRejection
    }

export type SaveNotice = {
  kind: 'warning' | 'error'
  messages: string[]
  /** Optional help links for load/save warnings (e.g. Shield Wizard). */
  links?: Array<{ href: string; label: string }>
}

export type GithubMeta = { repository: string; branch: string }

export type KeyboardSelection = {
  source?: string
  layout?: LayoutKey[] | null
  keymap?: ParsedKeymap | null
  github?: GithubMeta
  /**
   * Keep the live draft and Host legend when retargeting the same GitHub repo
   * (Create branch ≈ `git checkout -b`). Baseline becomes the loaded tip.
   */
  preserveSession?: boolean
  /** Demo-only host layouts to open when the legend is still English-only. */
  demoHost?: DemoHostLayoutSeed[]
  /** Pasted `.keymap` text for clipboard Copy (splice). */
  clipboardOriginalSource?: string | null
  /** Clipboard load warning codes (`clipboard_inferred_layout`, …). */
  warnings?: string[]
  /**
   * Host snapshot from `host_keymap/snapshot.json` (GitHub). When present it
   * wins over IndexedDB for this keymap identity.
   */
  hostSnapshot?: HostKeymapSnapshot | null
  [key: string]: unknown
}

/** Max draft snapshots kept for undo / redo. */
export const HISTORY_LIMIT = 50

/** Debounce for IndexedDB draft writes. */
export const PERSIST_DEBOUNCE_MS = 400
