import { defaultHostEditTarget, stepHostEditTarget } from '../host-edit-cycle'
import type { EditorState } from './state.svelte'
import type { HostKeyLevelEditResult, HostSymbolEditTarget } from './types'

export function armHostSymbolEdit(this: EditorState, target: HostSymbolEditTarget) {
  this.hostSymbolEditTarget = target
  this.hostSymbolCatalogOpen = true
}

/**
 * Start an Alt+click host-edit session. When `zmk` is known, arm the first
 * AltGr cycle cell (extras before base) so the catalog is ready to write.
 */
export function beginHostEditSession(this: EditorState, keyIndex: number, layer: number, zmk?: string) {
  this.hostEditSession = { keyIndex, layer }
  this.hostSymbolCatalogOpen = true
  if (zmk) {
    const target = defaultHostEditTarget(zmk, this.hostLegend)
    this.hostSymbolEditTarget = target
  } else {
    this.hostSymbolEditTarget = null
  }
}

/** Close catalog + clear armed cell; caller unpins the decode card. */
export function endHostEditSession(this: EditorState) {
  this.hostEditSession = null
  this.hostSymbolEditTarget = null
  this.hostSymbolCatalogOpen = false
}

export function closeHostSymbolCatalog(this: EditorState) {
  this.hostSymbolCatalogOpen = false
}

/** Move the armed cell along the AltGr cycle without writing. */
export function stepHostSymbolEdit(this: EditorState, delta: number) {
  const target = this.hostSymbolEditTarget
  if (!target || delta === 0) return
  this.hostSymbolEditTarget = stepHostEditTarget(target, this.hostLegend, delta)
}

export async function pickHostSymbol(this: EditorState, text: string): Promise<HostKeyLevelEditResult> {
  const target = this.hostSymbolEditTarget
  if (!target) {
    return { ok: false, reason: 'no-target' }
  }
  const result = await this.setHostKeyLevel(
    target.language,
    target.zmk,
    target.level,
    text
  )
  if (result.ok) this.stepHostSymbolEdit(1)
  return result
}

