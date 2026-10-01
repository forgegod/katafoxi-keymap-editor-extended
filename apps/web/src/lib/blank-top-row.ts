import {
  absentLayoutIndexes,
  isAbsentLayoutKey,
  isBlankLayerBinding,
  type KeyBindingNode,
  type LayoutKey
} from '@keymap-editor/keymap-core'

/** Indexes of the physical top row, or none when the board is a single row. */
function topRowKeyIndexes(keys: LayoutKey[]): number[] {
  const present = keys
    .map((key, index) => ({ key, index }))
    .filter(({ key }) => !isAbsentLayoutKey(key))
  if (present.length < 2) return []
  const rows = present.map(({ key }) => key.row)
  let indexes: number[]
  if (rows.every(row => typeof row === 'number')) {
    const top = Math.min(...(rows as number[]))
    indexes = present.flatMap(({ key, index }) => (key.row === top ? [index] : []))
  } else {
    const minY = Math.min(...present.map(({ key }) => key.y))
    indexes = present.flatMap(({ key, index }) =>
      Math.abs(key.y - minY) < 0.05 ? [index] : []
    )
  }
  if (indexes.length === 0 || indexes.length === present.length) return []
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

/**
 * Indexes omitted from the default board view: absent matrix slots plus a
 * blank top row. Scheme mode should skip this and draw every slot.
 */
export function hiddenBoardIndexes(
  layout: LayoutKey[],
  layers: KeyBindingNode[][]
): number[] {
  const hidden = new Set(absentLayoutIndexes(layout))
  for (const index of blankTopRowIndexes(layout, layers)) hidden.add(index)
  return [...hidden]
}
