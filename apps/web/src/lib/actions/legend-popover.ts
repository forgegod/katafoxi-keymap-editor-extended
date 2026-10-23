/** Escape the legend's table clip without changing DOM ownership or outside-click/focus handling. */
export function legendPopover(node: HTMLElement) {
  const anchor = node.parentElement
  if (!anchor) return
  const original = { position: node.style.position, left: node.style.left, top: node.style.top }
  node.style.position = 'fixed'

  function place() {
    const rect = anchor!.getBoundingClientRect()
    const width = node.getBoundingClientRect().width
    node.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`
    node.style.top = `${rect.bottom + 2}px`
  }

  place()
  const observer = new ResizeObserver(place)
  observer.observe(anchor)
  observer.observe(node)
  // Capture scrolls from the legend as well as document/ancestor scrolling.
  window.addEventListener('scroll', place, true)
  window.addEventListener('resize', place)
  return {
    destroy() {
      observer.disconnect()
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
      Object.assign(node.style, original)
    }
  }
}
