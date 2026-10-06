export type EscapeHandler = (event: KeyboardEvent) => void

const stack: EscapeHandler[] = []
let attached = false

function onEscape(event: KeyboardEvent) {
  if (event.key !== 'Escape' || event.repeat || event.isComposing) return
  const top = stack[stack.length - 1]
  if (!top) return
  event.preventDefault()
  event.stopImmediatePropagation()
  top(event)
}

function attach() {
  if (attached) return
  window.addEventListener('keydown', onEscape, true)
  attached = true
}

function detach() {
  if (!attached) return
  window.removeEventListener('keydown', onEscape, true)
  attached = false
}

/** Push a handler that runs on Escape while it is on top of the stack. */
export function pushEscapeHandler(handler: EscapeHandler): () => void {
  stack.push(handler)
  attach()
  let popped = false
  return () => {
    if (popped) return
    popped = true
    const index = stack.lastIndexOf(handler)
    if (index >= 0) stack.splice(index, 1)
    if (stack.length === 0) detach()
  }
}

/** True while a dialog or menu owns Escape (editor shortcuts should idle). */
export function hasEscapeOverlay(): boolean {
  return stack.length > 0
}

export function resetEscapeStackForTests(): void {
  stack.length = 0
  detach()
}
