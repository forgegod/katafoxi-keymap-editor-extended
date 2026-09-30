import {
  isBlankLayerBinding,
  type KeyBindingNode,
  type LayoutKey
} from '@keymap-editor/keymap-core'

/** Indexes of the physical top row, or none when the board is a single row. */
export function topRowKeyIndexes(keys: LayoutKey[]): number[] {
  if (keys.length < 2) return []
  const rows = keys.map(key => key.row)
  let indexes: number[]
  if (rows.every(row => typeof row === 'number')) {
    const top = Math.min(...(rows as number[]))
    indexes = keys.flatMap((key, index) => (key.row === top ? [index] : []))
  } else {
    const minY = Math.min(...keys.map(key => key.y))
    indexes = keys.flatMap((key, index) => (Math.abs(key.y - minY) < 0.05 ? [index] : []))
  }
  if (indexes.length === 0 || indexes.length === keys.length) return []
  return indexes
}

/**
 * Indexes to hide when every layer leaves the top row blank.
 * Empty when the row has a real binding or the board has no separate top row.
 */
export function blankTopRowIndexes(
  layout: LayoutKey[],
  layers: KeyBindingNode[][]
): number[] {
  const indexes = topRowKeyIndexes(layout)
  if (indexes.length === 0 || layers.length === 0) return []
  const blank = indexes.every(index =>
    layers.every(layer =>
      isBlankLayerBinding(layer[index] ?? { value: '&none', params: [] })
    )
  )
  return blank ? indexes : []
}
