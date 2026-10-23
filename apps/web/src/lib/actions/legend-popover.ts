/** Escape the legend's table clip without changing DOM ownership or outside-click/focus handling. */
export function legendPopover(node: HTMLElement) {
  const anchor = node.parentElement
  if (!anchor) return
  const original = { position: node.style.position, left: node.style.left, top: node.style.top }
  const originalMaxHeight = node.style.getPropertyValue('--legend-popover-max-height')
  node.style.position = 'fixed'

  function place() {
    const rect = anchor!.getBoundingClientRect()
    const width = node.getBoundingClientRect().width
    const top = rect.bottom + 2
    node.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - width - 8))}px`
    node.style.top = `${top}px`
    // Menus can opt into the remaining height without changing DOM ownership.
    // CSS max-height constrains the content box unless border-box is in use.
    const style = getComputedStyle(node)
    const edges = style.boxSizing === 'border-box' ? 0 :
      parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) +
      parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)
    node.style.setProperty('--legend-popover-max-height', `${Math.max(0, window.innerHeight - top - 8 - edges)}px`)
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
      if (originalMaxHeight) node.style.setProperty('--legend-popover-max-height', originalMaxHeight)
      else node.style.removeProperty('--legend-popover-max-height')
    }
  }
}
