import { afterEach, describe, expect, it, vi } from 'vitest'
import { handleEditorShortcut } from './editor-shortcuts'
import { pushEscapeHandler, resetEscapeStackForTests } from './escape-stack'

function mockHistory(
  overrides: Partial<{ canUndo: boolean; canRedo: boolean }> = {}
) {
  return {
    canUndo: true,
    canRedo: true,
    undo: vi.fn(),
    redo: vi.fn(),
    ...overrides
  }
}

function shortcutEvent(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init
  })
}

function dispatchShortcut(
  target: HTMLElement,
  init: KeyboardEventInit,
  history: ReturnType<typeof mockHistory>
): KeyboardEvent {
  const event = shortcutEvent(init)
  target.addEventListener(
    'keydown',
    (e) => {
      handleEditorShortcut(e, history)
    },
    { once: true }
  )
  target.dispatchEvent(event)
  return event
}

describe('handleEditorShortcut', () => {
  const mounted: HTMLElement[] = []

  afterEach(() => {
    for (const el of mounted) el.remove()
    mounted.length = 0
    resetEscapeStackForTests()
  })

  function mount<T extends HTMLElement>(el: T): T {
    document.body.appendChild(el)
    mounted.push(el)
    return el
  }

  it('Ctrl+Z and Meta+Z call undo and prevent default when canUndo', () => {
    const ctrlHistory = mockHistory({ canUndo: true, canRedo: false })
    const ctrlEvent = shortcutEvent({ key: 'z', ctrlKey: true })
    expect(handleEditorShortcut(ctrlEvent, ctrlHistory)).toBe(true)
    expect(ctrlHistory.undo).toHaveBeenCalledOnce()
    expect(ctrlHistory.redo).not.toHaveBeenCalled()
    expect(ctrlEvent.defaultPrevented).toBe(true)

    const metaHistory = mockHistory({ canUndo: true, canRedo: false })
    const metaEvent = shortcutEvent({ key: 'z', metaKey: true })
    expect(handleEditorShortcut(metaEvent, metaHistory)).toBe(true)
    expect(metaHistory.undo).toHaveBeenCalledOnce()
    expect(metaHistory.redo).not.toHaveBeenCalled()
    expect(metaEvent.defaultPrevented).toBe(true)
  })

  it('Ctrl+Shift+Z and Ctrl+Y call redo and prevent default when canRedo', () => {
    const shiftHistory = mockHistory({ canUndo: false, canRedo: true })
    const shiftEvent = shortcutEvent({ key: 'z', ctrlKey: true, shiftKey: true })
    expect(handleEditorShortcut(shiftEvent, shiftHistory)).toBe(true)
    expect(shiftHistory.redo).toHaveBeenCalledOnce()
    expect(shiftHistory.undo).not.toHaveBeenCalled()
    expect(shiftEvent.defaultPrevented).toBe(true)

    const yHistory = mockHistory({ canUndo: false, canRedo: true })
    const yEvent = shortcutEvent({ key: 'y', ctrlKey: true })
    expect(handleEditorShortcut(yEvent, yHistory)).toBe(true)
    expect(yHistory.redo).toHaveBeenCalledOnce()
    expect(yHistory.undo).not.toHaveBeenCalled()
    expect(yEvent.defaultPrevented).toBe(true)
  })

  it('does not call undo/redo or prevent default when canUndo/canRedo are false', () => {
    const undoHistory = mockHistory({ canUndo: false, canRedo: false })
    const undoEvent = shortcutEvent({ key: 'z', ctrlKey: true })
    expect(handleEditorShortcut(undoEvent, undoHistory)).toBe(false)
    expect(undoHistory.undo).not.toHaveBeenCalled()
    expect(undoHistory.redo).not.toHaveBeenCalled()
    expect(undoEvent.defaultPrevented).toBe(false)

    const redoZHistory = mockHistory({ canUndo: false, canRedo: false })
    const redoZEvent = shortcutEvent({ key: 'z', ctrlKey: true, shiftKey: true })
    expect(handleEditorShortcut(redoZEvent, redoZHistory)).toBe(false)
    expect(redoZHistory.undo).not.toHaveBeenCalled()
    expect(redoZHistory.redo).not.toHaveBeenCalled()
    expect(redoZEvent.defaultPrevented).toBe(false)

    const redoYHistory = mockHistory({ canUndo: false, canRedo: false })
    const redoYEvent = shortcutEvent({ key: 'y', ctrlKey: true })
    expect(handleEditorShortcut(redoYEvent, redoYHistory)).toBe(false)
    expect(redoYHistory.undo).not.toHaveBeenCalled()
    expect(redoYHistory.redo).not.toHaveBeenCalled()
    expect(redoYEvent.defaultPrevented).toBe(false)
  })

  it('Meta+Y does not redo', () => {
    const history = mockHistory({ canUndo: true, canRedo: true })
    const event = shortcutEvent({ key: 'y', metaKey: true })
    expect(handleEditorShortcut(event, history)).toBe(false)
    expect(history.redo).not.toHaveBeenCalled()
    expect(history.undo).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
  })

  it('does not undo or redo when an overlay owns the escape stack', () => {
    const pop = pushEscapeHandler(() => {})
    const history = mockHistory({ canUndo: true, canRedo: true })
    const event = shortcutEvent({ key: 'z', ctrlKey: true })
    expect(handleEditorShortcut(event, history)).toBe(false)
    expect(history.undo).not.toHaveBeenCalled()
    expect(history.redo).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
    pop()
  })

  it('does not undo or redo when the target is an input, textarea, or contenteditable', () => {
    const editable = document.createElement('div')
    editable.contentEditable = 'true'
    // happy-dom does not flip isContentEditable when contentEditable is set
    Object.defineProperty(editable, 'isContentEditable', { value: true })

    const cases: HTMLElement[] = [
      mount(document.createElement('input')),
      mount(document.createElement('textarea')),
      mount(editable)
    ]

    for (const target of cases) {
      const history = mockHistory({ canUndo: true, canRedo: true })
      const event = dispatchShortcut(target, { key: 'z', ctrlKey: true }, history)
      expect(history.undo).not.toHaveBeenCalled()
      expect(history.redo).not.toHaveBeenCalled()
      expect(event.defaultPrevented).toBe(false)
    }
  })
})
