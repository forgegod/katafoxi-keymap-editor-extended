export type KeycapFitTarget = {
  box: HTMLElement
  getFace: () => HTMLElement | undefined
  setScale: (scale: number) => void
}

type FitEntry = KeycapFitTarget

const entries = new Map<HTMLElement, FitEntry>()
const dirty = new Set<FitEntry>()

let sharedObserver: ResizeObserver | undefined
let raf = 0

function teardownIfIdle() {
  if (entries.size > 0) return
  if (raf) {
    cancelAnimationFrame(raf)
    raf = 0
  }
  dirty.clear()
  sharedObserver?.disconnect()
  sharedObserver = undefined
}

function ensureObserver(): ResizeObserver | undefined {
  if (typeof ResizeObserver === 'undefined') return undefined
  if (!sharedObserver) {
    sharedObserver = new ResizeObserver(records => {
      for (const record of records) {
        const entry = entries.get(record.target as HTMLElement)
        if (entry) dirty.add(entry)
      }
      scheduleFlush()
    })
  }
  return sharedObserver
}

function scheduleFlush() {
  if (raf) return
  if (typeof requestAnimationFrame === 'undefined') {
    flushFits()
    return
  }
  raf = requestAnimationFrame(() => {
    raf = 0
    flushFits()
  })
}

function flushFits() {
  const batch = [...dirty]
  dirty.clear()
  if (batch.length === 0) return

  const measured: Array<{
    entry: FitEntry
    face: HTMLElement
    prevTransform: string
    prevWidth: string
  }> = []

  for (const entry of batch) {
    const face = entry.getFace()
    if (!entry.box.isConnected || !face) continue
    measured.push({
      entry,
      face,
      prevTransform: face.style.transform,
      prevWidth: face.style.width
    })
  }

  for (const item of measured) {
    item.face.style.transform = 'scale(1)'
    item.face.style.width = 'max-content'
  }

  const scales: number[] = []
  for (const item of measured) {
    const have = item.entry.box.clientWidth
    const need = item.face.scrollWidth
    scales.push(have > 0 && need > have ? have / need : 1)
  }

  for (let i = 0; i < measured.length; i++) {
    const item = measured[i]
    item.face.style.transform = item.prevTransform
    item.face.style.width = item.prevWidth
    item.entry.setScale(scales[i])
  }
}

/** Watch a keycap box; all dirty faces measure in one rAF (reads, then writes). */
export function observeKeycapFit(target: KeycapFitTarget): () => void {
  const prev = entries.get(target.box)
  if (prev) dirty.delete(prev)
  entries.set(target.box, target)
  dirty.add(target)
  ensureObserver()?.observe(target.box)
  scheduleFlush()
  return () => {
    if (entries.get(target.box) !== target) return
    entries.delete(target.box)
    dirty.delete(target)
    sharedObserver?.unobserve(target.box)
    teardownIfIdle()
  }
}

/** Refit after face content changes; coalesces with resize into the same frame. */
export function requestKeycapFit(box: HTMLElement): void {
  const entry = entries.get(box)
  if (!entry) return
  dirty.add(entry)
  scheduleFlush()
}

export function fitSchedulerStatsForTests(): {
  targets: number
  observer: ResizeObserver | undefined
  pending: number
} {
  return { targets: entries.size, observer: sharedObserver, pending: dirty.size }
}

export function flushFitSchedulerForTests(): void {
  if (raf) {
    cancelAnimationFrame(raf)
    raf = 0
  }
  flushFits()
}

export function resetFitSchedulerForTests(): void {
  entries.clear()
  dirty.clear()
  if (raf) {
    cancelAnimationFrame(raf)
    raf = 0
  }
  sharedObserver?.disconnect()
  sharedObserver = undefined
}
