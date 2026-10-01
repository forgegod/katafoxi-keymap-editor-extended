import {
  absentLayoutIndexes,
  type KeyBindingNode,
  type LayoutKey
} from '@keymap-editor/keymap-core'
import { blankTopRowIndexes } from '../../../blank-top-row'

/**
 * Indexes drawn in the demo card thumb: omit absent matrix slots and a
 * blank top row, matching the main board’s default presentation.
 */
export function layoutThumbVisibleIndexes(
  layout: LayoutKey[],
  layers?: KeyBindingNode[][]
): number[] {
  const hidden = new Set(absentLayoutIndexes(layout))
  if (layers?.length) {
    for (const index of blankTopRowIndexes(layout, layers)) hidden.add(index)
  }
  return layout.flatMap((_, index) => (hidden.has(index) ? [] : [index]))
}
