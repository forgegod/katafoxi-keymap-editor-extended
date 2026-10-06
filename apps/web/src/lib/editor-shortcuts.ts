import { hasEscapeOverlay } from './escape-stack'

export function isEditableFocus(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

export function handleEditorShortcut(
  event: KeyboardEvent,
  history: { canUndo: boolean; canRedo: boolean; undo(): void; redo(): void }
): boolean {
  if (hasEscapeOverlay()) return false
  if (isEditableFocus(event.target)) return false
  const mod = event.metaKey || event.ctrlKey
  if (!mod) return false

  const key = event.key.toLowerCase()
  if (key === 'z' && event.shiftKey) {
    if (!history.canRedo) return false
    event.preventDefault()
    history.redo()
    return true
  }
  if (key === 'z') {
    if (!history.canUndo) return false
    event.preventDefault()
    history.undo()
    return true
  }
  if (key === 'y' && event.ctrlKey && !event.metaKey) {
    if (!history.canRedo) return false
    event.preventDefault()
    history.redo()
    return true
  }
  return false
}
