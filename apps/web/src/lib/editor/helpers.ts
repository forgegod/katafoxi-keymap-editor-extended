import {
  hostLanguageName,
  type LegendHover,
  type ParsedKeymap
} from '@keymap-editor/keymap-core'
import type { HostLanguageId } from '../host-layout-store'

export function pairedImportNames(
  description: string,
  caps: HostLanguageId,
  stem: string
): { baseName: string; capsName: string } {
  const parts = description.split(/\s+\+\s+/)
  if (parts.length >= 2 && parts[0].trim() && parts[1].trim()) {
    return { baseName: parts[0].trim(), capsName: parts.slice(1).join(' + ').trim() }
  }
  return {
    baseName: description.trim() || stem,
    capsName: hostLanguageName(caps)
  }
}

export function extractErrorMessages(data: unknown): string[] {
  if (
    data &&
    typeof data === 'object' &&
    Array.isArray((data as { errors?: unknown }).errors)
  ) {
    return (data as { errors: unknown[] }).errors.map(String)
  }
  return ['Save failed.']
}

const LETTER_KEYCODE = /^[A-Z]$/

/** Index of the host-legend sample key: `&kp E` on layer0, else the first letter `&kp`. */
export function hostLegendAnchorIndex(keymap: ParsedKeymap | null | undefined): number {
  const layer0 = keymap?.layers[0]
  if (!layer0 || layer0.length === 0) return 0
  const eAt = layer0.findIndex(
    node => node.value === '&kp' && String(node.params[0]?.value ?? '') === 'E'
  )
  if (eAt >= 0) return eAt
  const letterAt = layer0.findIndex(
    node =>
      node.value === '&kp' &&
      LETTER_KEYCODE.test(String(node.params[0]?.value ?? ''))
  )
  return letterAt >= 0 ? letterAt : 0
}

/** True when assigning `next` would not change kind or layer (or layers/source). */
export function legendHoversEqual(
  current: LegendHover | null,
  next: LegendHover | null
): boolean {
  if (current === next) return true
  if (!current || !next) return false
  if (current.kind !== next.kind) return false
  if (current.kind === 'layer' && next.kind === 'layer') {
    return current.layer === next.layer
  }
  if (current.kind === 'layers' && next.kind === 'layers') {
    if (current.source !== next.source) return false
    if (current.layers.length !== next.layers.length) return false
    return current.layers.every((layer, i) => layer === next.layers[i])
  }
  return true
}
