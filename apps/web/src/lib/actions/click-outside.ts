/** Document listener that runs when a pointer/click lands outside `node`. */
export type ClickOutsideParams = {
  /** When false, the listener is idle (menus stay closed without unregister churn). */
  enabled?: boolean
  handler: () => void
  /** Default `pointerdown`. Use `click` when the UI needs the full click sequence first. */
  event?: 'pointerdown' | 'click'
  /**
   * When set, a target is inside if `target.closest(selector) === node`.
   * Prefer this when `bind:this` can lag one frame behind the open menu.
   */
  closestSelector?: string
}

function isInside(
  node: HTMLElement,
  target: EventTarget | null,
  closestSelector?: string
): boolean {
  if (closestSelector) {
    if (!(target instanceof Element)) return false
    return target.closest(closestSelector) === node
  }
  return target instanceof Node && node.contains(target)
}

/**
 * Svelte action: close popovers/menus on outside press.
 * Mirror of the repeated `$effect` + `document.addEventListener('pointerdown')` pattern.
 */
export function clickOutside(node: HTMLElement, params: ClickOutsideParams) {
  let current = params

  function onEvent(event: Event) {
    if (current.enabled === false) return
    const target = event.target
    // A control that replaces itself may already be detached when the bubble arrives.
    if (target instanceof Node && !target.isConnected) return
    if (isInside(node, target, current.closestSelector)) return
    current.handler()
  }

  function bind(next: ClickOutsideParams) {
    const prev = current.event ?? 'pointerdown'
    const nextEvent = next.event ?? 'pointerdown'
    if (prev !== nextEvent) {
      document.removeEventListener(prev, onEvent)
      document.addEventListener(nextEvent, onEvent)
    }
    current = next
  }

  document.addEventListener(current.event ?? 'pointerdown', onEvent)

  return {
    update(next: ClickOutsideParams) {
      bind(next)
    },
    destroy() {
      document.removeEventListener(current.event ?? 'pointerdown', onEvent)
    }
  }
}
