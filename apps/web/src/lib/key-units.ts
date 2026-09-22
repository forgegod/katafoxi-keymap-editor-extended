const DEFAULT_SIZE = 65
const DEFAULT_PADDING = 5

export interface KeyPosition {
  x: number
  y: number
}

export interface KeySize {
  u: number
  h: number
}

export interface KeyRotation {
  x?: number
  y?: number
  a?: number
}

export function getComputedParams(
  position: KeyPosition,
  size: KeySize,
  rotation: KeyRotation = {}
) {
  return {
    x: position.x * (DEFAULT_SIZE + DEFAULT_PADDING),
    y: position.y * (DEFAULT_SIZE + DEFAULT_PADDING),
    u: size.u * DEFAULT_SIZE + DEFAULT_PADDING * (size.u - 1),
    h: size.h * DEFAULT_SIZE + DEFAULT_PADDING * (size.h - 1),
    rx: (position.x - (rotation.x ?? position.x)) * -(DEFAULT_SIZE + DEFAULT_PADDING),
    ry: (position.y - (rotation.y ?? position.y)) * -(DEFAULT_SIZE + DEFAULT_PADDING),
    a: rotation.a || 0
  }
}

export function getKeyStyles(
  position: KeyPosition,
  size: KeySize,
  rotation?: KeyRotation
): Record<string, string> {
  const { x, y, u, h, a, rx, ry } = getComputedParams(position, size, rotation)

  return {
    top: `${y}px`,
    left: `${x}px`,
    width: `${u}px`,
    height: `${h}px`,
    transformOrigin: `${rx}px ${ry}px`,
    transform: `rotate(${a || 0}deg)`
  }
}

export function getKeyBoundingBox(
  position: KeyPosition,
  size: KeySize,
  rotation?: KeyRotation
) {
  const { x, y, u, h, a, rx, ry } = getComputedParams(position, size, rotation)

  const points = [
    { x: 0, y: 0 },
    { x: u, y: 0 },
    { x: u, y: h },
    { x: 0, y: h }
  ]

  function translate(point: { x: number; y: number }) {
    return { x: point.x + x, y: point.y + y }
  }

  function rotate(point: { x: number; y: number }) {
    const px = point.x - rx
    const py = point.y - ry
    const angle = (Math.PI * a) / 180

    return {
      x: rx + px * Math.cos(angle) - py * Math.sin(angle),
      y: ry + py * Math.cos(angle) + px * Math.sin(angle)
    }
  }

  const transformed = points.map(rotate).map(translate)
  const xValues = transformed.map(p => p.x)
  const yValues = transformed.map(p => p.y)
  const min = {
    x: Math.min(...xValues),
    y: Math.min(...yValues)
  }
  const max = {
    x: Math.max(...xValues),
    y: Math.max(...yValues)
  }

  return { min, max }
}
