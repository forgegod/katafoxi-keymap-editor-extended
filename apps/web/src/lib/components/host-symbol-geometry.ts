/** Survives catalog collapse and component remounts. */
export const hostSymbolExpandedByLanguage = new Map<string, Record<string, boolean>>()
export const hostSymbolScrollByLanguage = new Map<string, number>()

export type HostSymbolPickerGeometry = {
  left: number
  top: number
  width: number
  height: number
}

/** Last user-placed box; reused on reopen. */
export const hostSymbolPickerFrame: {
  geometry: HostSymbolPickerGeometry | null
} = { geometry: null }

export const DEFAULT_PICKER_WIDTH = 560
export const DEFAULT_PICKER_HEIGHT = 420
const MIN_WIDTH = 240
const MIN_HEIGHT = 180
const VIEW_MARGIN = 8
/** Empty space kept between the catalog and the decode card. */
const CARD_CLEARANCE = 8

export interface PickerViewport {
  width: number
  height: number
}

type PickerSide = 'left' | 'right' | 'above' | 'below'

function boxesOverlap(
  a: HostSymbolPickerGeometry,
  b: HostSymbolPickerGeometry,
  gap: number
): boolean {
  return (
    a.left < b.left + b.width + gap &&
    a.left + a.width + gap > b.left &&
    a.top < b.top + b.height + gap &&
    a.top + a.height + gap > b.top
  )
}

function overlapArea(
  a: HostSymbolPickerGeometry,
  b: HostSymbolPickerGeometry,
  gap: number
): number {
  const left = Math.max(a.left, b.left - gap)
  const right = Math.min(a.left + a.width, b.left + b.width + gap)
  const top = Math.max(a.top, b.top - gap)
  const bottom = Math.min(a.top + a.height, b.top + b.height + gap)
  if (right <= left || bottom <= top) return 0
  return (right - left) * (bottom - top)
}

export function clampPickerBox(
  box: HostSymbolPickerGeometry,
  view: PickerViewport
): HostSymbolPickerGeometry {
  const maxW = Math.max(MIN_WIDTH, view.width - VIEW_MARGIN * 2)
  const maxH = Math.max(MIN_HEIGHT, view.height - VIEW_MARGIN * 2)
  const width = Math.min(maxW, Math.max(MIN_WIDTH, box.width))
  const height = Math.min(maxH, Math.max(MIN_HEIGHT, box.height))
  const left = Math.max(VIEW_MARGIN, Math.min(box.left, view.width - width - VIEW_MARGIN))
  const top = Math.max(VIEW_MARGIN, Math.min(box.top, view.height - height - VIEW_MARGIN))
  return { left, top, width, height }
}

function proposeBeside(
  side: PickerSide,
  picker: HostSymbolPickerGeometry,
  card: HostSymbolPickerGeometry,
  view: PickerViewport
): HostSymbolPickerGeometry {
  const maxW = Math.max(MIN_WIDTH, view.width - VIEW_MARGIN * 2)
  const maxH = Math.max(MIN_HEIGHT, view.height - VIEW_MARGIN * 2)
  if (side === 'right' || side === 'left') {
    const room =
      side === 'right'
        ? view.width - VIEW_MARGIN - (card.left + card.width + CARD_CLEARANCE)
        : card.left - VIEW_MARGIN - CARD_CLEARANCE
    const width = Math.min(picker.width, maxW, Math.max(MIN_WIDTH, room))
    const height = Math.min(picker.height, maxH)
    const left =
      side === 'right'
        ? card.left + card.width + CARD_CLEARANCE
        : card.left - CARD_CLEARANCE - width
    return clampPickerBox({ left, top: picker.top, width, height }, view)
  }
  const room =
    side === 'below'
      ? view.height - VIEW_MARGIN - (card.top + card.height + CARD_CLEARANCE)
      : card.top - VIEW_MARGIN - CARD_CLEARANCE
  const height = Math.min(picker.height, maxH, Math.max(MIN_HEIGHT, room))
  const width = Math.min(picker.width, maxW)
  const top =
    side === 'below'
      ? card.top + card.height + CARD_CLEARANCE
      : card.top - CARD_CLEARANCE - height
  return clampPickerBox({ left: picker.left, top, width, height }, view)
}

/**
 * Move the catalog off the decode card. A box that already clears the card
 * stays put. Otherwise the side with room for the current size wins; the
 * catalog shrinks toward its minimum before it is allowed to cover the card.
 */
export function placePickerClearOf(
  picker: HostSymbolPickerGeometry,
  card: HostSymbolPickerGeometry,
  view: PickerViewport
): HostSymbolPickerGeometry {
  const current = clampPickerBox(picker, view)
  if (!boxesOverlap(current, card, CARD_CLEARANCE)) return current
  const sides: PickerSide[] = ['right', 'left', 'below', 'above']
  let best = current
  let bestKey: number[] | null = null
  for (const side of sides) {
    const next = proposeBeside(side, picker, card, view)
    const horizontal = side === 'left' || side === 'right' ? 0 : 1
    const free =
      side === 'right'
        ? view.width - (card.left + card.width)
        : side === 'left'
          ? card.left
          : side === 'below'
            ? view.height - (card.top + card.height)
            : card.top
    const key = [
      overlapArea(next, card, CARD_CLEARANCE),
      -(next.width * next.height),
      horizontal,
      -free,
      Math.abs(next.left - picker.left) + Math.abs(next.top - picker.top)
    ]
    if (!bestKey || keyComesFirst(key, bestKey)) {
      best = next
      bestKey = key
    }
  }
  return best
}

function keyComesFirst(key: number[], other: number[]): boolean {
  for (let index = 0; index < key.length; index++) {
    if (key[index] < other[index]) return true
    if (key[index] > other[index]) return false
  }
  return false
}
