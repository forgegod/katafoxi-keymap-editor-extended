/** Attach mixin methods/getters onto EditorState.prototype. */

export const GETTER_NAMES = [
  'isDirty',
  'changes',
  'statusText',
  'canUndo',
  'canRedo',
  'hostLegendLayerNames',
  'isPublishDirty',
  'isHostDirty',
  'hostDeliverableLayoutIds',
  'hostDeliverableFingerprint',
  'canAlignHostSymbols',
  'symbolAlignShowsWinAltGr',
  'multilangViewOn'
] as const

export function assignEditorApi(
  proto: object,
  mod: Record<string, unknown>,
  getterNames: readonly string[]
) {
  const getters = new Set(getterNames)
  for (const [name, value] of Object.entries(mod)) {
    if (typeof value !== 'function') continue
    if (getters.has(name)) {
      Object.defineProperty(proto, name, {
        configurable: true,
        enumerable: false,
        get: function (this: unknown) {
          return (value as (this: unknown) => unknown).call(this)
        }
      })
    } else {
      Object.defineProperty(proto, name, {
        configurable: true,
        enumerable: false,
        writable: true,
        value
      })
    }
  }
}
