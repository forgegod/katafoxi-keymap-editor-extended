/** At most one legend-decode card is live across the board. */

type DecodeCloser = () => void

type ActiveDecode = {
  keyIndex: number
  layer: number
  close: DecodeCloser
  /** Host-edit session: other keys must not steal/dismiss this card. */
  locked: boolean
}

let active: ActiveDecode | null = null

/**
 * Register this key as the decode owner. Returns false when a locked session on
 * another key refuses to yield.
 */
export function claimLegendDecode(
  keyIndex: number,
  layer: number,
  close: DecodeCloser
): boolean {
  const prev = active
  if (prev?.locked && prev.keyIndex !== keyIndex) {
    return false
  }
  active = {
    keyIndex,
    layer,
    close,
    locked: prev?.keyIndex === keyIndex ? prev.locked : false
  }
  // Same key (layer switch / re-hover) must not call close — that would clear
  // the decode state we just opened.
  if (prev && prev.keyIndex !== keyIndex) {
    prev.close()
  }
  return true
}

export function lockLegendDecode(keyIndex: number): void {
  if (active?.keyIndex === keyIndex) active.locked = true
}

export function unlockLegendDecode(keyIndex: number): void {
  if (active?.keyIndex === keyIndex) active.locked = false
}

export function releaseLegendDecode(keyIndex: number): void {
  if (active?.keyIndex === keyIndex) active = null
}

export function isLegendDecodeLocked(): boolean {
  return Boolean(active?.locked)
}

export function lockedLegendDecodeKeyIndex(): number | null {
  return active?.locked ? active.keyIndex : null
}

/** Test helper. */
export function resetLegendDecodeActive(): void {
  active = null
}
