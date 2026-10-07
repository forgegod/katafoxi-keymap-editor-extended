import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasEscapeOverlay, pushEscapeHandler, resetEscapeStackForTests } from './escape-stack'

function escapeEvent() {
  return new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
}

describe('escape stack', () => {
  afterEach(() => {
    resetEscapeStackForTests()
  })

  it('invokes only the top handler once per Escape', () => {
    const lower = vi.fn()
    const top = vi.fn()
    pushEscapeHandler(lower)
    pushEscapeHandler(top)

    window.dispatchEvent(escapeEvent())
    expect(top).toHaveBeenCalledOnce()
    expect(lower).not.toHaveBeenCalled()
  })

  it('restores the previous handler after the top pops', () => {
    const lower = vi.fn()
    const top = vi.fn()
    pushEscapeHandler(lower)
    const popTop = pushEscapeHandler(top)
    popTop()

    window.dispatchEvent(escapeEvent())
    expect(top).not.toHaveBeenCalled()
    expect(lower).toHaveBeenCalledOnce()
  })
})

describe('hasEscapeOverlay', () => {
  afterEach(() => {
    resetEscapeStackForTests()
  })

  it('is true only while a handler is stacked', () => {
    expect(hasEscapeOverlay()).toBe(false)
    const pop = pushEscapeHandler(() => {})
    expect(hasEscapeOverlay()).toBe(true)
    pop()
    expect(hasEscapeOverlay()).toBe(false)
  })
})
