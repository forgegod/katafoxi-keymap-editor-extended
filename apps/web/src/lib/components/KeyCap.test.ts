import type { ComposedLegend } from '@keymap-editor/keymap-core'
import { flushSync, mount, unmount } from 'svelte'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fitSchedulerStatsForTests,
  resetFitSchedulerForTests
} from '../fit-scheduler'
import KeyCap from './KeyCap.svelte'

const legend: ComposedLegend = {
  columns: [
    {
      language: 'en',
      tone: 'base',
      pair: ['a', 'A'],
      pairDead: [false, false],
      altGr: '',
      altGrDead: false,
      altGrShift: '',
      altGrShiftDead: false,
      showAltGr: true,
      showAltGrShift: true,
      onKeycap: true
    }
  ]
}

describe('KeyCap fit scheduler', () => {
  const views: Array<ReturnType<typeof mount>> = []
  const nodes: HTMLElement[] = []

  afterEach(() => {
    for (const view of views) unmount(view)
    views.length = 0
    for (const node of nodes) node.remove()
    nodes.length = 0
    resetFitSchedulerForTests()
    vi.unstubAllGlobals()
  })

  it('paints face glyphs and keeps empty slots in the layout', () => {
    const target = document.createElement('div')
    document.body.append(target)
    nodes.push(target)
    views.push(mount(KeyCap, { target, props: { legend } }))
    flushSync()
    const glyphs = [...target.querySelectorAll('.glyph')]
    expect(glyphs.map(el => el.textContent).join('')).toBe('aAˬˬ')
    expect(glyphs.filter(el => el.classList.contains('empty'))).toHaveLength(2)
  })

  it('shares one ResizeObserver across KeyCaps', () => {
    const observers: ResizeObserver[] = []
    const Original = globalThis.ResizeObserver
    vi.stubGlobal(
      'ResizeObserver',
      class TrackingResizeObserver extends Original {
        constructor(callback: ResizeObserverCallback) {
          super(callback)
          observers.push(this)
        }
      }
    )

    const a = document.createElement('div')
    const b = document.createElement('div')
    document.body.append(a, b)
    nodes.push(a, b)
    views.push(mount(KeyCap, { target: a, props: { legend } }))
    views.push(mount(KeyCap, { target: b, props: { legend } }))
    flushSync()

    expect(observers).toHaveLength(1)
    expect(fitSchedulerStatsForTests().targets).toBe(2)
    expect(fitSchedulerStatsForTests().observer).toBe(observers[0])
  })
})
