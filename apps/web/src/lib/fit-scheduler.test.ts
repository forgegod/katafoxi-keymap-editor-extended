import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  fitSchedulerStatsForTests,
  flushFitSchedulerForTests,
  observeKeycapFit,
  requestKeycapFit,
  resetFitSchedulerForTests
} from './fit-scheduler'

function instrument(el: HTMLElement, label: string, log: string[], size: { width: number }) {
  Object.defineProperty(el, 'clientWidth', {
    configurable: true,
    get() {
      log.push(`read:${label}:clientWidth`)
      return size.width
    }
  })
  Object.defineProperty(el, 'scrollWidth', {
    configurable: true,
    get() {
      log.push(`read:${label}:scrollWidth`)
      return size.width
    }
  })
  const style = el.style
  const proto = Object.getPrototypeOf(style) as CSSStyleDeclaration
  const widthDesc = Object.getOwnPropertyDescriptor(proto, 'width')
  const transformDesc = Object.getOwnPropertyDescriptor(proto, 'transform')
  Object.defineProperty(style, 'width', {
    configurable: true,
    get() {
      return widthDesc?.get?.call(style) ?? ''
    },
    set(value: string) {
      log.push(`write:${label}:width`)
      widthDesc?.set?.call(style, value)
    }
  })
  Object.defineProperty(style, 'transform', {
    configurable: true,
    get() {
      return transformDesc?.get?.call(style) ?? ''
    },
    set(value: string) {
      log.push(`write:${label}:transform`)
      transformDesc?.set?.call(style, value)
    }
  })
}

describe('fit scheduler', () => {
  afterEach(() => {
    resetFitSchedulerForTests()
    vi.unstubAllGlobals()
  })

  it('observes many keycaps with one ResizeObserver', () => {
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
    const faceA = document.createElement('span')
    const faceB = document.createElement('span')
    a.append(faceA)
    b.append(faceB)
    document.body.append(a, b)

    const stopA = observeKeycapFit({
      box: a,
      getFace: () => faceA,
      setScale: () => {}
    })
    const stopB = observeKeycapFit({
      box: b,
      getFace: () => faceB,
      setScale: () => {}
    })

    const stats = fitSchedulerStatsForTests()
    expect(observers).toHaveLength(1)
    expect(stats.observer).toBe(observers[0])
    expect(stats.targets).toBe(2)

    stopA()
    stopB()
    a.remove()
    b.remove()
    expect(fitSchedulerStatsForTests().observer).toBeUndefined()
    expect(fitSchedulerStatsForTests().targets).toBe(0)
  })

  it('measures every dirty face before applying scale', () => {
    vi.stubGlobal('requestAnimationFrame', () => 1)
    vi.stubGlobal('cancelAnimationFrame', () => {})
    const log: string[] = []
    const boxA = document.createElement('div')
    const boxB = document.createElement('div')
    const faceA = document.createElement('span')
    const faceB = document.createElement('span')
    boxA.append(faceA)
    boxB.append(faceB)
    document.body.append(boxA, boxB)
    instrument(boxA, 'boxA', log, { width: 40 })
    instrument(boxB, 'boxB', log, { width: 40 })
    instrument(faceA, 'faceA', log, { width: 80 })
    instrument(faceB, 'faceB', log, { width: 120 })

    const scales: number[] = []
    observeKeycapFit({
      box: boxA,
      getFace: () => faceA,
      setScale: scale => {
        log.push('apply:A')
        scales.push(scale)
      }
    })
    observeKeycapFit({
      box: boxB,
      getFace: () => faceB,
      setScale: scale => {
        log.push('apply:B')
        scales.push(scale)
      }
    })

    log.length = 0
    flushFitSchedulerForTests()

    const firstRead = log.findIndex(step => step.startsWith('read:'))
    const firstApply = log.findIndex(step => step.startsWith('apply:'))
    const reads = log.filter(step => step.startsWith('read:'))
    const applies = log.filter(step => step.startsWith('apply:'))
    expect(reads.length).toBeGreaterThan(0)
    expect(applies).toEqual(['apply:A', 'apply:B'])
    expect(firstRead).toBeGreaterThanOrEqual(0)
    expect(firstApply).toBeGreaterThan(firstRead)
    expect(log.indexOf('read:faceB:scrollWidth')).toBeLessThan(firstApply)
    expect(scales[0]).toBeCloseTo(0.5)
    expect(scales[1]).toBeCloseTo(40 / 120)

    requestKeycapFit(boxA)
    boxA.remove()
    boxB.remove()
  })
})
