/**
 * Per-layer ZMK encoder turns (`sensor-bindings = <...>`).
 * The push button is an ordinary matrix key. Rotation is this property.
 * This module stays string-level so it can be used from the keymap parser
 * without an import cycle.
 */

import { findAnglePropStatement, maskDts } from './dts-scan.js'

interface SensorLayerSpan {
  openBrace: number
  closeBrace: number
}

function bindingsIndent(body: string): string {
  for (const line of body.split('\n')) {
    const found = line.match(/^([ \t]*)bindings\s*=/)
    if (found) return found[1]
  }
  return '            '
}

function writeLayerSensorBindings(
  source: string,
  openBrace: number,
  closeBrace: number,
  bindings: string[]
): string {
  const masked = maskDts(source)
  const range = { start: openBrace + 1, end: closeBrace }
  const found = findAnglePropStatement(masked, range, 'sensor-bindings')
  if (bindings.length === 0) {
    if (!found) return source
    const start = found.statement.start
    const end = found.statement.end
    let cut = start
    const before = source.slice(0, start)
    const lineBreak = before.match(/\n[ \t]*$/)
    if (lineBreak && lineBreak.index != null) cut = lineBreak.index
    return source.slice(0, cut) + source.slice(end)
  }

  const statement = `sensor-bindings = <${bindings.join(' ')}>;`
  if (found) {
    return (
      source.slice(0, found.statement.start) + statement + source.slice(found.statement.end)
    )
  }

  const body = source.slice(openBrace + 1, closeBrace)
  const indent = bindingsIndent(body)
  let braceAt = closeBrace
  while (braceAt > openBrace && /[ \t]/.test(source[braceAt - 1])) braceAt--
  const insertion = `${indent}${statement}\n`
  return source.slice(0, braceAt) + insertion + source.slice(braceAt)
}

/**
 * Write each layer's encoder list. Walks from the last layer so earlier
 * brace indexes stay valid. An empty list drops an existing property.
 */
export function spliceSensorBindingsIntoDts(
  source: string,
  nodes: SensorLayerSpan[],
  layers: string[][]
): string {
  let result = source
  const count = Math.min(nodes.length, layers.length)
  for (let i = count - 1; i >= 0; i--) {
    const node = nodes[i]
    result = writeLayerSensorBindings(result, node.openBrace, node.closeBrace, layers[i] ?? [])
  }
  return result
}
