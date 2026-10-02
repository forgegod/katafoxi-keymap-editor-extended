import { absentLayoutIndexes, type LayoutKey } from '@keymap-editor/keymap-core'

/**
 * Indexes drawn in the demo card thumb: omit absent matrix slots, matching
 * the main board’s default presentation.
 */
export function layoutThumbVisibleIndexes(layout: LayoutKey[]): number[] {
  const hidden = new Set(absentLayoutIndexes(layout))
  return layout.flatMap((_, index) => (hidden.has(index) ? [] : [index]))
}
